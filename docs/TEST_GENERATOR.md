# Isolated V2 iPad/Safari test setup and seeded round generator

Development branch only. Nothing in this guide authorizes deployment, production access, a merge, or sharing changes. In guided setup, perform one action at a time and wait for confirmation. Obtain explicit approval before publishing either backend or frontend. Use the latest matching `Code.gs`, `Phase1.gs`, `v2.js`, `v2.css` and `index.html`; Phase1.gs includes Phase 2 and scorecards despite its filename.

## Isolation and installation

Create a NEW standalone Apps Script project, e.g. **Flag Hunters V2 — iPad Isolated Test**. Do not copy or open the production Apps Script project, use an existing member spreadsheet, or repoint an existing deployment. Install `backend/Code.gs` as Code.gs and `backend/Phase1.gs` as Phase1.gs, retaining their placeholder spreadsheet/PIN constants. Install `dev/TestRoundGenerator.gs` as a third Script named TestRoundGenerator **in this isolated project only**.

Set Script properties in Project Settings (never put secrets in source or chat):

| Property | Value |
| --- | --- |
| `V2_ADMIN_SECRET` | A new password-manager-generated secret of at least 32 characters |
| `V2_TEST_ONLY` | Exact lowercase `true` |
| `V2_ENABLED` | Exact lowercase `true` |
| `V2_GENERATOR_MODE` | `isolated-synthetic-only` |
| `V2_GENERATOR_SCRIPT_ID` | This NEW project's Script ID, copied from Project Settings |
| `V2_GENERATOR_SEED` | Optional: `clubhouse-12-v1` (default), `windy-12-v1`, or any 1–64 letters/digits/underscores/hyphens |

Leave `V2_SPREADSHEET_ID` unset. Do not create/bind an arbitrary sheet or run the ordinary initializer first. Run **initializeV2TestRoundGenerator** from the editor and authorize only this new test project. It creates a NEW spreadsheet named `[V2 SYNTHETIC ONLY] …`, marks it with ownership metadata, writes synthetic master fixtures, binds the new spreadsheet ID and runs the real V2 schema initializer. Its execution log contains the new spreadsheet URL (not a password). Keep that URL.

The guard requires all opt-ins, the exact current Script ID, unchanged production-placeholder constants, matching generator/active spreadsheet IDs, the generated workbook name and private ownership marker, unchanged synthetic Players/Course fixtures, and no unmanaged events. It refuses mixed/member data and cannot be pointed at an arbitrary existing spreadsheet. These are safeguards against accidents, not a defense against an owner deliberately rewriting the source or properties. Do not bypass a guard rejection.

## Generate the initial round

Run **generateV2TestRound**. It creates 12 clearly synthetic players with Handicap Indexes from -1.2 to 35.6, three groups of four, starts on 1/7/13, and a synthetic White/Yellow 18-hole par-72 course. The course uses the legacy required course name but its measurements are invented, not official course data.

The deterministic score model adds allocated handicap strokes and a seeded distribution of net birdies/pars/bogeys/worse results; occasional pickups are explicit BLOBs with null Gross. All groups are scored through **physical hole 15**, regardless of shotgun start. Holes 16–18 remain unplayed, groups unfinished and results unrevealed. Six scorer-authenticated corrections have reasons and actual revision-1→2 history. Nearest the Pin, Blind Pairs and 2/3/4 are enabled; pin acknowledgements are recorded for visible selected holes. Blind Pairs remains undrawn until the round finishes.

Only initial master fixture inputs are seeded directly: Players, Course and empty legacy table headers. All rounds, groups, credential issuance/login, handicap confirmations, scoring, pickups, correction revisions, completion and competition mutations go through the real `doPost` APIs. No generated score/history/operation/credential/result rows are written directly. There are no mocked browser totals.

Watch the execution log: `ready:true`, `through_hole:15`, `revealed:false` means the initial scenario is ready. Generation pauses after roughly 3½ minutes to avoid the Apps Script execution limit; if `ready:false`, run the same function again. Stable operation IDs and saved cursors make score/correction retries idempotent, including lost responses. Do not edit group draws, rotate scorer credentials, alter master fixtures, or reveal while generation is still in progress. On a hard timeout, the concurrency lease may require waiting eight minutes before retrying. An unrecoverable setup failure should be reported; never manually delete journal rows to force progress.

The private server-side generator state contains test bearer sessions; do not share or dump Script properties. Execution logs contain only non-secret progress and workbook/event IDs. Seeded golf inputs/scores are repeatable; UUIDs, PINs, credential IDs and timestamps intentionally are not.

