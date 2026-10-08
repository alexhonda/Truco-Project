# Changelog

## v0.5.2 - 2026-10-07
- Docs only: `docs/HANDOFF.ja.md`, a Japanese summary of the project state. Refresh it once the rules are settled.

## v0.5.1 - 2026-10-07
- Docs only: phone-screen mockups (design canvas, see docs/HANDOFF.md) and workbook v1.9. No code changes.

## v0.5.0 - 2026-10-06
- Online test page (`web/online.html`): two player panels talking to the real server handlers running inside the page (create game, join, move, claim timeout), with cheat buttons that show the server rejecting forged or malformed requests. No Firebase needed.
- Server views now include `legalActions`, so clients never re-implement the rules.
- 52 tests; `npm run build:web` now builds both pages.

## v0.4.0 - 2026-10-05
- Server layer (`src/server/`): create game, join game, submit action, claim timeout, get view. Storage is injected, so it runs in tests and in Cloud Functions.
- Cloud Functions wiring (`functions/`) and Firestore security rules (`firestore.rules`). Type-checked and compiled; NOT yet run against Firebase or its emulator.
- Timeout policy: 90 seconds per move; the waiting player may claim the round (`forfeitRound` in the engine).
- Untrusted-input checks (`parseAction`, `parseRules`), privacy tests (no unplayed cards in public data) and 100 full games played through the handlers.
- `npm run typecheck` (TypeScript strict mode over src and tests); CI now runs typecheck and tests. 51 tests.

## v0.3.0 - 2026-10-05
- Repository package: README, RULES.md, CLAUDE.md, TODO.md, docs, test table build script, CI workflow.

## v0.2.0 - 2026-10-04
- Computer opponent (`src/bot.ts`), vs-computer mode in the test table, 41 tests.

## v0.1.0 - 2026-10-04
- Rebuilt rules engine with 38 tests including 3,000 simulated games; hot-seat test table.
