import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { Card, GameState } from "../src/types.ts";
import { GameError, createGame, forfeitRound, legalActions, singTruco } from "../src/engine.ts";
import { InMemoryStore } from "../src/server/store.ts";
import type { GameRecord } from "../src/server/store.ts";
import { ServerError } from "../src/server/errors.ts";
import { claimTimeout, createGameRoom, getGameView, handDoc, joinGame, parseAction, parseRules, publicDoc, submitAction } from "../src/server/handlers.ts";
import type { Deps } from "../src/server/handlers.ts";

function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function setup(seed = 1) {
  let clock = 1_000_000, n = 0;
  const store = new InMemoryStore();
  const deps: Deps = { store, now: () => clock, rng: mulberry32(seed), newId: () => `game${++n}`, turnSeconds: 90 };
  return { deps, store, advance: (ms: number) => { clock += ms; } };
}
const failsWith = async (p: Promise<unknown>, code: string) =>
  assert.rejects(p, (e: unknown) => e instanceof ServerError && e.code === code, `expected ${code}`);
const key = (c: Card) => `"rank":"${c.rank}","suit":"${c.suit}"`;

describe("engine: forfeitRound", () => {
  test("opponent gets the round value; unanswered Truco counts as declined; wrong player rejected", () => {
    const s = createGame("f", ["A", "B"], {}, mulberry32(3));
    const onTurn = s.turn, other = onTurn === "A" ? "B" : "A";
    const r = forfeitRound(s, onTurn, mulberry32(4));
    assert.equal(r.score[other], 1);
    assert.equal(r.roundNumber, 2);
    assert.throws(() => forfeitRound(s, other), (e: unknown) => e instanceof GameError && e.code === "NOT_YOUR_TURN");
    let t = singTruco(s, onTurn); // truco level 1 pending, responder = other
    t = singTruco(t, other); // raise to retruco (level 2), responder = onTurn
    const r2 = forfeitRound(t, onTurn, mulberry32(5)); // declined retruco = 2 points to `other`
    assert.equal(r2.score[other], 2);
  });
});

describe("lobby", () => {
  test("create, join, view", async () => {
    const { deps } = setup();
    const v = await createGameRoom(deps, "alice", { scoreTarget: 30, bogus: 1 });
    assert.equal(v.status, "waiting");
    assert.equal(v.state, null);
    await failsWith(submitAction(deps, "alice", v.gameId, { type: "singTruco" }), "GAME_NOT_STARTED");
    const j = await joinGame(deps, "bob", v.gameId);
    assert.equal(j.status, "playing");
    assert.equal(j.state?.rules.scoreTarget, 30);
    assert.equal(j.state?.myHand.cards.length, 3);
    assert.equal((await joinGame(deps, "bob", v.gameId)).version, j.version); // joining twice changes nothing
    assert.equal((await joinGame(deps, "alice", v.gameId)).version, j.version); // host re-opening the link is fine
    await failsWith(joinGame(deps, "carol", v.gameId), "GAME_FULL");
    await failsWith(joinGame(deps, "bob", "nope"), "NOT_FOUND");
  });
  test("outsiders cannot view or act", async () => {
    const { deps } = setup();
    const v = await createGameRoom(deps, "alice");
    await joinGame(deps, "bob", v.gameId);
    await failsWith(getGameView(deps, "mallory", v.gameId), "NOT_A_PLAYER");
    await failsWith(submitAction(deps, "mallory", v.gameId, { type: "singTruco" }), "NOT_A_PLAYER");
    await failsWith(claimTimeout(deps, "mallory", v.gameId), "NOT_A_PLAYER");
  });
  test("rules input is sanitised", () => {
    assert.deepEqual(parseRules({ scoreTarget: 99, faltaReplacesStack: "yes", pieMayCallEnvidoAfterManoPlays: false, x: 1 }), { pieMayCallEnvidoAfterManoPlays: false });
    assert.deepEqual(parseRules(null), {});
  });
});

describe("legal actions in views", () => {
  test("only the player on turn gets moves, and they match the engine", async () => {
    const { deps, store } = setup();
    const v = await createGameRoom(deps, "alice");
    assert.deepEqual(v.legalActions, []); // waiting for an opponent
    await joinGame(deps, "bob", v.gameId);
    const rec = (await store.get(v.gameId))!;
    const onTurn = rec.state!.turn, waiting = onTurn === "alice" ? "bob" : "alice";
    assert.deepEqual((await getGameView(deps, onTurn, v.gameId)).legalActions, legalActions(rec.state!).actions);
    assert.deepEqual((await getGameView(deps, waiting, v.gameId)).legalActions, []);
    assert.ok((await getGameView(deps, onTurn, v.gameId)).legalActions.length >= 4); // 3 cards + calls
  });
});

describe("untrusted input", () => {
  test("parseAction accepts good actions and rejects junk", () => {
    assert.deepEqual(parseAction({ type: "playCard", card: { rank: "1", suit: "espada", extra: 1 } }), { type: "playCard", card: { rank: "1", suit: "espada" } });
    assert.deepEqual(parseAction({ type: "respondTruco", accept: true }), { type: "respondTruco", accept: true });
    const junk: unknown[] = [null, 5, "x", {}, { type: "playCard" }, { type: "playCard", card: { rank: "9", suit: "oro" } }, { type: "playCard", card: { rank: "1", suit: "hearts" } },
      { type: "singEnvido", call: "mega" }, { type: "respondEnvido", accept: "true" }, { type: "respondTruco" }, { type: "__proto__" }, { type: "applyAction" }];
    for (const j of junk) assert.throws(() => parseAction(j), (e: unknown) => e instanceof ServerError && e.code === "BAD_REQUEST");
  });
  test("illegal moves come back as ILLEGAL_MOVE with the engine code", async () => {
    const { deps } = setup();
    const v = await createGameRoom(deps, "alice");
    const j = await joinGame(deps, "bob", v.gameId);
    const s = j.state!;
    const idle = s.turn === "alice" ? "bob" : "alice";
    await assert.rejects(submitAction(deps, idle, v.gameId, { type: "singTruco" }), (e: unknown) => e instanceof ServerError && e.code === "ILLEGAL_MOVE" && e.detail === "NOT_YOUR_TURN");
    await failsWith(submitAction(deps, s.turn, v.gameId, { type: "hack" }), "BAD_REQUEST");
  });
});

