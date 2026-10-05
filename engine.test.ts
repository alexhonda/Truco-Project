import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { Card, GameState, Rank, Suit, TrickResult } from "../src/types.ts";
import { buildDeck, cardPower } from "../src/cards.ts";
import { envidoPointsAccepted, envidoPointsDeclined, envidoValue, faltaPoints, legalEnvidoEscalations } from "../src/envido.ts";
import { declinedTrucoPoints, trucoValue } from "../src/truco.ts";
import {
  GameError, applyAction, canCallEnvido, createGame, legalActions, playCard, publicView,
  respondToEnvido, respondToTruco, roundWinner, singEnvido, singTruco,
} from "../src/engine.ts";

const c = (rank: Rank, suit: Suit): Card => ({ rank, suit });
function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Players are "A" (dealer, first round) and "B" (mano, first round).
function rig(handA: Card[], handB: Card[], rules = {}): GameState {
  const s = createGame("t", ["A", "B"], rules, mulberry32(1));
  s.hands = { A: { cards: handA, played: [] }, B: { cards: handB, played: [] } };
  return s;
}
const weakA = [c("4", "copa"), c("5", "copa"), c("6", "copa")];
const strongB = [c("1", "espada"), c("1", "basto"), c("7", "espada")];
const throwsCode = (fn: () => unknown, code: string) => assert.throws(fn, (e: unknown) => e instanceof GameError && e.code === code);

describe("cards", () => {
  test("deck has 40 unique cards and 14 power tiers", () => {
    const d = buildDeck();
    assert.equal(d.length, 40);
    assert.equal(new Set(d.map((x) => `${x.rank}-${x.suit}`)).size, 40);
    assert.equal(new Set(d.map(cardPower)).size, 14);
  });
  test("ranking order", () => {
    const order: Card[] = [c("1", "espada"), c("1", "basto"), c("7", "espada"), c("7", "oro"), c("3", "copa"), c("2", "oro"), c("1", "oro"), c("12", "basto"), c("11", "basto"), c("10", "basto"), c("7", "copa"), c("6", "oro"), c("5", "oro"), c("4", "oro")];
    for (let i = 1; i < order.length; i++) assert.ok(cardPower(order[i - 1]) > cardPower(order[i]), `${i}`);
    assert.equal(cardPower(c("1", "oro")), cardPower(c("1", "copa")));
    assert.equal(cardPower(c("7", "basto")), cardPower(c("7", "copa")));
  });
});

describe("envido scoring", () => {
  test("hand values", () => {
    assert.equal(envidoValue([c("7", "espada"), c("6", "espada"), c("1", "oro")]), 33);
    assert.equal(envidoValue([c("12", "oro"), c("11", "oro"), c("4", "basto")]), 20);
    assert.equal(envidoValue([c("7", "oro"), c("5", "oro"), c("4", "oro")]), 32);
    assert.equal(envidoValue([c("1", "oro"), c("2", "copa"), c("3", "basto")]), 3);
    assert.equal(envidoValue([c("12", "oro"), c("11", "copa"), c("10", "basto")]), 0);
  });
  test("escalation table", () => {
    assert.deepEqual(legalEnvidoEscalations([]), ["envido", "real_envido", "falta_envido"]);
    assert.deepEqual(legalEnvidoEscalations(["envido"]), ["envido_envido", "real_envido", "falta_envido"]);
    assert.deepEqual(legalEnvidoEscalations(["envido", "envido_envido"]), ["real_envido", "falta_envido"]);
    assert.deepEqual(legalEnvidoEscalations(["real_envido"]), ["falta_envido"]);
    assert.deepEqual(legalEnvidoEscalations(["falta_envido"]), []);
  });
  test("accepted and declined stacks", () => {
    const rules = { scoreTarget: 15 as const, pieMayCallEnvidoAfterManoPlays: true, faltaReplacesStack: true };
    const sc = { A: 0, B: 0 };
    assert.equal(envidoPointsAccepted(["envido"], sc, rules), 2);
    assert.equal(envidoPointsAccepted(["envido", "envido_envido"], sc, rules), 4);
    assert.equal(envidoPointsAccepted(["envido", "real_envido"], sc, rules), 5);
    assert.equal(envidoPointsAccepted(["envido", "envido_envido", "real_envido"], sc, rules), 7);
    assert.equal(envidoPointsDeclined(["envido"]), 1);
    assert.equal(envidoPointsDeclined(["envido", "envido_envido"]), 2);
    assert.equal(envidoPointsDeclined(["envido", "real_envido"]), 2);
    assert.equal(envidoPointsDeclined(["envido", "envido_envido", "real_envido"]), 4);
  });
  test("falta envido uses the leader's score and honours the stack flag", () => {
    assert.equal(faltaPoints({ A: 5, B: 12 }, 15), 3);
    const sc = { A: 10, B: 20 };
    assert.equal(envidoPointsAccepted(["envido", "falta_envido"], sc, { scoreTarget: 30, pieMayCallEnvidoAfterManoPlays: true, faltaReplacesStack: true }), 10);
    assert.equal(envidoPointsAccepted(["envido", "falta_envido"], sc, { scoreTarget: 30, pieMayCallEnvidoAfterManoPlays: true, faltaReplacesStack: false }), 12);
  });
});

