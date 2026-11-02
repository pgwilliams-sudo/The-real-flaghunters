# V2 Phase 1: controlled development baseline

Phase 2 result visibility and reveal now supersede the original future-reveal notes below; see [PHASE2.md](PHASE2.md).

This branch is not deployed. No existing spreadsheet, Apps Script project or production URL is configured in the frontend. `backend/Code.gs` retains the placeholder spreadsheet ID and PIN; `backend/Phase1.gs` supplies the public V2 handlers. Install BOTH files together in a separate test project when a test deployment is authorized. Never install just the legacy file.

## Delivered behaviour

- BLOB is `score_status=pickup`, with null gross/net, zero Stableford and a completed hole. Numeric zero-point scores stay numeric. Numeric gross/net totals display as incomplete if any hole is a pickup.
- Group scoring uses automatically generated two-digit PINs (`00`–`99`, including leading zeroes), generated/rotated by admin after saving groups. This is lightweight access control for a trusted private golf group, not strong individual authentication. A PIN opens only its selected event/group. Admin authentication remains separate and stronger. Every accepted change records the group-scoring role and credential ID, never a claimed individual identity.
- Group PINs are shown only in the authenticated admin issuance response, never in public reads. Only PIN hashes are stored server-side; two-digit hashes are trivially enumerable and are not strong secrets. `openGroup` accepts an exact two-character PIN and returns a high-entropy bearer session scoped to that round/group. Sessions are retained in `sessionStorage`, keyed by backend URL, event and group: reloads and reopening the group in the same tab need no PIN. Closing the tab, expiry, rotation or replacing the draw requires entry again. The PIN itself is never stored in browser storage. Admin tokens remain memory-only and expire after 12 hours; group credentials expire after 30 days, with the existing reveal/lock guards still blocking mutations. PIN rotation changes the PIN and revokes existing sessions; replacing the draw also revokes them. Existing legacy bearer credentials remain valid until revoked/expired; generate new PINs for existing groups to move them to this flow.
- PIN login is limited to five attempts (successful or failed) per group credential in each fixed 60-second window. Counters are persisted in ScoringCredentials under the script lock, so clearing cache or changing browsers does not bypass the limit. Existing sessions do not spend attempts; rotation starts a new credential/window. This basic limit can temporarily block a group and is not intended to defeat a determined attacker. Admin login keeps its separate ten-failed-attempts/minute cache limit.
- Group session secrets are deterministically derived from the strong server-side `V2_ADMIN_SECRET` and random credential ID; only their hashes are stored. Changing the admin secret requires generating new group PIN credentials before new logins work. Already opened bearer sessions remain valid until expiry/revocation. No score transaction, revision, idempotency, history or permanent-lock rule has changed.
- Scorers may correct their own group before and after Finish Group; admin may correct any group. Accepted changes need a 1–500 character reason. No-op saves do not create fake revisions. Undo means entering the previous value with a new reason. The old revision is never removed.
- Course snapshots freeze at new-event creation. Handicap snapshots freeze as a group is confirmed, including Handicap Index, Course Handicap, Playing Handicap, allowance, calculation version and rounding. A group can reconfirm before its first score; its first accepted score locks that group's handicaps. Other groups can still confirm before they start. Partial confirmation snapshots are invisible until the entire group's manifest is published.
- V1 rules are explicit: current 100% allowance, nearest rounding with ties away from zero, signed plus handicaps, and legacy Stableford scoring. Future rules must use another version, retaining V1.
- New events use V2. Failed setup remains status `setup`, which cannot be scored. No historical snapshots are manufactured.
- Historical numeric records remain in legacy sheets. Authorized numeric corrections use the audited operation journal as an overlay; original legacy rows remain unchanged. Such corrections retain the original live-course calculation behaviour and are explicitly marked `legacy_live_course_not_historical` with null snapshot references. Historical course truth cannot be reconstructed. BLOB is available only in new V2 rounds.
- Pickups count toward 18-hole completion, appearances and POTY. `v2EclecticCandidates()` excludes pickups but keeps numeric zero-point scores. Eclectic presentation remains future work. Season UI remains the existing placeholder.
- Stableford, Blind Pairs best-ball, numbered-hole 2/3/4, rolling pin concurrency checks/acknowledgements and explicit group completion are retained. GET competition reads no longer create sheets or write headers.
- A permanent mutation guard checks `RoundEventsV2.data.locked` or `revealed_at`, including admin corrections. No reveal endpoint or hidden-hole policy is implemented in Phase 1. The future reveal action MUST acquire the same script lock, recover accepted pending operations, validate completion, and set the irreversible marker. Spreadsheet owners can bypass application controls by editing the underlying data; protect direct sheet/script access.

