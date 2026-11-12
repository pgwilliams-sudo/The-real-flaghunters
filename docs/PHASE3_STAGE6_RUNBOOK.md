# Stage 6 — deployment, rollback and Saturday trial

**Planning only.** No production deployment, main merge, data restoration or trial is authorized. Use the [configuration checklist](PHASE3_STAGE6_CONFIGURATION.md) and [single simulation](PHASE3_STAGE6_SIMULATION.md). Stage 5 was accepted against f611b7e; accepted runtime is 46d9d5e57080ab99e5a2f24743ccf6673d913d62, cache stage5-v5. Any later runtime change needs its own version/evidence record.

## Release card — fill before approval

- Owner/release operator: **Peter Williams** (confirm availability).
- Named trial scorer, one person per participating group: **TBC — required**.
- Named support person and contact method: **TBC — required; confirm availability**.
- Trial Saturday/date, groups and start/end window: **TBC — required**.
- V1 working URL, deployed source/build, Script deployment version, Sheet ID: **UNVERIFIED — required**.
- Proposed V2 production URL/audience, exact frontend source + Site saved version, Script deployment version + backend source hashes, Sheet ID: **TBC — required**. Use configuration checklist's exact baseline; never infer a live version from an API label.
- Backup workbook IDs/time, source/config snapshots, custodian and fallback ledger location: **TBC — required**.

Unknown fields are gates, not permission to guess. Do not use the owner-private synthetic Site for member scoring or treat production configuration as already approved.

## Before requesting production deployment approval

1. Complete configuration/access checks, approved production setup design and the separately authorized simulation. Produce a concrete release card plus results for owner review.
2. Keep V1's working software, URL, Script deployment/config and data store available unchanged. Agree separate V2 production bindings; do not point V1 at V2 tables or repoint the test project at member data.
3. During a quiet window, reconcile active rounds and device pending operations. Prefer no active round/current-round pending work at cutover. Back up the entire affected workbooks privately, plus exact software artifacts/deployment IDs and non-secret configuration mapping. Preserve operation/history/lock metadata, not only visible totals. Store secrets securely outside Git; back up credentials/config only through an approved secure process.
4. Verify the backup opens and required tabs/rows exist; identify how an authorized restore would be performed to a separate workbook. Record cutover time and who checked it. A backup is a snapshot, not proof that later writes are absent.
5. **GO for approval request:** exact compatible artifacts, configuration/access verified, simulation passed, backups available, V1 fallback and named operators ready. **NO-GO:** unresolved checklist blockers or ambiguous authoritative data. Owner separately authorizes the specific deployment and window; main merge is separate.

## Deployment window — only after specific approval

1. Pause scoring; confirm no unaccounted current-round pending operations. Record old versions and backup timestamp. Apply only the approved production bindings/setup procedure; stop if a test-only schema guard prevents it. Never bypass that guard.
2. Deploy the approved backend/frontend in the reviewed order: any required backend/schema must be ready before releasing its dependent frontend. If compatibility/order is not established, stop rather than expose a mixed pair. Record exact immutable versions and timestamps. Publish the worker with all eight matching assets atomically; retain private audience as approved.
3. Make one targeted check of production binding, intended member access and online offline-preparation on the intended scoring device. Confirm the new worker can activate after tabs close; a cache name alone does not prove worker source. No site-data clearing with pending scores. Do not write real scores as a smoke test or rerun the full matrix. Report outcome; trial still requires separate approval.

## Software rollback is not scoring-data restoration

**Software rollback:** restore the recorded compatible frontend/backend artifacts and routing after owner authorization. Retain current scoring data and audit history. Withhold access to unsafe functionality during a privacy/lock incident. Older software is used against current data only if compatibility is established; otherwise stop V2 and use the separate fallback route. An older frontend/worker cannot be assumed to activate immediately in every open/offline tab; confirm the active route before resuming. Never unregister workers, delete caches/IndexedDB or force-reset devices to achieve rollback.

**Data restoration:** a separate, explicitly approved recovery action. Never overwrite a current workbook with a pre-release snapshot just because software rolled back. Preserve current state read-only, take a fresh backup, restore the older snapshot to a separate workbook, and compare all later accepted operations/revisions and outstanding device saves. Restore/merge only after event/player/hole mapping and authoritative values are reviewed. Maintain permanent locks and an audit trail; do not unlock or rewrite history to make imports succeed. If safe merge tooling/procedure is absent, stop for review instead of inventing one.

**Reconciliation rule:** server acceptance must be confirmed by operation status/history; “zero pending” on one device is not proof all devices are clear. Record each participating scorer's last accepted hole, pending/needs-review count and private export. Resolve late/ambiguous V2 writes before copying equivalent scores to V1. V1 is not assumed to read V2 records, preserve V2 revisions or import recovery JSON.

## Controlled Saturday trial — separate approval required

Start with a named small group and a separately identified trial round. Before tee-off, Peter confirms scorer/support assignments, V1 access on the intended devices, paper/secure ledger availability and which system is authoritative. Prepare V2 app/group online and record the round ID. Keep PINs private.

**One route:** while the trial is healthy, V2 is authoritative for that trial's scores; V1 stays available but receives no parallel scores. Paper can be a dated backup note, not another simultaneous submission route. Other groups' existing arrangements are explicitly recorded; do not combine V1/V2 totals automatically.

**Switch triggers:** confirmed/suspected lost or duplicate scores, cross-group/hidden-hole exposure, ineffective permanent lock, app unavailable after one reopen attempt, or inability to save locally. A brief outage with durable local saves is expected. An online upload remaining unconfirmed after one controlled retry and roughly five minutes calls support; if scoring/reconciliation cannot proceed reliably, switch. A single safely recovered timeout does not force switching.

**Switch procedure:** support announces “pause V2” and records time, round, last accepted hole and all device pending states/exports. Scorer stops using V2; closed tabs alone do not prevent later automatic retries. Do not reconnect a device with unresolved V2 saves into a switched round without a reconciliation plan. If current acceptance is ambiguous, use paper as the sole temporary authority while support establishes the boundary; do not guess or submit both ways.

Once support confirms the accepted boundary and accounts for pending operations, designate V1 as the sole software route (if usable) and record its separate round ID. Enter only reviewed, mapped scores needed for the agreed complete V1 record; retain provenance and check against the ledger. V1 cannot be assumed to load V2 scores. If mapping/re-entry is unsafe, finish on paper and defer electronic reconciliation. Never overwrite newer data or delete V2 evidence. Changing back to V2 mid-round requires an explicit new decision and reconciliation; no automatic flip-flop.

**After the round:** compare all authoritative scores, pending operations and totals before any final reveal/lock. Report timing, disruptions, recovery and feedback. An already locked round is preserved; discrepancies become an incident for review. Owner decides whether to continue, stop or broaden use—there is no automatic general rollout.

## Residuals and stop rules

Credit Stage 1–5 physical/automated coverage and the accepted Safari /# fix; do not repeat conflict/device/eviction matrices. Document eviction, update/restart needs and near-deadline uploads with recovery. Historical blank/history causes alone do not block release; investigate a recurrence with timestamp, action, IDs and available diagnostics (no secrets). Lost/duplicated accepted scores, privacy leakage, lock bypass, unverified bindings or an unsafe fallback remain genuine blockers. Add a targeted check only for a specific new risk.
