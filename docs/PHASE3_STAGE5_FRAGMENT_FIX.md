# Stage 5 offline fragment reload fix — 12 November 2026

Status: development fix tested; not deployed; Stage 5 not accepted.

## Finding and minimal change

Physical Safari in the disposable Stage5StorageTest profile repeatedly reopened `/#` offline but failed on reload. The same profile reloaded `/` offline successfully. The subsequent read-only report showed an activated root worker, complete stage5-v3 eight-asset cache and no reported errors. No storage clearing occurred.

The worker compared the complete request URL against canonical static asset URLs. A request retaining an empty fragment (`/#`) therefore bypassed its cache handler and went to the unavailable network. An empty fragment has an empty URL.hash getter even though URL.href retains the trailing `#`. The new handler clears hash unconditionally before exact allowlist matching; query, origin, method, authorization and range exclusions remain in place. Cache version advances to stage5-v4 for a distinct complete asset set. No broad navigation fallback is introduced.

The regression test fails on the old worker at `must intercept /#` and passes with normalization. This establishes the code defect and a mechanism consistent with Safari evidence; the physical FetchEvent URL could not be captured without Web Inspector, so final Safari confirmation remains necessary. Chromium may normalize fragments itself and cannot establish Safari's internal behavior.

Scope remains the app base `/`; the diagnostic worker retains its more-specific scope. Static installation continues to reject redirects (`redirect:error`), unexpected URLs/types and authentication HTML. The handler continues to exclude private/API/diagnostic routes and never caches runtime responses. There is no evidence that an authentication redirect caused the observed offline difference; hosting authentication was not changed or exhaustively instrumented. Pending operations, IndexedDB, credentials, backend, lifecycle activation policy and scoring code are unchanged.

## Validation

- New worker regression: cached `/`, `/#`, `/#home`, `/index.html#`; no network fallback; query/private/diagnostic routes remain excluded. Failed before fix, passed after.
- Full automated suite: 115 tests passed, zero failed.
- Real Chromium service worker browser suite passed, including offline new-tab reopen and forced reload at both `/` and `/#`, pending-score preservation, failed updates, waiting activation, synchronization and diagnostic-worker preservation.
- WebKit unavailable; physical Safari verification remains outstanding.
- Initial restricted-run test runner could not spawn its backend packaging subprocess (EPERM); rerun with the environment's additional permission mode passed all 115 tests.

## Proportionate acceptance plan (supersedes earlier wider blockers)

Credit the completed Stage 2–4 physical tests, Stage 5 physical scoring/synchronization/privacy/permanent-lock checks and automated coverage. After explicit approval to deploy this fix only to the existing owner-private test Site, guide one action at a time: reopen `/#` offline, then reload once. If both pass, prepare the final acceptance report without repeating the wider matrix. Stage 5 remains unaccepted until those observations are complete.

Storage eviction, exhaustive device/profile combinations and uncommon worker-install failures are documented residual risks. Earlier blank-page/incomplete-history failures did not recur in later successful history checks: retain mitigation and evidence, investigate recurrence, but do not block solely for an unknown original cause. The observed 24.753-second backend execution against a 25-second client deadline remains a timeout risk; durable recovery and duplicate prevention succeeded.

## Isolation preflight

On 12 November Sites metadata reconfirmed project appgprj_6ae88c84e7388191804ce879ca000a02, Flag Hunters V2 — TEST ONLY, at https://flaghunters-v2-test-8b76.williamsgpeter.chatgpt.site. Current user is owner; custom access revision 1 contains only that owner, no editors/groups/external visitors. The previously owner-verified isolated Script/endpoint and private synthetic Sheet binding are recorded in PHASE3_STAGE5_PHYSICAL_RESULTS.md; this fix does not change or write to any of them. This is preservation of the established binding, not a new inspection of live Script Properties. No Site deployment, production change, GitHub main merge or Stage 6 work is authorized by this development commit.

## Approved private test deployment

Owner approved deployment of 3092a75 on 12 November. Pre-deployment Sites metadata reconfirmed owner-only custom access. The Site source checkout was clean and matched the fetched remote before copying exact approved worker bytes; only dist/v2-app-sw.js changed. Separate Site publishing repository commit: 642d0c31e2ecbe510d2fd46c9503bfada249f0a8 (its configured main branch is not GitHub main). Existing safe stdin-only source-credential helper was used; no credential was persisted.

Native owner-private deployment succeeded at 2026-11-12T08:39:02.630165Z:
- Deployment: appgdep_6af57b1c29008191898093981e87a49c
- Saved version: appgprj_6ae88c84e7388191804ce879ca000a02~appgver_95e019ca8dec8191ba596b051a7fb448
- URL: https://flaghunters-v2-test-8b76.williamsgpeter.chatgpt.site

This supersedes the initial not-deployed status above. Stage 5 remains NOT ACCEPTED pending online preparation/activation and the agreed focused offline /# reopen and reload. No production, backend, GitHub main or Stage 6 changes performed.
