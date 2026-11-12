# Stage 5 installation deadline follow-up — 12 November 2026

> Current outcome (12 November 2026): agreed essential physical checks complete; acceptance recommended. See [final acceptance report](PHASE3_STAGE5_ACCEPTANCE.md). Earlier statuses below are chronological and superseded where noted. Owner sign-off, production release and Stage 6 are not inferred.

Status: development candidate only; requires approval before another private test Site deployment. Stage 5 remains unaccepted.

## Evidence and limits

After approved v4 deployment, the physical iPad repeatedly timed out preparing assets. Readiness reports showed a separate worker still installing, only the complete v3 cache, and no waiting worker. Closing/reopening both app/report tabs online followed by one preparation retry did not resolve the reported state. No scores or site storage were cleared.

Code review found that the page's 30-second preparation deadline does not terminate the worker's install promise. Asset fetches, HTML clone text reads and response arrayBuffer reads had no worker deadline. A stalled request/body can therefore leave an update installing after the page stops waiting. Controlled regressions reproduce the missing bound. This is a proven implementation gap consistent with the physical observations, not proof of the precise iPad network request or Safari internal cause. No network trace was available. A private-origin authentication/network stall remains possible; no evidence identifies a redirect as the cause.

## Minimal worker follow-up

- Bound the entire network/body preflight to 25 seconds; abort its fetch signal and reject install on timeout. Cache publication starts only after validated preflight completes. Failed candidates do not delete the active version's cache.
- Consume each asset body once. Check the HTML app-shell marker using the same downloaded bytes instead of cloning/teeing the HTML response. Removing the clone avoids an unnecessary stream path; a Safari clone defect has not been demonstrated.
- Cache version stage5-v5; retain the v4 fragment normalization, exact allowlist, redirect rejection, response type/URL checks and no runtime caching.
- No scoring, credential, IndexedDB, backend, scope, diagnostic worker, skipWaiting or clients.claim changes.

The bound cannot guarantee a slow connection installs successfully. It makes an unfinished download fail safely and permits a later explicit retry, rather than leaving the worker install indefinitely pending. It does not bound CacheStorage internals or override Safari scheduling.

## Validation and next step

The new fake-worker regression failed before the fix (no deadline scheduled), then passed for both a stalled fetch and a stalled body, with no cache publication/deletion. Automated and real browser validation results are recorded below after completion. Only the existing focused offline /# reopening and single reload remain after confirmed update preparation/activation. No wider physical matrix is restarted. Owner approval is required for any deployment of this follow-up.

Validation completed: all 116 automated tests passed. The real Chromium service-worker suite passed offline reopen/reload at both / and /#, a deliberately stalled HTTP response body reaching the 25-second worker deadline, preservation of the old complete cache and pending operation ID/scope/payload, subsequent successful retry/update activation, synchronization and diagnostic-worker checks. Ordinary online retry counters may advance during the stalled-update test; immutable pending score content is verified separately. The first new browser assertion incorrectly required retry counters to remain unchanged while online; it was corrected to the intended durable-content invariant and the full browser suite passed. Physical Safari installation success is not claimed.

Sites metadata reconfirmed existing TEST ONLY origin, owner-only custom audience, no editors/groups/external visitors. Backend/Sheet bindings remain unchanged from the established isolated synthetic setup. No deployment performed for this candidate; user approval remains required. No production/main/Stage 6 changes.

## Approved isolated deployment — 12 November

Owner explicitly approved 46d9d5e57080ab99e5a2f24743ccf6673d913d62. Sites metadata reconfirmed owner-only audience before source preparation. Clean Site source HEAD matched fetched remote; only exact approved dist/v2-app-sw.js bytes changed. Site publishing source commit 77af27be7ad5a8417ff9beb6d634f20cc4cf1649 is in the separate Site repository (not GitHub main).

Native private deployment succeeded at 2026-11-12T10:29:21.287021Z:
- Deployment appgdep_6af594f65c008191b6257695ca9a3bbb
- Version appgprj_6ae88c84e7388191804ce879ca000a02~appgver_f1c12fbdc75481918f3ee3873664a0c1
- URL https://flaghunters-v2-test-8b76.williamsgpeter.chatgpt.site

Initial candidate-only status is superseded by this approved test deployment. Physical update preparation/activation and focused /# offline reopen/reload remain pending. Stage 5 is NOT ACCEPTED. No backend, production, GitHub main or Stage 6 changes.

## Post-v5 rollout report

Owner again observed preparation timeout. Readiness report 6 at 2026-11-12T10:32:48.114Z shows root active controller, a separate installing worker, no waiting worker, only complete eight-asset stage5-v3 cache, and errors empty. It does not identify the installing worker code version; therefore v5 execution and its deadline cannot be inferred. The deadline change has not been physically validated. Existing prepare code waits for an already installing candidate instead of forcing another update; an older unfinished candidate may therefore prevent this button from requesting the newest script. Next limited recovery is a Safari process restart, without storage clearing, before another observation. This hypothesis is not proof of Safari internals. Stage 5 remains unaccepted.
