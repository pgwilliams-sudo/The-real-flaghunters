# Stage 5 final acceptance report — 12 November 2026

**Result: all agreed essential physical checks PASS. Recommendation: accept Stage 5 for the isolated private V2 test environment. Owner explicitly accepted Stage 5 against report commit `f611b7e` on 12 November 2026.** No production release, main merge or Stage 6 is authorized by this report.

This report supersedes the wider outstanding-test lists and unknown-cause-only release blockers in earlier chronological Stage 5 records, following the owner's explicitly agreed proportionate acceptance plan for a small private Saturday golf group.

## Candidate and scope

- Final deployed development commit: `46d9d5e57080ab99e5a2f24743ccf6673d913d62`, including fragment normalization from `3092a758a7f04f72e27d6db0aaae8250a760c535`; worker cache `stage5-v5`.
- Existing owner-private TEST ONLY Site: https://flaghunters-v2-test-8b76.williamsgpeter.chatgpt.site
- Site publishing source: `77af27be7ad5a8417ff9beb6d634f20cc4cf1649`; deployment `appgdep_6af594f65c008191b6257695ca9a3bbb`, succeeded 2026-11-12T10:29:21.287021Z.
- Existing separate Apps Script and private synthetic Sheet bindings unchanged; no production/backend changes. Development commits pushed only to GitHub development/v2. The separate Site publishing repository's configured main branch is not GitHub main.
- Physical device: iPad Pro 13-inch (M5), iPadOS/Safari 27.0.1. Synthetic data only.

## PASS: credited essential evidence

| Essential risk | Completed evidence |
| --- | --- |
| Full offline loading and reopening | Original-profile cold tab reopening/reload passed. Final focused retest below closes the reproduced fragment reload defect. |
| Durable scoring | Offline Save & Next, tab closure, reload and lock/resume preserved pending scores. Before/after update exports preserved operation content and older scoped requests. |
| Synchronization and truthful status | Offline UI reported device saves awaiting server acceptance; reconnect synchronized. Independent synthetic Sheet checks confirmed committed results and no duplicate history. Credential rotation paused rejected requests; explicit review/recovery succeeded. |
| Session and hidden-hole privacy | Another group required its own PIN. Public leaderboard and scorecards excluded holes 16–18 before authorized reveal. Automation verifies scoped sessions, static cache exclusions and export redaction. |
| Permanent lock enforcement | After online learning of permanent final lock, offline reload retained the lock and disabled saving. No unlock/reset used to claim success. |
| Update/data preservation | Physical v3 rollout exports retained all 15 draft records and eight snapshots exactly; separate diagnostic worker/cache survived. Failed update checks retained existing data. Automation covers denied installs, waiting updates and stalled response bodies. |

Completed Stage 2–4 physical evidence is credited alongside Stage 5 tests. It is not represented as a repeat of every check against v5: v5 changes are isolated to app-worker asset handling; scoring/backend/IndexedDB code is unchanged.

## Final focused physical retest: PASS

Following the reported installing-worker stall, a Safari process restart without clearing website data was followed by successful online Prepare. Owner's screenshot showed cached assets verified and online preparation/update check completed. Owner then read `stage5-v5` from the read-only readiness report. Cache version alone is not direct proof of running worker source.

At our direction the owner closed all app/report tabs in disposable Stage5StorageTest while online, enabled Airplane Mode and turned Wi-Fi off, then:

1. Opened a new Safari tab directly at `https://flaghunters-v2-test-8b76.williamsgpeter.chatgpt.site/#` — owner answered **Yes**, full app loaded.
2. Pressed Safari reload once while still offline — owner answered **Yes**, full app returned.

These are owner-observed physical results, not automation or an instrumented network trace. This is the full agreed retest. No new scoring/group setup, storage clearing or wider device matrix was required. The disposable profile has no prepared scoring group; earlier original-profile evidence covers scoring and session durability.

## Cause, mitigation and verification limits

The worker's exact asset URL matching omitted fragment normalization. A URL retaining an empty `#` bypassed the cache handler. The regression failed on the earlier worker and passed after unconditional hash removal. Physical before/after reload evidence supports the mitigation; Safari FetchEvent URLs were not directly captured.

A separate installation-progress gap allowed stalled network/body reads to outlive the page's preparation deadline. v5 bounds asset network/body preflight to 25 seconds and consumes HTML once instead of cloning/teeing the response. Old cache and pending data survive rejection. This explains a possible mechanism, not the precise original iPad stall: the installing worker's version and stuck request were not captured. Success followed deployment plus Safari restart; attribution to either measure alone is not established.

Validation: **116 automated tests passed**, plus the real Chromium service-worker suite: offline reopen/reload at `/` and `/#`, stalled download deadline, old-cache/pending-payload preservation, later successful update and synchronization, and diagnostic-worker preservation. Physical Safari provides platform evidence; Chromium is not represented as Safari testing.

## Documented residual risks; no further routine physical tests required

- Safari can evict site storage. Reconnect/reprepare messages and private recovery exports mitigate this; an evicted unsynchronized score cannot be reconstructed from a cleared device. No claim of eviction-proof storage or completed destructive physical eviction test.
- Slow/unavailable private-origin networking may prevent an update. The old cache is retained; v5 safely rejects a stalled download. Safari process restart was needed during this rollout. Exhaustive worker/profile/device combinations are not required for this private-group acceptance.
- Upload latency can approach the 25-second client limit: a recorded Apps Script execution took 24.753 seconds. UI kept acceptance unconfirmed; durable, idempotent recovery succeeded. Internal latency phase remains unknown.
- Earlier blank-page/incomplete-history failures did not recur in subsequent physical history checks. Retain Stage 4 mitigation `2d7cc27`, successful regression evidence and diagnostic records; investigate any recurrence. Unknown original root causes alone no longer block this proportionate acceptance.
- Offline data can be stale, including knowledge of a remote lock or access rotation. The server remains authoritative: offline device saves are never claimed as accepted; learned locks are enforced locally and rejected operations remain recoverable/exportable.

## Decision boundary

No essential physical checks remain under the agreed plan. Recommend Stage 5 acceptance with these recorded limitations. Owner subsequently authorized Stage 6 planning documentation only. Any simulation execution, production deployment, merge to GitHub main or Saturday trial requires separate approval.
