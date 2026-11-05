# Stage 5 physical acceptance session — 2026-11-05

Status: DEPLOYED TO ISOLATED OWNER-PRIVATE TEST SITE; NOT ACCEPTED. Prior preflight entries below are chronological; the isolation gate subsequently passed on owner readback. Deployment of source 7230c89b5f5b4ff2c8695e91cb58e19dafc166c5 authorized only to the existing isolated owner-private V2 test environment. Production/main/Stage 6 changes prohibited. Follow docs/PHASE3_STAGE5_SAFARI.md one user action at a time.

## Read-only isolation preflight

- Git worktree /workspace/work/stage5-verified is clean on development/v2 at the approved commit.
- Sites get_site verified appgprj_6ae88c84e7388191804ce879ca000a02, title Flag Hunters V2 — TEST ONLY, active, owner role, custom access with exactly one owner and no other viewers, editors or groups. Access revision 1. Current live URL https://flaghunters-v2-test-8b76.williamsgpeter.chatgpt.site; latest Site version 9. No access change performed.
- Repository records identify this as the existing isolated test Site, separate from the live frontend. No Site write credentials, source push, save or deploy performed during this preflight.
- Drive discovery found multiple test/synthetic spreadsheets, including 1b0mKYNdWjYc1d02mXAE_g17ozs4X2gRx3f3DQAWuv-c, named [V2 SYNTHETIC ONLY] clubhouse-12-v1 652507ad, reported unshared. This is a candidate, NOT a verified active backend binding.
- Drive discovery exposed no Apps Script project metadata. Available tools do not establish the current test deployment's Script ID, active V2_SPREADSHEET_ID or generator-owned Sheet binding. Public status identifies an API generation, not its spreadsheet/project identity, so it is insufficient proof.
- Isolation gate STOPPED pending read-only evidence from the existing Flag Hunters V2 — iPad Isolated Test project's Project Settings/deployment details. Do not deploy until the script, deployment and synthetic workbook binding are verified as separate from production.

## Results and risks

No physical Safari test has started; no pass is recorded. Stage 4 blank-page/history-response blockers and physical upload-timeout investigation remain open. Preserve original Safari tabs, IndexedDB/outboxes, diagnostic registration/cache and existing private exports. Do not share secrets or full Script property dumps. Only non-secret IDs/flags are needed for isolation verification.

## Owner-provided isolation evidence

- Test web-app deployment URL: https://script.google.com/macros/s/AKfycbzygKEHMYWvZPYZjdEjCcFaG4VkYqqxRTnjckv3Y053PDUbejl8YQ6-MCEaNjVyIiEP/exec. This differs from the older production endpoint in the supplied repository.
- Script ID reported from the isolated project: 1QVgbBdFCm7MPYD0Tqfi6hb5vQUjxHIObMjS8er4yrqUFk7mTWbO4poOs.
- V2_SPREADSHEET_ID reported from that project: 1b0mKYNdWjYc1d02mXAE_g17ozs4X2gRx3f3DQAWuv-c. Matches the previously metadata-verified unshared synthetic workbook [V2 SYNTHETIC ONLY] clubhouse-12-v1 652507ad.
- Generator binding/opt-in checks and deployment-to-project association still pending. No deployment or physical test performed.

## Isolation gate passed — owner readback

- Owner confirmed V2_GENERATOR_SPREADSHEET_ID matches V2_SPREADSHEET_ID at the private synthetic workbook recorded above.
- Owner confirmed V2_GENERATOR_SCRIPT_ID matches the isolated Script ID recorded above.
- Owner confirmed exact lowercase true for V2_TEST_ONLY and V2_ENABLED; V2_GENERATOR_MODE is isolated-synthetic-only.
- Owner confirmed Deploy → Manage deployments in that same isolated project shows the exact test /exec URL recorded above. This ties the endpoint to the verified project/Sheet binding.
- Sites live readback reconfirmed owner-only custom access, revision 1. Source manifest agrees with the authorized test Site ID. Isolation accepted on combined live metadata and owner Project Settings/deployment readback; no production resource accessed or changed.
- No backend or Sheet change is needed or performed. Approved frontend application files copied byte-for-byte from 7230c89; three diagnostic assets compared and preserved unchanged.

