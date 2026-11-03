# Phase 3 Stage 1: private-host and physical Safari feasibility

Status: **Stage 1 feasibility passed for the scoped diagnostic on the existing private host, based on the owner’s physical iPad/Safari checks completed 2026-11-03. Stage 1 results were subsequently reviewed and Stage 2 authorized; see PHASE3_STAGE2.md for the new implementation status.**

## Confirmed by inspection

- Existing isolated Site: `appgprj_6ae88c84e7388191804ce879ca000a02`, HTTPS origin `https://flaghunters-v2-test-8b76.ablazeseed.chatgpt.site`.
- Sites reports the user as owner, custom access restricted to that owner, no other viewers or groups. No audience change is required or authorized.
- The currently published source is the earlier Phase 2 frontend; the newer compact-table commit on development/v2 has not been deployed. A Stage 1 probe must preserve the currently published app bytes rather than silently bundle that UI change.
- There is no existing app service worker/offline shell in the inspected deployed source. The physical iPad online test does not prove offline launch, Cache Storage persistence or worker registration.
- Sites owns sign-in/access routes. Its documentation supports authenticated private static resources, but does not explicitly guarantee service-worker delivery through the access gateway or physical Safari persistence. Those remain empirical gates.

## Prepared diagnostic (not an offline scoring implementation)

Source: `dev/offline-feasibility/`. Proposed test URL on the **same existing private Site**: `/offline-feasibility/index.html`. Root script `/offline-probe-sw.js` registers only scope `/offline-feasibility/`. It refuses an application-wide scope and intercepts only its own exact HTML/JS paths, never app assets, sign-in routes, query URLs or Apps Script APIs.

Installation fetches its two assets with same-origin credentials and redirect rejection, validates content types, and checks an HTML marker to reject sign-in/fallback pages. Only the diagnostic page/script enter its dedicated Cache Storage namespace. A dedicated IndexedDB database holds one disposable random marker, not credentials, score drafts, queues or course/member records. A successful transaction-complete event is required for its marker write; this is an API feasibility test, not Stage 2 storage implementation.

The mobile page reports secure context/API availability, worker response MIME/CSP/allowed-scope headers (as visible to that request), active worker/controller, cached asset paths, marker ID and timestamp. Reports can be exported without app credentials or data. Its cleanup unregisters only its exact worker/scope and removes only its named cache/dummy database. No new host, Sites project or Google resources are involved.

## Proposed physical iPad/Safari procedure — guide one action at a time

1. After explicit approval to publish the diagnostic to the existing test Site, open its exact HTTPS URL in a normal Safari tab, signed in as the owner. Record iPadOS/Safari version and whether Private Browsing is off.
2. Tap Prepare while online. Registration/install/activation must succeed and the dummy transaction must commit. Reload online once and tap Check: worker control, both cached paths and retained marker must pass.
3. Enable Airplane Mode **and disable Wi-Fi**. Reload this exact URL offline; it must open from the diagnostic cache. Tap Check and compare the marker ID/time.
4. Close that tab and open the exact URL in a new tab while still offline. It must load and retain the marker. Also suspend Safari and return; repeat the read. These are observed-device tests, not guarantees against future OS eviction.
5. Restore connectivity, export the report, and record any auth redirects, unsupported APIs, MIME/CSP failures, worker activation errors, missing data, or page that fails to reopen. Do not begin Stage 2 if a gate fails without reviewing the limitation.
6. Remove the diagnostic worker/data if desired using its narrowly scoped cleanup. Never clear all Safari storage or app caches to remove this probe.

## Limitations to resolve before Stage 2

- HTTPS/private sharing is necessary but does not prove service-worker support. A worker URL redirected to sign-in, served as HTML, or disallowed by the host's CSP/scope policy is a hosting blocker, not a reason to make the Site public or switch providers automatically.
- Private-host authorization is a network boundary. Once explicitly cached on a trusted device, offline content cannot freshly verify server-side owner access. The diagnostic contains no golf data; later offline group storage must follow the approved trusted-device policy and revalidate on reconnect.
- iPad Safari can evict site data; Private Browsing and storage policies may limit persistence. A successful marker test is an observation on this device, not a promise that browser storage is permanent.
- Service workers do not guarantee background synchronization after Safari closes. Later stages must sync in the foreground and distinguish locally durable from server-accepted saves.
- Worker root placement with a narrow test scope checks delivery and registration, but does not install an app-wide worker. The eventual app-shell root-scope/cache-update strategy still needs deliberate implementation/testing after Stage 1 acceptance.
- No real pending-score persistence, replay, instant scoring, queue clearing/export, Finish Group gating or offline admin/reveal behavior is implemented by this diagnostic. Those belong to approved later stages, not this feasibility check.

## Automated checks

`tests/offline-feasibility.test.cjs` validates diagnostic parsing, narrow scope/asset allowlists, rejection of login/fallback content, and no interception of app/sign-in/backend requests. These unit tests cannot validate the actual host CSP, owner authentication path or a physical Safari offline restart. Report those as pending until observed.

## First physical Safari observation and diagnostic v2

