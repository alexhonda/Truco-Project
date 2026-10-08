# Truco App - Handoff (v0.5.2)

Prepared 4 October 2026 for the two builders and for any new Claude session. A fuller version with a glossary is the
Google Doc "Truco App - Handoff Document" in the owner's Drive.

## 1. Summary
Two beginners are building an online Argentine Truco card game (two players, Envido, no Flor). A first chat produced a plan and a
draft engine that was never run end to end: the tool sandbox kept failing, two bugs were found by hand, and the chat hit its
context and spending limits. A follow-up chat then:
- analysed the first chat in an Excel workbook (`docs/Truco_Chat_Analysis_v1.10.xlsx`) with a findings register;
- rebuilt the engine from the visible code and the spec (the original files were cut off in the PDF export and never run), fixing the review findings;
- reached 41 passing tests, including 3,000 simulated full games;
- built a computer opponent and a browser test table (`web/index.html`);
- prepared RULES.md, CLAUDE.md, a decision sheet and a to-do list.

**Where it stands (v0.5.0):** tested rules engine, bot, test table, and a tested server layer for online games (create, join, move,
timeout) with Cloud Functions wiring and Firestore security rules. The Firebase wiring has not been run on Firebase or its emulator yet.
No phone app yet. 52 automated tests. `web/online.html` lets you try the online flow (create, join, move, timeout, cheat attempts) against a local copy of the server code. See `docs/BACKEND.md`.

## 2. Decisions made
- Argentine Truco with Envido, no Flor. Both builders are beginners. Online multiplayer is a must-have from the start.
- Chosen approach: native iOS and Android built separately (still open to revisit; Flutter or Expo would roughly halve the screen work).
- Architecture: pure-logic engine; Firebase will hold the authoritative game state; clients only send actions.
- No real-money betting mechanics.

## 3. How the engine works
Every move takes a GameState and returns a new one, or throws `GameError`. `legalActions` lists the allowed moves,
`applyAction` runs one, `publicView(state, playerId)` returns what one player may see (the full state holds both hands and
must stay on the server). `chooseAction` in `bot.ts` is the computer opponent: it sees only its own hand and public information,
only picks legal moves, beat a random player 66% of the time and splits evenly against itself.

## 4. Rules
See `RULES.md`. Open decisions (defaults in brackets): D1 Falta Envido replaces earlier calls [yes]; D2 Falta based on the leader
[yes]; D3 second player may call Envido after mano's card [yes]; D4 mano leads after a tie [yes]; D5 Envido points 2/2/3, declined 1;
D6 target [15]; D7 Envido ties to mano [yes]; D8 folding, D9 Flor, D10 Truco out of turn, D11 Envido after Retruco: not implemented.

## 5. What went wrong first, and what was fixed
- A const reassignment (invalid code) in the Truco response.
- Round-winner logic gave the round to mano instead of the trick-3 winner when tricks 1 and 2 tied (14-case test matrix now covers it).
- Review fixes in the rebuild: wrong player on turn after an accepted Truco at the start of trick 2; Envido closing too early for the
  second player; no rule stopping a caller raising their own call; Falta Envido using the winner's score; both hands in one shared object.
- Lesson: start a fresh chat per task and attach this file.

## 6. Risks and caveats
- Scope is the biggest risk: two beginners, two native apps and online play from day one. Revisit native vs cross-platform before building screens.
- Written but not yet run on Firebase: Cloud Functions wiring and Firestore rules (type-checked and compiled only). Not built: sign-in screens, lobby, phone app, card art and sounds.
- Timeout policy (90 s, waiting player claims the round) is a default I chose; confirm it with your friend.
- The test table was click-tested in a simulated browser only; it has not been checked on a real screen or phone.
- Firebase plan costs and store fees change; check current terms. The GitHub workflow file has not been run on GitHub yet.

## 6b. Phone-screen mockups
Four draft screens (Home, Invite, Your move, Answer a call) as a design canvas: https://claude.ai/artifact/C1kT7AF7nd87YfZibLuG4B (visible to the account owner; share it from the canvas if your friend should see it). Felt-green, ivory, brass look; card art is placeholder text. Agree or change the look before the app is built.

## 7. Next steps
See `TODO.md`. In short: play test hands, settle the rules, create the Firebase project and run the emulator (BACKEND.md), then Claude
fixes what the first run shows, adds the confirmed rules, builds a two-browser online test, then sign-in, mockups and the mobile app.

## 8. Resume prompt
> We are building an online Argentine Truco app (two players, Envido, no Flor). Read docs/HANDOFF.md and RULES.md first;
> RULES.md is the source of truth. The engine is pure TypeScript in src/ and must never mutate its input state; run `npm test`
> after every change and add a test for every rule change. Hands stay server-side (use publicView). I am a beginner, so explain
> code in plain language. Today I want to: [your goal].
