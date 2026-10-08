// Server-side game handlers: the only code that should touch a GameRecord. Pure TypeScript, storage injected,
// so the same code runs in tests (InMemoryStore) and in Cloud Functions (Firestore).
import type { Action, EnvidoCallType, GameState, PublicState, Rank, Rules, Suit } from "../types.ts";
import { DEFAULT_RULES } from "../types.ts";
import { GameError, applyAction, createGame, forfeitRound, legalActions, publicView } from "../engine.ts";
import { ServerError } from "./errors.ts";
import type { GameRecord, GameStore } from "./store.ts";

export interface Deps {
  store: GameStore;
  now: () => number;
  rng: () => number;
  newId: () => string;
  turnSeconds: number; // time allowed per move before the opponent may claim the round
}

export interface GameView {
  gameId: string;
  status: GameRecord["status"];
  version: number;
  you: string;
  opponentJoined: boolean;
  turnDeadline: number | null;
  state: PublicState | null; // your own hand only; null while waiting for an opponent
  /** Moves you may make right now (empty unless it is your turn), so clients never re-implement the rules. */
  legalActions: Action[];
}

const SUITS: Suit[] = ["espada", "basto", "oro", "copa"];
const RANKS: Rank[] = ["1", "2", "3", "4", "5", "6", "7", "10", "11", "12"];
const ENVIDO: EnvidoCallType[] = ["envido", "envido_envido", "real_envido", "falta_envido"];

/** Turns untrusted client JSON into a valid Action, or throws BAD_REQUEST. */
export function parseAction(raw: unknown): Action {
  const bad = (m: string) => new ServerError("BAD_REQUEST", m);
  if (typeof raw !== "object" || raw === null) throw bad("Action must be an object.");
  const a = raw as Record<string, unknown>;
  switch (a.type) {
    case "playCard": {
      const c = a.card as Record<string, unknown> | undefined;
      if (!c || !RANKS.includes(c.rank as Rank) || !SUITS.includes(c.suit as Suit)) throw bad("Invalid card.");
      return { type: "playCard", card: { rank: c.rank as Rank, suit: c.suit as Suit } };
    }
    case "singEnvido":
      if (!ENVIDO.includes(a.call as EnvidoCallType)) throw bad("Invalid Envido call.");
      return { type: "singEnvido", call: a.call as EnvidoCallType };
    case "respondEnvido":
      if (typeof a.accept !== "boolean") throw bad("accept must be true or false.");
      return { type: "respondEnvido", accept: a.accept };
    case "singTruco":
      return { type: "singTruco" };
    case "respondTruco":
      if (typeof a.accept !== "boolean") throw bad("accept must be true or false.");
      return { type: "respondTruco", accept: a.accept };
    default:
      throw bad("Unknown action type.");
  }
}

/** Keeps only known rule keys with valid values. */
export function parseRules(raw: unknown): Partial<Rules> {
  const out: Partial<Rules> = {};
  if (typeof raw !== "object" || raw === null) return out;
  const r = raw as Record<string, unknown>;
  if (r.scoreTarget === 15 || r.scoreTarget === 30) out.scoreTarget = r.scoreTarget;
  if (typeof r.pieMayCallEnvidoAfterManoPlays === "boolean") out.pieMayCallEnvidoAfterManoPlays = r.pieMayCallEnvidoAfterManoPlays;
  if (typeof r.faltaReplacesStack === "boolean") out.faltaReplacesStack = r.faltaReplacesStack;
  return out;
}

function view(rec: GameRecord, uid: string): GameView {
  return {
    gameId: rec.id, status: rec.status, version: rec.version, you: uid,
    opponentJoined: rec.guest !== null, turnDeadline: rec.turnDeadline,
    state: rec.state ? publicView(rec.state, uid) : null,
    legalActions: rec.state && rec.state.phase !== "match_end" && rec.state.turn === uid ? legalActions(rec.state).actions : [],
  };
}

