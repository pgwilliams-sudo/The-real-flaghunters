const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./harness.cjs');

function addRound(h, { id, date, tee = 'White', players, scores, status = 'complete' }) {
  h.sheets.get('Events').rows.push([id, date, 'Brickendon Grange', tee, status, status === 'complete']);
  h.sheets.get('Groups').rows.push(...players.map((player, i) => [id, 1, player, i + 1, i === 0, 1, i + 1, true]));
  h.sheets.get('Scores').rows.push(...scores.map(({ player, hole, gross, net, points, blob, birdie, eagle }) =>
    [id, player, hole, gross, net, points, blob || false, birdie || false, eagle || false, 'legacy']));
}

function get(h, action, params = {}) {
  const data = h.ctx.doGet({ parameter: { action, ...params } });
  assert.equal(data.ok, true, data.error);
  return data;
}

function card(player, score) {
  return Array.from({ length: 18 }, (_, i) => ({ player, hole: i + 1, gross: 5, net: 4, points: 2,
    ...score?.(i + 1) }));
}

test('calendar years isolate appearances, flags and POTY; incomplete and unrevealed rounds stay out', () => {
  const h = harness();
  const six = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  addRound(h, { id: 'new-year', date: '2026-01-01', players: six,
    scores: six.flatMap((player, i) => card(player, hole => {
      if (i === 0 && hole === 1 || i === 1 && hole === 18) return { points: 3, birdie: true };
      return i >= 2 && hole === 1 ? { points: 2 - Math.min(i - 1, 2) } : {};
    })) });
  addRound(h, { id: 'year-end', date: '2026-12-31', players: ['p2', 'p3'], scores: [
    ...card('p2', hole => hole === 2 ? { points: 0, blob: true } : hole === 4 ? { points: 4, eagle: true } : {}),
    ...card('p3').slice(0, 17)
  ] });
  addRound(h, { id: 'prior-year', date: '2025-12-31', players: ['p1'], scores: card('p1') });
  addRound(h, { id: 'next-year', date: '2027-01-01', players: ['p6'], scores: card('p6') });
  addRound(h, { id: 'setup-round', date: '2026-12-24', status: 'setup', players: ['p7'], scores: card('p7') });
  h.sheets.get('Events').rows.find(row => row[0] === 'v2-event')[4] = 'complete';
  h.sheets.get('Scores').rows.push(...card('p8').map(s => ['v2-event', s.player, s.hole, s.gross, s.net, s.points]));
  h.clearFault();

  const { year, years, season } = get(h, 'season', { year: '2026' });
  assert.equal(year, '2026');
  assert.deepEqual(years, ['2027', '2026', '2025']);
  assert.equal(get(h, 'season').year, new Date().toISOString().slice(0, 4));
  assert.deepEqual(season.map(p => [p.player_id, p.poty_points]),
    [['p2', 5], ['p1', 4], ['p3', 3], ['p4', 2], ['p5', 2], ['p6', 2]]);
  assert.deepEqual(season.map(p => [p.player_id, p.appearances, p.stableford_total, p.stableford_average]),
    [['p2', 2, 73, 36.5], ['p1', 1, 37, 37], ['p3', 1, 35, 35],
      ['p4', 1, 34, 34], ['p5', 1, 34, 34], ['p6', 1, 34, 34]]);
  assert.deepEqual([season[0].blobs, season[0].birdies, season[0].eagles], [1, 1, 1]);
  assert.deepEqual(get(h, 'season', { year: '2025' }).season.map(p => p.player_id), ['p1']);
  assert.deepEqual(get(h, 'season', { year: '2027' }).season.map(p => p.player_id), ['p6']);
  assert.equal(h.ctx.doGet({ parameter: { action: 'season', year: '2026-01' } }).ok, false);
  assert.equal(h.writes, 0);
});

test('gross and recorded net eclectic minima are separate by year, tee and physical nine', () => {
  const h = harness();
  addRound(h, { id: 'white-one', date: '2026-02-07', players: ['p1', 'p2', 'p3'], scores: [
    ...card('p1', hole => hole === 1 ? { gross: 3, net: 2, blob: true } : { gross: 5, net: 4 }),
    ...card('p2', hole => hole === 1 ? { net: '' } : {}).slice(0, 8)
  ] });
  addRound(h, { id: 'white-two', date: '2026-03-07', players: ['p1'], scores: [
    { player: 'p1', hole: 1, gross: 4, net: 5, points: 1 },
    { player: 'p1', hole: 9, gross: 4, net: 6, points: 1 },
    { player: 'p1', hole: 10, gross: 6, net: 2, points: 3 },
    { player: 'p1', hole: 18, gross: 1, net: 1, points: 0, blob: true }
  ] });
  addRound(h, { id: 'yellow-one', date: '2026-04-04', tee: 'Yellow', players: ['p1'],
    scores: card('p1', () => ({ gross: 3, net: 1 })) });
  addRound(h, { id: 'other-year', date: '2025-12-31', players: ['p1'],
    scores: card('p1', () => ({ gross: 1, net: 0 })) });
  h.clearFault();
  const { eclectics } = get(h, 'eclectics', { year: '2026' });
  assert.deepEqual(eclectics.map(tee => tee.tee), ['White', 'Yellow']);
  const [white, yellow] = eclectics;
  assert.deepEqual(white.gross.front.map(p => [p.player_id, p.total, p.holes_recorded, p.complete]),
    [['p1', 43, 9, true], ['p2', null, 8, false], ['p3', null, 0, false]]);
  assert.deepEqual(white.net.front[0].holes, [5, 4, 4, 4, 4, 4, 4, 4, 4]);
  assert.equal(white.net.front[1].holes[0], null);
  assert.equal(white.net.back[0].total, 34);
  assert.equal(white.gross.back[0].total, 45);
  assert.equal(yellow.gross.front[0].total, 27);
  assert.equal(yellow.net.back[0].total, 9);
  assert.deepEqual(get(h, 'eclectics', { year: '2026' }).eclectics, eclectics);
  assert.equal(h.writes, 0);
});

test('round index defaults to the round in play and uses only safe metadata', () => {
  const h = harness();
  addRound(h, { id: 'newer-completed', date: '2026-10-31', players: [], scores: [] });
  const { rounds, current_event_id } = get(h, 'rounds');
  assert.equal(current_event_id, 'v2-event');
  assert.deepEqual(rounds.map(r => [r.event_id, r.revealed]),
    [['v2-event', false], ['newer-completed', true], ['legacy-event', true]]);
  assert.deepEqual(Object.keys(rounds[0]).sort(), ['course', 'date', 'event_id', 'revealed', 'status', 'tee']);
  const events = h.sheets.get('Events').rows;
  events[1][4] = 'complete';
  events.push(events.splice(1, 1)[0]);
  assert.equal(get(h, 'rounds').current_event_id, 'v2-event', 'completed round awaiting reveal stays selectable');
  assert.equal(get(h, 'rounds').rounds[0].revealed, false);
  addRound(h, { id: 'orphan-setup', date: '2027-01-01', status: 'setup', players: [], scores: [] });
  assert.equal(get(h, 'rounds').current_event_id, 'newer-completed');
  assert.equal(h.writes, 0);
});
