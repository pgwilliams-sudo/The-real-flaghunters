const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./harness.cjs');

const eventId = 'legacy-event';
const groupNo = 1;

function legacyFixture() {
  const h = harness();
  const event = h.sheets.get('Events').rows.find(row => row[0] === eventId);
  h.sheets.get('Groups').rows.push([eventId, groupNo, 'p1', 1, true, 1, 1, true]);
  return { h, event };
}

function openBeforeCompletion(h, event) {
  event.splice(4, 2, 'active', false);
  delete h.properties.V2_SCORING_ACCESS_MODE;
  const result = h.post({ action: 'openGroup', eventId, groupNo });
  assert.equal(result.ok, true);
  return result.token;
}

test('imported scores, summaries and competition outcomes stay visible without any writes', () => {
  const { h } = legacyFixture();
  // In a workbook with only completed rounds, the latest legacy round is current.
  h.sheets.get('Events').rows.find(row => row[0] === 'v2-event')[4] = 'complete';
  const scoreRows = h.sheets.get('Scores').rows;
  for (let hole = 1; hole < 18; hole++) {
    scoreRows.push([eventId, 'p1', hole, 5, 4, 2, false, false, false, 'legacy timestamp']);
  }
  // Keep the imported zero-point BLOB and its numeric strokes exactly as recorded.
  scoreRows.push([eventId, 'p1', 18, 8, 7, 0, true, false, false, 'legacy timestamp']);
  h.ctx.saveCompetitionRecord(eventId, {
    enabled: true, holes: [3], pins: { 3: 'p1' }, pairs: [],
    blindEnabled: true, team234Enabled: false
  });
  h.ctx.groupStatusSheet().appendRow([eventId, groupNo, 'legacy finish time']);
  h.clearFault();

  const get = (action, params = {}) => h.ctx.doGet({ parameter: { action, eventId, ...params } });
  const current = get('currentEvent').event;
  assert.equal(current.event_id, eventId);
  assert.equal(current.schema_version, 1);
  assert.equal(current.locked, true);

  const scores = get('scores').scores;
  assert.equal(scores.length, 18);
  assert.deepEqual(scores.map(s => [
    s.event_id, s.player_id, s.hole, s.gross, s.net, s.stableford, s.blob,
    s.birdie, s.eagle, s.timestamp
  ]), scoreRows.slice(1));
  const [leader] = get('leaderboard').leaderboard;
  assert.deepEqual([leader.gross, leader.net, leader.stableford, leader.blobs, leader.revealed],
    [93, 75, 34, 1, true]);
  const card = get('scorecard', { playerId: 'p1' }).scorecard;
  assert.equal(card.holes.length, 18);
  assert.equal(card.holes.at(-1).gross, 8);
  assert.deepEqual(get('season').season.map(p => [p.appearances, p.stableford_total, p.blobs]),
    [[1, 34, 1]]);
  const comps = get('competitions');
  assert.deepEqual(comps.nearest_pins, { 3: 'p1' });
  assert.deepEqual(comps.blind_pairs, []);
  assert.deepEqual(comps.group_status, [{ group_no: groupNo, finished_at: 'legacy finish time' }]);
  assert.equal(h.ctx.v2Meta(eventId), null);
  assert.equal(h.sheets.get('ScoreHistory').rows.length, 1);
  assert.equal(h.writes, 0);
});

test('completed legacy rounds reject every scoring and admin write route', () => {
  const { h, event } = legacyFixture();
  const scorer = openBeforeCompletion(h, event);
  event.splice(4, 2, 'COMPLETE', false);
  h.clearFault();

  assert.match(h.post({ action: 'openGroup', eventId, groupNo }).error, /permanently locked/);
  const scorerWrites = ['saveHoleScores', 'saveScore', 'confirmGroupHandicaps',
    'completeGroup', 'updatePinLeader'];
  const adminWrites = [...scorerWrites, 'saveGroups', 'saveCompetitionSetup', 'drawBlindPairs',
    'correctPinWinner', 'issueGroupCredential', 'recoverScores', 'startRound'];
  for (const [credential, actions] of [[scorer, scorerWrites], [h.admin, adminWrites]]) {
    for (const action of actions) {
      assert.match(h.post({ action, credential, eventId, groupNo }).error, /permanently locked/, action);
    }
  }
  assert.match(h.post({ action: 'revealResults', credential: h.admin, eventId }).error, /A V2 round is required/);
  assert.equal(h.post({ action: 'adminCompetitionData', credential: h.admin, eventId }).ok, true);
  const unsent = {
    eventId, groupNo, hole: 1, operationId: 'legacy-unsent-score-01',
    scores: [{ playerId: 'p1', status: 'scored', gross: 5, expectedRevision: 0 }]
  };
  assert.equal(h.post({ action: 'operationStatus', credential: scorer, ...unsent }).state, 'ABSENT');
  assert.match(h.post({ action: 'reviewOperation', credential: h.admin, ...unsent }).error, /permanently locked/);
  assert.match(h.post({
    action: 'resolveOperation', credential: h.admin, original: unsent, choice: 'server',
    resolutionId: 'legacy-absent-resolution-01'
  }).error, /permanently locked/);
  event.splice(4, 2, 'active', true);
  assert.match(h.post({ action: 'openGroup', eventId, groupNo }).error, /permanently locked/);
  assert.equal(h.writes, 0);
});

test('a prepared legacy write stays frozen across status, review and resolution after completion', () => {
  const { h, event } = legacyFixture();
  const scorer = openBeforeCompletion(h, event);
  const original = {
    eventId, groupNo, hole: 1, operationId: 'legacy-pending-score-01',
    scores: [{ playerId: 'p1', status: 'scored', gross: 5, expectedRevision: 0 }]
  };
  h.fault(2, 'before');
  assert.match(h.post({ action: 'saveHoleScores', credential: scorer, ...original }).error, /Injected failure/);
  h.clearFault();
  event.splice(4, 2, 'complete', true);

  for (const credential of [scorer, h.admin]) {
    for (const action of ['operationStatus', 'reviewOperation']) {
      assert.match(h.post({ action, credential, ...original }).error, /permanently locked/, action);
    }
    assert.match(h.post({
      action: 'resolveOperation', credential, original, choice: 'server',
      resolutionId: 'legacy-resolution-01'
    }).error, /permanently locked/);
  }
  assert.equal(h.sheets.get('ScoreOperations').rows[1][1], 'PREPARED');
  assert.equal(h.sheets.get('ScoreHistory').rows.length, 1);
  assert.equal(h.sheets.get('ScoresV2').rows.length, 1);
  assert.equal(h.writes, 0);
});
