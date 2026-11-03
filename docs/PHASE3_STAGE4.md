# Phase 3 Stage 4: conflict handling and recovery

Implemented on development/v2 after the owner approved Stage 3 physical iPad/Safari results. Not deployed. No merge, production resource changes or Stage 5 work.

## Paused credentials and round boundaries

Automatic startup/reconnect/resume synchronization is restricted to the current backend/round. Older records remain on the device, visible in their own recovery section and included in exports. They are not automatically sent and do not block another round's Finish Group. Every unaccepted operation for the **current** round still blocks completion and reveal, across all groups/credentials.

Credential failures are durable `needs-review` records, not transient transport failures. Automatic triggers cannot repeatedly retry them, even when reconnect/resume requests another retry burst. Legacy Stage 3 credential errors are normalized locally without network traffic. Manual Retry permits one explicit attempt; reauthentication is available from the recovery entry. Invalid matching stored sessions are removed without deleting scores. A newly verified PIN cannot silently submit an old request as its old actor: status reconciliation remains scoped, and a new submission requires explicit review and confirmation with the current credential.

## Conflict decisions and audit

Authenticated `reviewOperation` reconciles the original immutable operation ID first and returns server-accepted scores for just its players/physical hole. The phone UI compares server values/revisions with pending local values (including BLOB), displays original reasons, and defaults every **Use my pending change** checkbox to off.

The scorer chooses **Keep server values** or selects local changes and confirms **Resubmit selected changes**. Unselected players keep their server values. Changed accepted scores require a reason; original reasons remain in the original record and are retained in the new reason when additional text is supplied. There is no automatic rebasing, force overwrite, accepted-history rewrite or credential impersonation. A second device changing a reviewed revision causes another conflict before a new decision can write scores.

Confirmation commits a whitelisted recovery intent to IndexedDB before sending. It has its own stable resolution ID, reviewed revisions, choice, selected replacement body and prior-intent link. It survives closure, quota failures and lost responses. Recovery Retry resumes the same intent. Interrupted/failed decisions remain exportable; confirming a later review retains the earlier intent in local recovery history.

Server `resolveOperation` runs under the existing script lock. It first reconciles the original operation. If already committed, it acknowledges that original result and creates no replacement. Otherwise it validates the reviewed revisions and existing score rules before recording an audited CANCELLED tombstone for the original ID. This prevents a delayed original HTTP request from undoing the decision. A selected replacement uses the existing PREPARED/COMMITTED score journal, unchanged revision checks and immutable correction history. Cancellation records retain their resolution attempts, request hashes, audited actors and results. Replaying a recovery ID with different contents fails.

Original rejected local requests are **not labelled server-accepted**. After an explicit decision is server-confirmed, they become `resolved`, retaining their immutable original payload and the resolution evidence. This removes a resolved conflict from the outstanding queue. A replacement must be server-accepted before resolution completes. Keeping server values creates no invented scores: any missing holes still block completion. Resolved decisions remain reviewable in an expandable archive and exportable until explicit confirmed removal of that synced local scope.

Revealed rounds cannot accept a new recovery mutation. Already accepted operations can still be acknowledged through authenticated reconciliation. All public leaderboard/scorecard/competition routes and their hidden-hole projections are unchanged.

## Lost responses, storage and interrupted recovery

Accepted original requests use authenticated operation-status reconciliation before unchanged replay. Accepted recovery responses can also be reconciled from their stable resolution ID and server journal. A missing response does not generate a new correction ID. Atomic local acknowledgement updates all prepared scopes for the same group and retains pending data if storage fails. Confirming in another tab during an active local upload is refused; stale confirmation of an intent replaced in another tab is refused.

Phone messages distinguish expired access, connection interruption, full/unavailable storage, conflict and permanent lock. Recovery exports contain scores, snapshots, reasons, original requests and resolution evidence; sessions, leases, PINs, bearer tokens and strong admin secrets remain excluded. Users are never told to clear Safari storage to repair an unaccepted request. Manual Retry does not force a conflicting or locked request through without a reviewed decision.

No API can prove that disconnected devices have no unsent scores. The existing operational reveal precautions remain necessary. App-wide offline launch, cache/update strategies and offline public read views remain Stage 5 work, which has not started.

## PIN lock-timeout investigation

The physical Stage 3 observation established one lock-timeout error during PIN issuance, followed by success on explicit retry. There was no captured server trace identifying the specific lock holder, so a unique root cause is **not proven**.

Inspection found avoidable contention: every operation-status read acquired the global script lock and invoked whole-round recovery, even for an immutable committed result. Committed/absent status reads now avoid that lock; PREPARED recovery still reacquires the lock and rechecks the journal before repairing it. Committing a newly validated score recovers that target intent directly after earlier intents have been recovered, rather than rescanning the entire round a second time.

PIN issuance now scans credentials once under lock, revokes only active credentials using their known sheet rows and appends the new PIN hash with its credential in a single write. Authentication and scoring/group/reveal checks remain inside the relevant critical sections. The UI shows an in-progress message, disables duplicate PIN clicks, and explains server-busy failures. These changes reduce avoidable reads/lock acquisitions; actual Google latency and residual contention need physical acceptance. The script lock and its timeout have not been weakened or removed from writes.

## Automated checks and deployment boundary

Run `npm test`, `npm run test:local-drafts` and `npm run test:mobile`. Tests use synthetic in-memory backend fixtures and local browser IndexedDB, with no Google or production requests. New cases cover invalid credentials across repeated automatic triggers, old/current round separation, explicit conflict confirmation, selected changes/BLOBs/reasons, another change after review, deterministic server acceptance followed by lost response, interruption before/after every server recovery write, storage failure during confirmation/acknowledgement, fresh-credential auditing, scope/reveal protections and bounded PIN credential reads.

A future separately approved isolated deployment must use the matching backend `Phase1.gs` with `Code.gs` and **seven** matching frontend assets: `index.html`, `v2-local.js`, `v2-sync.js`, `v2-recovery.js`, `v2.js`, `v2.css`, `app-icon.PNG`. Reuse the existing owner-private Site and isolated synthetic Apps Script project, preserving the diagnostic, access policy, generator and settings. No deployment has been performed for Stage 4. See PHASE3_STAGE4_SAFARI.md for the prepared physical acceptance plan.

## Local validation result

98 unit/backend/generator/diagnostic tests passed, including 19 Stage 4 recovery tests. Eleven Chromium real-IndexedDB phone-browser scenarios passed, including explicit conflict comparison/selected BLOB recovery, deterministic loss of an accepted recovery response with tab reopening, renewed-PIN explicit review and older-round isolation. The existing scoring/table/scorecard/completion/reveal suite passed at four Chromium mobile viewport sizes. `git diff --check` passed. WebKit is unavailable locally; physical Stage 4 Safari acceptance remains pending approval of an isolated test deployment. Passing local tests do not prove real Google lock timing or eliminate browser storage eviction risk.
