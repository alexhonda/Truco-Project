// Cloud Functions entry point. DRAFT: type-checked, but NOT yet run against a real Firebase project or the emulator.
// All game logic lives in ../../src (engine + server handlers); this file only wires them to Firestore and sign-in.
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import * as h from "../../src/server/handlers.ts";
import { ServerError } from "../../src/server/errors.ts";
import type { GameRecord, GameStore } from "../../src/server/store.ts";

initializeApp();
const db = getFirestore();

/** Saves the full server record plus the two public/private views in ONE transaction, only if the version matches. */
const store: GameStore = {
  async get(id) {
    const snap = await db.collection("serverGames").doc(id).get();
    return snap.exists ? (snap.data() as GameRecord) : null;
  },
  async put(rec, expectedVersion) {
    return db.runTransaction(async (tx) => {
      const ref = db.collection("serverGames").doc(rec.id);
      const snap = await tx.get(ref);
      const current = snap.exists ? (snap.data() as GameRecord).version : 0;
      if (current !== expectedVersion) return false;
      tx.set(ref, JSON.parse(JSON.stringify(rec)));
      const pub = db.collection("games").doc(rec.id);
      tx.set(pub, h.publicDoc(rec));
      for (const uid of [rec.host, rec.guest]) {
        if (uid && rec.state) tx.set(pub.collection("hands").doc(uid), h.handDoc(rec, uid));
      }
      return true;
    });
  },
};

const deps: h.Deps = { store, now: () => Date.now(), rng: Math.random, newId: () => randomUUID(), turnSeconds: 90 };

const CODES: Record<string, "not-found" | "aborted" | "permission-denied" | "invalid-argument" | "failed-precondition"> = {
  NOT_FOUND: "not-found", CONFLICT: "aborted", NOT_A_PLAYER: "permission-denied", GAME_FULL: "permission-denied", BAD_REQUEST: "invalid-argument",
};

function callable<T>(fn: (uid: string, data: Record<string, unknown>) => Promise<T>) {
  return onCall(async (req: CallableRequest) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
    try {
      return await fn(req.auth.uid, (req.data ?? {}) as Record<string, unknown>);
    } catch (e) {
      if (e instanceof ServerError) throw new HttpsError(CODES[e.code] ?? "failed-precondition", e.message, { code: e.code, detail: e.detail });
      throw e;
    }
  });
}

export const createGame = callable((uid, d) => h.createGameRoom(deps, uid, d.rules));
export const joinGame = callable((uid, d) => h.joinGame(deps, uid, String(d.gameId)));
export const getGame = callable((uid, d) => h.getGameView(deps, uid, String(d.gameId)));
export const submitAction = callable((uid, d) => h.submitAction(deps, uid, String(d.gameId), d.action));
export const claimTimeout = callable((uid, d) => h.claimTimeout(deps, uid, String(d.gameId)));
