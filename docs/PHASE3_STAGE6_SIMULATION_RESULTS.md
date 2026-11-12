# Stage 6 synthetic simulation — PASS

12 November 2026. Owner approved execution of PHASE3_STAGE6_SIMULATION.md, including guarded reset in the existing isolated test project. Owner separately approved irreversible synthetic reveal after reconciliation; it completed successfully. No production, V1, main or Saturday-trial action authorized.

**Outcome:** all planned essential rehearsal checks passed. No new scoring/privacy/lock blocker observed. Production configuration/schema/access gates remain open; no production or trial approval is implied. Entries below are chronological; later completion supersedes earlier pending statuses. Operator/scorer: Peter Williams via guided iPad actions; support: assistant read-only reconciliation, not a designated Saturday support person.

## Preflight and reset

- Sites metadata reconfirmed TEST ONLY project appgprj_6ae88c84e7388191804ce879ca000a02, existing private origin, owner-only custom access, zero editors/groups/external visitors.
- Owner read back Script ID 1QVgbBdFCm7MPYD0Tqfi6hb5vQUjxHIObMjS8er4yrqUFk7mTWbO4poOs and current V2_SPREADSHEET_ID 1LW28dExiimGe-xiaGRYsRwCpP0c6HpS1gojk5ha7IhM. Confirmed generator Sheet and Script bindings match; mode isolated-synthetic-only and both opt-ins exact lowercase true.
- Owner confirmed installed reset calls trgGuard_ before trgNewWorkbook_. Reviewed source guard checks ownership marker, private synthetic fixture identity and bindings. Owner ran reset once and reported execution complete with fresh workbook result. No guard error reported.
- Preserved locked Stage 5 workbook: https://docs.google.com/spreadsheets/d/1LW28dExiimGe-xiaGRYsRwCpP0c6HpS1gojk5ha7IhM/edit . Reset creates/rebinds a new workbook; no old workbook or prior evidence deletion requested.
- New simulation workbook: https://docs.google.com/spreadsheets/d/1ldVVlR3YmH7RzfM6xEpRsFcJYoltIdg6NdCW2cacOQY/edit ; seed clubhouse-12-v1. Owner-provided log: fresh synthetic workbook ready. Log's generic suggestion to generate is not an instruction for this rehearsal; generateV2TestRound and finishV2GeneratedRound must not run.
- Accepted candidate: development runtime 46d9d5e57080ab99e5a2f24743ccf6673d913d62, cache stage5-v5, private Site deployment appgdep_6af594f65c008191b6257695ca9a3bbb. Prior evidence credited; no broader matrix restarted.

Next: confirm post-reset binding, online iPad app connection and manual new round setup. No scores entered yet; no simulation PASS claimed.

## Manual round setup

Owner confirmed both active/generator Sheet properties now equal the fresh workbook ID. A screenshot showed Safari Personal with two older scoped pending requests; the backend-switch prompt was cancelled and owner switched to Stage5StorageTest. No older records were deleted or retried. In Stage5StorageTest owner connected the verified test endpoint, opened admin and created a round dated 14 November 2026, White tees. All 12 synthetic golfers selected with existing Handicap Index values unchanged; alternative starts off. Owner confirmed randomized three groups of four, all starting at hole 1, and successful Save Groups. Optional competitions saved unchecked (UI returned Home). Admin reopened and PINs generated separately for Groups 1, 2 and 3; no PINs shared or recorded here. Event ID/group player order and first Group 1 player remain to be recorded. No scores or reveal yet.

## Group 1 — holes 1–10

Owner signed out of admin, opened Group 1 with its own PIN and identified the first displayed player as Synthetic Golfer 12 (the planned special-entry player, not Synthetic Golfer 1). Hole 1 all Gross 5 progressed to hole 2, showing syncing then saved to server. Owner confirmed accepted progression for holes 2 and 3 all Gross 5; returned from 4 to 3 and changed only Synthetic Golfer 12 to 6 with reason Stage 6 synthetic correction; Save & Next returned to 4 and owner explicitly confirmed server save. Holes 4/5 all Gross 5 confirmed; hole 6 Synthetic Golfer 12 BLOB, other three Gross 5; accepted progression through holes 7–9 all Gross 5. These are owner observations; server records not yet independently reconciled.

At hole 10 owner enabled Airplane Mode and turned Wi-Fi off, entered all four Gross 5 and saved once. Owner reported hole 11 and exact status saved on device awaiting server acceptance. No offline server acceptance claimed. Next action is one reconnect and observation of automatic synchronization; no repeated offline matrix.

## Completion and independent pre-reveal reconciliation

Owner confirmed Group 1 offline hole 10 automatically synchronized after reconnect, with no current-round pending scores; holes 11–18 then accepted and Finish Group succeeded. Group 2 opened. Owner requested batch entry instructions for remaining routine holes: Groups 2/3 all Gross 5, waiting for acceptance, finish each, no reveal. Owner subsequently reported Success for both.

Read-only Google Sheets connector metadata identifies the new workbook as [V2 SYNTHETIC ONLY] clubhouse-12-v1 45e7edd2. Metadata-derived bounded ranges were read for score records/history, operation IDs/states, frozen players/course, groups, finish state and round metadata; no scoring-credential table read or Sheet write. Event event-a958ffae-2206-4087-9d59-8a6a64f3de2a, dated 14 November, White, complete. All groups 1/2/3 have finished markers, all start hole 1. Meta remains locked=false, revealed_at=null.

