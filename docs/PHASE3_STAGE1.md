# Phase 3 Stage 1: private-host and physical Safari feasibility

Status: **in progress; physical Safari preparation has failed; offline acceptance is blocked pending diagnosis. Stage 2 has not started.**

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

On 2026-11-02 the owner opened the protected diagnostic in iPad Safari. The report showed secure context and Service Worker/IndexedDB/Cache APIs available; normal page fetch of the worker returned HTTP 200 with `text/javascript`. No Service-Worker-Allowed or CSP response header was visible on that fetch (absence alone is not a restriction). Preparation timed out, and subsequent checks showed no registered active worker, no controller, no dummy marker and no cached assets. Private-page loading works in the existing signed-in session; a signed-out access-denial test has not yet been performed. These observations do not establish whether Safari, host authorization during worker requests, CSP, or installation code caused the failure. Do not label Stage 1 passed.

The original diagnostic also lacked a reliable failure trace: it could miss a worker becoming redundant and report only a generic timeout. Diagnostic v2 records registration/updatefound/state changes, worker-side asset status/type and installation errors, page-side asset preflights and CSP events. Worker messages are restricted to diagnostic clients and no cookies, credentials or response bodies enter the report. Scope and cache allowlists are unchanged.

`npm run test:offline-feasibility` uses a LOCAL HTTP protected fixture, not the real Site: Chromium successfully installs, reloads offline, reopens a tab offline with its marker, excludes an app-root control page from the worker, and cleans up only diagnostic storage. A simulated worker-context-only 403 produces an explicit traced install failure. WebKit is run if installed; local Chromium success does not prove actual private Sites/Safari compatibility. Physical preparation must be retried using diagnostic v2 before any offline action or Stage 2.

## Canonical-path correction (diagnostic v3)

The owner confirmed Safari's actual page URL is `/offline-feasibility/`: the host canonicalizes the supplied `index.html` URL to that directory. In v2 the failure was before registration, during its first redirect-rejecting page-asset preflight. The original worker fetched the same non-canonical index path, consistent with the earlier empty-cache installation failure. This is a diagnostic path assumption, not evidence that the host forbids workers.

V3 fetches and caches the canonical directory URL while continuing to reject authentication redirects. Its fetch handler accepts only the canonical diagnostic document, the known index alias (served from the same cached document), and the diagnostic JS. It still cannot intercept the golf app or broader paths. The report includes `page_path`. The local fixture now performs an index-to-directory 308 and explicitly demonstrates the old redirect-error rejection before testing successful install, offline reload and tab reopening. Actual private-host Safari preparation/reopening is still pending; Stage 2 remains paused.
