# To-do

Tick a box by changing `[ ]` to `[x]`. The workbook in `docs/` has the same list with how-to notes and a status dropdown.

## You and your friend
- [ ] Play 10+ hands on `web/index.html` (also against the computer) and note anything that feels wrong
- [ ] Settle the open rules (RULES.md section 7, or the Rule Decisions sheet) and send them to Claude
- [ ] Create the Firebase project (Authentication + Firestore); check whether Cloud Functions needs a paid plan; follow `docs/BACKEND.md`
- [ ] Install Node.js 22+ and run `npm test` on your own computer
- [ ] Decide: two native apps (Swift + Kotlin) or one cross-platform app (Flutter or Expo)
- [ ] Choose where the card art, sounds and "Truco!" voice lines come from; check licences
- [ ] Line up 3-5 friends for a private beta
- [ ] Create store developer accounts (Apple, Google Play) - check current fees; do this late
- [ ] Privacy policy and store screenshots

## Claude
- [x] Rules engine with tests, including 3,000 simulated games
- [x] Browser test table (two players or vs the computer)
- [x] Computer opponent
- [ ] Write the confirmed decisions into RULES.md, set the switches, add tests, re-tune the bot
- [ ] Add any extra rules chosen (fold, Flor, Truco out of turn)
- [x] Server handlers (create, join, move, claim timeout), Cloud Functions wiring and Firestore rules - written and type-checked
- [x] Move timeouts (90 s, claim the round) and resuming (re-read the game)
- [ ] Fix whatever the first emulator run and first deploy turn up; add emulator tests for the Firestore rules
- [x] Online test page against a local copy of the server code (`web/online.html`)
- [ ] Point that page at the real Cloud Functions once deployed; sign-in and invite links
- [ ] Screen mockups, then the mobile app(s)
- [ ] Fresh Japanese summary once the rules are settled
