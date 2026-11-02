# Phase 3 Stage 1: private-host and physical Safari feasibility

Status: **in progress; physical Safari offline acceptance has not been performed. Stage 2 has not started.**

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
