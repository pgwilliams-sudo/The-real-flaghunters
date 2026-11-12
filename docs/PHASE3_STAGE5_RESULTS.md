# Stage 5 development results — 2026-11-05

> Current outcome (12 November 2026): agreed essential physical checks complete; acceptance recommended. See [final acceptance report](PHASE3_STAGE5_ACCEPTANCE.md). Earlier statuses below are chronological and superseded where noted. Owner sign-off, production release and Stage 6 are not inferred.

Development only on `development/v2`. No Stage 5 deployment, Site source synchronization, production change, main merge or Stage 6 work was performed. Stage 4 provisional acceptance is recorded in `PHASE3_STAGE4_RESULTS.md` (commit `ce2a834`), following the already-pushed Stage 4 mitigation `2d7cc27`. The supplied checkout initially contained an older `work` branch; the remote development baseline was recovered and the implementation validated in a dedicated `development/v2` worktree.

## Implemented

- Explicit **Prepare offline app** installs `v2-app-sw.js` relative to the app root on the existing origin. Its scope must encompass the root application, but its fetch handler intercepts only eight clean, exact same-origin static GET URLs (root/index alias, CSS, five application scripts and icon). API URLs, query strings, authorization/range requests, POSTs, diagnostic paths, auth routes and unrelated assets pass through. No runtime response caching exists.
- Installation validates every response's status, final URL and content type, plus an app-shell marker; auth redirects/login HTML and failed assets cannot publish a partial cache. Bodies are consumed during preflight to avoid connection-pool exhaustion. Only static asset bytes enter CacheStorage. Group sessions, own-group snapshots, private scoring data and pending operations remain in existing IndexedDB stores; admin secrets remain in memory. Exports continue excluding session credentials.
- **Reopen prepared round … group …** provides offline entry independently of server startup/current-round discovery. It lists only snapshots matching an unexpired stored session's backend, event, group and credential. It restores course/handicap snapshots and own-group score projections, including pending BLOBs/reasons. Expired/missing access does not authorize new offline saves. New groups, authentication, handicap confirmation, completion, history, administration and public results continue requiring the server. Private snapshots are never substituted into public leaderboards or scorecards; hidden-hole backend filtering is unchanged.
- Offline/stale-data messages distinguish local saves from server acceptance, explain that remote access/lock changes cannot be learned offline and warn about storage eviction. Missing preparation or IndexedDB failure has an explicit message. Complete eviction of the shell while offline necessarily yields the browser's load failure; the application cannot render a warning when no application assets remain. `navigator.storage.persist()` is requested after preparation but is not treated as a durability guarantee.
- Worker updates wait for old app tabs to close, with no `skipWaiting`, forced reload or `clients.claim`. Updates do not migrate/delete IndexedDB or touch outbox IDs/payloads. Activation deletes only older app caches sharing its own path-specific prefix. The Stage 1 diagnostic registration/cache is retained. **Every future asset release must also bump the worker `VERSION` and be packaged atomically with all eight assets**; do not independently deploy mixed files or delete the old cache from an open scoring tab.
- Locked-state summary, save errors and Finish guidance now agree that final results are permanently locked and pending requests remain exportable without resubmission. Repeated render no longer accumulates lock notices, bootstrap propagates a learned lock to the UI, and null metadata cannot crash a lock rejection. Original schema version, operation IDs, payloads, revision checks and recovery confirmation flow remain unchanged.

## Automated validation

Run `npm test`, `npm run test:app-offline`, `npm run test:local-drafts`, `npm run test:mobile` and `git diff --check`. All API/backend fixtures are synthetic; no Google scoring or production requests are used.

- Unit/backend/generator/diagnostic/local/recovery/sync suite: 103 tests pass. New coverage checks prepared-session expiry/scope and retained pending scores, exact worker exclusions and cache cleanup boundaries, login/mislabeled-response refusal, locked-message consistency, and an upload deadline after server commit followed by status reconciliation without duplicate writes/history.
- Real Chromium service-worker/HTTP/CacheStorage/IndexedDB scenario passes: failed install without partial app cache, successful preparation, full offline reload, closed-tab reopen, saved pending BLOBs with zero offline attempts, visibility/pageshow resume signals, exact static cache contents, waiting update and activation across tab closure with unchanged pending ID, foreground reconciliation, diagnostic cache/registration preservation and missing-IndexedDB warning after simulated eviction.
- Existing 13 Chromium phone IndexedDB/recovery scenarios pass, including selected BLOB conflict recovery, accepted-response loss, changed-after-review rejection, safe malformed-history retry, older-round isolation, unavailable storage and consistent post-reveal lock messages.
- Existing scoring/Finish/corrections/history/table/scorecard/privacy suite passes at four Chromium mobile viewport sizes.
- WebKit is unavailable in this environment. Synthetic visibility events are not physical device lock/resume, and same-origin local hosting does not prove owner-private host authentication/CSP behavior. Physical Safari, OS termination and real storage pressure remain acceptance gates, not claimed passes.

## Upload timeout findings

The outbox already uses a 25-second upload deadline and abort signal. A deadline does not prove server rejection: Apps Script may commit after the response is interrupted. Existing ordered retry/status reconciliation is preserved. The added deterministic test commits server-side, fires the upload deadline, verifies the unchanged pending operation, and then reconciles `COMMITTED` with exactly one score write/history chain.

Closing a tab mid-upload can retain its cross-tab lease for up to 60 seconds. The update/reopen fixture explicitly advances its clock beyond that lease, rather than masking the delay with a timing race or weakening coordination. This is a possible apparent retry delay, not proof of the physical upload timeout's cause. Real backend execution/lock timing, sanitized HTTP status/response shape, elapsed time and device evidence are still needed. No backend timeout or lock was relaxed; no automatic background execution is promised.

## High-priority release blockers retained

- **S4-B1 open:** physical Safari blank/unresponsive recovery page root cause and regression evidence remain unresolved. Prior in-page confirmation mitigation is retained; provisional acceptance does not establish a root cause.
- **S4-B2 open:** intermittent incomplete history-response root cause remains unresolved. Safe in-page validation/retry remains covered; no empty history is invented.
- **S4-B3 development fix verified:** inconsistent local locked-state wording/UI propagation addressed with automated coverage; physical retest is required before release closure.
- **S4-B4 investigation open:** bounded timeout, uncertain acceptance and lease-expiry paths are covered; physical latency/timeout root cause remains unproven.

The physical acceptance procedure is prepared in `PHASE3_STAGE5_SAFARI.md`. Deploying this commit to the existing owner-private test origin requires further approval. Do not promote to production, merge main or begin Stage 6.