## Stage 5 test deployment completed

- Approved application commit: 7230c89b5f5b4ff2c8695e91cb58e19dafc166c5.
- Separate Sites publishing-repository commit: bace70284368d05eeb26a1037bd33f001d2fa8d7. Application assets verified byte-for-byte against approved development commit. This repository uses its own main publishing branch; no GitHub main merge or change was performed.
- Deployment ID: appgdep_6aec59f07e54819181a967e22a118942. Saved version: appgprj_6ae88c84e7388191804ce879ca000a02~appgver_9d39319732a88191a4503455c0ae86e4. Sites returned succeeded at 2026-11-05 10:27:07 UTC.
- URL: https://flaghunters-v2-test-8b76.williamsgpeter.chatgpt.site . Owner-private access preserved; no backend, Sheet, environment variable, production resource or Stage 6 changes.
- Three diagnostic files preserved byte-for-byte. No diagnostic registration/cache cleanup performed.
- Deployment packaging contains only hosting manifest and static assets, with no backend, test scripts, credentials, exports or scores.
- Stage 5 NOT ACCEPTED. All physical Safari cases remain pending. First guided action: open existing /offline-feasibility/ diagnostic online in normal Safari without Prepare/Cleanup; await owner observation.

## Physical Safari observation 1 — diagnostic baseline

Owner screenshot at device-displayed 10:29 Thu 5 Nov: diagnostic page opens at /offline-feasibility/ on the existing test origin. Visible diagnostic_version 3; secure_context, service_worker_api, indexeddb_api and cache_api all true; online_hint true; controller is the existing /offline-probe-sw.js. User agent reports Version/27.0.1 Safari/605.1.15 with desktop-style Macintosh string; exact device model/iPadOS version not yet confirmed. Status: Ready for Stage 1 preparation. Checks array empty, so retained marker/cache validation is not yet established. No Prepare/Cleanup action reported. This is diagnostic availability/controller evidence only, not Stage 5 offline app acceptance. Next action: Check retained marker and worker.

## Physical Safari observation 2 — retained diagnostic check

Owner reports PASS after tapping Check retained marker and worker. Record as user-reported diagnostic pass, following screenshot evidence of the original diagnostic controller. Detailed marker ID/cache report not supplied; marker identity comparison across later app-worker installation remains pending. No Stage 5 full-app offline pass inferred. Next: open canonical full application online without clearing Safari data or preparing its worker, and verify the Stage 5 controls are visible.

## Physical Safari observation 3 — full app online entry

Owner confirms Prepare offline app is visible after opening the canonical full test application online in a new normal Safari tab. Stage 5 controls are present; app worker preparation has not been requested. Next action is read-only review of existing current/older-round pending scores before creating a private recovery baseline. Full-app offline launch remains untested.

## Physical Safari observation 4 — recovery baseline before offline preparation

Screenshot at device-displayed 10:32 Thu 5 Nov shows Local score recovery opens without a blank page. Current round: one visible Group 1 / hole 16 request, Needs review, message Review server values and confirm a choice before resubmission. Other rounds/backends: one visible Group 1 / hole 16 request for event-3f4ccb60-3a10-4342-922a-d377207fb5ec, Needs review, Scoring credential invalid or expired; explanatory text says retained for export and current-round Retry will not send it. Five resolved decisions retained. Stored local score details collapsed; payloads, operation IDs and attempt counters not yet captured. App header behind modal shows 20 Jun 2026 / White tees. No resubmission, resolution, deletion or export yet reported. Next: privately export recovery baseline. Existing current and older pending requests must be preserved through Stage 5 tests.

## Physical Safari observations 5–6 — baseline preserved

Owner confirms recovery baseline exported and saved privately, then confirms recovery panel closed. Export file contents, operation IDs and attempt counters have not been inspected here; do not infer a detailed payload comparison yet. No resolution/deletion requested. Next: verify the Safari connection field targets the same isolated /exec deployment before online group preparation.

## Physical Safari observations 7–9 — connected endpoint and locked-round obstacle

