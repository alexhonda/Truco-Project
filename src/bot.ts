// Rule-based computer opponent. It reads only its own hand plus public state, and only ever returns
// an action taken from legalActions(), so it cannot cheat or make an illegal move.
import type { Action, Card, GameState, PlayerId } from "./types.ts";
import { cardPower } from "./cards.ts";
import { envidoValue } from "./envido.ts";
import { legalActions } from "./engine.ts";

export type BotLevel = "easy" | "normal";

/** 0..1 estimate of how strong the player's position is: best two cards left, adjusted by tricks won/lost. */
export function strength(state: GameState, player: PlayerId): number {
  const powers = state.hands[player].cards.map(cardPower).sort((a, b) => b - a);
  if (powers.length === 0) return 0;
  const best = powers[0] / 14;
  const second = (powers[1] ?? powers[0]) / 14;
  let diff = 0;
  for (const t of state.tricks) if (t.winner && t.winner !== "parda") diff += t.winner === player ? 1 : -1;
  return Math.max(0, Math.min(1, 0.6 * best + 0.4 * second + 0.15 * diff));
}

export function chooseAction(state: GameState, rng: () => number = Math.random, level: BotLevel = "normal"): Action {
  const { player, actions } = legalActions(state);
  if (actions.length === 0) throw new Error("No legal actions: the match is over.");
  const pick = (a: Action[]): Action => a[Math.floor(rng() * a.length)];
  if (level === "easy") return pick(actions);

  const hand = state.hands[player];
  const env = envidoValue(hand.cards.concat(hand.played));
  const s = strength(state, player);
  const find = (type: Action["type"], extra?: (a: Action) => boolean) => actions.find((a) => a.type === type && (!extra || extra(a)));
  const envidoCall = (call: string) => actions.find((a) => a.type === "singEnvido" && a.call === call);

  if (state.phase === "envido_pending_response") {
    const last = state.envidoState.calls[state.envidoState.calls.length - 1].type;
    const need = last === "real_envido" ? 28 : last === "falta_envido" ? 30 : 25;
    if (env >= 32 && rng() < 0.5 && envidoCall("falta_envido")) return envidoCall("falta_envido")!;
    if (env >= 30 && envidoCall("real_envido")) return envidoCall("real_envido")!;
    const accept = env >= need || rng() < 0.08;
    return actions.find((a) => a.type === "respondEnvido" && a.accept === accept)!;
  }

  if (state.phase === "truco_pending_response") {
    if (env >= 27 && rng() < 0.7 && envidoCall("envido")) return envidoCall("envido")!;
    const level3 = state.trucoState.level;
    const need = level3 === 1 ? 0.5 : level3 === 2 ? 0.62 : 0.75;
    if (s >= 0.85 && find("singTruco")) return find("singTruco")!;
    const accept = s >= need || rng() < 0.08;
    return actions.find((a) => a.type === "respondTruco" && a.accept === accept)!;
  }

  // trick_play
  if (env >= 27 || (env >= 20 && rng() < 0.07)) {
    const call = env >= 31 && rng() < 0.5 ? "real_envido" : "envido";
    if (envidoCall(call)) return envidoCall(call)!;
  }
  if (find("singTruco") && ((s >= 0.72 && rng() < 0.5) || rng() < 0.04)) return find("singTruco")!;

  const plays = actions.filter((a): a is Extract<Action, { type: "playCard" }> => a.type === "playCard");
  const byPower = [...plays].sort((x, y) => cardPower(x.card) - cardPower(y.card)); // weakest first
  const trick = state.tricks[state.tricks.length - 1];
  if (trick.plays.length === 1) {
    const target = cardPower(trick.plays[0].card);
    const wins = byPower.filter((p) => cardPower(p.card) > target);
    if (wins.length) return wins[0]; // cheapest winning card
    const ties = byPower.filter((p) => cardPower(p.card) === target);
    return ties.length ? ties[0] : byPower[0]; // else tie, else sacrifice the weakest
  }
  if (state.tricks.length === 1) return byPower[Math.floor((byPower.length - 1) / 2)]; // lead trick 1 with a middle card
  return byPower[byPower.length - 1]; // later tricks: lead the best card
}
