# Stage 4 physical iPad/Safari acceptance plan

Prepared only. Obtain explicit approval for the concrete matching Stage 4 backend and frontend deployment before executing this plan. Stage 4 has not been physically validated. Stage 5 is not authorized.

## Environment and evidence

- Reuse Site `appgprj_6ae88c84e7388191804ce879ca000a02`, owner-private, and the isolated **Flag Hunters V2 — iPad Isolated Test** Apps Script project. No production resources, additional Site, hosting/access changes or main merge.
- Use synthetic players only. Keep the existing old-round pending record and its export as an explicit old-round test fixture; never erase it to make the counters green.
- Export the baseline before testing. Preserve prior workbooks/history with the guarded reset/generate workflow if a fresh synthetic round is needed. Use a group PIN session for scoring and sign out of admin before scorer tests.
- Record iPadOS/Safari version, normal browsing, active event/group, observed messages, operation IDs/attempts in the private export and server history counts. Keep secrets private. The iPhone may serve as the independent online second device for conflict/history checks. Android is deferred.
- Guide **one action at a time**, awaiting confirmation. Before each offline segment, provide its complete short instruction block so chat connectivity is not required. Take screenshots before restoring connectivity. Restore connectivity before reopening the golf app: full offline app launch is not a Stage 4 claim.

## A. Old-round isolation and invalid access

1. After approved deployment, reload without clearing site data. Confirm current-round counts are separate from the retained older credential-invalid record.
2. Record the old record's attempts from export. Trigger reconnect, app resume and current-round manual Retry. Export again: the old record must remain intact with no automatic request/attempt growth. It must not block another round's completed group.
3. Prepare a current scorer group, queue one score offline, and rotate that group's test PIN from the independently authenticated admin device while the scorer is offline.
4. Reconnect the scorer. Observe one failed authorization/reconciliation followed by a stable needs-review state. Repeated online/resume events must not cause repeated automatic uploads or an endless syncing indicator.
5. From recovery, choose **Sign in to this group**, enter the current PIN privately and review the old pending request. It must not be silently submitted under the fresh identity. Explicitly confirm a reviewed submission or keep server values. Check actor/reason history and the retained original export.

## B. Two-device score conflict

1. On both devices, load the same group and physical hole with accepted scores; record server values/revisions and history length.
2. On iPad, go offline and save one changed score with a distinct correction reason. On the online iPhone, change the same score to another value with a different reason and obtain server acceptance.
3. Reconnect iPad. Its request must pause as a conflict. Finish Group must remain blocked while the current-round conflict is unresolved. Manual Retry alone must not overwrite the newer score.
4. Open the comparison: verify accepted value/revision versus local pending value and original reason. Check that no overwrite checkbox is preselected. Cancel review once: server state and local intent must remain intact.
5. Choose **Keep server values** and confirm. Verify no extra correction was created, the accepted value is displayed, and the original rejected change is retained in the resolved archive/export.
6. Repeat a conflict. Select only the intended player change, provide the additional reason and confirm. Verify unchanged/unselected players retain server values; exactly one correction is appended. Include a selected BLOB: Gross must remain null.
7. Repeat with another iPhone change after iPad's comparison loads but before confirmation. Confirming the stale comparison must fail safely and require a fresh review.

## C. Response loss, replay and interrupted recovery

The automated tests deterministically execute server commit and then discard its response, including recovery responses. A physical Airplane Mode interruption alone cannot prove this timing.

1. Load a reviewed change online. Save/confirm once and interrupt connectivity immediately. Keep the tab open; capture the pending message and counts. Do not create another operation to retry it.
2. While iPad remains offline, use the independent online iPhone to read the server history. If it shows the new revision while the iPad export still shows its operation unaccepted, record this as accepted-server/unconfirmed-client evidence. If not, label it only as an interrupted upload; do not claim a lost accepted response.
3. Reconnect iPad without Save/Retry. Observe reconciliation, inspect the stable original/resolution IDs, and verify no duplicate history. Then tap manual Retry twice after acceptance; history must remain unchanged.
4. Separately, load a conflict comparison online, disconnect, and explicitly confirm a reviewed decision while offline. Close that tab after the local recovery intent is saved. Restore connectivity, reopen online, and resume. The same confirmed resolution ID must finish; no new decision ID or duplicate history should appear.
5. If acceptance remains ambiguous, retain/export the record and report it. Never edit journal rows or clear browser data to force a pass.

## D. Finish, privacy, storage and locks

1. Save the final hole offline using **Save this hole**. Confirm Finish is disabled while a current-round operation or confirmed recovery is unaccepted. After online server acceptance for all holes, Finish should become available, even with an unrelated older-round record retained.
2. Complete the synthetic group. Public leaderboard/scorecards must still exclude physical holes 16–18 until a separately authorized reveal. Do not reveal as part of this plan without explicit approval for that permanent test-round lock.
3. Check PIN issuance has a visible in-progress state and a disabled button during one request; record latency and any lock timeout. Do not generate multiple concurrent PIN requests as a workaround.
4. Storage quota/transaction failures are deterministically injected in automated tests. Do not fill/clear real Safari storage to provoke them. If encountered naturally, verify no false local save/advance, retained recovery intent, actionable message and safe manual Retry/export.
5. Permanent reveal-lock recovery is covered automatically. A physical locked-round case requires separate explicit reveal approval or an existing marked locked synthetic round; never unlock one.

## Review gate

Report each observed pass/failure separately from automated evidence. Remaining physical items include exact accepted-response-loss timing if not independently established, residual Apps Script latency/lock contention, fresh-session behavior and storage eviction risk. Keep all unresolved records/export copies. Review Stage 4 results before any Stage 5 work; none is implicit in this acceptance plan.