Owner supplied the connection-field endpoint, matching the verified isolated /exec URL. A prior screenshot at device-displayed 10:36 showed a successful status JSON response (ok true, version 2-phase2, api_generation v2-phase1, message V2 test backend); status alone was not used as proof of stored configuration. Owner reports Enter Scores lists Groups 1–3. On selecting Group 2, owner reports Final results are locked and cannot obtain a PIN. This is user-reported permanent-lock behavior, not yet a comprehensive locked-state UI pass. Existing locked round and two pending requests must be preserved; no unlock, pending deletion or PIN workaround authorized/performed. Full offline group scoring cannot be tested on this locked round. A new guarded synthetic workbook/round is needed before continuing scoring tests; original records must remain available as older-round fixtures.

## Physical Safari setup observations 10–11 — guarded fresh synthetic workbook

Owner reports resetV2TestRoundGenerator execution complete in the verified isolated project and supplies its non-secret result: spreadsheet_id 1LW28dExiimGe-xiaGRYsRwCpP0c6HpS1gojk5ha7IhM; spreadsheet_url https://docs.google.com/spreadsheets/d/1LW28dExiimGe-xiaGRYsRwCpP0c6HpS1gojk5ha7IhM/edit; seed clubhouse-12-v1; status Fresh synthetic workbook ready; run generateV2TestRound. Guarded reset creates/rebinds a new synthetic workbook and preserves the original locked workbook/history. This is test-fixture setup, not a physical offline pass. Generation and new group PIN issuance remain pending. Original Safari pending records/export must be retained.

## Physical Safari setup observations 12–13 — fresh round generated

Drive metadata verified the new workbook 1LW28dExiimGe-xiaGRYsRwCpP0c6HpS1gojk5ha7IhM is a native Sheet named [V2 SYNTHETIC ONLY] clubhouse-12-v1 05f3c8b5 and not shared. Owner ran generateV2TestRound and supplied final progress: event_id event-16275a7a-5df7-4a84-81ff-c2ff0dd33681; seed clubhouse-12-v1; steps_done 69; steps_total 69; ready true; through_hole 15; revealed false. Synthetic round setup complete per generator report. New group access/preparation, hidden-hole checks and all full-app offline tests remain pending. Next action: reload the existing golf-app tab online without clearing storage and observe the new round and local pending summary.

## Physical Safari observations 14–15 — fresh round reload and pending isolation

After online app reload, owner reports round date 20 June. Date alone was not used to identify the new seeded event. Owner supplies exact Device saves summary: No local scores are awaiting server acceptance for this round. 2 request(s) belong to other rounds/backends; retained for review/export and not automatically retried. This is user-observed round-isolation evidence: both baseline pending records remain retained and are no longer current-round requests after fixture reset. Operation IDs/attempt counts have not yet been compared to the private baseline export. Next: sign into isolated test admin to issue fresh Group 2 access, then sign out before scorer testing.

## Physical Safari observations 16–19 — online Group 2 preparation

Owner reports test Admin opened, Group 2 Generate / rotate group PIN completed, then Sign out of admin completed. PIN/secret not shared or recorded. Owner subsequently opened Enter Scores → Group 2 using private access and reports hole 16 opened with no errors. This establishes user-observed online scorer entry for the fresh synthetic round, not offline reopening. Seeded handicap confirmation and visible scores were generated through hole 15. The app-worker preparation button has not yet been used; next action is Prepare offline app and capture its exact result. Original two pending records remain fixtures to preserve.

## Physical Safari observation 20 — app asset preparation

Owner screenshot at device-displayed 11:15 Thu 5 Nov shows Offline app status: Connection available; server data may still be stale. App assets prepared. Reload once online, then verify offline reopening. Group access must be prepared separately. Storage-eviction/recovery-export guidance is visible. Reopen prepared round event-16275a7a-5df7-4a84-81ff-c2ff0dd33681 / group 2 button is present, matching the new generated event. Two older Group 1 event reopen buttons are also visible (event-3f4ccb60-3a10-4342-922a-d377207fb5ec and event-ec9f492e-3d26-45e8-aa03-58341a21a539). Device saves still reports zero current-round pending and two older-round/backend requests retained without automatic retry. Record as physical Safari preparation-success UI evidence; worker controller/cache allowlist/credential content inspection and offline reload/reopen are not established by this screenshot. Next: reload online once, retaining all storage.