describe("round winner (parda matrix from the handoff doc)", () => {
  const cases: [TrickResult[], string | null][] = [
    [["parda", "B"], "B"], [["parda", "A"], "A"], [["A", "parda"], "A"], [["B", "parda"], "B"],
    [["A", "A"], "A"], [["B", "B"], "B"], [["A", "B"], null], [["parda", "parda"], null],
    [["A", "B", "A"], "A"], [["A", "B", "B"], "B"], [["A", "B", "parda"], "A"], [["B", "A", "parda"], "B"],
    [["parda", "parda", "A"], "A"], [["parda", "parda", "B"], "B"], [["parda", "parda", "parda"], "B"], // mano = B
  ];
  for (const [results, expected] of cases) test(JSON.stringify(results), () => assert.equal(roundWinner(results, "B"), expected));
});

describe("truco", () => {
  test("values", () => {
    assert.deepEqual([0, 1, 2, 3].map((l) => trucoValue(l as 0 | 1 | 2 | 3)), [1, 2, 3, 4]);
    assert.deepEqual([1, 2, 3].map((l) => declinedTrucoPoints(l as 1 | 2 | 3)), [1, 2, 3]);
  });
  test("caller cannot raise own call; acceptor can", () => {
    let s = rig(weakA, strongB);
    s = singTruco(s, "B");
    s = respondToTruco(s, "A", true);
    assert.equal(s.turn, "B");
    throwsCode(() => singTruco(s, "B"), "NO_RAISE_RIGHT");
    s = playCard(s, "B", c("1", "espada"));
    s = singTruco(s, "A"); // A accepted, so A may raise
    assert.equal(s.trucoState.level, 2);
  });
  test("raise while answering; declining the raise pays the previous level", () => {
    let s = rig(weakA, strongB);
    s = singTruco(s, "B");
    s = singTruco(s, "A"); // A answers Truco with Retruco
    assert.equal(s.trucoState.level, 2);
    assert.equal(s.turn, "B");
    s = respondToTruco(s, "B", false);
    assert.equal(s.score.A, 2);
    assert.equal(s.roundNumber, 2);
  });
  test("vale cuatro is the ceiling", () => {
    let s = rig(weakA, strongB);
    s = singTruco(s, "B"); s = respondToTruco(s, "A", true);
    s = playCard(s, "B", c("1", "espada"));
    s = singTruco(s, "A"); s = respondToTruco(s, "B", true);
    assert.equal(s.turn, "A"); // A still has to answer B's card
    s = playCard(s, "A", c("4", "copa")); // B wins trick 1 and leads trick 2
    s = singTruco(s, "B"); // B accepted Retruco, so B may raise to Vale Cuatro
    assert.equal(s.trucoState.level, 3);
    s = respondToTruco(s, "A", true);
    assert.equal(s.trucoState.level, 3);
    assert.ok(!legalActions(s).actions.some((a) => a.type === "singTruco"));
  });
  test("declined truco awards points, redeals, rotates dealer", () => {
    let s = rig(weakA, strongB);
    s = singTruco(s, "B");
    s = respondToTruco(s, "A", false);
    assert.equal(s.score.B, 1);
    assert.equal(s.roundNumber, 2);
    assert.equal(s.dealer, "B");
    assert.equal(s.mano, "A");
  });
});

describe("turn handling (earlier review flags)", () => {
  test("after Truco is accepted at the start of trick 2, the trick leader is on turn", () => {
    let s = rig(weakA, strongB);
    s = playCard(s, "B", c("1", "espada"));
    s = playCard(s, "A", c("4", "copa")); // B wins trick 1, B leads trick 2
    assert.equal(s.turn, "B");
    s = singTruco(s, "B");
    s = respondToTruco(s, "A", true);
    assert.equal(s.phase, "trick_play");
    assert.equal(s.turn, "B");
  });
  test("after a parda trick, mano leads", () => {
    let s = rig([c("3", "espada"), c("4", "copa"), c("5", "copa")], [c("3", "basto"), c("6", "oro"), c("5", "oro")]);
    s = playCard(s, "B", c("3", "basto"));
    s = playCard(s, "A", c("3", "espada"));
    assert.equal(s.tricks[0].winner, "parda");
    assert.equal(s.turn, "B");
  });
});

