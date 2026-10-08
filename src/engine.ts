// Truco Argentino engine: a pure, deterministic state machine (inject rng for tests).
// ZERO dependency on Firebase/HTTP/IO. Wrap these functions in Cloud Functions as-is.
// Illegal actions throw GameError; the calling layer should return a rejected call, not a 500.
import type {
  Action, Card, EnvidoCallType, GameState, PlayerId, PublicState, Rules, TrickResult, TrucoLevel,
} from "./types.ts";
import { DEFAULT_RULES } from "./types.ts";
import { buildDeck, cardEquals, compareCards, shuffle } from "./cards.ts";
import { envidoPointsAccepted, envidoPointsDeclined, envidoValue, legalEnvidoEscalations } from "./envido.ts";
import { declinedTrucoPoints, MAX_TRUCO_LEVEL, trucoValue } from "./truco.ts";

type Rng = () => number;

export class GameError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "GameError";
    this.code = code;
  }
}

const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));
const other = (s: GameState, p: PlayerId): PlayerId => (p === s.players[0] ? s.players[1] : s.players[0]);
function log(s: GameState, event: string, actor: PlayerId | "system", detail?: Record<string, unknown>) {
  s.log.push({ seq: s.log.length + 1, event, actor, detail });
}
function assertTurn(s: GameState, p: PlayerId) {
  if (s.phase === "match_end") throw new GameError("The match is over.", "ILLEGAL_PHASE");
  if (s.turn !== p) throw new GameError(`It is not ${p}'s turn.`, "NOT_YOUR_TURN");
}

// --- Round winner (pure, exported for tests) -------------------------------------------------
/** results = winner of each trick played so far ("parda" = tie). Returns the round winner or null if undecided. */
export function roundWinner(results: TrickResult[], mano: PlayerId): PlayerId | null {
  const n = results.length;
  if (n < 2) return null;
  if (n === 2) {
    const [t1, t2] = results;
    if (t1 === "parda" && t2 === "parda") return null; // trick 3 decides
    if (t1 === "parda") return t2 as PlayerId;
    if (t2 === "parda") return t1 as PlayerId;
    return t1 === t2 ? (t1 as PlayerId) : null; // 1-1 split: trick 3 decides
  }
  const [t1, , t3] = results;
  const wins = new Map<string, number>();
  for (const r of results) if (r && r !== "parda") wins.set(r, (wins.get(r) ?? 0) + 1);
  for (const [p, w] of wins) if (w >= 2) return p;
  if (results.every((r) => r === "parda")) return mano;
  if (t3 === "parda") return t1 as PlayerId; // 1-1 then tie: first trick winner ("primera vale doble")
  return t3 as PlayerId; // includes [parda, parda, X]
}

function trickTurn(s: GameState): PlayerId {
  const trick = s.tricks[s.tricks.length - 1];
  return trick.plays.length === 0 ? trick.leader : other(s, trick.plays[trick.plays.length - 1].player);
}

// --- Setup & dealing -------------------------------------------------------------------------
export function createGame(id: string, players: [PlayerId, PlayerId], rules: Partial<Rules> = {}, rng: Rng = Math.random): GameState {
  const [p1, p2] = players;
  const state: GameState = {
    id, players, rules: { ...DEFAULT_RULES, ...rules },
    score: { [p1]: 0, [p2]: 0 },
    dealer: p1, mano: p2, turn: p2, phase: "trick_play", roundNumber: 0, tricks: [],
    trucoState: { level: 0, calledBy: null, awaitingResponseFrom: null, raiseRight: null },
    envidoState: { calls: [], awaitingResponseFrom: null, resolved: false, winner: null, pointsAwarded: 0, revealedPoints: null, resumeTruco: false },
    hands: { [p1]: { cards: [], played: [] }, [p2]: { cards: [], played: [] } },
    log: [], winner: null,
  };
  return dealNewRound(state, rng);
}

