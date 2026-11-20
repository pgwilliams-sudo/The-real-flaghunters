# Stage 7 — anonymous scoring and setup

Development only; no deployment. Owner's 20 November 2026 instruction supersedes issue #2's former PIN-generation/scorer-reveal scope. Owner explicitly accepts anonymous direct backend scoring. Authenticated gateway / Stage 7A proof of concept cancelled; no new hosting or login system.

## Behavior

- Selecting a group opens an anonymous, event/group-scoped scoring session without a PIN. Existing validation, correction reasons/history, idempotent operation IDs, IndexedDB queues and permanent locks remain. A scoring session is not a person's identity.
- Admin authentication remains independently required for round/group setup, competitions, recovery administration and final Clubhouse Reveal. Scorers cannot reveal. Anonymous group bootstrap/history never return admin secrets or PINs.
- Group PIN machinery remains behind `V2_SCORING_ACCESS_MODE=group-pin`. Default when unset is `pin-free`. In free mode the PIN controls are hidden/disabled and the backend refuses PIN issuance. No PIN is generated/requested by free group opening or test generator.
- `V2_SCORING_ACCESS_REVISION` defaults to `1`. Increment it whenever changing mode, including switching back, to invalidate previously issued scoring sessions. Mode mismatch, expired/revoked credentials and changed group version are rejected server-side. Invalid configuration fails closed. Admin credentials are independent of this mode/revision.
- Save Groups leads to Select Comps & Start Round. The final admin-only action persists a group-version-bound start intent and competitions, records one start time, shows Saved ✓, then returns Home. A retry after an ambiguous response uses the same content/operation ID. Changed choices/stale groups are rejected; failures remain on setup with a clear retry message.
- Newly created rounds require admin start before ordinary scoring. Existing accepted rounds without the new marker retain their prior behavior. No Stage 6 records/evidence are edited.

## Compatibility and operations

Deploy matching Stage 7 frontend/backend only after separate test deployment approval. The frontend requires the Stage 7 policy metadata and does not silently enable free mode against an older backend. Session-mode/revision changes may invalidate prepared access: pending scores remain stored for review/recovery; never clear IndexedDB or silently move requests across groups/backends. Offline devices cannot learn mode/revocation/lock changes until reconnect. Existing credential lifetime is retained (30 days for scorer sessions; separate admin lifetime).

The synthetic generator is updated only to follow the new start step and selected access mode; guarded reset/fixture safety remains. It is not part of backend packaging and has not been run against the live environment. Runtime asset version is stage7-v1; old worker/cache lifecycle and diagnostic isolation are retained. No gateway.

The hosted Site's current audience is unchanged. This source has no Site-login dependency, but making a currently private hosted frontend public requires separate access/deployment approval. Anonymous callers knowing the backend URL can select any valid group, read that group's scoring/history data and change/finish it before permanent lock. Group scope is a consistency boundary, not protection against a caller selecting another group. Public hidden-hole result filtering remains; an anonymous selected-group scorer may read its full holes by the owner's accepted policy.

Software rollback does not restore scoring data. Preserve queues and journal/history; keep compatible source versions and reconcile pending operations before mode changes. No production, V1, main, production schema or Saturday-trial change authorized/performed.

## Validation

Candidate prepared through connected GitHub tools because the managed workspace failed to start. JavaScript syntax checks passed before commit. The existing GitHub Actions workflow is reused for the existing unit suite and a focused Chromium Stage 7 browser scenario; no deployment steps or production secrets. Test results will be recorded after CI completion; no Safari retest or full physical matrix claimed. Existing Stage 1–6 evidence is credited.


## Completed validation — 20 November 2026

Tested runtime/test commit: b1c4a07b62eee0bc12d3c85d559f37c36524a916.
GitHub Actions run: https://github.com/pgwilliams-sudo/The-real-flaghunters/actions/runs/44744961061 — SUCCESS.

- 123 unit/backend/storage tests passed, zero failed (116 existing + 7 focused Stage 7 cases). Coverage includes anonymous scope/validation, required correction reasons/audit, admin-only actions/reveal, dormant PIN issuance rejection, mode/revision/expiry rejection, finishing/locks, start idempotency and failure injection, plus queued-data retention on a mode-change rejection.
- Focused Chromium browser scenario passed: no PIN prompt, actual service-worker/IndexedDB offline save/reopening/reload, one-hole advancement under overlapping Save & Next calls, automatic reconnect, accepted correction, admin-only reveal denial, PIN-mode reactivation, hidden PIN controls in free mode, duplicate create/group/start guards, lost-response start recovery, Saved ✓ and Home navigation. All API requests intercepted by an in-memory synthetic backend; no live Google or production data used.
- The duplicate-save test exposed a real pre-existing gap: the saving flag was set after an awaited session read. It is now reserved synchronously, before that first await, so overlapping taps cannot advance multiple holes.
- Initial browser checks used an insufficient asynchronous observation; explicit IndexedDB polling now checks the specific accepted operation. The mode-change queue fixture was corrected to include every group member. Final CI has no failures.
- Existing broad physical/mobile/conflict evidence is credited; no new Safari matrix or Saturday trial performed. Previously separate mobile/local-draft browser commands remain available, while the branch workflow now runs the focused Stage 7 browser case.
- Git tree comparison confirms backend/Code.gs, index.html and every PHASE3_STAGE6 document unchanged; no files deleted. The Site source repository, deployed worker, Apps Script, Sheets, Site audience, production and GitHub main were not changed.

No remaining implementation/test blocker. A future separately approved test deployment must use the matching backend/frontend pair, account for pending scores before changing mode/revision and preserve older scoped recovery records. Current hosted test access remains private; no promise of anonymous access to that unchanged hosted frontend is made. Anonymous backend use, lack of individual attribution and potential unsolicited scoring/usage are the explicitly accepted risks. No gateway or Stage 7A work remains in scope.
