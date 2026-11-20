# Stage 7 isolated deployment — preflight in progress

Owner approved development candidate ec742d2150f31bc65d71c4c72f95fc8eff5427a9 for the existing isolated test environment only on 20 November 2026. Tested runtime b1c4a07b62eee0bc12d3c85d559f37c36524a916 (123 unit tests + focused Chromium PASS). No production, V1, main, schema, sharing or Saturday trial changes.

## Verified target and rollback baseline

- Native Sites read reconfirmed TEST ONLY project appgprj_6ae88c84e7388191804ce879ca000a02, https://flaghunters-v2-test-8b76.williamsgpeter.chatgpt.site, owner-only custom audience revision 1; no other users/editors/groups/external visitors. No sharing edits.
- Current frontend rollback: Site version 15, saved version appgprj_6ae88c84e7388191804ce879ca000a02~appgver_f1c12fbdc75481918f3ee3873664a0c1, publishing source 77af27be7ad5a8417ff9beb6d634f20cc4cf1649, deployment appgdep_6af594f65c008191b6257695ca9a3bbb, worker stage5-v5. Saved archive retained by Sites.
- Owner read back isolated Script ID 1QVgbBdFCm7MPYD0Tqfi6hb5vQUjxHIObMjS8er4yrqUFk7mTWbO4poOs. Both active/generator Sheet IDs match 1ldVVlR3YmH7RzfM6xEpRsFcJYoltIdg6NdCW2cacOQY. V2_TEST_ONLY and V2_ENABLED exact lowercase true. Scoring mode/revision properties both absent; Stage 7 defaults pin-free/revision 1 without changing properties.
- Owner Manage deployments readback: existing web app version 3, Execute as Me, Who has access Anyone. Owner supplied exact matching /exec URL https://script.google.com/macros/s/AKfycbzygKEHMYWvZPYZjdEjCcFaG4VkYqqxRTnjckv3Y053PDUbejl8YQ6-MCEaNjVyIiEP/exec . A library URL was distinguished from this web-app URL; the /exec URL was subsequently confirmed. Preserve this deployment ID, URL and settings when updating its version. Backend rollback is this existing immutable version 3.
- Independent Sheets metadata: [V2 SYNTHETIC ONLY] clubhouse-12-v1 45e7edd2. Read-only RoundEventsV2 baseline: event-a958ffae-2206-4087-9d59-8a6a64f3de2a locked=true, revealed_at=2026-11-12T16:33:06.522Z. ScoreOperations baseline: 56 COMMITTED, no other states in bounded read. No Sheet writes/reset performed.
- Owner opened the existing test app online in Stage5StorageTest and reported 0 waiting. Saved a private Before Stage 7 deployment.json recovery export. The export remains owner-held; contents not independently inspected in this preflight. Personal-profile older records and all prior exports/evidence must remain untouched.

## Candidate/configuration and sequence

Matching core backend files are backend/Code.gs and backend/Phase1.gs at ec742d2150f31bc65d71c4c72f95fc8eff5427a9 (Code.gs unchanged from accepted baseline). Backend status 2-stage7, API generation v2-phase1. Frontend is the eight exact app assets plus v2-app-sw.js from that commit; worker cache stage7-v1. Preserve existing diagnostic assets/scope and hosting manifest identity. Do not deploy a mixed pair as a completed release.

Source preparation is not live publication. Keep live backend version 3 until both matching packages are ready. Updating Apps Script source requires guided owner editor actions; no connected Apps Script write API is available. The Site packaging execution workspace currently remains starting/unavailable; do not expose a partially completed release while this dependency is unresolved. No Stage 7 deployment has happened as of this record.

After deployment: verify non-secret status/version/mode and unchanged Sheet binding/locked markers, use a minimal non-destructive smoke check (no locked-round edits), then guide focused physical acceptance one action at a time. Any fresh smoke round must be separately identified synthetic; never reset/unlock preserved rounds. Roll back software as a compatible pair if necessary; do not restore an old Sheet over newer scoring data or delete queues. Preserve/reconcile operation IDs and private exports.
