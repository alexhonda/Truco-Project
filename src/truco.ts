import type { TrucoLevel } from "./types.ts";

export const MAX_TRUCO_LEVEL: TrucoLevel = 3;
export const TRUCO_LEVEL_LABEL: Record<TrucoLevel, string> = { 0: "(sin cantar)", 1: "Truco", 2: "Retruco", 3: "Vale Cuatro" };
/** Points the round is worth at each accepted level. */
export const trucoValue = (level: TrucoLevel): number => level + 1;
/** Points to the caller when a call at `level` is declined: the previously accepted value, min 1. */
export const declinedTrucoPoints = (level: TrucoLevel): number => Math.max(1, trucoValue((level - 1) as TrucoLevel));
