# Truco Argentino - Rules as implemented

Status: DRAFT. Section 7 lists decisions the two of you still need to confirm.
This file is the single source of truth. If the code and this file disagree, fix one of them.

## 1. Deck and card strength
Spanish 40-card deck (no 8s, 9s or jokers), 4 suits: espada, basto, oro, copa.
Trick strength, highest to lowest:
1. 1 de espada  2. 1 de basto  3. 7 de espada  4. 7 de oro
5. all 3s  6. all 2s  7. 1 de oro and 1 de copa  8. all 12s  9. all 11s  10. all 10s
11. 7 de basto and 7 de copa  12. all 6s  13. all 5s  14. all 4s
Cards in the same tier tie.

## 2. Round
Two players. Each round: shuffle, deal 3 cards each. The dealer alternates every round.
The player who is not the dealer is "mano" and plays first in trick 1.

## 3. Tricks and ties (parda)
A round has up to 3 tricks; the higher card wins each trick. The trick winner leads the next one.
If a trick is tied (parda), mano leads the next trick. Round winner:
- Two trick wins decide the round.
- Trick 1 tied: whoever wins trick 2 wins the round.
- Trick 2 tied: whoever won trick 1 wins the round.
- Tricks 1 and 2 both tied: whoever wins trick 3 wins the round.
- One win each, trick 3 tied: whoever won trick 1 wins the round.
- All three tied: mano wins.

## 4. Envido
Face cards (10, 11, 12) count 0; other cards count their number. Envido value: two or three cards of
the same suit = highest two pips + 20 (max 33); no pair = the highest single pip. Highest value wins; ties go to mano.
Calls (stack): Envido, then Envido again, Real Envido, Falta Envido. Rules:
- Points if accepted: Envido 2, second Envido 2, Real Envido 3, added together.
  Falta Envido = points the leading player still needs to reach the target (minimum 1).
- If declined, the caller gets the points of the stack accepted before the declined call (minimum 1).
- Timing: trick 1 only, and only before the caller has played a card. Mano may call at the start;
  the second player may still call after mano's card (see decision D3).
- Envido may also be called while a first-level Truco is waiting for an answer ("el envido esta primero");
  the Truco is answered afterwards.
- A player may raise an Envido call instead of answering it.

## 5. Truco
Levels: Truco (round worth 2), Retruco (3), Vale Cuatro (4); an unsung round is worth 1.
- A call can be made on your own turn. Only the player who accepted the last call may raise it.
- A player may raise (e.g. Truco to Retruco) instead of answering.
- If declined, the caller gets the value of the previously accepted level (1, 2 or 3 points) and a new round starts.

## 6. Match
First player to reach the target (15 or 30) wins immediately, including from an Envido or declined call.

## 6b. Timeouts (online play)
Each move has a 90-second deadline. If the player on turn runs out of time, the other player may claim the round: they get the round's
current value, or, if a Truco call was waiting for the slow player, the same points as a declined call. (Default, to be confirmed: D12.)

## 7. Open decisions (confirm with your friend)
| ID | Question | Engine default | How to change |
|----|----------|----------------|---------------|
| D1 | Accepted Falta Envido: replaces earlier Envido calls or adds to them? | Replaces | Switch `faltaReplacesStack` |
| D2 | Falta Envido amount: what the leader still needs, or what the winner still needs? | Leader | Code change (envido.ts) |
| D3 | May the second player call Envido after mano's first card? | Yes | Switch `pieMayCallEnvidoAfterManoPlays` |
| D4 | After a tied trick, who leads: mano or the player who led the tied trick? | Mano | Code change (engine.ts) |
| D5 | Envido points: 2 / 2 / 3, declined 1? | As listed | Constants in envido.ts |
| D6 | Match target: 15 or 30? | 15 | Switch `scoreTarget` |
| D7 | Ties in Envido go to mano? | Yes | Code change (engine.ts) |
| D8 | Fold ("irse al mazo"): allowed? What does it cost? | Not implemented | New code + tests |
| D9 | Flor (three cards of one suit): played? | Not implemented | New code + tests |
| D10 | May Truco be called out of turn? | No, own turn only | New code + tests |
| D11 | May Envido be called after Retruco or Vale Cuatro? | No | Code change (canCallEnvido) |
| D12 | Online: how long per move, and what does running out of time cost? | 90 s; opponent claims the round | Constant `turnSeconds` (functions/src/index.ts) |
