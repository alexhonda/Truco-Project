# Truco App

An online Argentine Truco card game (two players, Envido, no Flor), built by two friends with Claude.

**Version 0.5.2.** Status: a tested rules engine, a computer opponent, a browser test table and a server layer for online games
(tested without Firebase; the Firebase wiring has not been run yet). No phone app yet. See `CHANGELOG.md`.
See `TODO.md` for what is next and `docs/HANDOFF.md` for the full project summary.

## Try it right now (no install)
Open `web/index.html` in a browser (double-click it). For the online flow, open `web/online.html`: two panels, one per player, talking to a local copy of the server code (create a game, join it, play, try the cheat buttons). Two people can share one screen, or tick
"Player 2 is the computer" to play alone. The three checkboxes at the top are the open rule decisions.

## Run the tests
You need Node.js 22.6 or newer (nodejs.org). Then, in this folder:

    npm test

You should see 52 passing tests, including simulated full games. No `npm install` is needed for the tests.
`npm install` then `npm run typecheck` runs a stricter check of the code.

## Rebuild the test page after changing the engine

    npm install
    npm run build:web

## Folder map
- `RULES.md` - the rules exactly as the engine plays them, plus the open decisions. The source of truth.
- `src/` - the engine (pure logic): `engine.ts` (the moves), `cards.ts`, `envido.ts`, `truco.ts`, `types.ts`, `bot.ts` (computer opponent), `browser.ts` (what the test page uses).
- `src/server/` - the online-game handlers (create, join, move, timeout) and their storage interface.
- `functions/` and `firestore.rules` - the Firebase wiring and security rules (see `docs/BACKEND.md`). Not yet run on Firebase.
- `test/` - all automated tests (`engine.test.ts`, `server.test.ts`).
- `web/` - the test pages. Edit the `*.template.html` files, then rebuild; `index.html` and `online.html` are generated.
- `docs/` - `HANDOFF.md` (project summary), `HANDOFF.ja.md` (Japanese summary), `BACKEND.md` (online design and setup), `GITHUB-SETUP.md` (how to put this on GitHub), `Truco_Chat_Analysis_v1.10.xlsx` (the working record: findings, rule-decision sheet, to-do list).
- `CLAUDE.md` - instructions Claude reads at the start of every session.
- `.github/workflows/test.yml` - makes GitHub run the tests on every change.

## Rules you two still need to settle
Falta Envido scoring, Envido after the first card, who leads after a tied trick, 15 vs 30, folding, Flor.
They are listed in `RULES.md` section 7 and in the "Rule Decisions" sheet of the workbook.

## Working together
- Keep `main` working: run `npm test` before you save changes to it.
- For anything bigger than a small fix, make a branch, open a pull request, and let the other person look at it before merging.
- Start each Claude session by attaching `docs/HANDOFF.md` and saying what you want to do today.
