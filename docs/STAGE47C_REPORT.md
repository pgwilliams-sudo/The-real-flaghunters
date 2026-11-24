# Stage 47C production interface and results

**Release approval pending.** The implementation commit on `development/v2` is [`1930d24fd45cbedd59da53a7ae00157ad54860d1`](https://github.com/pgwilliams-sudo/The-real-flaghunters/commit/1930d24fd45cbedd59da53a7ae00157ad54860d1). The live Site remains owner-only on version 1, and the live Apps Script remains on deployment version 1 with `V2_ENABLED=false`. V1, the live workbook and the existing synthetic deployment were left in place.

## Golfer interface

- **Play** opens group selection. The app prepares its files automatically and stores the group's data when the group opens. It signals offline readiness after checking the app files, the group data and valid local scoring access. A dated **Resume Group** action reopens a prepared card from Home.
- **Results** opens the round in play or the latest published result. The chosen date stays selected across the compact leaderboard, scorecards and competitions. A player's scorecard shows recorded Gross, Net and Stableford per hole, plus total Net, BLOBs, gross birdies and gross eagles. Historical competitions display the available records and preserve missing outcomes as missing.
- **Season** defaults to the current calendar year in Europe/London and offers earlier years with eligible rounds. It shows ranked POTY points, sortable player statistics and Gross and Net Eclectics by course, tee and physical nine. Incomplete Eclectic cards are unranked and show which holes are missing. A player without a complete card has no appearance or average for that season.
- **Admin** stays secondary. Setup, competition writes, clubhouse reveal and permanent locking keep the existing Admin authentication. PIN-free scoring and the configurable Group PIN fallback remain available.
- **Score Recovery** holds sync retry, score comparison, export, reload and prepared-group removal. **All scores synced**, **Saved on this device · X to sync** and **Scores need attention** appear beside play. The app still synchronizes automatically on reconnect or reopen and refuses to remove unaccepted saves.

The completed and revealed rounds in the live Events sheet are the official results. Season statistics and POTY use complete 18-hole player cards. POTY uses 5–4–3–2–1, at least six completed cards, and Stableford countback over the last 9, 6, 3 and 1 physical holes. Eclectics use recorded per-hole minima within each course and tee. BLOBs and pickups are ineligible for Eclectics, including legacy numeric BLOBs. The calculation preserves recorded Gross and Net and uses no current handicap to revise history.

## Interface screenshots

These iPad-sized Chromium screenshots use synthetic players on a local copy of the packaged app.

[Home](stage47c/home.png) · [Past round](stage47c/past-round.png) · [Scorecard](stage47c/scorecard.png) · [Net Eclectic](stage47c/net-eclectic.png) · [Offline scoring](stage47c/offline-scoring.png)

## Verification

| Check | Result |
| --- | --- |
| `npm test` | 129 passed. Includes calendar-year boundaries, POTY qualification and ties, Eclectic tees and BLOB exclusions, incomplete cards, read-only results, hidden holes and historical write protection. |
| `npm run test:stage47c -- <bundle>/dist` | Passed at iPad and phone widths in Chromium using the exact bound static bundle and an intercepted synthetic API. Covered historical navigation, correct competition round, recorded Net, season filters and sorting, Eclectics, automatic offline preparation, offline reopening and replay. |
| `npm run test:mobile` | Passed at 320, 360, 390 and 820 px in Chromium. Covered mobile scoring and result layout, history and corrections, Group PIN access, Admin reveal and final scorecards. |
| `npm run test:stage7` | Passed. Covered PIN-free scoring, dormant Group PIN controls, repeated setup/save guards, reconnect, corrections, Admin-only reveal access and historical lock. |
| `npm run test:local-drafts` and `npm run test:app-offline` | Passed in Chromium. Covered retry and lost responses, conflict recovery and export, unaccepted-score removal guard, locked-round rejection, service-worker update, offline reload and draft retention. |
| Release packaging | Passed syntax and manifest checks. The backend package refuses missing or different workbook bindings before opening a sheet and excludes the test initializer. The frontend ignores a stored alternate API URL. |

**Remaining validation.** The WebKit binary download was blocked by HTTP 403. Physical iPad Safari acceptance is still required for this package. Results and Season require a connection. The worker caches the app files while prepared scoring data and unaccepted scores stay in the device's local storage.

## Historical reconciliation

Read-only requests to the existing dedicated V2 live API confirmed **11 active players**, **three completed historical rounds**, **342 unique hole scores**, **19 appearances**, **598 Stableford points**, **30 POTY points**, **37 BLOBs**, **16 gross birdies** and **two gross eagles**. An independent calculation from the hole scores matched the season figures for each of the nine players with complete cards. The latest imported round is still locked.

| Round | Appearances | Hole scores | Stableford |
| --- | ---: | ---: | ---: |
| 31 October 2026 | 8 | 144 | 250 |
| 14 November 2026 | 7 | 126 | 241 |
| 21 November 2026 | 4 | 72 | 107 |

The 31 October record still contains a Nearest the Pin result on hole 6 and four saved Blind Pairs, with the 2/3/4 game enabled. The 14 and 21 November records have those competitions disabled. The 21 November round contributes to season statistics and Eclectics and falls below the POTY threshold.

## Owner actions after release approval

1. **Approve the exact implementation commit above for an owner-only update.** Confirm the existing live Apps Script and live Site are the intended targets. Record Apps Script deployment version 1 and Site version 1 (`appgver_33fec33a81b481918d7ce556e51fd097`) as the rollback points. The new public read routes make the already approved scoring and competition data easier to browse by calendar year, course, tee and round.
2. **Build the two packages from the implementation commit.** Set `APPROVED_V2_LIVE_API_URL` and `APPROVED_V2_LIVE_WORKBOOK_ID` from the private release record. Use an empty local folder. The builder checks the exact destinations and produces `backend/`, `dist/` and `.openai/hosting.json` without contacting either service.

   ```sh
   node scripts/package-stage47c-live.cjs /path/to/empty-release \
     "$APPROVED_V2_LIVE_API_URL" "$APPROVED_V2_LIVE_WORKBOOK_ID"
   ```

3. **Update the dedicated Apps Script first.** In **Flag Hunters V2 - Live API**, replace `Code.gs` and `Phase1.gs` with the packaged files. Verify the existing `V2_SPREADSHEET_ID` matches the approved V2 live workbook, `V2_ENABLED=false`, `V2_TEST_ONLY=false`, `V2_SCORING_ACCESS_MODE=pin-free`, `V2_SCORING_ACCESS_REVISION=1`, and the existing dedicated `V2_ADMIN_SECRET` is retained. Keep Europe/London and the existing access configuration. There are no schema changes or initializer steps. Use **Deploy → Manage deployments → Edit → New version** on the existing web app so its `/exec` URL stays fixed. Record the resulting deployment version.
4. **Verify the backend before publishing the frontend.** Confirm `status` reports `2-stage47c`, `V2 live backend`, PIN-free and revision 1. Verify `rounds`, `season&year=2026`, `eclectics&year=2026` and a historical `scorecard` on the same `/exec` URL using the corresponding `action` query parameter. Recheck the table totals above, recorded Net and 31 October competition results. Confirm admin login and scoring remain disabled. Stop and keep Site version 1 if any result differs.
5. **Update the existing live Site owner-only.** Use the archive containing `.openai/hosting.json` and `dist/` from the same build. Confirm it points to the existing live Site, pins the dedicated live API, and has worker version `v2-live-stage47c-v2`. Save and publish as a private Sites version. Keep the access list owner-only and record the deployed version and archive checksum.
6. **Validate on the owner's iPad.** Open the live Site online, confirm Results, a historical scorecard, competition results and Season, then verify the new cached app opens offline. An iPad still showing version 1 can check for an offline app update and close all app tabs before reopening. Keep browser data intact. Use a disposable synthetic fixture for the scoring and reconnect acceptance while live writes remain disabled. Approve public Site access and live scoring separately after acceptance.

If an update fails, keep writes disabled. Restore owner-only Site version 1 if the new frontend was published, then point the same live Apps Script web app back to deployment version 1 if the API update needs rollback. Recheck the historical results and owner-only access. Keep the workbook and every device's pending scores intact.