export function dealNewRound(state: GameState, rng: Rng = Math.random): GameState {
  const s = clone(state);
  if (s.roundNumber > 0) {
    s.dealer = other(s, s.dealer);
    s.mano = other(s, s.dealer);
  }
  const deck = shuffle(buildDeck(), rng);
  const [p1, p2] = s.players;
  s.hands = { [p1]: { cards: deck.slice(0, 3), played: [] }, [p2]: { cards: deck.slice(3, 6), played: [] } };
  s.tricks = [{ number: 1, leader: s.mano, plays: [], winner: null }];
  s.trucoState = { level: 0, calledBy: null, awaitingResponseFrom: null, raiseRight: null };
  s.envidoState = { calls: [], awaitingResponseFrom: null, resolved: false, winner: null, pointsAwarded: 0, revealedPoints: null, resumeTruco: false };
  s.roundNumber += 1;
  s.phase = "trick_play";
  s.turn = s.mano;
  log(s, "round_dealt", "system", { roundNumber: s.roundNumber, dealer: s.dealer, mano: s.mano });
  return s;
}

function checkMatchEnd(s: GameState): boolean {
  for (const p of s.players) {
    if (s.score[p] >= s.rules.scoreTarget) {
      s.phase = "match_end";
      s.winner = p;
      log(s, "match_won", p, { finalScore: s.score });
      return true;
    }
  }
  return false;
}

function finishRound(s: GameState, winner: PlayerId, rng: Rng): GameState {
  const pts = trucoValue(s.trucoState.level);
  s.score[winner] += pts;
  log(s, "round_won", winner, { points: pts, trucoLevel: s.trucoState.level });
  return checkMatchEnd(s) ? s : dealNewRound(s, rng);
}

// --- Playing a card --------------------------------------------------------------------------
export function playCard(state: GameState, player: PlayerId, card: Card, rng: Rng = Math.random): GameState {
  if (state.phase !== "trick_play") throw new GameError("Cannot play a card right now.", "ILLEGAL_PHASE");
  assertTurn(state, player);
  const s = clone(state);
  const hand = s.hands[player];
  const idx = hand.cards.findIndex((c) => cardEquals(c, card));
  if (idx === -1) throw new GameError("Card not in hand.", "CARD_NOT_IN_HAND");
  hand.cards.splice(idx, 1);
  hand.played.push(card);
  const trick = s.tricks[s.tricks.length - 1];
  trick.plays.push({ player, card });
  log(s, "card_played", player, { card });

  if (trick.plays.length < 2) {
    s.turn = other(s, player);
    return s;
  }
  const [a, b] = trick.plays;
  const cmp = compareCards(a.card, b.card);
  trick.winner = cmp === 0 ? "parda" : cmp > 0 ? a.player : b.player;
  log(s, "trick_resolved", "system", { trickNumber: trick.number, winner: trick.winner });
  const rw = roundWinner(s.tricks.map((t) => t.winner), s.mano);
  if (rw) return finishRound(s, rw, rng);
  const leader = trick.winner === "parda" ? s.mano : (trick.winner as PlayerId); // after a parda, mano leads
  s.tricks.push({ number: (trick.number + 1) as 1 | 2 | 3, leader, plays: [], winner: null });
  s.turn = leader;
  return s;
}

// --- Envido ----------------------------------------------------------------------------------
/** Initial Envido call: trick 1 only, caller has not played yet, and Truco is either unsung or pending on the caller. */
export function canCallEnvido(s: GameState, player: PlayerId): boolean {
  if (s.phase === "match_end" || s.envidoState.resolved || s.tricks.length !== 1) return false;
  const t = s.tricks[0];
  if (t.plays.some((p) => p.player === player)) return false;
  if (!s.rules.pieMayCallEnvidoAfterManoPlays && t.plays.length > 0) return false;
  if (s.phase === "trick_play") return s.trucoState.level === 0;
  if (s.phase === "truco_pending_response") return s.trucoState.awaitingResponseFrom === player && s.trucoState.level === 1; // "el envido esta primero"
  return false;
}

