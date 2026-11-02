# V2 Phase 2: physical-nine splits and clubhouse reveal

Development only. This change does not deploy the frontend, Apps Script, or any Google Sheet. Both backend files (`Code.gs` and `Phase1.gs`) must be updated together when a separate test deployment is later authorized. The original Phase 1 guide remains historical; the result-visibility and reveal rules here supersede its references to future reveal work.

## Public results

Before an explicit admin reveal, physical holes **16–18** are excluded on the server from public score responses, leaderboard sums and ordering. Front 9 always means physical holes 1–9. Back 9 means physical holes 10–18, regardless of shotgun starting hole. Before reveal its visible subtotal covers only holes 10–15 and is labeled **Back 9 · partial through hole 15**. The combined figure is labeled **Partial total · holes 1–15**, never an 18-hole total. After reveal, both nines and 18-hole totals are complete when all scores exist.

Each leaderboard row includes Playing Handicap and `front9`, `back9`, and `total` projections. Each projection contains Gross, Stableford, saved-hole count, expected visible-hole count, `partial`, `through_hole`, and `gross_incomplete`. The `partial` flag also stays true for Back 9 and combined totals while holes 16–18 are withheld. Missing holes do not become zero-stroke scores: a subtotal is explicitly partial with its saved-hole count. A pickup makes that nine's Gross and the combined Gross `null` with `gross_incomplete: true`; the UI says **Incomplete (BLOB)**. Stableford continues to sum numeric points, including zero for a pickup. A numeric zero-point score retains its real Gross.

The leaderboard is a compact phone-first table with exactly one row per player and five columns: **Player, Gross, Stb, F9, B9**. Stb is combined visible Stableford; F9/B9 are Stableford for physical holes 1–9/10–18. Before reveal, Stb/Gross stop at 15 and B9 at 15, with an explicit partial notice. `*` marks partial totals/nines; Gross `—` means incomplete due to BLOB. Row ordering and all displayed numbers still come from the server projection. Playing Handicap and full Gross/Stableford splits remain available inside the scorecard.

Player names stay on one line, using ellipsis only when necessary; the full name remains in DOM text and the name tooltip. Numeric columns use tabular digits and do not truncate. Every row is a touch target at least 44px high, with Enter/Space keyboard support. The table fits phone widths without horizontal scrolling. Scorecard and group-result split panels retain their existing layout.

## Privacy boundaries

- Public GET `scores` returns only holes 1–15 until reveal. GET `leaderboard` derives all fields and ranking from that same filtered set.
- Public GET `competitions` hides pin winners/acknowledgements for holes 16–18, saved Blind Pairs, and finish-derived group status until reveal. Team-game clients can only calculate from filtered public scores.
- Public season statistics/POTY omit unrevealed V2 rounds entirely, even if their event status is `complete`. Historical rounds without V2 metadata retain legacy visibility.
- GET uses an explicit route allowlist, so an added legacy read route cannot silently bypass the policy.
- Group completion responses use the public leaderboard projection, so finishing a group cannot expose final totals or ranks.
- Authenticated `roundBootstrap` deliberately supplies a scorer with their own group's full hole records, including 16–18, to enter and correct scores. It does not supply other groups' private scores. Private score history and save responses remain group-scoped. This is a necessary scoring permission, not a public result feed. Admin credentials retain full scoring access.
- Authenticated admin-only `adminCompetitionData` supplies competition configuration/status needed to draw pairs before reveal. It is not a public route. Public competition scores remain filtered even while admin is signed in.

## Final reveal

The admin screen has **Reveal final clubhouse results**, with an explicit confirmation that the action permanently locks the round. POST `revealResults` requires the strong admin credential and the existing script lock. It recovers accepted pending score operations, requires every member to have physical holes 1–18 and every group to have explicitly finished, and requires a saved Blind Pairs draw if enabled. It then writes `revealed_at` and `locked` together in the existing round metadata. No new sheet/schema initializer is needed.

Repeated reveal calls return the same final leaderboard without redrawing pairs or changing scores/history. The existing revision, operation-ID, credential-scope and correction-history rules remain intact. All mutation paths remain blocked by the permanent marker after reveal, for admin and scorers alike. To continue testing after reveal, create a new synthetic round; do not remove the marker from the revealed round.

## Validation

`npm test` runs all backend regressions plus Phase 2 tests for physical splits, shotgun order, partial rounds, pickups versus numeric zero points, hidden-hole response invariance, cross-group access, public competition/season privacy, final reveal, pending-operation recovery and permanent locks.

`npm run test:mobile` runs the real frontend against intercepted synthetic API responses at phone/tablet sizes, including partial split labels, single-line names, no page overflow, and the admin final-reveal interaction. It does not exercise a live Google deployment. WebKit/physical Safari and physical Android verification must be reported separately from Chromium emulation.

## Player scorecards

Tap a player's name or anywhere on their leaderboard row to open a read-only scorecard. Keyboard Enter/Space works too. It shows Playing Handicap, physical-hole Par and Stroke Index from the round's frozen course, Gross and Stableford, plus the same Front 9, Back 9 and combined projections as the leaderboard. An unplayed hole shows a dash; a pickup shows **BLOB**, no Gross, and zero Stableford. Numeric zero-point scores keep their actual Gross.

Public GET `scorecard` requires `eventId` and `playerId`. It returns only the player's display identity/handicap, filtered physical-hole rows, split summaries and visibility flags. Before reveal, rows end at hole 15 and `hidden_holes` lists 16–18 without their Par, Stroke Index, score, completion state, or audit metadata. Totals use the existing server-filtered projection; query flags or credentials attached to GET cannot override hiding. After admin reveal, all 18 rows and complete summaries are available. Unknown/missing player or round IDs fail without returning a scorecard.

The dialog has a sticky **Back to leaderboard** button, a second Close button, and native Escape support. Closing restores keyboard focus to that player's row without navigating away or changing the leaderboard. The compact table fits iPhone/iPad widths; long names stay on one line. The view is read-only and does not change score revisions, credential sessions, history, or reveal locks.

Automated coverage includes frozen course data, physical ordering with shotgun starts, partial/unplayed holes, pickup versus numeric zero points, cross-player isolation, hidden-hole response invariance, rejected override flags, and complete post-reveal scorecards. The mobile suite also opens scorecards by player name/row cell, tests keyboard opening and closing, checks focus restoration, and verifies pre/post-reveal layouts without horizontal overflow.

For a new isolated iPad/Safari test with 12 synthetic players, use the [current setup and generator guide](TEST_GENERATOR.md).

Table layout regressions cover 320px, 360px, 390px and tablet Chromium viewports, exact headers/row counts, long names, numeric overflow, partial markers, BLOB Gross, and row/name taps before and after reveal. WebKit iPhone/iPad scenarios run when that runtime is installed.
