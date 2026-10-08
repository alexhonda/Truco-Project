import type { Card, Rank, Suit } from "./types.ts";

export const SUITS: Suit[] = ["espada", "basto", "oro", "copa"];
export const RANKS: Rank[] = ["1", "2", "3", "4", "5", "6", "7", "10", "11", "12"];

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  return deck;
}

/** Fisher-Yates. Pass a seeded rng in tests; use a secure rng server-side if you want. */
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Trick-taking power, higher = stronger. 14 tiers. */
export function cardPower(card: Card): number {
  const { rank, suit } = card;
  if (rank === "1" && suit === "espada") return 14;
  if (rank === "1" && suit === "basto") return 13;
  if (rank === "7" && suit === "espada") return 12;
  if (rank === "7" && suit === "oro") return 11;
  if (rank === "3") return 10;
  if (rank === "2") return 9;
  if (rank === "1") return 8; // anchos falsos (oro, copa)
  if (rank === "12") return 7;
  if (rank === "11") return 6;
  if (rank === "10") return 5;
  if (rank === "7") return 4; // sietes falsos (basto, copa)
  if (rank === "6") return 3;
  if (rank === "5") return 2;
  if (rank === "4") return 1;
  throw new Error(`Invalid card: ${rank} de ${suit}`);
}
export const compareCards = (a: Card, b: Card): number => cardPower(a) - cardPower(b);
export const cardEquals = (a: Card, b: Card): boolean => a.rank === b.rank && a.suit === b.suit;
export const envidoPip = (rank: Rank): number => (rank === "10" || rank === "11" || rank === "12" ? 0 : parseInt(rank, 10));
