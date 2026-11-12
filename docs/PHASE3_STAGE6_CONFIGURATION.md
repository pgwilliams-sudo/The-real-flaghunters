# Stage 6 — configuration and access checklist

**Planning only · 12 November 2026 · development/v2.** Owner accepted Stage 5 against `f611b7e` and approved Stage 6 documentation. No simulation, production write/deployment, main merge or Saturday trial is authorized. Use this checklist with [simulation](PHASE3_STAGE6_SIMULATION.md) and [runbook](PHASE3_STAGE6_RUNBOOK.md).

## Pinned release record

| Item | Exact baseline |
| --- | --- |
| Accepted report | `f611b7e` — PHASE3_STAGE5_ACCEPTANCE.md |
| V2 runtime source | `46d9d5e57080ab99e5a2f24743ccf6673d913d62` |
| Offline cache | `stage5-v5`; eight static assets; worker packaged with matching assets |
| Test Site source | `77af27be7ad5a8417ff9beb6d634f20cc4cf1649` |
| Test saved version | `appgprj_6ae88c84e7388191804ce879ca000a02~appgver_f1c12fbdc75481918f3ee3873664a0c1` |
| Test deployment | `appgdep_6af594f65c008191b6257695ca9a3bbb` |
| Backend source | Code.gs + Phase1.gs from the same runtime commit; status `2-phase2`, API `v2-phase1` |
| Code.gs SHA-256 | `0629e63a25182d0295306f1bcb627f9f033d4fe55df34a2a5be3b8a9fdd2fbcf` |
| Phase1.gs SHA-256 | `466278b4f9aa792c155f1c0280c3518b78e0bb4b0106e6330b198ac438423dcc` |

These identify source, not a newly verified live Apps Script version. Record the immutable Apps Script deployment version and exported source comparison before execution. A status string alone is insufficient. Production V1 and proposed V2 live IDs/versions are **UNVERIFIED: fill before go**; never substitute the test IDs below.

## Keep test and production distinct

Test-only inventory, previously verified:
- Site: `appgprj_6ae88c84e7388191804ce879ca000a02`, https://flaghunters-v2-test-8b76.williamsgpeter.chatgpt.site — owner-private.
- Script: `1QVgbBdFCm7MPYD0Tqfi6hb5vQUjxHIObMjS8er4yrqUFk7mTWbO4poOs`.
- Test endpoint: https://script.google.com/macros/s/AKfycbzygKEHMYWvZPYZjdEjCcFaG4VkYqqxRTnjckv3Y053PDUbejl8YQ6-MCEaNjVyIiEP/exec
- Current synthetic Sheet: `1LW28dExiimGe-xiaGRYsRwCpP0c6HpS1gojk5ha7IhM`; its Stage 5 round is permanently locked. A later approved generator reset changes the active test Sheet: record the new ID.

Verify by read-only review; tick only when evidenced:
- [ ] Record V1 production Site URL/project, Script ID, deployment ID/version, Sheet ID and current working link. Record proposed V2 production equivalents separately; verify intentional differences from all test resources and from the V1 data store.
- [ ] Confirm intended audience: trial scorers can open the proposed production origin with their own accounts. Current owner-private test access does not establish member access. Obtain approval before changing sharing.
- [ ] Review Script execution identity and web-app access. Document which read endpoints are public; never assume a private frontend makes its backend private. Scorer PINs, admin authentication and hidden-hole filtering must match approved behavior.
- [ ] Confirm V2_ENABLED, correct Sheet binding, schema headers, real course/player inputs and supported handicap settings. Verify admin secret exists securely; do not copy secret values, PINs or bearer tokens into this checklist or chat.
- [ ] **Production setup gate:** `initializeV2TestSchema` requires V2_TEST_ONLY=true and a separate test Sheet. There is no approved production initialization/migration procedure in this plan. Do not bypass the guard, label member data synthetic, run the generator on production, or assume schema compatibility. Review a concrete setup procedure separately; if code is required, request new implementation approval.
- [ ] Package backend using the existing exact allowlist (Code.gs and Phase1.gs only). Exclude TestRoundGenerator.gs and all development fixtures. Verify the deployed source against the pinned release; no test endpoint silently becomes the production endpoint.
- [ ] Confirm the selected production origin can serve the exact worker/assets without login HTML or redirects during preparation. Retain narrow static matching and the diagnostic worker's separate scope where present. Any origin/auth configuration change gets one targeted preparation check, not a new device matrix.
- [ ] Record backup IDs/time, custodian and access; complete runbook reconciliation and rollback mapping before a release approval request.

## Decision

**NO-GO:** unknown/mixed bindings or audience; unapproved production setup; missing backup/recovery path; unverified release bytes; unresolved score loss/duplication, hidden-hole disclosure or ineffective server lock. Resolve before production or trial.

**Acceptable residuals:** Safari eviction, occasional update/restart needs, slow uploads with durable recovery, and historical blank/history failures without recurrence. See accepted [Stage 5 evidence](PHASE3_STAGE5_ACCEPTANCE.md). Credit Stage 1–5 physical/automated tests; expand only for a specifically changed component or new failure.