export function singEnvido(state: GameState, player: PlayerId, type: EnvidoCallType): GameState {
  assertTurn(state, player);
  let legal: EnvidoCallType[];
  if (state.phase === "envido_pending_response") {
    if (state.envidoState.awaitingResponseFrom !== player) throw new GameError("It is not your turn to respond.", "NOT_YOUR_TURN");
    legal = legalEnvidoEscalations(state.envidoState.calls.map((c) => c.type));
  } else {
    if (!canCallEnvido(state, player)) throw new GameError("Envido can no longer be sung.", "ENVIDO_CLOSED");
    legal = legalEnvidoEscalations([]);
  }
  if (!legal.includes(type)) throw new GameError(`${type} is not a legal Envido call right now.`, "ILLEGAL_ENVIDO_CALL");
  const s = clone(state);
  if (s.phase === "truco_pending_response") s.envidoState.resumeTruco = true;
  s.envidoState.calls.push({ type, calledBy: player });
  s.envidoState.awaitingResponseFrom = other(s, player);
  s.phase = "envido_pending_response";
  s.turn = other(s, player);
  log(s, "envido_sung", player, { type });
  return s;
}

export function respondToEnvido(state: GameState, player: PlayerId, accept: boolean): GameState {
  if (state.phase !== "envido_pending_response") throw new GameError("No Envido call is pending.", "ILLEGAL_PHASE");
  if (state.envidoState.awaitingResponseFrom !== player) throw new GameError("It is not your turn to respond.", "NOT_YOUR_TURN");
  const s = clone(state);
  const e = s.envidoState;
  const types = e.calls.map((c) => c.type);
  const lastCaller = e.calls[e.calls.length - 1].calledBy;
  let winner: PlayerId;
  let pts: number;
  if (!accept) {
    winner = lastCaller;
    pts = envidoPointsDeclined(types);
  } else {
    const [p1, p2] = s.players;
    const v1 = envidoValue(s.hands[p1].cards.concat(s.hands[p1].played));
    const v2 = envidoValue(s.hands[p2].cards.concat(s.hands[p2].played));
    winner = v1 === v2 ? s.mano : v1 > v2 ? p1 : p2; // mano wins ties
    pts = envidoPointsAccepted(types, s.score, s.rules);
    e.revealedPoints = { [p1]: v1, [p2]: v2 };
  }
  s.score[winner] += pts;
  e.resolved = true; e.winner = winner; e.pointsAwarded = pts; e.awaitingResponseFrom = null;
  log(s, accept ? "envido_accepted" : "envido_declined", player, { winner, points: pts, revealed: e.revealedPoints });
  if (checkMatchEnd(s)) return s;
  if (e.resumeTruco) {
    e.resumeTruco = false;
    s.phase = "truco_pending_response";
    s.turn = s.trucoState.awaitingResponseFrom as PlayerId;
  } else {
    s.phase = "trick_play";
    s.turn = trickTurn(s);
  }
  return s;
}

// --- Truco -----------------------------------------------------------------------------------
/** Call Truco / Retruco / Vale Cuatro on your turn, or raise while answering a pending call. */
export function singTruco(state: GameState, player: PlayerId): GameState {
  assertTurn(state, player);
  const t = state.trucoState;
  if (state.phase === "truco_pending_response") {
    if (t.awaitingResponseFrom !== player) throw new GameError("It is not your turn to respond.", "NOT_YOUR_TURN");
  } else if (state.phase === "trick_play") {
    if (t.level > 0 && t.raiseRight !== player) throw new GameError("Only the player who accepted the last call may raise.", "NO_RAISE_RIGHT");
  } else {
    throw new GameError("Cannot sing Truco right now.", "ILLEGAL_PHASE");
  }
  if (t.level >= MAX_TRUCO_LEVEL) throw new GameError("Vale Cuatro is the highest call.", "ILLEGAL_TRUCO_ESCALATION");
  const s = clone(state);
  const level = (t.level + 1) as TrucoLevel;
  s.trucoState = { level, calledBy: player, awaitingResponseFrom: other(s, player), raiseRight: null };
  s.phase = "truco_pending_response";
  s.turn = other(s, player);
  log(s, "truco_sung", player, { level });
  return s;
}

