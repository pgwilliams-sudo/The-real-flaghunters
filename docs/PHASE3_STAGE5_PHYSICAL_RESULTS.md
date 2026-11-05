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
