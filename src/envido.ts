import type { Card, EnvidoCallType, PlayerId, Rules } from "./types.ts";
import { envidoPip } from "./cards.ts";

/** Best Envido from a full 3-card hand. Max 33 (7 + 6 of one suit + 20). */
export function envidoValue(hand: Card[]): number {
  const bySuit = new Map<string, number[]>();
  for (const c of hand) bySuit.set(c.suit, [...(bySuit.get(c.suit) ?? []), envidoPip(c.rank)]);
  let best = 0;
  for (const pips of bySuit.values()) {
    if (pips.length >= 2) {
      const p = [...pips].sort((a, b) => b - a);
      best = Math.max(best, p[0] + p[1] + 20);
    }
  }
  return best > 0 ? best : Math.max(...hand.map((c) => envidoPip(c.rank)));
}

const FIXED_POINTS: Record<Exclude<EnvidoCallType, "falta_envido">, number> = { envido: 2, envido_envido: 2, real_envido: 3 };

export function legalEnvidoEscalations(calls: EnvidoCallType[]): EnvidoCallType[] {
  if (calls.length === 0) return ["envido", "real_envido", "falta_envido"];
  const last = calls[calls.length - 1];
  if (last === "envido" && !calls.includes("envido_envido")) return ["envido_envido", "real_envido", "falta_envido"];
  if (last === "envido" || last === "envido_envido") return ["real_envido", "falta_envido"];
  if (last === "real_envido") return ["falta_envido"];
  return [];
}

/** Falta Envido = points the leading player still needs. Uses the leader's score, not the winner's. */
export function faltaPoints(scores: Record<PlayerId, number>, target: number): number {
  return Math.max(1, target - Math.max(...Object.values(scores)));
}

export function envidoPointsAccepted(calls: EnvidoCallType[], scores: Record<PlayerId, number>, rules: Rules): number {
  const fixed = calls.filter((c) => c !== "falta_envido").reduce((t, c) => t + FIXED_POINTS[c as keyof typeof FIXED_POINTS], 0);
  if (!calls.includes("falta_envido")) return fixed;
  const falta = faltaPoints(scores, rules.scoreTarget);
  return rules.faltaReplacesStack ? falta : fixed + falta;
}

/** `calls` includes the declined (last) call. Decliner concedes the stack accepted before it, minimum 1. */
export function envidoPointsDeclined(calls: EnvidoCallType[]): number {
  if (calls.length <= 1) return 1;
  return calls.slice(0, -1).reduce((t, c) => t + FIXED_POINTS[c as keyof typeof FIXED_POINTS], 0);
}