## Schema and migration

The initializer is explicit, repeatable, validates existing table headers and requires `V2_TEST_ONLY=true` and a separately configured `V2_SPREADSHEET_ID`. There is no automatic production migration. Original Events, Players, Course, Groups and Scores headers stay in place. Version metadata is additive in RoundEventsV2 rather than overwriting legacy Events columns.

| New sheet | Exact columns | Payload / role |
| --- | --- | --- |
| RoundEventsV2 | event_id, data | JSON schema version, course snapshot ID, group generation, committed confirmation manifests, allowance, rules, reveal/lock state |
| RoundCourseHoles | snapshot_id, hole, data | Immutable per-hole copy of course/tee/par/SI/yardage/slope/rating |
| RoundPlayers | snapshot_id, event_id, player_id, data | Immutable confirmation version and handicap/rules snapshot |
| ScoresV2 | operation_id, score_key, revision, data | Append-only versioned score projection; key is JSON [event, player, hole] |
| ScoreHistory | operation_id, score_key, revision, data | Immutable before/after, reason, authenticated role/credential ID |
| ScoreOperations | operation_id, state, data | Durable validated intent, request hash, actor, changes and result; PREPARED or COMMITTED |
| ScoringCredentials | credential_id, data | Role, scope, hash, expiry, revocation; never plaintext bearer secret |
| SchemaMigrations | version, state, timestamp | Explicit initialization checkpoint |

Competitions, PinHistory and GroupStatus retain their existing layouts and are created only by explicit writes when needed. V2 JSON cells are an intentional schema choice to keep versioned records together and prevent user text from becoming a sheet formula. Do not manually edit journal cells. Sheets' cell and execution/quota limits still apply; this is designed for society-sized events, not unbounded datasets.

Before a later production migration: verify/export backups and actual headers, stop writes during cutover, run preflight in a copy, reconcile event/player/hole keys and competition totals, and keep historical rounds on legacy rules. Do not import current master data as historical snapshots. The current deliverable does not migrate production data.

## ScoreOperations: interrupted-write recovery

A score save holds the Apps Script lock:

1. Authenticate role/scope, verify the event lock, recover earlier accepted intents, and validate expected score revisions and correction reasons.
2. Append a PREPARED operation containing the complete validated before/after batch, stable request hash and return result. Flush it. No token secret is included.
3. For each changed score, append its ScoresV2 row and immutable ScoreHistory row. Existing matching operation/key/revision rows are checked and reused, not duplicated.
4. Flush all projection/history rows, then mark the operation COMMITTED and flush. A whole batch becomes visible through one commit marker.

Readers include only COMMITTED operations. While a batch is partially written, readers see its previous committed state, never part of the new batch. A timeout may mean the server accepted the intent; retry the SAME operation ID. The interface retains that ID during an unchanged retry in the same page session. If the acknowledgement was lost after commit, the stored result is returned without a new revision.

A later save or the admin's **Recover pending score writes** action completes PREPARED operations before accepting another revision. A restarted browser may issue a new ID: the server first recovers the old intent and then rejects a stale revision; use Reload scores to inspect the accepted result. Recovery uses the original validated result and actor; it does not recompute from changed master settings. Revoking a credential does not erase an already accepted operation; admin recovery can finish it.

Fault tests interrupt before and after every write/flush boundary, for initial batches and correction batches. This models requests failing before application or succeeding with their acknowledgement lost, plus batches split across sheets. It does not claim arbitrary manual cell corruption is recoverable. Conflicting journal data fails closed with an integrity error: preserve backups and investigate rather than overwriting history. Apps Script locks coordinate this project only; another project or direct editor must not write these tables concurrently.

## Automated tests

- `npm ci --ignore-scripts`
- `npm test`: real backend functions in a local VM with fake Sheets, properties, locks, cache and crypto; no Google access.
- `npx playwright install --with-deps chromium webkit` in an environment permitting browser downloads.
- `npm run test:mobile`: actual frontend, synthetic backend, every HTTP request intercepted. Exercises touch BLOB, handicap confirmation, reasons/history, Finish/edit, admin PIN generation and competitions at phone/tablet sizes. Runs WebKit scenarios when installed; reports a limitation when unavailable. Set CHROMIUM_PATH if necessary.
- GitHub Actions runs these tests only; it has no deployment step or Google credentials.

