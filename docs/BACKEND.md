# Backend (v0.5.0)

Status: the game logic and the server handlers are tested (51 tests, no Firebase needed). The Firebase wiring in `functions/`
and the rules in `firestore.rules` type-check and compile, but have NOT been run against a real project or the emulator yet.
Treat the first deploy as a test.

## How it fits together
- `src/server/handlers.ts`: the only code that changes a game. Five calls: `createGameRoom`, `joinGame`, `getGameView`,
  `submitAction`, `claimTimeout`. They check who is asking, validate the move, run the engine and save with a version check.
- `functions/src/index.ts`: exposes those five calls as Cloud Functions (`createGame`, `joinGame`, `getGame`, `submitAction`,
  `claimTimeout`). Players must be signed in; their sign-in id is their player id.
- Firestore data (see `firestore.rules`):
  - `serverGames/{id}`: the full record with both hands. Nobody but the functions can read or write it.
  - `games/{id}`: public state (scores, turn, tricks, log, deadline, how many cards each player holds). Only the two players can read it.
  - `games/{id}/hands/{uid}`: that player's own cards. Only that player can read it.
  - Apps never write to Firestore directly; every change goes through a function.
- Timeouts: each move has a 90-second deadline (`turnSeconds` in `functions/src/index.ts`). After it passes, the waiting player calls
  `claimTimeout` and wins the round (a pending Truco counts as declined). Reconnecting is just reading `games/{id}` again.
- Two changes at the same moment: each save checks a version number, so one succeeds and the other gets a `CONFLICT` and retries.

## First-time setup (needs you)
1. Create the Firebase project; turn on Authentication (Anonymous or Google sign-in) and Firestore.
   Cloud Functions may need the pay-as-you-go plan: check the current terms.
2. Install Node.js 22+ and the Firebase tools (`npm install -g firebase-tools`), then `firebase login`.
3. In this folder: `firebase use --add` (pick your project), then `cd functions && npm install && cd ..`.
4. Try it locally first: `firebase emulators:start`. Then deploy: `firebase deploy`.
5. Tell Claude what happens; the first deploy usually needs a fix or two.

## Trying the flow without Firebase
Open `web/online.html`. It runs the same handlers in the browser over an in-memory store, so you can create a game, join it as the second player,
play, skip the clock 91 seconds and claim a timeout, and press the cheat buttons to watch the server reject forged moves. Going live means
replacing its handler calls with the five Cloud Functions; the data it receives (`GameView`, including `legalActions`) is the same.

## Known gaps
- Firestore rules are not yet covered by automated tests (needs the emulator).
- No lobby listing or invite-link page yet (a game id is the invite).
- Forfeit on timeout is the only abandon rule; folding (irse al mazo) is still undecided (D8).