On 2026-11-02 the owner opened the protected diagnostic in iPad Safari. The report showed secure context and Service Worker/IndexedDB/Cache APIs available; normal page fetch of the worker returned HTTP 200 with `text/javascript`. No Service-Worker-Allowed or CSP response header was visible on that fetch (absence alone is not a restriction). Preparation timed out, and subsequent checks showed no registered active worker, no controller, no dummy marker and no cached assets. At that point private-page loading worked in the signed-in session; a fresh-session access check had not yet been performed. These observations do not establish whether Safari, host authorization during worker requests, CSP, or installation code caused the failure. Those initial failed attempts were not a pass; the later v3 results below supersede them.

The original diagnostic also lacked a reliable failure trace: it could miss a worker becoming redundant and report only a generic timeout. Diagnostic v2 records registration/updatefound/state changes, worker-side asset status/type and installation errors, page-side asset preflights and CSP events. Worker messages are restricted to diagnostic clients and no cookies, credentials or response bodies enter the report. Scope and cache allowlists are unchanged.

`npm run test:offline-feasibility` uses a LOCAL HTTP protected fixture, not the real Site: Chromium successfully installs, reloads offline, reopens a tab offline with its marker, excludes an app-root control page from the worker, and cleans up only diagnostic storage. A simulated worker-context-only 403 produces an explicit traced install failure. WebKit is run if installed; local Chromium success does not prove actual private Sites/Safari compatibility. At that point physical preparation needed a new attempt before any offline action. V3 corrected the canonical-path issue and was subsequently tested below.

## Canonical-path correction (diagnostic v3)

The owner confirmed Safari's actual page URL is `/offline-feasibility/`: the host canonicalizes the supplied `index.html` URL to that directory. In v2 the failure was before registration, during its first redirect-rejecting page-asset preflight. The original worker fetched the same non-canonical index path, consistent with the earlier empty-cache installation failure. This is a diagnostic path assumption, not evidence that the host forbids workers.

V3 fetches and caches the canonical directory URL while continuing to reject authentication redirects. Its fetch handler accepts only the canonical diagnostic document, the known index alias (served from the same cached document), and the diagnostic JS. It still cannot intercept the golf app or broader paths. The report includes `page_path`. The local fixture now performs an index-to-directory 308 and explicitly demonstrates the old redirect-error rejection before testing successful install, offline reload and tab reopening. Actual private-host Safari preparation/reopening subsequently passed with v3, as recorded below; Stage 2 remains paused for results review.

## Final physical iPad/Safari observations — completed 2026-11-03

The owner performed these actions on the physical iPad and reported their outcomes in chat. No remote device telemetry or exported device report was obtained; the offline conditions and displayed PASS results are user-observed, not inferred from chat connectivity.

| Check | Observed outcome |
| --- | --- |
| Diagnostic v3 Prepare while online | Prepared successfully |
| Online reload followed by Check | PASS: installed/active worker, controlled diagnostic, cached assets and retained dummy marker |
| Airplane Mode on and Wi-Fi off; reload diagnostic | Page loaded; Check passed |
| Still offline; close tab, open a new tab at the canonical URL | Page reopened; Check passed |
| Still offline; leave Safari, lock iPad, unlock and resume Safari | Check passed |
| Restore connectivity; open diagnostic in Safari Private Browsing without signing in | Prompted to sign in with ChatGPT |

The signed-out check establishes an authentication prompt for a fresh Safari context, not a multi-user account authorization audit. Sites access metadata independently confirms the unchanged owner-only policy. The controlled diagnostic and its cached dummy data demonstrate scoped worker/cache/IndexedDB feasibility on this host/device, not a guarantee that all site data survives OS eviction or a proof of durable golf-score storage.

**Finding:** no confirmed private-host blocker remains for this narrow feasibility case after using the canonical route. No provider switch, new environment or public access is needed for Stage 2 planning. Root app-shell scope/update behavior remains a later implementation/test gate. Safari background execution after closure is neither relied on nor promised.

Only diagnostic assets and their dedicated dummy storage were used. The worker remains restricted to `/offline-feasibility/`; golf application assets, scores, credentials, Google resources, production and main are unchanged. The diagnostic can remain for evidence or be removed later using its scoped cleanup; never clear all Safari data to remove it.

**Review gate:** do not start Stage 2 until these findings and limitations have been reviewed and the user gives the go-ahead. Stage 2 will implement real transactional IndexedDB writes/local drafts, immediate advance only after transaction completion, pending-data recovery/export safeguards, and acceptance-state UI. It must not claim server acceptance or enable Finish Group while queued scores lack server acceptance. Durable synchronization/outbox reconciliation, app-wide offline boot, and broader offline acceptance remain separately sequenced stages of the approved architecture.

The user approved beginning Stage 2 after this report. The [Stage 2 report](PHASE3_STAGE2.md) records its separate scope, tests and remaining gates; the diagnostic observations here remain unchanged.

## Reconfirmation on the current test origin — 2026-11-03

The Stage 2 publication of the same owner-private Site returned origin `https://flaghunters-v2-test-8b76.williamsgpeter.chatgpt.site`. The owner repeated diagnostic v3 at that origin's `/offline-feasibility/` route. Prepare succeeded. After online reload, Check reported: “PASS: marker retained, worker controls this diagnostic, both assets cached.” The owner then reported all three guided offline checks passed with Airplane Mode on and Wi-Fi off: reload, close/reopen in a new tab, and lock/resume. These are physical user-observed passes, separately reconfirmed for the current origin. They establish scoped diagnostic feasibility; they do not establish app-wide golf offline boot, background synchronization or immunity to storage eviction.
