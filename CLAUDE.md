# CLAUDE.md - Truco app

Two beginners are building an online Argentine Truco app. Explain code in plain language when asked, prefer small tested
steps over big rewrites, and say plainly what has not been verified.

## Source of truth
- Game rules: `RULES.md`. Change the rules there first, then the code and tests.
- Rule switches live in `Rules` in `src/types.ts`. Open decisions are listed in RULES.md section 7.
- Project summary and history: `docs/HANDOFF.md`.

## Engine conventions (src/)
- Pure TypeScript, no dependencies, no network or database code. Every action takes a GameState and returns a new one.
- Never mutate the input state. Illegal actions throw `GameError` with a code.
- `GameState` holds both hands and must stay on the server. Clients only get `publicView(state, playerId)`.
- Randomness is injected (`rng`) so tests are repeatable.
- `legalActions(state)` is the single list of allowed moves; the bot and the test page both use it.

## Commands (Node 22.6+)
- Tests: `npm test` (no install needed). Every rule change needs a test; the simulations must keep passing.
- Types: `npm install` then `npm run typecheck` (strict). Run it before finishing a change.
- Rebuild the test page: `npm install` then `npm run build:web` (writes web/index.html from web/ui.template.html).

## Server layer
- `src/server/handlers.ts` is the only code that changes a stored game. Clients send actions; handlers check the caller, validate input
  with `parseAction`, run the engine, and save with a version check. Storage is injected (`InMemoryStore` in tests, Firestore in `functions/`).
- Public Firestore data must never contain unplayed cards; `server.test.ts` checks this. Keep that test passing.
- Views returned to clients include `legalActions`; clients should use that list instead of re-implementing rules.
- `web/online.html` runs these same handlers in the browser over `InMemoryStore` (a local stand-in for Firebase). To go live, swap its calls for the Cloud Functions.
- Details: `docs/BACKEND.md`.

## Plan
Rules confirmed > bot (done) > server layer, functions and Firestore rules (written, not yet run on Firebase) > run on the emulator
and deploy > two-browser online test > mobile app > assets > beta > store. No real-money betting mechanics.
See `TODO.md`.

## Known gaps
Folding, Flor, Truco out of turn and Envido after Retruco are not implemented. The bot is a modest rule-based player.
The Firebase wiring has not been run on Firebase or its emulator; the Firestore rules have no automated tests; lobby, sign-in UI and
phone app do not exist yet. The page was tested in a simulated browser, not on real devices.
