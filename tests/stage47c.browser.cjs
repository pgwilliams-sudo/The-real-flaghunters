// Browser acceptance on localhost. Every API call is intercepted and served from a synthetic workbook.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { harness } = require('./harness.cjs');

const bundle = process.argv[2] || '.';
const entry = fs.readFileSync(path.join(bundle, 'index.html'), 'utf8');
const pinned = entry.match(/data-v2-fixed-test-api="([^"]*)"/)[1];
const endpoint = pinned || 'https://script.google.com/macros/s/stage47c-fixture/exec';
const screenshotDirectory = process.env.STAGE47C_SCREENSHOTS;
const assets = ['index.html', 'v2-app-sw.js', 'v2.css', 'v2.js', 'v2-local.js', 'v2-sync.js',
  'v2-recovery.js', 'v2-offline.js', 'app-icon.PNG'];
const contentTypes = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.PNG': 'image/png' };

function fixture() {
  const h = harness();
  h.properties.V2_SCORING_ACCESS_MODE = 'pin-free';
  h.sheets.get('Players').rows.slice(1).forEach((row, i) => {
    row[1] = ['Alex Example', 'Bailey Example', 'Charlie Example', 'Drew Example',
      'Ellis Example', 'Frankie Example', 'Georgie Example', 'Harper Example'][i];
  });
  const year = new Date().getFullYear();
  const events = h.sheets.get('Events').rows;
  const active = events[1];
  active[1] = year + '-11-28';
  events.splice(1, 2,
    ['prior', year - 1 + '-12-31', 'Brickendon Grange', 'White', 'complete', true],
    ['autumn-white', year + '-10-31', 'Brickendon Grange', 'White', 'complete', true],
    ['autumn-yellow', year + '-11-14', 'Brickendon Grange', 'Yellow', 'complete', true], active);
  const course = h.sheets.get('Course').rows;
  course.push(...course.slice(1).map(row => [row[0], 'Yellow', ...row.slice(2)]));
  for (const [id, count] of [['prior', 1], ['autumn-white', 8], ['autumn-yellow', 4]]) {
    for (let i = 0; i < count; i++) {
      const player = 'p' + (i + 1);
      h.sheets.get('Groups').rows.push([id, i < 4 ? 1 : 2, player, i + 3, i % 4 === 0, 1, i + 1, true]);
      for (let hole = 1; hole <= 18; hole++) {
        const gross = hole === 1 && id === 'autumn-white' ? 6 : 4 + (i + hole) % 3;
        const net = hole === 1 && id === 'autumn-white' ? 5 : gross - 1;
        const blob = i === 0 && hole === 10;
        h.sheets.get('Scores').rows.push([id, player, hole, gross, net, blob ? 0 : 2 + (i + hole) % 3,
          blob, gross === 3, false, 'fixture']);
      }
    }
  }
  h.ctx.saveCompetitionRecord('autumn-white', {
    enabled: true, holes: [3], pins: { 3: 'p1' }, pairs: [['p1', 'p4'], ['p2', 'p3'], ['p5', 'p6'], ['p7', 'p8']],
    blindEnabled: true, team234Enabled: true
  });
  const save = h.save({ credential: h.admin, hole: 18,
    scores: [{ playerId: 'p1', status: 'scored', gross: 4, expectedRevision: 0 }] });
  assert.equal(save.ok, true, save.error);
  return { h, year };
}