describe("envido timing and interplay", () => {
  test("pie may call Envido after mano's first card (default); blocked when the rule is off", () => {
    let s = rig(weakA, strongB);
    s = playCard(s, "B", c("1", "espada"));
    assert.ok(canCallEnvido(s, "A"));
    s = singEnvido(s, "A", "envido");
    assert.equal(s.phase, "envido_pending_response");
    let off = rig(weakA, strongB, { pieMayCallEnvidoAfterManoPlays: false });
    off = playCard(off, "B", c("1", "espada"));
    throwsCode(() => singEnvido(off, "A", "envido"), "ENVIDO_CLOSED");
  });
  test("envido is closed once the caller has played, or trick 1 is over", () => {
    let s = rig(weakA, strongB);
    s = playCard(s, "B", c("1", "espada"));
    s = playCard(s, "A", c("4", "copa"));
    assert.ok(!canCallEnvido(s, "B"));
    throwsCode(() => singEnvido(s, "B", "envido"), "ENVIDO_CLOSED");
  });
  test("envido in answer to Truco, then Truco resumes", () => {
    const A = [c("7", "espada"), c("6", "espada"), c("4", "copa")]; // 33
    const B = [c("1", "basto"), c("1", "oro"), c("2", "copa")];     // 2
    let s = rig(A, B);
    s = singTruco(s, "B");
    assert.equal(s.phase, "truco_pending_response");
    s = singEnvido(s, "A", "envido");
    assert.equal(s.phase, "envido_pending_response");
    s = respondToEnvido(s, "B", true);
    assert.equal(s.score.A, 2);
    assert.equal(s.phase, "truco_pending_response");
    assert.equal(s.turn, "A");
    s = respondToTruco(s, "A", true);
    assert.equal(s.phase, "trick_play");
    assert.equal(s.turn, "B");
  });
  test("envido ties go to mano; declined envido pays the caller 1", () => {
    const hand = [c("7", "oro"), c("6", "oro"), c("4", "copa")];
    const hand2 = [c("7", "copa"), c("6", "copa"), c("4", "oro")]; // both 33
    let s = rig(hand, hand2);
    s = singEnvido(s, "B", "envido");
    s = respondToEnvido(s, "A", true);
    assert.equal(s.envidoState.winner, "B"); // mano
    let d = rig(weakA, strongB);
    d = singEnvido(d, "B", "envido");
    d = respondToEnvido(d, "A", false);
    assert.equal(d.score.B, 1);
  });
  test("falta envido won by the trailing player pays what the leader lacks", () => {
    const A = [c("7", "espada"), c("6", "espada"), c("4", "copa")]; // 33
    const B = [c("1", "basto"), c("1", "oro"), c("2", "copa")];
    let s = rig(A, B, { scoreTarget: 30 });
    s.score = { A: 10, B: 20 };
    s = singEnvido(s, "B", "falta_envido");
    s = respondToEnvido(s, "A", true);
    assert.equal(s.score.A, 20); // 10 + (30 - 20)
  });
});

describe("match end and guard rails", () => {
  test("round win that reaches the target ends the match", () => {
    let s = rig(weakA, strongB);
    s.score = { A: 0, B: 14 };
    s = playCard(s, "B", c("1", "espada")); s = playCard(s, "A", c("4", "copa"));
    s = playCard(s, "B", c("1", "basto"));
    s = playCard(s, "A", c("5", "copa"));
    assert.equal(s.phase, "match_end");
    assert.equal(s.winner, "B");
    throwsCode(() => playCard(s, "A", c("6", "copa")), "ILLEGAL_PHASE");
    assert.equal(legalActions(s).actions.length, 0);
  });
  test("illegal actions throw GameError", () => {
    const s = rig(weakA, strongB);
    throwsCode(() => playCard(s, "A", c("4", "copa")), "NOT_YOUR_TURN");
    throwsCode(() => playCard(s, "B", c("4", "copa")), "CARD_NOT_IN_HAND");
    throwsCode(() => respondToTruco(s, "A", true), "ILLEGAL_PHASE");
    throwsCode(() => respondToEnvido(s, "A", true), "ILLEGAL_PHASE");
  });
  test("input state is never mutated", () => {
    const s = rig(weakA, strongB);
    const snapshot = JSON.stringify(s);
    playCard(s, "B", c("1", "espada"));
    singTruco(s, "B");
    singEnvido(s, "B", "envido");
    assert.equal(JSON.stringify(s), snapshot);
  });
  test("publicView hides the opponent's cards", () => {
    const s = rig(weakA, strongB);
    const v = publicView(s, "A");
    assert.equal("hands" in v, false);
    assert.equal(v.myHand.cards.length, 3);
    assert.equal(v.opponentCardsLeft, 3);
    assert.ok(!JSON.stringify(v).includes('"espada"') || JSON.stringify(v.myHand).includes("espada") === JSON.stringify(v).includes('"suit":"espada"'));
    assert.ok(!JSON.stringify(v.myHand).includes("1"), "viewer A holds only 4,5,6 of copa");
  });
});