describe("timeouts and concurrency", () => {
  test("claimTimeout only after the deadline, only by the waiting player", async () => {
    const { deps, advance } = setup();
    const v = await createGameRoom(deps, "alice");
    const j = await joinGame(deps, "bob", v.gameId);
    const onTurn = j.state!.turn, waiting = onTurn === "alice" ? "bob" : "alice";
    await failsWith(claimTimeout(deps, waiting, v.gameId), "TIMEOUT_NOT_REACHED");
    advance(91_000);
    await failsWith(claimTimeout(deps, onTurn, v.gameId), "BAD_REQUEST");
    const r = await claimTimeout(deps, waiting, v.gameId);
    assert.equal(r.state!.score[waiting], 1);
    assert.equal(r.state!.roundNumber, 2);
    assert.ok(r.turnDeadline! > 1_000_000 + 91_000, "new deadline starts after the claim");
    // after the claim a new round starts with a fresh deadline: the same claim must not work again immediately
    await assert.rejects(claimTimeout(deps, waiting, v.gameId), (e: unknown) => e instanceof ServerError && (e.code === "TIMEOUT_NOT_REACHED" || e.code === "BAD_REQUEST"));
  });
  test("a stale write is rejected, not silently applied", async () => {
    const { deps, store } = setup();
    const v = await createGameRoom(deps, "alice");
    await joinGame(deps, "bob", v.gameId);
    const rec = (await store.get(v.gameId))!;
    assert.equal(await store.put({ ...rec, version: rec.version + 1 }, rec.version - 1), false);
    assert.equal(await store.put({ ...rec, version: rec.version + 1 }, rec.version), true);
    assert.equal(await store.put({ ...rec, version: rec.version + 1 }, rec.version), false);
  });
  test("two submits against the same version: exactly one wins", async () => {
    const { deps } = setup();
    const v = await createGameRoom(deps, "alice");
    const j = await joinGame(deps, "bob", v.gameId);
    const mover = j.state!.turn;
    const res = await Promise.allSettled([
      submitAction(deps, mover, v.gameId, { type: "singTruco" }),
      submitAction(deps, mover, v.gameId, { type: "singTruco" }),
    ]);
    const ok = res.filter((r) => r.status === "fulfilled").length;
    assert.equal(ok, 1, "one succeeded");
    assert.ok(res.some((r) => r.status === "rejected"));
  });
});

describe("privacy and full games through the handlers", () => {
  test("100 games played only through handlers: no leaks, consistent views, game ends", async () => {
    for (let g = 0; g < 100; g++) {
      const { deps, store } = setup(500 + g);
      const rng = mulberry32(9000 + g);
      const v = await createGameRoom(deps, "alice", { scoreTarget: g % 2 ? 15 : 30 });
      let view = await joinGame(deps, "bob", v.gameId);
      let steps = 0;
      while (view.status !== "finished") {
        assert.ok(steps++ < 4000, "did not finish");
        const rec = (await store.get(v.gameId)) as GameRecord;
        const st = rec.state as GameState;
        const { player, actions } = legalActions(st);
        const other = player === "alice" ? "bob" : "alice";
        // privacy: public doc has no unplayed card from either hand; hand docs match; views show only own hand
        // earlier rounds' cards stay in the log (they were public when played), so only check the current round's log
        const lastDeal = st.log.map((l) => l.event).lastIndexOf("round_dealt");
        const currentRound = (o: { log: unknown[] }) => JSON.stringify({ ...o, log: o.log.slice(lastDeal) });
        const pubDoc = publicDoc(rec) as { game: { log: unknown[] } };
        const pubJson = currentRound(pubDoc.game);
        for (const p of ["alice", "bob"]) for (const c of st.hands[p].cards) assert.ok(!pubJson.includes(key(c)), "unplayed card leaked into the public doc");
        assert.ok(!("hands" in pubDoc.game) && !JSON.stringify(publicDoc(rec)).includes('"hands"'));
        assert.deepEqual(handDoc(rec, player), st.hands[player]);
        const mine = (await getGameView(deps, player, v.gameId)).state!;
        const theirs = (await getGameView(deps, other, v.gameId)).state!;
        assert.deepEqual(mine.myHand, st.hands[player]);
        assert.equal(theirs.opponentCardsLeft, st.hands[player].cards.length);
        const theirJson = currentRound(theirs);
        for (const c of st.hands[player].cards) assert.ok(!theirJson.includes(key(c)), "opponent view leaked a card");
        // the idle player cannot move
        await failsWith(submitAction(deps, other, v.gameId, { type: "singTruco" }), "ILLEGAL_MOVE");
        const action = actions[Math.floor(rng() * actions.length)];
        view = await submitAction(deps, player, v.gameId, action);
      }
      const final = (await store.get(v.gameId))!;
      assert.equal(final.status, "finished");
      assert.equal(final.turnDeadline, null);
      await failsWith(submitAction(deps, "alice", v.gameId, { type: "singTruco" }), "GAME_OVER");
    }
  });
});