async function run(browser, label, viewport, capture) {
  const { h, year } = fixture();
  const calls = [], errors = [], unexpected = [];
  const server = http.createServer((req, res) => {
    const name = req.url === '/' ? 'index.html' : req.url.slice(1);
    if (!assets.includes(name)) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': contentTypes[path.extname(name)], 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(path.join(bundle, name)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port + '/';
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, timezoneId: 'Europe/London' });
  await context.addInitScript(url => localStorage.setItem('flaghunters.v2.api', url),
    pinned ? 'https://script.google.com/macros/s/must-not-be-used/exec' : endpoint);
  await context.route('**/*', async route => {
    const request = route.request();
    if (request.url().startsWith(origin)) return route.continue();
    if (!request.url().startsWith(endpoint + '?') && request.url() !== endpoint) {
      unexpected.push(new URL(request.url()).hostname);
      return route.abort();
    }
    const post = request.method() === 'POST';
    const params = post ? JSON.parse(request.postData()) : Object.fromEntries(new URL(request.url()).searchParams);
    calls.push({ method: request.method(), action: params.action, eventId: params.eventId });
    const result = post ? h.post(params) : h.ctx.doGet({ parameter: params });
    await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(result) });
  });
  async function open() {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(12000);
    await page.goto(origin);
    return page;
  }
  async function image(page, name) {
    if (capture && screenshotDirectory) {
      fs.mkdirSync(screenshotDirectory, { recursive: true });
      await page.screenshot({ path: path.join(screenshotDirectory, name + '.png'), fullPage: true, animations: 'disabled' });
    }
  }
  async function noOverflow(page) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  }
  try {
    let page = await open();
    await page.waitForFunction(() => currentEvent?.event_id === 'v2-event');
    assert.equal(await page.locator('#homeScreen .menu-button').count(), 3);
    assert.equal(await page.locator('#v2ScoreRecovery').evaluate(el => el.open), false);
    assert.equal(await page.locator('#v2ScoreReadiness').isVisible(), false);
    if (pinned) {
      assert.equal(await page.evaluate(() => API_URL), endpoint);
      assert.equal(await page.locator('#v2Connect').count(), 0);
    }
    await image(page, 'home');
    await page.getByRole('button', { name: /^Results/ }).click();
    await page.locator('#leaderboardTable').getByText(/holes 16–18 hidden/).waitFor();
    const round = page.getByLabel('Round', { exact: true });
    assert.equal(await round.inputValue(), 'v2-event');
    await round.selectOption('autumn-white');
    await page.locator('#leaderboardTable').getByText(/Final results/).waitFor();
    await noOverflow(page);
    await image(page, 'past-round');
    await page.locator('[data-scorecard-player="p1"]').click();
    const scorecard = page.locator('.v2-scorecard-dialog[open]');
    await scorecard.waitFor();
    assert.equal(await scorecard.locator('tbody tr').count(), 18);
    assert.deepEqual(await scorecard.locator('[data-hole="1"] td').allTextContents(), ['4', '1', '6', '5', '3']);
    assert.ok(await scorecard.getByText('Net total', { exact: true }).isVisible());
    assert.ok(await scorecard.getByText('BLOBs', { exact: true }).isVisible());
    await image(page, 'scorecard');
    await scorecard.getByRole('button', { name: 'Back to leaderboard' }).click();
    await page.getByRole('button', { name: 'Competition results' }).click();
    await page.locator('#competitionContent p').filter({hasText: 'Hole 3'}).filter({hasText: 'Alex Example'}).waitFor();
    for (const text of ['Blind Pairs', '2/3/4 Team Game']) {
      assert.ok(await page.locator('#competitionContent').getByText(text, { exact: false }).first().isVisible());
    }
    assert.equal(calls.filter(call => call.action === 'competitions').at(-1).eventId, 'autumn-white');
    assert.equal(calls.some(call => call.method === 'POST'), false, 'public result browsing must use reads only');
    assert.equal(await page.evaluate(() => currentEvent.event_id), 'v2-event', 'viewing history must not change the scoring round');
    await page.getByRole('button', { name: /Results/ }).click();
    assert.equal(await round.inputValue(), 'autumn-white');
    await round.selectOption('autumn-yellow');
    await page.getByRole('button', { name: 'Competition results' }).click();
    await page.getByText('No competitions for this round.').waitFor();
    await page.getByRole('button', { name: /Results/ }).click();
    await page.getByRole('button', { name: /Home/ }).click();

    await page.getByRole('button', { name: /^Season/ }).click();
    await page.getByRole('heading', { name: 'Player of the Year' }).waitFor();
    assert.equal(await page.getByLabel('Season year').inputValue(), String(year));
    const poty = await page.locator('#v2SeasonPanel tbody tr td:last-child').allTextContents();
    assert.ok(poty.includes('5'));
    await page.getByRole('button', { name: 'Statistics', exact: true }).click();
    await page.getByLabel('Sort by').selectOption('stableford_average');
    assert.ok(await page.locator('[aria-sort="descending"]').isVisible());
    await page.getByLabel('Season year').selectOption(String(year - 1));
    await page.locator('#v2SeasonPanel tbody tr').waitFor();
    assert.equal(await page.locator('#v2SeasonPanel tbody tr').count(), 1);
    await page.getByRole('button', { name: 'POTY' }).click();
    await page.getByText('No POTY points awarded this season.').waitFor();
    await page.getByLabel('Season year').selectOption(String(year));
    await page.getByRole('button', { name: 'Gross Eclectic' }).click();
    await page.getByLabel('Course and tee').waitFor();
    assert.deepEqual(await page.locator('#v2EclecticTee option').allTextContents(),
      ['Brickendon Grange · White', 'Brickendon Grange · Yellow']);
    await page.getByRole('button', { name: 'Net Eclectic' }).click();
    await page.getByRole('button', { name: 'Back nine' }).click();
    await page.getByLabel('Course and tee').selectOption('1');
    await page.getByRole('columnheader', { name: '18', exact: true }).waitFor();
    await page.getByText('8/9 holes', { exact: true }).waitFor();
    await noOverflow(page);
    await image(page, 'net-eclectic');
    await page.getByRole('button', { name: /Home/ }).click();

    await page.getByRole('button', { name: /^Play/ }).click();
    await page.locator('.group-button').first().click();
    await page.getByText('Ready to play offline', { exact: true }).waitFor();
    assert.equal(await page.locator('#v2Code').count(), 0);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.close();
    page = await open();
    await page.getByRole('button', { name: /^Resume Group 1/ }).click();
    await page.locator('#scoreScreen.active').waitFor();
    for (const blob of await page.locator('.v2-pickup').all()) await blob.click();
    await page.evaluate(() => Promise.all([saveAndNext(), saveAndNext()]));
    await page.getByText('Saved on this device · 1 to sync.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(async () => (await V2Local.pending()).length), 1);
    await image(page, 'offline-scoring');
    await context.setOffline(false);
    await page.locator('#v2ScoreStatus').filter({ hasText: 'All scores synced.' }).waitFor();
    assert.equal(h.ctx.v2Rows('ScoreHistory').filter(r => JSON.parse(r.data).after.hole === 1).length, 4);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    console.log('PASS ' + label + ': round navigation, recorded Net, historical competitions, season filtering and sorting, Eclectic views, automatic preparation, offline reopen and replay');
  } finally {
    await context.close();
    await new Promise(resolve => server.close(resolve));
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ||
    (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath()), headless: true, args: ['--no-sandbox'] });
  try {
    await run(browser, 'Chromium iPad size', { width: 820, height: 1180 }, true);
    await run(browser, 'Chromium phone size', { width: 390, height: 844 }, false);
  } finally {
    await browser.close();
  }
  if (fs.existsSync(webkit.executablePath())) {
    const safari = await webkit.launch();
    try {
      await run(safari, 'WebKit iPad size', { width: 820, height: 1180 }, false);
    } finally {
      await safari.close();
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
