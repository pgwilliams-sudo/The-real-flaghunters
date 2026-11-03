# Phase 3 Stage 3: ordered foreground synchronization

Implemented on `development/v2`. Not deployed. No production changes or Stage 4 work.

## Behavior

Save & Next still commits its IndexedDB transaction before advancing. It does not wait for an upload, status query or server acknowledgement. `v2-sync.js`, loaded between `v2-local.js` and `v2.js`, dispatches the durable queue at startup, after group preparation, on `online`, `pageshow`, visible-page resume and manual **Retry synchronization**. Actual API outcomes determine connectivity; `navigator.onLine` and background execution are not required.

Each backend/round/group has an ordered stream, including records from older credentials. New records receive an atomic monotonic sequence; pre-Stage-3 records retain the previous timestamp/operation-ID order and precede new records. A group never overtakes its earliest ambiguous or rejected request. Another group's stream can proceed independently. The existing one-unaccepted-operation-per-hole restriction remains: corrections must wait for acknowledgement; this stage does not silently rebase dependent edits.

A same-origin IndexedDB lease coordinates tabs for each group. An abandoned tab's lease expires after 60 seconds; another tab may wait up to a minute before recovery. Each API attempt has an abortable 25-second deadline. Transient failures retry with exponential delays (1, 2, 4, 8 seconds; capped at 30 seconds), with at most five failures per burst. Reconnect/resume/manual Retry starts another burst. Records and immutable IDs/bodies remain stored throughout. A server may finish a request even after the browser aborts it.

## Reconciliation and protections

The authenticated POST `operationStatus` route checks round/group/player scope and the exact original request hash before returning an operation's stored result. PREPARED accepted intents are recovered through the existing journal. Missing operations are reported as ABSENT. The route never creates a new scoring intent, returns bearer secrets or supplies a public results route. An authenticated current same-group credential can reconcile an older operation's acceptance, including after rotation. It cannot submit that old request as a new actor. Existing revision checks, immutable history, server group restrictions, hidden-hole public projections and permanent reveal locks remain authoritative.

Previously attempted requests query status before replay. A committed result is acknowledged locally in the existing atomic snapshot/record transaction. If status is ABSENT, replay uses the unchanged ID/body and only the original credential. This covers lost uploads, lost responses, failed local acknowledgement and duplicate triggers. A status lookup can acknowledge a previously accepted operation after reveal; it cannot authorize any new mutation after reveal.

Conflict, lock, validation and other non-transient failures remain **needs review**. Automatic triggers do not retry conflicts or rewrite their revision/reason. Manual Retry rechecks the same immutable request; it does not force an overwrite. Unavailable/expired credentials remain visible/exportable and may be rechecked when a group session becomes available. An absent operation belonging to an unavailable old admin credential is deliberately not impersonated by the scorer. Detailed conflict/credential recovery UX belongs to the separately gated Stage 4.

The UI distinguishes saved-on-device/awaiting acceptance, syncing, server-accepted and needs-review states. Acknowledgements do not erase an unsaved next-hole selection. Finish Group and reveal remain blocked by **every unaccepted local operation for that backend/round**, including other groups and old credentials. Recovery exports exclude sessions, lease records, bearer tokens, PINs and admin secrets. Forget safeguards remain in force.

Stage 2 `needs-review` entries with known transport-only messages (`Load failed`, `Failed to fetch`, `NetworkError…`) can resume automatically. Legacy conflicts, authentication failures and locks are not treated as connectivity failures. Storage schema remains version 1; new fields are additive and old pending records are retained.

## Validation

Run `npm test`, `npm run test:mobile`, and `npm run test:local-drafts`.

The queue tests cover operation order, duplicate triggers, interrupted uploads before/after server commit, process/module reopening, idempotent replay, bounded backoff, upload deadlines, failed durable acknowledgement, leases/crash expiry, rejected conflicts, rotated credentials, server authorization/privacy, PREPARED journal recovery and Stage 2 record compatibility. Browser fixtures exercise actual IndexedDB and the reconnect/resume/manual handlers with synthetic interrupted API traffic, preserve instant advancement and next-hole input, verify retained exports, session/tab recovery, Finish gating, quota failure and post-reveal rejection. They do not contact Google or production.

Stage 3 physical Safari synchronization acceptance remains pending a separately authorized isolated deployment. Local WebKit availability is reported by the browser runner rather than counted as physical Safari evidence.

## Stage 1 and Stage 2 physical evidence — 2026-11-03

The owner reconfirmed diagnostic v3 on the current test origin, `https://flaghunters-v2-test-8b76.williamsgpeter.chatgpt.site/offline-feasibility/`: Prepare succeeded; online reload/Check reported the retained marker, worker control and both cached assets. With Airplane Mode on and Wi-Fi off, offline reload, closing/reopening the diagnostic tab, and lock/resume all passed. These are user-observed physical iPad/Safari results. Stage 1 service-worker and scoped diagnostic offline-launch checks have **passed**, not outstanding. App-wide golf offline boot remains unimplemented and belongs to Stage 5.

The owner accepted all five Stage 2 physical checks: immediate offline advancement, retained pending scores after reload/tab closure, credential-free recovery export, Finish gating and retained group PIN session. The exported hole 16 request contained all four entered scores (2, 3, 4, 5). A save made in the earlier admin credential scope remained recoverable but did not overlay the later scorer scope. This was retained/exportable rather than lost; no fresh-credential impersonation or successful cross-credential replay was claimed.

## Future deployment and review gate

No deployment is authorized here. A later isolated Stage 3 test needs the matching updated `backend/Phase1.gs` with the existing `backend/Code.gs`, plus six matching frontend assets: `index.html`, `v2-local.js`, `v2-sync.js`, `v2.js`, `v2.css`, `app-icon.PNG`. Preserve the existing private Site, diagnostic and synthetic backend/workbook safeguards. Do not publish only the frontend against a backend lacking `operationStatus`; unknown status responses are retained for review rather than assumed accepted.

Review Stage 3 implementation and results before authorizing Stage 4. No merge into main, production resource access, provider change, new Site or automatic deployment is part of this work.

## Local validation result

79 unit/backend/generator/diagnostic tests passed, including 14 Stage 3 queue/reconciliation tests. Eight real-IndexedDB Chromium browser scenarios passed. The existing mobile scoring/leaderboard/scorecard/Finish/reveal suite passed at four Chromium viewport sizes. WebKit is unavailable locally and no Stage 3 physical Safari test is claimed. A slow-bootstrap regression check also confirms that a newly accepted local revision or known reveal lock cannot be replaced by an older network snapshot. `git diff --check` passed.