## Physical Safari observations 21–23 — online reload and first offline app reload

Owner confirms online reload returns to main menu with the new Group 2 prepared-round button still visible. Owner has a phone for online chat and confirms iPad Airplane Mode enabled and Wi-Fi disabled. Following an instructed offline reload, owner supplies a phone photo of the iPad showing the full styled app menu, iconography and prepared-round controls; header falls back to Saturday Golf and red home message reads Connection problem: Load failed. This supports successful offline application-shell rendering after reload, not yet closed-tab reopening or offline group scoring. Offline app status text is outside the supplied photo. Record usability finding S5-U1: raw server-startup Load failed banner remains visible alongside offline entry, potentially confusing despite a usable cached shell; investigate and retain as a remaining issue. No blank page occurred in this observation. Next action: open the explicitly prepared new-event Group 2 while keeping iPad offline.

## Physical Safari observations 24–26 — offline group entry and closed-tab cold reopen

Owner confirms prepared new-event Group 2 opens offline at physical hole 16 following offline reload. Owner then confirms closing only the golf-app Safari tab while iPad remains in Airplane Mode with Wi-Fi off; chat continues on the phone. After entering the canonical root test URL in a new normal Safari tab without reconnecting, owner confirms the full app loads. Record user-observed PASS for full application offline reopening after Safari tab closure on this device/session. Safari force termination, OS process eviction, device lock/resume, pending-score durability, cache-update survival and reconnect are not established by this pass. Next: use the new tab to reopen the prepared Group 2, then perform controlled offline score saves.

## Physical Safari observations 27–29 — reopened group and offline Save & Next

Owner confirms the new offline Safari tab reopens the prepared new-event Group 2 at hole 16. Owner enters BLOB/Picked up for the first listed player and Gross 5 for the other three, confirms selections, then taps Save & Next once while iPad remains offline. Owner reports hole 17 appears and message saved on device awaiting server acceptance. Record user-observed PASS for continued scoring/advancement after closed-tab offline reopen and an honest local-only save message. No server acceptance is claimed. Exact operation ID, durable record payload and backend history comparison are pending; this observation does not establish a physical accepted-response-loss scenario. Next: device lock for at least five minutes while pending data remains and Wi-Fi stays disabled.

## Physical Safari observations 30–33 — five-minute lock/resume and continued offline scoring

After instruction to leave iPad locked offline for at least five minutes, owner reports elapsed time, then unlocks/returns to Safari. Owner reports physical hole 17 and Device saves summary: one request waiting, zero syncing, zero needing review. This is user-reported device-lock/resume and pending-count retention evidence; elapsed duration was not independently timed. Owner enters Gross 4 for all four players on hole 17 and taps Save & Next once while still offline. Owner reports advancement to hole 18 and paraphrases the device-save/awaiting-server-acceptance message. Record PASS for continued offline Save & Next after lock/resume. No server acceptance observed or claimed; exact operation IDs/payload retention and two-request count after this save still require inspection/export. Next: offline reload followed by prepared Group 2 reopen, then compare the pending count and selected scores.

## Physical Safari observations 34–37 — offline reload preserves pending scores

Owner reloads the full app while iPad remains offline, confirms main menu and prepared Group 2 button return, then reopens prepared Group 2. Owner reports hole 18 opens with two saved requests awaiting acceptance. Using Edit hole without mutation, owner confirms hole 16 retains first-player BLOB and Gross 5 for the other three, and hole 17 retains Gross 4 for all four. Record user-observed PASS for offline reload/reopen preserving both pending-hole counts and displayed score values after lock/resume. No reconnect has been instructed; no server acceptance is claimed. Exact operation IDs/attempt counters remain to be inspected from exports before/after subsequent tests. Stage 5 remains NOT ACCEPTED; update/expiry/reconnect/privacy/known-lock/history/blank-page cases are incomplete. Next: capture a private recovery export with these pending scores before testing reconnect and updates.
