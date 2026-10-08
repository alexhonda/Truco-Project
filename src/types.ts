// Core types for the Truco Argentino engine. Pure domain types: no Firebase / framework imports.
export type Suit = "espada" | "basto" | "oro" | "copa";
export type Rank = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "10" | "11" | "12";
export interface Card { rank: Rank; suit: Suit }
export type PlayerId = string;

export type EnvidoCallType = "envido" | "envido_envido" | "real_envido" | "falta_envido";
export type TrucoLevel = 0 | 1 | 2 | 3; // 0 = not sung, 1 = Truco, 2 = Retruco, 3 = Vale Cuatro

/** House-rule switches. Confirm each with your group; every one is a one-line change. */
export interface Rules {
  scoreTarget: 15 | 30;
  /** If true, the second player (pie) may still call Envido after mano's first card. */
  pieMayCallEnvidoAfterManoPlays: boolean;
  /** If true, an accepted Falta Envido pays only the falta amount; if false it adds to earlier calls. */
  faltaReplacesStack: boolean;
}
export const DEFAULT_RULES: Rules = { scoreTarget: 15, pieMayCallEnvidoAfterManoPlays: true, faltaReplacesStack: true };

export interface EnvidoCall { type: EnvidoCallType; calledBy: PlayerId }
export interface EnvidoState {
  calls: EnvidoCall[];
  awaitingResponseFrom: PlayerId | null;
  resolved: boolean;
  winner: PlayerId | null;
  pointsAwarded: number;
  revealedPoints: Record<PlayerId, number> | null;
  /** True when Envido was called in answer to a pending Truco; Truco resumes afterwards. */
  resumeTruco: boolean;
}
export interface TrucoState {
  level: TrucoLevel;
  calledBy: PlayerId | null;
  awaitingResponseFrom: PlayerId | null;
  /** Who may raise next. null at level 0 (either player may call Truco). */
  raiseRight: PlayerId | null;
}

export type Phase = "trick_play" | "envido_pending_response" | "truco_pending_response" | "match_end";
export type TrickResult = PlayerId | "parda" | null;
export interface TrickPlay { player: PlayerId; card: Card }
export interface Trick { number: 1 | 2 | 3; leader: PlayerId; plays: TrickPlay[]; winner: TrickResult }
export interface PlayerHand { cards: Card[]; played: Card[] }
export interface GameLogEntry { seq: number; event: string; actor: PlayerId | "system"; detail?: Record<string, unknown> }

export interface GameState {
  id: string;
  players: [PlayerId, PlayerId];
  rules: Rules;
  score: Record<PlayerId, number>;
  dealer: PlayerId;
  mano: PlayerId;
  turn: PlayerId;
  phase: Phase;
  roundNumber: number;
  tricks: Trick[];
  trucoState: TrucoState;
  envidoState: EnvidoState;
  /** SERVER-SIDE ONLY. Send clients publicView() instead. */
  hands: Record<PlayerId, PlayerHand>;
  log: GameLogEntry[];
  winner: PlayerId | null;
}

export type Action =
  | { type: "playCard"; card: Card }
  | { type: "singEnvido"; call: EnvidoCallType }
  | { type: "respondEnvido"; accept: boolean }
  | { type: "singTruco" }
  | { type: "respondTruco"; accept: boolean };

/** What one client may see: its own hand only. */
export interface PublicState extends Omit<GameState, "hands"> {
  viewer: PlayerId;
  myHand: PlayerHand;
  opponentCardsLeft: number;
}
