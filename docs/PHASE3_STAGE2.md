# Phase 3 Stage 2: transactional local drafts

Historical implementation report at 93e3821. Subsequently deployed only to the existing private isolated Site and accepted by the owner in physical iPad/Safari testing on 2026-11-03. Stage 3 is separately documented in PHASE3_STAGE3.md. Stage 1's physical iPad/Safari feasibility passed, but that does not verify these new app behaviors on a physical device. At the Stage 2 implementation boundary, Stages 3–6 had not begun.

## Delivered scope

`v2-local.js` is a standalone, network-free IndexedDB module. Database `flaghunters-v2-local` schema version 1 contains scoped group sessions, frozen prepared snapshots/accepted scores, and local save records. Every scope includes backend URL, event ID, group number and credential ID. The adapter never serves this private store to public leaderboards/scorecards/competitions; those still use the filtered server APIs. The Stage 1 diagnostic worker does not control or cache the golf app.

An online group preparation fetches the real V2 bootstrap and confirmed handicap/course snapshots. Group bearer sessions are persisted on the trusted device, not the PIN. Old same-tab sessions migrate only after an IndexedDB transaction commits. The strong admin secret/token remains memory-only. Server expiry, rotation and revocation still apply; invalidating a session never erases its saved scores. Pending data under an old credential remains available for export/review and is not silently submitted under a new identity.

After local validation, **Save & Next advances after `transaction.oncomplete`**, without waiting for the server. Request success alone is insufficient. Read/write transactions request strict durability where supported, with a TypeError-only compatibility fallback for browsers without that option. Transaction abort, quota/storage error, blocked/incompatible database, missing preparation or a known reveal lock cannot claim a successful device save or advance the hole.

The persisted record includes a stable operation ID, immutable request body/expected revisions, scope, timestamps and acceptance status; no request bearer token/PIN/admin secret is stored with it. One unaccepted save per physical hole is permitted in this stage. Its fields remain read-only until accepted; another edit must not overwrite that pending record. Re-selecting it and using Save this hole retries the same saved request/ID. New edits after server acceptance use a new operation and real current revision/reason checks. BLOB stays null Gross, never a fictional stroke count.

Each user save makes one immediate online attempt **after** the local commit. Advancing does not wait for that attempt. A positive server response is not enough to clear pending state: accepted scores and local acceptance status commit atomically. A lost response/failed local acknowledgement retains the original record. A stale revision, revoked credential or post-reveal rejection retains it as needing review. The adapter does not invent accepted revisions or alter the server journal. A late response does not overwrite an unsaved next-hole selection or label it server-accepted.

## Stage boundary — not a completed offline app

There is **no automatic startup/reconnect queue draining, backoff dispatcher, dependent-correction reconciliation, operation-status API, cross-device conflict resolver, or app-wide offline shell** in this stage. Those belong to the approved later stages. New saves can make immediate online attempts, but failure recovery is deliberately explicit rather than a partially implemented automatic sync engine. Fast concurrent saves may still encounter existing Apps Script latency/lock limits; failures remain stored for review/manual retry until Stage 3 introduces bounded ordered synchronization.

A prepared, already loaded scoring page can save after connectivity loss. Full offline cold-start/app navigation and cached public read views are not yet delivered. Reloading with connectivity permits snapshot refresh and restores pending score overlays. A retained current snapshot may be used for the prepared group's bootstrap when its network request fails; server authentication/reveal rejection is not treated as an offline fallback.

Known snapshots/rules are checked locally for feedback, but the server remains authoritative. Unknown remote locks/conflicts while offline can only be discovered on a later real API request. Rejected/ambiguous local records are preserved for recovery rather than silently dropped or used in public totals.

## Finish/reveal gates and status

The UI distinguishes unsaved selections, saved on this device/awaiting acceptance, accepted by server, and unconfirmed/rejected saves needing review. The global Device saves panel remains available even when the backend is unavailable or scoring is locked.

**Finish Group is disabled until all local saved requests for the current backend/round (including other group/old-credential records on this device) have server acceptance, the active group has server-accepted scores for all physical holes 1–18, and the current selection is saved.** Save the final hole using Save this hole, then use Finish Group once enabled. The API adapter rechecks local pending records before sending completion. Reveal is likewise blocked by any unaccepted local request for that round. Existing backend group restrictions, revision validation, idempotency, completion checks and permanent reveal locks are unchanged. Other devices' unsent data cannot be proven drained by this client; later sync/reveal acceptance must address that operational gate.

## Recovery and clearing safeguards

- Review/export local scores lists unaccepted records, physical holes, statuses and errors. A JSON recovery file includes private snapshots, request IDs/bodies, reasons and statuses, **not bearer sessions/PINs/admin secrets**. Keep the file private. It is a recovery artifact, not an automatic re-import or permission to bypass a reveal lock.
- Forget this prepared round refuses to clear unaccepted records and offers export instead. Synced records/session removal needs explicit confirmation and is rechecked in the same write transaction. No whole-database reset/automatic purge exists.
- Reload scores replaces only the accepted snapshot and preserves pending requests. Discard prompts refer only to unsaved in-memory selections.
- Switching backend warns if unaccepted local records exist and leaves them intact. Old round/group/credential data remains visible in recovery instead of being silently overwritten.
- Browser storage is not an external backup: Safari/OS eviction or manually clearing site data outside the app cannot be prevented. Export provides an external recovery copy; do not clear Safari storage to troubleshoot pending saves.

## Assets and setup impact

A future separately authorized static deployment must include **index.html, v2-local.js, v2.js, v2.css and app-icon.PNG**, from the same development commit, in that script order. The new module loads before v2.js. Backend code/deployment and Google schema do not change in this stage. No current deployment, provider, audience, production resource or main branch is changed by implementation/testing.

## Automated validation

- `npm test`: existing backend/generator/privacy/diagnostic regressions plus IndexedDB transaction-completion, abort, quota error, atomic acknowledgement, stable retry, session retention, scope isolation, future-version rejection, BLOB/reason/revision/lock validation, redacted recovery exports and refusal to clear pending data.
- `npm run test:local-drafts`: real browser IndexedDB with intercepted synthetic API responses. Holds server responses to prove immediate durable-first advancement and Finish gating, closes/reopens the tab to recover drafts/session without PIN re-entry, downloads a credential-free export, checks stable replay both before acceptance and after a lost accepted response, and verifies quota failure/reveal rejection retain correct state.
- `npm run test:mobile`: existing mobile table/scoring/correction/Finish/reveal/scorecard flows. The fixture explicitly refreshes the accepted local snapshot after test code writes other holes outside the tab.
- Browser suites run WebKit when installed; local absence is reported, never counted as Safari acceptance. No test contacts the real Google backend or production.

Next review gate: assess Stage 2 results and limitations before starting Stage 3's ordered synchronization/reconciliation. No deployment is implicit in that review.

## Local validation result

65 unit/backend/generator/diagnostic tests passed, including 11 local-storage tests. Four Chromium mobile viewports passed the existing full scoring/table/reveal/scorecard flow. Five Chromium real-IndexedDB scenarios passed durable-first advancement with a held response, tab/session recovery and private export, replay after a lost accepted response, all-round pending Finish gating, quota failure without advancement, and post-reveal retention/lock behavior (the grouped scenarios contain multiple checks). WebKit is unavailable locally, so no new physical Safari Stage 2 pass is claimed. CI installs WebKit and runs the local-draft browser suite when available. No failing local tests remain.
