import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { Card, GameState } from "../src/types.ts";
import { buildDeck, cardEquals } from "../src/cards.ts";
import { applyAction, createGame, legalActions } from "../src/engine.ts";
import { chooseAction } from "../src/bot.ts";

function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function randomAction(s: GameState, rng: () => number) { const a = legalActions(s).actions; return a[Math.floor(rng() * a.length)]; }

function play(g: number, botSeat: "A" | "B", other: "bot" | "random") {
  const rng = mulberry32(5000 + g);
  let s = createGame(`b${g}`, ["A", "B"], { scoreTarget: 15 }, rng);
  let steps = 0;
  while (s.phase !== "match_end") {
    assert.ok(++steps < 4000, "game did not finish");
    const me = s.turn;
    const action = me === botSeat || other === "bot" ? chooseAction(s, rng) : randomAction(s, rng);
    const legal = legalActions(s).actions;
    assert.ok(legal.some((x) => JSON.stringify(x) === JSON.stringify(action)), "bot chose an illegal action");
    s = applyAction(s, me, action, rng);
  }
  return s.winner;
}

describe("computer opponent", () => {
  test("bot vs bot: 300 games finish and every chosen action is legal", () => {
    for (let g = 0; g < 300; g++) assert.ok(play(g, "A", "bot"));
  });

  test("bot never looks at the opponent's hidden cards", () => {
    let checked = 0;
    for (let g = 0; g < 200; g++) {
      const rng = mulberry32(900 + g);
      let s = createGame(`p${g}`, ["A", "B"], {}, rng);
      for (let step = 0; step < 40 && s.phase !== "match_end"; step++) {
        const me = s.turn, opp = me === "A" ? "B" : "A";
        // swap the opponent's unplayed cards for other cards the bot cannot see
        const visible = [...s.hands[me].cards, ...s.hands[me].played, ...s.hands[opp].played];
        const unseen = buildDeck().filter((c) => !visible.some((v) => cardEquals(v, c)) && !s.hands[opp].cards.some((v) => cardEquals(v, c)));
        const alt: GameState = JSON.parse(JSON.stringify(s));
        const n = alt.hands[opp].cards.length;
        const shuffled = [...unseen].sort(() => rng() - 0.5);
        alt.hands[opp].cards = shuffled.slice(0, n) as Card[];
        const seed = 77 + g * 100 + step;
        assert.deepEqual(chooseAction(s, mulberry32(seed)), chooseAction(alt, mulberry32(seed)));
        checked++;
        s = applyAction(s, me, randomAction(s, rng), rng);
      }
    }
    assert.ok(checked > 1000);
  });

  test("bot beats a random player clearly", () => {
    let wins = 0;
    const N = 600;
    for (let g = 0; g < N; g++) {
      const seat = g % 2 === 0 ? "A" : "B";
      if (play(g, seat, "random") === seat) wins++;
    }
    console.log("BOT WIN RATE vs RANDOM", wins, "/", N);
    assert.ok(wins / N > 0.65, `win rate only ${wins / N}`);
  });
});