export function respondToTruco(state: GameState, player: PlayerId, accept: boolean, rng: Rng = Math.random): GameState {
  if (state.phase !== "truco_pending_response") throw new GameError("No Truco call is pending.", "ILLEGAL_PHASE");
  if (state.trucoState.awaitingResponseFrom !== player) throw new GameError("It is not your turn to respond.", "NOT_YOUR_TURN");
  let s = clone(state);
  if (!accept) {
    const caller = s.trucoState.calledBy as PlayerId;
    const pts = declinedTrucoPoints(s.trucoState.level);
    s.score[caller] += pts;
    log(s, "truco_declined", player, { awardedTo: caller, points: pts });
    return checkMatchEnd(s) ? s : dealNewRound(s, rng);
  }
  s.trucoState.awaitingResponseFrom = null;
  s.trucoState.raiseRight = player; // the acceptor may raise next
  s.phase = "trick_play";
  s.turn = trickTurn(s);
  log(s, "truco_accepted", player, { level: s.trucoState.level });
  return s;
}

// --- Action helpers for the server layer, bots and UI -----------------------------------------
export function applyAction(state: GameState, player: PlayerId, action: Action, rng: Rng = Math.random): GameState {
  switch (action.type) {
    case "playCard": return playCard(state, player, action.card, rng);
    case "singEnvido": return singEnvido(state, player, action.call);
    case "respondEnvido": return respondToEnvido(state, player, action.accept);
    case "singTruco": return singTruco(state, player);
    case "respondTruco": return respondToTruco(state, player, action.accept, rng);
  }
}

/** Every action the player on turn may legally take. Doubles as the UI's button list. */
export function legalActions(state: GameState): { player: PlayerId; actions: Action[] } {
  const player = state.turn;
  const actions: Action[] = [];
  if (state.phase === "match_end") return { player, actions };
  const t = state.trucoState;
  const envidoOpeners = () => { if (canCallEnvido(state, player)) for (const call of legalEnvidoEscalations([])) actions.push({ type: "singEnvido", call }); };
  if (state.phase === "trick_play") {
    for (const card of state.hands[player].cards) actions.push({ type: "playCard", card });
    envidoOpeners();
    if (t.level < MAX_TRUCO_LEVEL && (t.level === 0 || t.raiseRight === player)) actions.push({ type: "singTruco" });
  } else if (state.phase === "envido_pending_response") {
    actions.push({ type: "respondEnvido", accept: true }, { type: "respondEnvido", accept: false });
    for (const call of legalEnvidoEscalations(state.envidoState.calls.map((c) => c.type))) actions.push({ type: "singEnvido", call });
  } else if (state.phase === "truco_pending_response") {
    actions.push({ type: "respondTruco", accept: true }, { type: "respondTruco", accept: false });
    if (t.level < MAX_TRUCO_LEVEL) actions.push({ type: "singTruco" });
    envidoOpeners();
  }
  return { player, actions };
}

/** Client-safe view: only the viewer's own hand. Never send GameState itself to a client. */
export function publicView(state: GameState, viewer: PlayerId): PublicState {
  const { hands, ...rest } = state;
  const opp = other(state, viewer);
  const revealed = state.envidoState.revealedPoints; // only populated once Envido was accepted
  return { ...JSON.parse(JSON.stringify(rest)), viewer, myHand: JSON.parse(JSON.stringify(hands[viewer])), opponentCardsLeft: hands[opp].cards.length, envidoState: { ...rest.envidoState, revealedPoints: revealed } };
}

// --- Timeouts and abandoned rounds -------------------------------------------------------------
/**
 * The player on turn ran out of time (or left). The opponent takes the round: the accepted round value,
 * or, if a Truco call was waiting for this player, the same points as a declined call.
 * This is the timeout policy only; folding (irse al mazo) is a separate open decision (D8).
 */
export function forfeitRound(state: GameState, loser: PlayerId, rng: Rng = Math.random): GameState {
  if (state.phase === "match_end") throw new GameError("The match is over.", "ILLEGAL_PHASE");
  if (loser !== state.turn) throw new GameError("Only the player on turn can forfeit a round.", "NOT_YOUR_TURN");
  const s = clone(state);
  const winner = other(s, loser);
  const pts = s.phase === "truco_pending_response" ? declinedTrucoPoints(s.trucoState.level) : trucoValue(s.trucoState.level);
  s.score[winner] += pts;
  log(s, "round_forfeited", loser, { awardedTo: winner, points: pts });
  return checkMatchEnd(s) ? s : dealNewRound(s, rng);
}