Local results: 26 backend tests passed, including 36 injected failure scenarios across nine write/flush boundaries for initial and correction batches. Chromium touch scenarios passed at 390×844 (iPhone size), 360×800 (Android phone size), and 820×1180 (iPad size). WebKit was unavailable in the current environment. Chromium emulation is not a physical iPhone/iPad Safari test. Perform the device checklist below before acceptance for live use.

## Controlled first test — later, with separate authorization

1. Create a NEW spreadsheet containing synthetic Players, Course, Events, Groups and Scores with the original headers. Use eight fake players, valid 18-hole White/Yellow course data, and no member data. Existing empty data-sheet headers are sufficient for Events/Groups/Scores. Export this clean fixture as a baseline.
2. Create a NEW Apps Script project. Copy both repository `.gs` files. In that project's Script Properties set `V2_SPREADSHEET_ID` to the new test sheet ID, `V2_ADMIN_SECRET` to a unique password-manager-generated secret of at least 32 characters, `V2_ENABLED=true`, and `V2_TEST_ONLY=true`. Keep secrets out of chat, source control, URLs and logs.
3. Run `initializeV2TestSchema()` from the test editor and inspect the new headers. Repeat once to confirm it is idempotent. Authorize only the separate test project. Do not run any initializer against existing Sheets.
4. Only after test deployment is authorized, create a separate TEST web-app deployment and host this branch's static frontend at an isolated test URL. Do not update the existing Apps Script deployment, GitHub Pages production source or main. Confirm the web-app's access/execution settings permit the intended tester and CORS/redirect behaviour. These Google integration details have not been exercised by local mocks.
5. Open the frontend on iPad, iPhone and Android phone. Connect the TEST web-app URL through the development connection panel (status must report v2-phase1). The frontend has no production endpoint by default. Only this non-secret endpoint is saved in localStorage.
6. Sign in through Admin Setup, create a new round, save groups and competitions, generate group PINs and privately give them to the assigned test scorers. Admin sign-out clears the visible issued PIN. Verify group A cannot score group B and old PINs and sessions fail after rotation.
7. Confirm handicaps on each device. Enter numeric zero-point scores and BLOBs; save, reload, correct with reasons, open history, Finish Group and correct again. Check pickup gross/net are absent and all 18 holes count. Verify Blind Pairs, 2/3/4 and pin acknowledgement/correction flows.
8. Change only the TEST master course/handicap data and confirm the V2 round does not change. Verify historical records remain unsnapshotted. Test two-device stale revisions and reconnect after a failed save. Use admin recovery, then Reload scores; never manually rewrite history.
9. Test portrait/landscape, keyboard, touch target size, phone overflow, Safari tab suspension/reload, and session retention after reload (PIN entry again after closing the tab). Local scoring is not offline-first in this phase: a save is accepted only by the server. Unsaved selections are memory-only. Do not close a tab with unsaved changes.
10. In the synthetic test sheet only, set the lock marker to exercise the future reveal guard; verify scorer and admin changes are rejected. No reveal button exists yet. Keep the test sheet separate and never use manual lock editing as a production reveal workflow.

## Rollback

Set `V2_ENABLED=false` in the TEST project to stop all API writes; reads remain available. Preserve/export the journal and all snapshots. Do not restore a pre-session backup over newer accepted scores. Resolve PREPARED operations using a compatible V2 build before resuming writes. Rolling back means restoring a previous V2-compatible code version, not directing legacy-only code at V2 rounds. Legacy original score rows are untouched; corrections live in the overlay and must be retained if exporting historical results. Stop the isolated static test host and revoke test credentials if abandoning the test. Production remains unchanged throughout this process.

## Remaining limits

No production or live Google integration test has run. No reveal UI, hidden-hole filtering, offline queue/background sync, season dashboard, eclectic display or new competition formats are included. High-volume indexing/archival and record retention are future work. Public read endpoints retain the current application's visibility; group credentials protect writes and private revision history, not public leaderboard results. Group PINs and sessions are capabilities, not proof of personal identity. History is immutable through the application, not against a spreadsheet owner. Legacy course settings remain historically unknown.

## Group PIN regression checks

Run `npm test` for PIN format/leading zeroes, scoped login, persistent attempt limiting and reset, rotation/revocation, public-response redaction and post-reveal rejection alongside all existing scoring/recovery tests. Run `npm run test:mobile` for two-digit input, wrong-PIN rejection, same-tab session reuse after reload/reopening, admin-only PIN generation and the existing touch scoring/correction flows. Browser scenarios use synthetic local API responses, not Google or production. Existing physical-device checks of bearer-code entry do not verify this new PIN flow; it has not been deployed.
