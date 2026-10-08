import type { GameState, Rules } from "../types.ts";

export type GameStatus = "waiting" | "playing" | "finished";

/** Everything the server keeps about one game. Contains BOTH hands: never send it to a client. */
export interface GameRecord {
  id: string;
  status: GameStatus;
  version: number; // goes up by 1 on every change
  host: string; // uid of the player who created the game
  guest: string | null; // uid of the player who joined
  rules: Partial<Rules>;
  createdAt: number;
  turnDeadline: number | null; // ms timestamp; null while waiting or finished
  state: GameState | null; // null until the guest joins
}

/** Storage the handlers talk to. Firestore implements it in production; tests use InMemoryStore. */
export interface GameStore {
  get(id: string): Promise<GameRecord | null>;
  /** Compare-and-set: saves only if the stored version equals expectedVersion (0 = must not exist yet). */
  put(rec: GameRecord, expectedVersion: number): Promise<boolean>;
}

export class InMemoryStore implements GameStore {
  private games = new Map<string, GameRecord>();
  async get(id: string) {
    const g = this.games.get(id);
    return g ? (JSON.parse(JSON.stringify(g)) as GameRecord) : null;
  }
  async put(rec: GameRecord, expectedVersion: number) {
    const cur = this.games.get(rec.id);
    if ((cur ? cur.version : 0) !== expectedVersion) return false;
    this.games.set(rec.id, JSON.parse(JSON.stringify(rec)));
    return true;
  }
}