216 distinct latest player/hole records (12 × 18); 217 stored score revisions and 217 history rows. The single extra revision is Synthetic Golfer 12 hole 3: initial 5 revision 1, correction 6 revision 2, reason Stage 6 synthetic correction. No duplicate key/revision history. All 56 operation journal entries COMMITTED; an operation journal entry need not add a changed score revision. Group 1 offline hole 10 has one committed operation ID b6b554d0-8755-4924-af51-6c5788cdaa61, four unique accepted player entries, no duplicate revision history.

All latest inputs match the schedule: only Synthetic Golfer 12 hole 6 has score_status=pickup and null Gross; its other special score is hole 3 Gross 6. All remaining entries Gross 5. Eleven complete Gross totals are 90 (45/45); Golfer 12 has incomplete Gross due to pickup, 86 numeric strokes, incomplete F9 and B9 45. Independent recomputation against frozen Par/SI/Playing Handicap matches every numeric Net, allocated strokes and Stableford result; pickup has zero points and null Gross/Net. Stableford totals by golfer number: 1=18, 2=20, 3=24, 4=26, 5=29, 6=32, 7=34, 8=38, 9=40, 10=44, 11=49, 12=51. Initial scratch reconciliation treated the legacy blob flag as pickup; source inspection corrected this: blob also marks numeric zero-point scores, while score_status identifies pickup. No scoring defect was found.

Groups: 1 = 12/2/8/4; 2 = 10/7/1/6; 3 = 3/9/11/5. Public pre-reveal UI check, final device pending check/export and explicit reveal authorization remain outstanding. No irreversible reveal performed; simulation is not yet marked PASS.

## Pre-reveal device/privacy evidence

Owner confirmed Device saves has no current-round requests awaiting acceptance. Owner opened public Live Leaderboard and confirmed partial results/holes 16–18 hidden; opened Synthetic Golfer 12's scorecard and confirmed only holes 1–15 with 16–18 hidden until admin reveal.

Private export Stage 6 before reveal.json, exported 2026-11-12T16:27:25.307Z, SHA-256 feb8bdf825e4ed766ee23d57459b26b851704ff31769862c7dfd7036be3c8598: 56 unique operations, all status accepted, only this simulation event, all three groups, three snapshots. Operation IDs exactly match the 56 COMMITTED server operations. Offline Group 1 hole 10 operation b6b554d0-8755-4924-af51-6c5788cdaa61 accepted with attempts=1. No pending/needs-review records in this export. Recursive named-field scan found no token/credential/password/PIN/secret/session/lease keys; this is not a guarantee about arbitrary content. Raw recovery export retained privately outside Git/Sites assets. Reconciliation and pre-reveal privacy checks complete; explicit approval to reveal/lock this synthetic event is the next gate.


## Authorized reveal and final result — PASS

After the export/server reconciliation, owner explicitly answered Yes to revealing event event-a958ffae-2206-4087-9d59-8a6a64f3de2a (14 November 2026), with permanent lock and disclosure of synthetic holes 16–18 explained. Owner signed into test admin, tapped Reveal, confirmed and reported Reveal success. Owner then opened Synthetic Golfer 12's final scorecard and confirmed all 18 holes, corrected hole 3 Gross 6 and hole 6 BLOB.

Read-only server verification: same event metadata locked=true, revealed_at=2026-11-12T16:33:06.522Z; operation journal still 56 COMMITTED entries. Prior Stage 5 offline lock enforcement tests are credited rather than repeated. Independent metadata/round read also confirmed the preserved Stage 5 workbook still exists as [V2 SYNTHETIC ONLY] clubhouse-12-v1 05f3c8b5; event event-16275a7a-5df7-4a84-81ff-c2ff0dd33681 remains locked with its original revealed_at=2026-11-08T14:24:06.392Z. No source/data edits to that workbook were requested.

| Check | Result |
| --- | --- |
| Fresh guarded isolated setup, existing evidence retained | PASS |
| 12 golfers × 18 holes, three finished groups | PASS — 216 latest accepted scores |
| Hole-3 correction + hole-6 pickup | PASS — intended player, reason and revision chain |
| Short offline scoring, automatic reconnect | PASS — one accepted operation, no duplicate history |
| Accepted scores and calculations reconciled | PASS — planned inputs and all computed Stableford values match |
| No pending scores before reveal | PASS — device report and 56 accepted export records match committed journal |
| Hidden holes before reveal / all holes after reveal | PASS — physical public leaderboard/scorecard observations |
| Final permanent lock | PASS — live locked marker and reveal timestamp; earlier enforcement tests credited |

No blank-page, incomplete-history or upload-timeout recurrence was reported during this rehearsal. This is bounded observation, not proof those residual risks are eliminated. Stage 1–5 tests remain credited; no broader matrix was run. The two old Personal-profile requests remain outside this simulation and were not cleared or retried.

## Remaining release decisions

No new genuine blocker arose in this simulation. Production identity/access verification, an approved production schema/setup procedure (test-only initializer guard must not be bypassed), backup/restore readiness, exact production version mapping and named Saturday scorer/support assignments remain required under PHASE3_STAGE6_CONFIGURATION.md and PHASE3_STAGE6_RUNBOOK.md. Safari eviction/update restarts, possible slow uploads and historical non-recurring failures remain documented residuals. No production deployment, V1 alteration, main merge, production schema initialization or Saturday trial performed. Further actions require their separate approvals.