async function load(deps: Deps, gameId: string): Promise<GameRecord> {
  if (typeof gameId !== "string" || gameId.length === 0 || gameId.length > 128) throw new ServerError("BAD_REQUEST", "Invalid game id.");
  const rec = await deps.store.get(gameId);
  if (!rec) throw new ServerError("NOT_FOUND", "Game not found.");
  return rec;
}
function assertMember(rec: GameRecord, uid: string) {
  if (uid !== rec.host && uid !== rec.guest) throw new ServerError("NOT_A_PLAYER", "You are not a player in this game.");
}
async function save(deps: Deps, rec: GameRecord, next: GameRecord) {
  next.version = rec.version + 1;
  if (!(await deps.store.put(next, rec.version))) throw new ServerError("CONFLICT", "The game changed at the same moment. Try again.");
}
function withState(deps: Deps, rec: GameRecord, state: GameState): GameRecord {
  const over = state.phase === "match_end";
  return { ...rec, state, status: over ? "finished" : "playing", turnDeadline: over ? null : deps.now() + deps.turnSeconds * 1000 };
}

export async function createGameRoom(deps: Deps, uid: string, rules?: unknown): Promise<GameView> {
  const rec: GameRecord = { id: deps.newId(), status: "waiting", version: 1, host: uid, guest: null, rules: parseRules(rules), createdAt: deps.now(), turnDeadline: null, state: null };
  if (!(await deps.store.put(rec, 0))) throw new ServerError("CONFLICT", "Could not create the game. Try again.");
  return view(rec, uid);
}

export async function joinGame(deps: Deps, uid: string, gameId: string): Promise<GameView> {
  const rec = await load(deps, gameId);
  if (uid === rec.host || uid === rec.guest) return view(rec, uid); // joining twice is harmless
  if (rec.guest !== null) throw new ServerError("GAME_FULL", "This game already has two players.");
  const state = createGame(rec.id, [rec.host, uid], { ...DEFAULT_RULES, ...rec.rules }, deps.rng);
  const next = withState(deps, { ...rec, guest: uid }, state);
  await save(deps, rec, next);
  return view(next, uid);
}

export async function getGameView(deps: Deps, uid: string, gameId: string): Promise<GameView> {
  const rec = await load(deps, gameId);
  assertMember(rec, uid);
  return view(rec, uid);
}

export async function submitAction(deps: Deps, uid: string, gameId: string, rawAction: unknown): Promise<GameView> {
  const rec = await load(deps, gameId);
  assertMember(rec, uid);
  if (rec.status === "waiting") throw new ServerError("GAME_NOT_STARTED", "Waiting for an opponent to join.");
  if (rec.status === "finished" || !rec.state) throw new ServerError("GAME_OVER", "This game is over.");
  const action = parseAction(rawAction);
  let state: GameState;
  try {
    state = applyAction(rec.state, uid, action, deps.rng);
  } catch (e) {
    if (e instanceof GameError) throw new ServerError("ILLEGAL_MOVE", e.message, e.code);
    throw e;
  }
  const next = withState(deps, rec, state);
  await save(deps, rec, next);
  return view(next, uid);
}

/** The opponent of a player who has run out of time may claim the round. */
export async function claimTimeout(deps: Deps, uid: string, gameId: string): Promise<GameView> {
  const rec = await load(deps, gameId);
  assertMember(rec, uid);
  if (rec.status !== "playing" || !rec.state || rec.turnDeadline === null) throw new ServerError("GAME_NOT_PLAYING", "There is no move to time out.");
  if (rec.state.turn === uid) throw new ServerError("BAD_REQUEST", "It is your turn; you cannot claim a timeout.");
  if (deps.now() <= rec.turnDeadline) throw new ServerError("TIMEOUT_NOT_REACHED", "The other player still has time.");
  const next = withState(deps, rec, forfeitRound(rec.state, rec.state.turn, deps.rng));
  await save(deps, rec, next);
  return view(next, uid);
}

// --- What gets written where in Firestore (also unit-tested for leaks) -----------------------------
/** Public document games/{id}: readable by the players, contains no unplayed cards. */
export function publicDoc(rec: GameRecord) {
  const base = { id: rec.id, status: rec.status, version: rec.version, playerIds: [rec.host, rec.guest].filter((x): x is string => x !== null), turnDeadline: rec.turnDeadline, createdAt: rec.createdAt };
  if (!rec.state) return base;
  const { hands, ...rest } = rec.state;
  const cardsLeft: Record<string, number> = {};
  for (const p of rec.state.players) cardsLeft[p] = hands[p].cards.length;
  return { ...base, game: JSON.parse(JSON.stringify(rest)), cardsLeft };
}
/** Private document games/{id}/hands/{uid}: readable only by that player. */
export function handDoc(rec: GameRecord, uid: string) {
  return rec.state ? JSON.parse(JSON.stringify(rec.state.hands[uid])) : { cards: [], played: [] };
}