describe("full-game simulation", () => {
  test("3000 seeded random games finish, stay consistent, and every legal action is accepted", () => {
    const stats = { games: 0, rounds: 0, steps: 0, envidoAccepted: 0, envidoDeclined: 0, trucoMax: [0, 0, 0, 0], parda: 0, matchEndsByTrucoDecline: 0, maxSteps: 0 };
    for (let g = 0; g < 3000; g++) {
      const rng = mulberry32(1000 + g);
      const target = g % 2 === 0 ? 15 : 30;
      let s = createGame(`g${g}`, ["A", "B"], { scoreTarget: target as 15 | 30, pieMayCallEnvidoAfterManoPlays: g % 3 !== 0 }, rng);
      let steps = 0;
      while (s.phase !== "match_end") {
        steps++;
        assert.ok(steps < 4000, `game ${g} did not terminate`);
        const { player, actions } = legalActions(s);
        assert.ok(actions.length > 0, `no legal actions in phase ${s.phase}`);
        // The player NOT on turn must be rejected for any action.
        const idle = player === "A" ? "B" : "A";
        assert.throws(() => singTruco(s, idle), GameError);
        assert.throws(() => playCard(s, idle, s.hands[idle].cards[0] ?? c("4", "copa")), GameError);
        const action = actions[Math.floor(rng() * actions.length)];
        const before = s;
        s = applyAction(s, player, action, rng);
        // invariants
        for (const p of s.players) assert.ok(Number.isInteger(s.score[p]) && s.score[p] >= 0);
        const all = s.players.flatMap((p) => [...s.hands[p].cards, ...s.hands[p].played].map((x) => `${x.rank}-${x.suit}`));
        assert.equal(new Set(all).size, 6, "six unique cards in play");
        if (action.type === "respondEnvido") (action.accept ? stats.envidoAccepted++ : stats.envidoDeclined++);
        if (s.roundNumber > before.roundNumber) stats.rounds++;
        if (s.tricks.length && s.tricks[s.tricks.length - 1].winner === "parda") stats.parda++;
        stats.trucoMax[s.trucoState.level]++;
      }
      assert.ok(s.winner && s.score[s.winner] >= target, "winner reached the target");
      const loser = s.players.find((p) => p !== s.winner)!;
      assert.ok(s.score[loser] < target, "loser is below the target");
      stats.games++; stats.steps += steps; stats.maxSteps = Math.max(stats.maxSteps, steps);
    }
    console.log("SIM STATS", JSON.stringify(stats));
    assert.equal(stats.games, 3000);
  });
});

import { chooseAction } from "../src/bot.ts";
describe("computer opponent", () => {
  function match(seed: number, levels: Record<string, "easy" | "normal">, target: 15 | 30 = 15) {
    const rng = mulberry32(seed);
    let s = createGame("bot", ["A", "B"], { scoreTarget: target }, rng);
    let steps = 0;
    while (s.phase !== "match_end") {
      assert.ok(steps++ < 4000, "bot game did not terminate");
      const p = s.turn;
      s = applyAction(s, p, chooseAction(s, rng, levels[p]), rng); // throws if the bot picks an illegal action
    }
    return s.winner as string;
  }
  test("bot only ever plays legal moves and finishes games (both levels, 15 and 30)", () => {
    for (let g = 0; g < 300; g++) match(5000 + g, { A: "normal", B: g % 2 ? "normal" : "easy" }, g % 2 ? 15 : 30);
  });
  test("normal bot beats the random bot clearly, from either seat", () => {
    let wins = 0; const N = 600;
    for (let g = 0; g < N; g++) {
      const normalSeat = g % 2 ? "A" : "B";
      const w = match(9000 + g, { [normalSeat]: "normal", [normalSeat === "A" ? "B" : "A"]: "easy" });
      if (w === normalSeat) wins++;
    }
    console.log("BOT normal vs random win rate", (wins / N).toFixed(3));
    assert.ok(wins / N > 0.6, `win rate ${wins / N}`);
  });
  test("normal vs normal is roughly even (no seat bias)", () => {
    let a = 0; const N = 600;
    for (let g = 0; g < N; g++) if (match(20000 + g, { A: "normal", B: "normal" }) === "A") a++;
    console.log("BOT normal vs normal, seat A win rate", (a / N).toFixed(3));
    assert.ok(a / N > 0.4 && a / N < 0.6, `seat A ${a / N}`);
  });
});
