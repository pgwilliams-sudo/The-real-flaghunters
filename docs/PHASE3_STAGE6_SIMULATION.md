# Stage 6 — one realistic synthetic 18-hole round

**Executed with separate owner approval on 12 November 2026: PASS.** See [results](PHASE3_STAGE6_SIMULATION_RESULTS.md). The script below is retained for audit; rerunning/resetting requires new approval. Use the pinned candidate and isolated resources in [configuration checklist](PHASE3_STAGE6_CONFIGURATION.md). Credit Stage 1–5 coverage; this is one operational rehearsal, not another offline/conflict/device matrix.

## Before starting

- [ ] Name simulation scorer and support person; record device, approved source/deployed versions and start time. Use the already-tested Safari iPad; no extra devices required. Support can read the public leaderboard after scorer signs out.
- [ ] Reverify test Script/Sheet bindings and synthetic-only generator guards from [TEST_GENERATOR.md](TEST_GENERATOR.md). Export any pending device scores privately; retain older scoped records without retrying them into this round.
- [ ] Preserve the current locked Stage 5 workbook and its ID. With execution approval explicitly covering the binding change, run the existing guarded `resetV2TestRoundGenerator` only in the verified test project. It creates a new owned synthetic workbook and retains the old one. Record the new Sheet ID and backup reference. Stop on a guard error.
- [ ] Do **not** run generateV2TestRound or finishV2GeneratedRound: they prefill holes and would defeat a manual full-round rehearsal. In Admin Setup create a fresh event on the new synthetic workbook, select the 12 synthetic golfers, White tees, three groups of four starting at hole 1, and confirm handicaps. Record event/group IDs. If that workflow is unavailable, stop and report; do not hand-edit score/history tables.
- [ ] Keep optional competitions off for this rehearsal; their Stage 1–5 tests remain credited. Obtain each group PIN through admin and sign out before scoring. Verify no current-round pending requests at start. Prepare the offline app and Group 1 online.

## Play the round

For every player enter Gross **5 on each physical hole**, with only these two exceptions for the first player in Group 1:

| Hole | Entry |
| --- | --- |
| 3 | Enter 5 initially; after acceptance correct to 6 with reason “Stage 6 synthetic correction”. |
| 6 | BLOB / picked up; no Gross. |
| All other holes | Gross 5. |

1. Score Group 1 holes 1–9 using Save & Next. Correct hole 3 as above once online acceptance is confirmed.
2. Go offline briefly, score hole 10, and confirm “saved on device / awaiting server acceptance”. Reconnect once; allow automatic synchronization. Confirm no current-round pending request remains. No repeated tab/lock/conflict tests.
3. Complete Group 1 holes 11–18, then Finish after server acceptance. Open Groups and authenticate Group 2 with its own PIN; score 1–18 and Finish. Repeat for Group 3. Record any warning or unconfirmed upload; do not clear data or repeatedly enter the same hole to force success.
4. Before reveal, sign out and inspect one public leaderboard and the first player's scorecard. They must stop at physical hole 15 and exclude hidden-hole contributions even though all groups finished. This checks the full-round operational sequence; exhaustive privacy permutations remain credited.
5. Support compares accepted records with the entry schedule. All 12 players have 18 accepted hole records; the one pickup is explicit with null Gross. Eleven players have Gross 90, F9 45/B9 45. The first player has incomplete Gross (BLOB), 86 numeric strokes across scored holes, incomplete F9 and B9 Gross 45. Stableford totals must agree with the frozen course/playing handicaps; support independently spot-checks the pickup, corrected hole and one stroke-allocation hole. Do not calculate results from pending drafts.
6. Only after reconciliation, obtain the execution-time explicit confirmation for irreversible **synthetic** final reveal/lock. Reveal through the admin UI, check all 18 holes are visible and final lock is reported. Do not reset/unlock the event. Prior offline-lock enforcement testing remains credited; no further lock matrix.

## Record and decide

- [ ] Record start/end, event/Sheet IDs, exact release versions, completion/reveal state and accepted totals. Retain one private recovery export and relevant screenshots; keep scoring exports out of public Git/Sites assets.
- [ ] Confirm no pending or needs-review request for this simulation on the scoring device; older scoped exports are accounted for separately. Verify the hole-3 correction has the intended history and the offline save did not create duplicate committed history. Record operation IDs privately where useful.
- [ ] **PASS:** full workflow completed, totals/history reconciled, hidden holes protected before reveal, final lock correct, no unresolved current-round save.
- [ ] **NO-GO:** score loss/duplication, wrong scope, privacy leakage, lock failure, unexplained totals or inability to complete normal scoring/recovery. Preserve evidence; investigate the specific failure only.

An upload timeout with later confirmed, unique acceptance is a recorded residual, not automatic failure. A recurring blank page/incomplete history is investigated with time, action, event/group, operation state and available backend execution evidence. No root-cause guess counts as a result. Report the simulation before requesting any production/trial approval.
