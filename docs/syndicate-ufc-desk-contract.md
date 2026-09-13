# Sharpe Syndicate UFC / MMA desk contract (internal)

**Audience:** Ryan + agents. **Not** public marketing copy.  
**Status:** Locked 2026-09-12. Current live UFC engine (`loungeBotUfcPredictive.ts`) does **not** satisfy this contract. Do **not** start the rebuild until the independence test below is implemented as a real check and passing.

Football desks stay on **`docs/lounge-bot-sports-odds.md`** + **`docs/syndicate-cfb-weekly-runbook.md`**. This file is the UFC house only.

North star: **four questions, not four labels on one ML.** The desks work if they can disagree on a healthy card. That is the test.

---

## Before anyone codes

Sit is a first-class output. Every desk must be able to print PASS. If a desk can’t sit, it isn’t independent.

Conviction is that desk’s own units, not the house’s. Scott uses EV%. Rocco uses matchup margin. Chedda uses path confidence. Tank uses minutes-edge. Don’t normalize them into one fake 1-5 until you have a month of cards.

Kill list is closed. Miss, scratch, or walk-off. No “I don’t like the story anymore” after lock.

---

## Independence test (the line that makes it real)

If you delete Scott’s number, Rocco and Tank still have to print a side **or** a sit from their own files. If they blank, you still have one desk.

**Do not start coding the UFC rebuild until this is an actual check.** Spec:

1. Build a card the normal way.
2. Hide Scott’s fair% / model win% / +EV (treat as missing). Do not delete Rocco’s matchup features or Tank’s minutes file.
3. Rerun Rocco and Tank only.
4. Each must emit **Side** or **PASS** from its own inputs.
5. Fail the check if either desk blanks, copies Scott, or needs Scott’s fair% to decide.

Chedda is not in the hide-Scott pair (his gate is a named path, not Scott’s number). He still fails independence if the only way he prints a side is “plus money” or “copy Rocco.”

A clone vote is a 1-0. Write that in the footer of any house card that used a fallback.

---

## The four questions

| Desk | Question | Legal output | Fake version |
| --- | --- | --- | --- |
| Scott | Is the posted ML wrong? | Side / PASS | “I also like the favorite” |
| Rocco | If they ran it 10 times, who wins the fight? | Side / PASS | Copying Scott’s fair% |
| Chedda | Does the dog (or closer) have a real finish path the market priced as a decision? | Side / PASS | “plus money therefore Chedda” |
| Tank | Who does the clock help? | Side derived from minutes | Fourth ML guess |

Scott never looks at “who looks better” except as an input to win%. Rocco ignores juice. Chedda is allowed to fade Scott. Tank’s engine is rounds / pace / finish rate. The side is a mapping. If Tank can print a side without a minutes number, kill that row.

### Mapping rules

- **Scott:** fair win% vs posted juice. No edge → PASS.
- **Rocco:** matchup features (stance, cage, 3 vs 5, wrestling vs liner). Same 0-100 fighter score Scott already used → you have two Scotts. No features → PASS. Never inherit Scott’s fair%.
- **Chedda:** named path required (KO in pocket, body kick to late, R1 sub off shot). “I take dogs” is a sit. Dog that only wins a decision in Vegas → sit or a flag, not a fifth vote.
- **Tank:** early-finish fight → closer. Distance fight → cardio / decision. No minutes read → PASS. Do not let Tank vote ML because “he’s the killer.”

---

## House rules

- **4-0** hammer
- **3-1** consensus + show the dissenter
- **2-2** is a split, not a pick. Do not count it.
- Sits do not count.
- A 4-0 of clones is a 1-0.

Publish the dissenter on 3-1. “Chedda fading the chalk because the only path is a late sub” is a different flag than “Rocco says the styles are backwards.”

---

## Ranking (the actual product)

The “4-0 Fight Hammer” badge is marketing, not the product. Rank inside the tier.

v1 score: `independent_votes × conviction × price_quality`

Conviction stays in that desk’s own units (see Before anyone codes). Do not squash to a shared 1-5 until a month of cards exists.

Force `price_quality` to punish chalk:

- **-200 and shorter:** multiply by 0.4-0.6
- **+100 to +200:** 1.0-1.2

Four desks on -450 can still display as 4-0. They should not outrank three desks on +155 unless conviction is absurd.

---

## Clock

Do not copy NFL wiring. No Friday lean / Sunday inactives clock.

- **Lean** when all four desks have posted (usually fight-week Wednesday-Friday).
- **Lock** at weigh-ins / official walk.
- **Kill** only on the closed list: miss, scratch, or walk-off.

---

## Where the live engine fails this contract (2026-09-12)

Do not “patch” these by copying Scott harder. Rebuild against this file.

- Tank UFC ML copies Scott. Costume rationale. No minutes → side mapping.
- Rocco copies Scott when `analyzeUfcMatchup` is null.
- Chedda copies Rocco on chalk. Dog screen has no named path.
- Missing both names in the ~39-row metrics file collapses the house into one desk.
- Odds API `home_team` is not a pick.

---

## Related

- Odds / publish / cron: **`docs/lounge-bot-sports-odds.md`**
- CFB four-desk SOP (orthogonal sits already live): **`docs/syndicate-cfb-weekly-runbook.md`**