## Publish only after explicit approval

Backend: deploy this NEW project as a separate Web app, Execute as **Me**. A cross-origin static frontend normally needs **Anyone** access to the backend; obtain informed approval because public read endpoints then expose synthetic visible results. Scorer PINs protect group writes; the admin secret remains stronger and separate. Never change an existing production deployment.

Frontend: use the authorized isolated owner-private Sites project (or ask which project to reuse), preserving its access policy. For the Stage 2 development frontend, publish only index.html, v2-local.js, v2.js, v2.css and app-icon.PNG from the matching development commit. Do not create an additional Site silently or reuse a production frontend URL. Obtain fresh Sites source credentials through Sites. Ask for approval of this concrete deployment before publishing.

On iPad Safari, connect the NEW backend `/exec` URL using the development connection panel. The API generation remains `v2-phase1` for adapter compatibility; the backend version is Phase 2. Only the endpoint is stored in localStorage. Admin uses the new strong secret. On the Stage 2 development frontend, a group PIN opens a trusted-device IndexedDB session retained across tab closure; expiry/rotation requires reauthentication. Earlier deployed Phase 2 files retain the old same-tab behavior until a new deployment is explicitly approved. See PHASE3_STAGE2.md for local-versus-server save statuses and Finish gating.

## End-to-end checks

1. At physical hole 15: verify 12 players, Playing Handicaps, Front 9, clearly labeled partial Back 9/combined totals, BLOB Gross incompleteness and numeric zero-point scores. Tap names/rows for physical-hole scorecards. The current development leaderboard uses Player/Gross/Stb/F9/B9 columns; previously deployed card layouts require a separately approved frontend update. Holes 16–18 have no public details or totals. Close and return to the same leaderboard.
2. Admin can generate/rotate a group PIN after the initial generator has finished. Sign out, enter that group once, inspect correction histories and make a reasoned correction. Test group restrictions and PIN limits without sharing credentials in chat. An open group may edit its own private hidden holes, but public result feeds never include them before reveal.
3. To finish quickly, run **finishV2GeneratedRound** in the editor. It uses real scoped scorer APIs to fill 16–18, acknowledge remaining pin holes, explicitly finish all three groups, and draw six Blind Pairs through the admin API. It is resumable like generation. It does NOT reveal. Public scorecards/totals still stop at 15. Existing scores and earlier corrections are preserved, including manually entered hidden-hole scores. If a stored generator session was revoked/expired (for example after testing PIN rotation), finishing generates a fresh group PIN/session through the admin API; that group must obtain its newly rotated PIN before subsequent scorer login.
4. With explicit user approval for this irreversible TEST round action, use the app's **Reveal final clubhouse results**. Verify complete physical Front/Back 9 and 18-hole totals, all scorecard rows, competitions, BLOB handling and server rejection of scorer/admin corrections after the permanent lock. Reveal uses real server validation, pending-operation recovery and the strong admin credential.
5. Safari is a physical-device check, separate from Chromium emulation. No Android device is assumed. Record missing-score/persistence issues rather than working around them with manual score-sheet edits.

## Reset and repeat

Run **resetV2TestRoundGenerator** only for this owned isolated workbook. It validates the existing binding/fixtures, creates a fresh marked workbook, rebinds ONLY this test script and clears only generator state. It preserves the old workbook and its audit journal rather than deleting history or unlocking a revealed round. The backend deployment URL can remain the same because its properties now select the fresh workbook. Reload the frontend and run generateV2TestRound again; new event IDs prevent old group sessions being reused.

Change `V2_GENERATOR_SEED` BEFORE resetting to get a different reproducible scenario. The seed is captured by initialization/reset. If Players/Course were edited or unknown events added, reset intentionally refuses; do not bypass it to risk real data.

## Production exclusion and automated checks

The generator lives under `dev/`, not `backend/`, has no frontend or HTTP route, and must never be installed into production. `npm run package:backend -- <empty-directory>` copies an exact allowlist of **Code.gs and Phase1.gs only**. It excludes all development utilities. Never deploy a recursive repository glob; manual Apps Script copies must follow the same two-file production allowlist.

`npm test` includes synthetic generation through real backend functions, handicap-based calculations, six authenticated correction chains, all competitions, physical-hole progress/shotgun starts, reset/seed repeatability, lost-response recovery, hidden-hole invariance, completion/reveal locks, guard rejection and package/HTTP exclusion. `npm run test:mobile` exercises the existing real frontend with intercepted synthetic API responses. Neither test command contacts or changes Google production resources. Live Google/Safari integration is not implied by passing local tests.
