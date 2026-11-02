/** The Real Flag Hunters | Apps Script backend v3.3
 * Groups sheet columns A:H:
 * event_id, group_no, player_id, playing_handicap,
 * scorer, start_hole, handicap_index, handicap_confirmed.
 */

const SPREADSHEET_ID = 'REPLACE_WITH_SPREADSHEET_ID';

const ADMIN_PIN = 'REPLACE_WITH_ADMIN_PIN';

function legacyDoGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = p.action || 'status';


    if (action === 'status')
      return jsonResponse({
        ok: true,
        app: 'The Real Flag Hunters',
        version: '3.3',
        message: 'API connected'
      });

    if (action === 'season')
      return jsonResponse({
        ok: true,
        season: getSeasonStats()
      });

    if (action === 'players')
      return jsonResponse({
        ok: true,
        players: getPlayers()
      });

    if (action === 'course')
      return jsonResponse({
        ok: true,
        course: getCourse()
      });

    if (action === 'currentEvent')
      return jsonResponse({
        ok: true,
        event: getCurrentEvent()
      });

    if (action === 'groups')
      return jsonResponse({
        ok: true,
        groups: getGroups(p.eventId || '')
      });

    if (action === 'scores')
      return jsonResponse({
        ok: true,
        scores: getScores(p.eventId || '')
      });

    if (action === 'leaderboard')
      return jsonResponse({
        ok: true,
        leaderboard: getLeaderboard(p.eventId || '')
      });


      if (action === 'competitions') {
  return jsonResponse({
    ok: true,
    ...getCompetitionData(e.parameter.eventId || '')
  });
}

    throw new Error('Unknown action');
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err.message
    });
  }
}

function legacyDoPost(e) {
  try {
    const data = JSON.parse(
      (e && e.postData && e.postData.contents) || '{}'
    );

    const action = data.action || '';

    if (action === 'adminLogin')
      return jsonResponse({
        ok: String(data.pin) === String(ADMIN_PIN)
      });

    if (action === 'createEvent') {
      requireAdmin(data.pin);
      return jsonResponse(createEvent(data));
    }

    if (action === 'saveGroups') {
      requireAdmin(data.pin);
      return jsonResponse(saveGroups(data));
    }

    if (action === 'confirmGroupHandicaps')
      return jsonResponse(confirmGroupHandicaps(data));

    if (action === 'saveHoleScores')
      return jsonResponse(saveHoleScores(data));

    if (action === 'saveScore')
      return jsonResponse(saveScore(data));

    if (action === 'completeGroup')
      return jsonResponse(completeGroup(data));

if (action === 'saveCompetitionSetup') {
  requireAdmin(data.pin);
  return jsonResponse(saveCompetitionSetup(data));
}

if (action === 'drawBlindPairs') {
  requireAdmin(data.pin);
  return jsonResponse(drawBlindPairs(data));
}

if (action === 'updatePinLeader') {
  return jsonResponse(updatePinLeader(data));
}

if (action === 'correctPinWinner') {
  requireAdmin(data.pin);
  return jsonResponse(correctPinWinner(data));
}

    throw new Error('Unknown action');
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err.message
    });
  }
}

function requireAdmin(pin) {
  if (String(pin) !== String(ADMIN_PIN))
    throw new Error('Admin PIN incorrect');
}

function getSpreadsheet() {
  const id = PropertiesService.getScriptProperties().getProperty('V2_SPREADSHEET_ID') || SPREADSHEET_ID;
  if (id === 'REPLACE_WITH_SPREADSHEET_ID') throw new Error('Configure a separate test spreadsheet first');
  return SpreadsheetApp.openById(id);
}

function sheetNamed(name) {
  const sheet = getSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet: ' + name);
  return sheet;
}

function getPlayers() {
  return getRowsAsObjects(sheetNamed('Players'))
    .filter(r =>
      String(r.active).toUpperCase() !== 'FALSE'
    );
}

function getCourse() {
  return getRowsAsObjects(sheetNamed('Course'));
}

function getCourseHole(courseName, tee, hole) {
  return getCourse().find(r =>
    String(r.course) === String(courseName) &&
    String(r.tee) === String(tee) &&
    Number(r.hole) === Number(hole)
  ) || null;
}

function legacyGetCurrentEvent() {
  const rows = getRowsAsObjects(sheetNamed('Events'));
  if (!rows.length) return null;

  const active = rows.filter(r =>
    String(r.status).toLowerCase() === 'active'
  );

  return active.length
    ? active[active.length - 1]
    : rows[rows.length - 1];
}

function getEventById(id) {
  return getRowsAsObjects(sheetNamed('Events'))
    .find(r => String(r.event_id) === String(id)) || null;
}

function requireActiveEvent(id) {
  const event = getEventById(id);

  if (!event)
    throw new Error('Event not found');

  if (String(event.status).toLowerCase() !== 'active')
    throw new Error('This round is no longer active');

  return event;
}

function createEvent(data) {
  const tee = String(data.tee || 'White');

  if (!['White', 'Yellow'].includes(tee))
    throw new Error('Invalid tee');

  const tz = Session.getScriptTimeZone();

  const eventId =
    'event-' +
    Utilities.formatDate(
      new Date(), tz, 'yyyyMMdd-HHmmss'
    ) + '-' + Utilities.getUuid().slice(0,8);

  const date =
    data.date ||
    Utilities.formatDate(
      new Date(), tz, 'yyyy-MM-dd'
    );

  sheetNamed('Events').appendRow([
    eventId,
    date,
    'Brickendon Grange',
    tee,
    'active',
    false
  ]);

  return {
    ok: true,
    event_id: eventId
  };
}

function legacyGetGroups(eventId) {
  if (!eventId) return [];

  const rows = getRowsAsObjects(sheetNamed('Groups'))
    .filter(r =>
      String(r.event_id) === String(eventId)
    );

  const playerMap = {};

  getRowsAsObjects(sheetNamed('Players'))
    .forEach(p => {
      playerMap[String(p.player_id)] = p;
    });

  return rows.map(r => {
    const player =
      playerMap[String(r.player_id)] || {};

    const rawIndex = r.handicap_index;

    const index =
      rawIndex === '' ||
      rawIndex === null ||
      rawIndex === undefined
        ? null
        : Number(rawIndex);

    return {
      event_id: r.event_id,
      group_no: Number(r.group_no),
      player_id: r.player_id,
      player_name: player.name || r.player_id,
      playing_handicap:
        Number(r.playing_handicap) || 0,
      scorer: isTrue(r.scorer),
      start_hole: Number(r.start_hole) || 1,
      handicap_index:
        Number.isFinite(index) ? index : null,
      handicap_confirmed:
        isTrue(r.handicap_confirmed)
    };
  });
}

function normaliseStartHole(value) {
  const hole = Number(value || 1);

  if (![1, 7, 13].includes(hole))
    throw new Error(
      'Start hole must be 1, 7 or 13'
    );

  return hole;
}

function validateGroups(groups) {
  if (!Array.isArray(groups) || !groups.length)
    throw new Error('No players selected');

  const seen = new Set();
  const grouped = {};

  groups.forEach(r => {
    const id = String(r.player_id || '');
    const no = Number(r.group_no);

    if (!id)
      throw new Error('Missing player');

    if (seen.has(id))
      throw new Error('A player appears twice');

    seen.add(id);

    if (!Number.isInteger(no) || no < 1)
      throw new Error('Invalid group number');

    normaliseStartHole(r.start_hole);

  if (!grouped[no]) {
  grouped[no] = [];
}

grouped[no].push(r);
  });

  Object.keys(grouped).forEach(no => {
    const members = grouped[no];

    if (members.length > 4)
      throw new Error(
        'Group ' + no + ' has more than four players'
      );

    if (
      members.filter(r => isTrue(r.scorer)).length !== 1
    )
      throw new Error(
        'Group ' + no + ' needs exactly one scorer'
      );

    if (
      new Set(
        members.map(r =>
          normaliseStartHole(r.start_hole)
        )
      ).size !== 1
    )
      throw new Error(
        'Group ' + no + ' has conflicting start holes'
      );
  });
}

function validateHandicapIndex(value) {
  // Plus 2.4 is represented as -2.4.

  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < -9.9 ||
    value > 54 ||
    Math.abs(
      value * 10 - Math.round(value * 10)
    ) > 1e-7
  )
    throw new Error(
      'Handicap Index must be between +9.9 and 54.0, in 0.1 increments'
    );

  return value;
}

function legacyGetTeeData(event) {
  const holes = getCourse().filter(r =>
    String(r.course) === String(event.course) &&
    String(r.tee) === String(event.tee)
  );

  if (
    holes.length !== 18 ||
    new Set(
      holes.map(r => Number(r.hole))
    ).size !== 18
  )
    throw new Error(
      'Complete 18-hole course data required'
    );

  const slope = Number(holes[0].slope);
  const rating = Number(holes[0].course_rating);

  const par = holes.reduce(
    (sum, r) => sum + Number(r.par),
    0
  );

  if (
    !Number.isFinite(slope) ||
    slope <= 0 ||
    !Number.isFinite(rating) ||
    !Number.isFinite(par)
  )
    throw new Error(
      'Invalid slope, rating or par'
    );

  return {
    slope,
    rating,
    par
  };
}

function calculateCourseHandicap(index, teeData) {
  const raw =
    index * teeData.slope / 113 +
    teeData.rating -
    teeData.par;

  return Math.sign(raw) *
    Math.floor(Math.abs(raw) + 0.5);
}

function withScriptLock(fn) {
  const lock = LockService.getScriptLock();

  lock.waitLock(10000);

  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function saveGroups(data) {
  return withScriptLock(() => {
    const eventId = String(data.eventId || '');
    v2Writable(eventId);
    v2RecheckActor(data._v2Actor);
    const groups = data.groups || [];

    if (!eventId)
      throw new Error('Missing event ID');

    const event = requireActiveEvent(eventId);

    validateGroups(groups);

    if (getScores(eventId).length)
      throw new Error(
        'Cannot change groups after scoring has started'
      );

    const teeData = getTeeData(event);

    const rows = groups.map(g => {
      const raw = g.handicap_index;

      const hasIndex =
        raw !== '' &&
        raw !== null &&
        raw !== undefined;

      const index = hasIndex
        ? validateHandicapIndex(Number(raw))
        : null;

      const ch = hasIndex
        ? calculateCourseHandicap(index, teeData)
        : Number(g.playing_handicap) || 0;

      return [
        eventId,
        Number(g.group_no),
        String(g.player_id),
        ch,
        isTrue(g.scorer),
        normaliseStartHole(g.start_hole),
        hasIndex ? index : '',
        false
      ];
    });

    const sheet = sheetNamed('Groups');

    if (sheet.getMaxColumns() < 8)
      sheet.insertColumnsAfter(
        sheet.getMaxColumns(),
        8 - sheet.getMaxColumns()
      );

    sheet.getRange(1, 7, 1, 2).setValues([
      ['handicap_index', 'handicap_confirmed']
    ]);

    const old = sheet.getDataRange().getValues();

    for (let i = old.length - 1; i >= 1; i--) {
      if (String(old[i][0]) === eventId)
        sheet.deleteRow(i + 1);
    }

    sheet.getRange(
      sheet.getLastRow() + 1,
      1,
      rows.length,
      8
    ).setValues(rows);

    v2AfterGroupSave(eventId);
    return {
      ok: true,
      saved: rows.length
    };
  });
}

function confirmGroupHandicaps(data) {
  return withScriptLock(() => {
    const eventId = String(data.eventId || '');
    v2Writable(eventId);
    v2RecheckActor(data._v2Actor);
    const groupNo = Number(data.groupNo);

    if (
      !eventId ||
      !Number.isInteger(groupNo) ||
      groupNo < 1
    )
      throw new Error(
        'Missing event or invalid group'
      );

    const event = requireActiveEvent(eventId);
    const supplied = data.handicaps;

    if (
      !Array.isArray(supplied) ||
      !supplied.length
    )
      throw new Error(
        'No handicaps supplied'
      );

    const sheet = sheetNamed('Groups');

    if (sheet.getLastColumn() < 8)
      throw new Error(
        'Groups sheet requires handicap_index and handicap_confirmed columns'
      );

    const values = sheet.getDataRange().getValues();
    const members = [];

    for (let i = 1; i < values.length; i++) {
      if (
        String(values[i][0]) === eventId &&
        Number(values[i][1]) === groupNo
      )
        members.push({
          sheetRow: i + 1,
          playerId: String(values[i][2])
        });
    }

    if (!members.length)
      throw new Error('Group not found');

    if (
      getScores(eventId).some(s =>
        members.some(m =>
          m.playerId === String(s.player_id)
        )
      )
    )
      throw new Error(
        'Cannot change handicaps after scoring has started'
      );

    if (supplied.length !== members.length)
      throw new Error(
        'Handicaps must be supplied for every group member'
      );

    const map = new Map();

    supplied.forEach(h => {
      const id = String(h.player_id || '');

      if (!id || map.has(id))
        throw new Error(
          'Duplicate or missing player in handicap confirmation'
        );

      map.set(
        id,
        validateHandicapIndex(h.handicap_index)
      );
    });

    const teeData = getTeeData(event);

    const updates = members.map(m => {
      if (!map.has(m.playerId))
        throw new Error(
          'Handicap missing for ' + m.playerId
        );

      const index = map.get(m.playerId);

      return {
        sheetRow: m.sheetRow,
        index,
        ch: calculateCourseHandicap(
          index,
          teeData
        )
      };
    });

    updates.forEach(u => {
      sheet.getRange(
        u.sheetRow,
        4
      ).setValue(u.ch);

      sheet.getRange(
        u.sheetRow,
        7,
        1,
        2
      ).setValues([
        [u.index, true]
      ]);
    });

    SpreadsheetApp.flush();

    return {
      ok: true,
      groups: getGroups(eventId)
    };
  });
}

function legacyGetScores(eventId) {
  if (!eventId) return [];

  return getRowsAsObjects(sheetNamed('Scores'))
    .filter(r =>
      String(r.event_id) === String(eventId)
    );
}

function requireConfirmedHandicaps(
  eventId,
  playerIds
) {
  const players = getGroups(eventId);

  playerIds.forEach(id => {
    const player = players.find(p =>
      String(p.player_id) === String(id)
    );

    if (!player)
      throw new Error(
        'Player is not in this round'
      );

    // Existing scored rounds remain editable.
    if (
      !player.handicap_confirmed &&
      !getScores(eventId).some(s =>
        String(s.player_id) === String(id)
      )
    )
      throw new Error(
        'Confirm the group handicaps before scoring'
      );
  });

  return players;
}

function validateGrossScore(hole, gross) {
  if (
    !Number.isInteger(hole) ||
    hole < 1 ||
    hole > 18
  )
    throw new Error('Invalid hole');

  if (
    !Number.isInteger(gross) ||
    gross < 1 ||
    gross > 20
  )
    throw new Error('Invalid gross score');
}

function getHoleStrokes(
  playingHandicap,
  strokeIndex
) {
  const h = Number(playingHandicap);
  const si = Number(strokeIndex);

  if (
    !Number.isInteger(h) ||
    !Number.isInteger(si) ||
    si < 1 ||
    si > 18
  )
    throw new Error(
      'Invalid handicap or stroke index'
    );

  return Math.floor(
    (h + 18 - si) / 18
  );
}

function calculateScore(
  player,
  courseHole,
  gross
) {
  const strokes = getHoleStrokes(
    player.playing_handicap,
    Number(courseHole.stroke_index)
  );

  const net = gross - strokes;

  const stableford = Math.max(
    0,
    2 + Number(courseHole.par) - net
  );

  return {
    net,
    stableford,
    strokes_received: strokes,
    blob: stableford === 0,
    birdie:
      gross === Number(courseHole.par) - 1,
    eagle:
      gross <= Number(courseHole.par) - 2
  };
}

function saveScore(data) {
  const result = saveHoleScores({
    eventId: data.eventId,
    hole: data.hole,
    scores: [{
      playerId: data.playerId,
      gross: data.gross
    }]
  });

  return {
    ok: true,
    ...result.scores[0]
  };
}

function saveHoleScores(data) {
  return withScriptLock(() => {
    const eventId = String(data.eventId || '');
    v2Writable(eventId);
    v2RecheckActor(data._v2Actor);
    const hole = Number(data.hole);
    const incoming = data.scores;

    if (!eventId)
      throw new Error('Missing event ID');

    if (
      !Number.isInteger(hole) ||
      hole < 1 ||
      hole > 18
    )
      throw new Error('Invalid hole');

    if (
      !Array.isArray(incoming) ||
      !incoming.length
    )
      throw new Error('No scores supplied');

const event = requireEditableEvent(eventId);

    const ids = incoming.map(s =>
      String(s.playerId || '')
    );

    if (new Set(ids).size !== ids.length)
      throw new Error(
        'Duplicate player scores'
      );

    const players =
      requireConfirmedHandicaps(eventId, ids);

    const courseHole = getCourseHole(
      event.course,
      event.tee,
      hole
    );

    if (!courseHole)
      throw new Error(
        'Course hole not found'
      );

    const results = incoming.map(item => {
      const id = String(item.playerId || '');
      const gross = Number(item.gross);

      validateGrossScore(hole, gross);

      const player = players.find(p =>
        String(p.player_id) === id
      );

      if (!player)
        throw new Error(
          'Player is not in this round'
        );

      return {
        event_id: eventId,
        player_id: id,
        hole,
        gross,
        ...calculateScore(
          player,
          courseHole,
          gross
        )
      };
    });

    const sheet = sheetNamed('Scores');
    const existing =
      sheet.getDataRange().getValues();

    const newRows = [];

    results.forEach(r => {
      const row = [
        r.event_id,
        r.player_id,
        r.hole,
        r.gross,
        r.net,
        r.stableford,
        r.blob,
        r.birdie,
        r.eagle,
        new Date()
      ];

      let found = -1;

      for (
        let i = 1;
        i < existing.length;
        i++
      ) {
        if (
          String(existing[i][0]) === eventId &&
          String(existing[i][1]) === r.player_id &&
          Number(existing[i][2]) === hole
        ) {
          found = i + 1;
          break;
        }
      }

      if (found > 0)
        sheet.getRange(
          found,
          1,
          1,
          10
        ).setValues([row]);
      else
        newRows.push(row);
    });

    if (newRows.length)
      sheet.getRange(
        sheet.getLastRow() + 1,
        1,
        newRows.length,
        10
      ).setValues(newRows);

    return {
      ok: true,
      scores: results
    };
  });
}


function completeGroup(data) {
  return withScriptLock(function () {
    const eventId = String(data.eventId || '');
    v2Writable(eventId);
    v2RecheckActor(data._v2Actor);
    const groupNo = Number(data.groupNo);

    requireEditableEvent(eventId);

    const members = getGroups(eventId)
      .filter(p =>
        Number(p.group_no) === groupNo
      );

    if (!members.length) {
      throw new Error('Group not found');
    }

    const scores = getScores(eventId);

    const complete = members.every(p => {
      const holes = new Set(
        scores
          .filter(s =>
            String(s.player_id) ===
            String(p.player_id)
          )
          .map(s => Number(s.hole))
      );

      return holes.size === 18;
    });

    if (!complete) {
      throw new Error(
        'All players must have 18 saved holes'
      );
    }


const competition = getCompetitionData(eventId);
const config = competition.config || {};

if (config.nearest_enabled) {
  const acknowledgements =
    competition.pin_acknowledgements || {};

  const missing = (
    config.nearest_holes || []
  ).filter(hole => {
    const decisions =
      acknowledgements[hole] || {};

    return !Object.prototype.hasOwnProperty.call(
      decisions,
      String(groupNo)
    );
  });

  if (missing.length) {
    throw new Error(
      'Record your Nearest the Pin decision ' +
      'before finishing. Missing holes: ' +
      missing.join(', ')
    );
  }
}


    const sheet = groupStatusSheet();
    const existing = getGroupStatus(eventId);

    if (!existing.some(r =>
      r.group_no === groupNo
    )) {
      sheet.appendRow([
        eventId,
        groupNo,
        new Date()
      ]);
    }

    const eventComplete =
      checkEventCompletion(eventId);

    const leaderboard = getLeaderboard(eventId);

    return {
      ok: true,
      group_complete: true,
      event_complete: eventComplete,
      group_results: leaderboard.filter(p =>
        members.some(m =>
          String(m.player_id) ===
          String(p.player_id)
        )
      )
    };
  });
}


function checkEventCompletion(eventId) {
  if (!allGroupsFinished(eventId)) {
    return false;
  }

  const groups = getGroups(eventId);
  const scores = getScores(eventId);

  const allScored = groups.every(p => {
    const holes = new Set(
      scores
        .filter(s =>
          String(s.player_id) ===
          String(p.player_id)
        )
        .map(s => Number(s.hole))
    );

    return holes.size === 18;
  });

  if (!allScored) return false;

  const sheet = sheetNamed('Events');
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(eventId)) {
      sheet.getRange(i + 1, 5, 1, 2)
        .setValues([['complete', true]]);
      break;
    }
  }

  return true;
}

function getLeaderboard(eventId) {
  return v2Leaderboard(eventId);
}

function getSeasonStats() {
  const events =
    getRowsAsObjects(sheetNamed('Events'))
      .filter(e =>
        String(e.status).toLowerCase() ===
        'complete' && v2ResultsRevealed(String(e.event_id))
      );

  const groups =
    getRowsAsObjects(sheetNamed('Groups'));

  const scores = events.flatMap(event => getScores(String(event.event_id)));

  const playerMap = {};

  getRowsAsObjects(sheetNamed('Players'))
    .forEach(p => {
      playerMap[String(p.player_id)] =
        p.name;
    });

  const stats = {};

  function ensurePlayer(id) {
    id = String(id);

    if (!stats[id]) {
      stats[id] = {
        player_id: id,
        name: playerMap[id] || id,
        appearances: 0,
        stableford_total: 0,
        stableford_average: 0,
        blobs: 0,
        birdies: 0,
        eagles: 0,
        poty_points: 0
      };
    }

    return stats[id];
  }

  events.forEach(event => {
    const eventId = String(event.event_id);

    const members = groups.filter(g =>
      String(g.event_id) === eventId
    );

    const eventScores = scores.filter(s =>
      String(s.event_id) === eventId
    );

    const roundResults = [];

    members.forEach(g => {
      const id = String(g.player_id);

      const playerScores =
        eventScores.filter(s =>
          String(s.player_id) === id
        );

      if (playerScores.length !== 18)
        return;

      const p = ensurePlayer(id);
      p.appearances++;

      let stableford = 0;
      let blobs = 0;
      let birdies = 0;
      let eagles = 0;

      playerScores.forEach(s => {
        stableford +=
          Number(s.stableford) || 0;

        if (isTrue(s.blob)) blobs++;
        if (isTrue(s.birdie)) birdies++;
        if (isTrue(s.eagle)) eagles++;
      });

      p.stableford_total += stableford;
      p.blobs += blobs;
      p.birdies += birdies;
      p.eagles += eagles;

      roundResults.push({
        player_id: id,
        stableford,
        scores: playerScores
      });
    });

    if (roundResults.length >= 6)
      awardPotyPoints(
        roundResults,
        stats
      );
  });

  return Object.values(stats)
    .map(p => {
      p.stableford_average =
        p.appearances
          ? Number(
              (
                p.stableford_total /
                p.appearances
              ).toFixed(1)
            )
          : 0;

      return p;
    })
    .sort((a, b) =>
      b.poty_points - a.poty_points ||
      b.stableford_average -
        a.stableford_average ||
      String(a.name).localeCompare(
        String(b.name)
      )
    );
}

function awardPotyPoints(
  roundResults,
  stats
) {
  const ranked =
    [...roundResults].sort(
      comparePotyResults
    );

  const pointsByPlace = {
    1: 5,
    2: 4,
    3: 3,
    4: 2,
    5: 1
  };

  let index = 0;

  while (index < ranked.length) {
    const current = ranked[index];
    const tied = [current];

    let next = index + 1;

    while (
      next < ranked.length &&
      comparePotyResults(
        current,
        ranked[next]
      ) === 0
    ) {
      tied.push(ranked[next]);
      next++;
    }

    const points =
      pointsByPlace[index + 1] || 0;

    tied.forEach(r => {
      if (stats[String(r.player_id)]) {
        stats[String(r.player_id)]
          .poty_points += points;
      }
    });

    index = next;
  }
}

function comparePotyResults(a, b) {
  if (b.stableford !== a.stableford)
    return b.stableford - a.stableford;

  for (const holes of [
    [10, 11, 12, 13, 14, 15, 16, 17, 18],
    [13, 14, 15, 16, 17, 18],
    [16, 17, 18],
    [18]
  ]) {
    const delta =
      stablefordForHoles(
        b.scores,
        holes
      ) -
      stablefordForHoles(
        a.scores,
        holes
      );

    if (delta !== 0)
      return delta;
  }

  return 0;
}

function stablefordForHoles(
  scores,
  holes
) {
  return scores
    .filter(s =>
      holes.includes(Number(s.hole))
    )
    .reduce(
      (total, s) =>
        total +
        (Number(s.stableford) || 0),
      0
    );
}

function isTrue(value) {
  return (
    value === true ||
    String(value).toUpperCase() ===
      'TRUE'
  );
}

function getRowsAsObjects(sheet) {
  const values =
    sheet.getDataRange().getValues();

  if (values.length < 2)
    return [];

  const headers = values[0];

  return values
    .slice(1)
    .filter(row =>
      row.some(cell => cell !== '')
    )
    .map(row =>
      rowToObject(headers, row)
    );
}

function rowToObject(headers, row) {
  const obj = {};

  headers.forEach((header, i) => {
    obj[header] = row[i];
  });

  return obj;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(
      JSON.stringify(data)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}


/* =========================================
   SATURDAY COMPETITIONS - v3.4
   Uses a separate Competitions sheet.
   Does not change existing score records.
========================================= */

function competitionSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('Competitions');

  if (!sheet) {
    sheet = ss.insertSheet('Competitions');
    sheet.appendRow([
      'event_id',
      'nearest_enabled',
      'nearest_holes',
      'nearest_pins',
      'blind_pairs'
    ]);
  }

  return sheet;
}

function competitionJson(value, fallback) {
  if (!value) return fallback;

  try {
    return JSON.parse(String(value));
  } catch (err) {
    return fallback;
  }
}


function competitionRecord(eventId) {
  const sheet = getSpreadsheet().getSheetByName('Competitions');
  const values = sheet ? sheet.getDataRange().getValues() : [];

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(eventId)) {
      return {
        row: i + 1,
        enabled: isTrue(values[i][1]),
        holes: competitionJson(values[i][2], []),
        pins: competitionJson(values[i][3], {}),
        pairs: competitionJson(values[i][4], []),
        blindEnabled: isTrue(values[i][5]),
        team234Enabled: isTrue(values[i][6])
      };
    }
  }

  return {
    row: null,
    enabled: false,
    holes: [],
    pins: {},
    pairs: [],
    blindEnabled: false,
    team234Enabled: false
  };
}



function saveCompetitionRecord(eventId, record) {
  const sheet = competitionSheet();
  if (sheet.getMaxColumns() < 7) sheet.insertColumnsAfter(sheet.getMaxColumns(), 7 - sheet.getMaxColumns());
  const extra = sheet.getRange(1,6,1,2).getValues()[0];
  if ((extra[0] && extra[0] !== 'blind_enabled') || (extra[1] && extra[1] !== 'team234_enabled')) throw new Error('Unexpected competition columns');
  sheet.getRange(1,6,1,2).setValues([['blind_enabled','team234_enabled']]);

  const values = [
    eventId,
    record.enabled,
    JSON.stringify(record.holes),
    JSON.stringify(record.pins),
    JSON.stringify(record.pairs),
    record.blindEnabled === true,
    record.team234Enabled === true
  ];

  if (record.row) {
    sheet.getRange(
      record.row, 1, 1, 7
    ).setValues([values]);
  } else {
    sheet.getRange(
      sheet.getLastRow() + 1,
      1, 1, 7
    ).setValues([values]);
  }
}


function getPinAcknowledgements(eventId) {
  const sheet = getSpreadsheet().getSheetByName('PinHistory');
  if (!sheet) return {};
  const rows = getRowsAsObjects(sheet).filter(r =>
    String(r.event_id) === String(eventId)
  );

  const latest = {};

  rows.forEach(r => {
    const hole = Number(r.hole);
    const groupNo = Number(r.group_no);

    if (!latest[hole]) {
      latest[hole] = {};
    }

    latest[hole][groupNo] = {
      action: String(r.action),
      leader: String(r.new_leader || '')
    };
  });

  return latest;
}


function getCompetitionData(eventId) {
  
if (!eventId) {
  return {
    config: {
      nearest_enabled: false,
      nearest_holes: [],
      blind_enabled: false,
      team234_enabled: false
    },
    nearest_pins: {},
    blind_pairs: [],
    group_status: [],
    all_groups_finished: false,
    pin_acknowledgements: {}
  };
}

  const r = competitionRecord(eventId);

  return {
    config: {
      nearest_enabled: r.enabled,
      nearest_holes: r.holes,
      blind_enabled: r.blindEnabled,
      team234_enabled: r.team234Enabled
    },
    nearest_pins: r.pins,
    blind_pairs: r.pairs,
    group_status: getGroupStatus(eventId),
all_groups_finished: allGroupsFinished(eventId),
pin_acknowledgements: getPinAcknowledgements(eventId) 

  };
}

function competitionResponse(eventId) {
  return {
    ok: true,
    competitions: getCompetitionData(eventId)
  };
}

function competitionPar3Holes(event) {
  const meta=v2Meta(event.event_id);
  return (meta ? v2Course(meta) : getCourse())
    .filter(h =>
      String(h.course) === String(event.course) &&
      String(h.tee) === String(event.tee) &&
      Number(h.par) === 3
    )
    .map(h => Number(h.hole));
}

function saveCompetitionSetup(data) {
  return withScriptLock(function () {
    const eventId = String(data.eventId || '');
    v2Writable(eventId);
    v2RecheckActor(data._v2Actor);
    const event = requireActiveEvent(eventId);
if (getScores(eventId).length > 0) {
  throw new Error(
    'Competition setup cannot change after scoring starts.'
  );
}
    const enabled = data.nearest_enabled === true;
    const holes = data.nearest_holes;

    if (!Array.isArray(holes)) {
      throw new Error('Invalid selected holes');
    }

    const valid = competitionPar3Holes(event);
    const selected = holes.map(Number);

    if (
      selected.some(h => !valid.includes(h)) ||
      new Set(selected).size !== selected.length
    ) {
      throw new Error(
        'Select valid par-3 holes only'
      );
    }

    const record = competitionRecord(eventId);
    record.enabled = enabled;
    record.holes = selected.sort((a, b) => a - b);
record.blindEnabled = data.blind_enabled === true;
record.team234Enabled = data.team234_enabled === true;

const groups = getGroups(eventId);

const groupNumbers = [
  ...new Set(groups.map(p => Number(p.group_no)))
];

const playerCount = groups.length;

if (record.blindEnabled &&
    (playerCount < 2 || playerCount % 2 !== 0)) {
  throw new Error(
    'Blind Pairs requires an even number of players.'
  );
}

if (record.team234Enabled &&
    (!groupNumbers.length ||
     groupNumbers.some(no =>
       groups.filter(p =>
         Number(p.group_no) === no
       ).length !== 4
     ))) {
  throw new Error(
    'The 2/3/4 Team Game requires every group ' +
    'to have exactly four players.'
  );
}


    // Discard winners for holes no longer selected.
    const pins = {};
    selected.forEach(h => {
      if (Object.prototype.hasOwnProperty.call(
        record.pins, h
      )) {
        pins[h] = record.pins[h];
      }
    });

    record.pins = pins;
    saveCompetitionRecord(eventId, record);

    return competitionResponse(eventId);
  });
}

function saveNearestPins(data) {
  return withScriptLock(function () {
    const eventId = String(data.eventId || '');
    requireActiveEvent(eventId);

    const record = competitionRecord(eventId);

    if (!record.enabled) {
      throw new Error(
        'Nearest the Pin is not enabled'
      );
    }

    if (!Array.isArray(data.winners)) {
      throw new Error('Invalid winners');
    }

    const playerIds = new Set(
      getGroups(eventId).map(p =>
        String(p.player_id)
      )
    );

    const pins = {};
    const seen = new Set();

    data.winners.forEach(w => {
      const hole = Number(w.hole);
      const playerId = String(w.player_id || '');

      if (
        !record.holes.includes(hole) ||
        seen.has(hole)
      ) {
        throw new Error(
          'Invalid or duplicate pin hole'
        );
      }

      seen.add(hole);

      if (
        playerId &&
        playerId !== 'none' &&
        !playerIds.has(playerId)
      ) {
        throw new Error(
          'Pin winner is not in this round'
        );
      }

      if (playerId) {
        pins[hole] = playerId;
      }
    });

    record.pins = pins;
    saveCompetitionRecord(eventId, record);

    return competitionResponse(eventId);
  });
}

function drawBlindPairs(data) {
  return withScriptLock(function () {
    const eventId = String(data.eventId || '');
    v2Writable(eventId);
    v2RecheckActor(data._v2Actor);
    const event = getEventById(eventId);

    if (!event) {
      throw new Error('Event not found');
    }

    const record = competitionRecord(eventId);
if (!record.blindEnabled) {
  throw new Error(
    'Blind Pairs was not enabled for this round'
  );
}

    // Idempotent: never silently redraw saved pairs.
    if (record.pairs.length) {
      return competitionResponse(eventId);
    }

    const players = getGroups(eventId);
    const ids = players.map(p =>
      String(p.player_id)
    );

    if (
      ids.length < 2 ||
      ids.length % 2 !== 0
    ) {
      throw new Error(
        'Blind Pairs requires an even number of players'
      );
    }

    const scores = getScores(eventId);

    const everyoneFinished = ids.every(id => {
      const holes = new Set(
        scores
          .filter(s =>
            String(s.player_id) === id
          )
          .map(s => Number(s.hole))
      );

      return holes.size === 18 &&
        Array.from({length: 18}, (_, i) => i + 1)
          .every(h => holes.has(h));
    });

    if (!everyoneFinished) {
      throw new Error(
        'All players must finish 18 holes before the draw'
      );
    }
if (!allGroupsFinished(eventId)) {
  throw new Error(
    'Every group must explicitly finish ' +
    'before Blind Pairs can be drawn'
  );
}
    // Fisher-Yates random shuffle.
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(
        Math.random() * (i + 1)
      );

      const temp = ids[i];
      ids[i] = ids[j];
      ids[j] = temp;
    }

    const pairs = [];

    for (let i = 0; i < ids.length; i += 2) {
      pairs.push([ids[i], ids[i + 1]]);
    }

    record.pairs = pairs;
    saveCompetitionRecord(eventId, record);

    return competitionResponse(eventId);
  });
}

/* =========================================
   V3.5 - ROLLING NEAREST THE PIN
========================================= */

function pinHistorySheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('PinHistory');

  if (!sheet) {
    sheet = ss.insertSheet('PinHistory');
    sheet.appendRow([
      'timestamp',
      'event_id',
      'hole',
      'group_no',
      'previous_leader',
      'new_leader',
      'action'
    ]);
  }

  return sheet;
}

function updatePinLeader(data) {
  return withScriptLock(function () {
    const eventId = String(data.eventId || '');
    v2Writable(eventId);
    v2RecheckActor(data._v2Actor);
    const hole = Number(data.hole);
    const groupNo = Number(data.groupNo);
    const playerId = String(data.playerId || '');
    const action = String(data.pinAction || '');

    
const event = requireEditableEvent(eventId);

if (String(event.status).toLowerCase() === 'complete') {
  throw new Error(
    'Nearest the Pin results are locked after ' +
    'the event is completed.'
  );
}


    if (
      !Number.isInteger(hole) ||
      !Number.isInteger(groupNo)
    ) {
      throw new Error('Invalid hole or group');
    }

    const record = competitionRecord(eventId);

    if (
      !record.enabled ||
      !record.holes.includes(hole)
    ) {
      throw new Error(
        'Nearest the Pin is not enabled for this hole'
      );
    }

    const members = getGroups(eventId)
      .filter(p => Number(p.group_no) === groupNo);

    if (!members.length) {
      throw new Error('Group not found');
    }

    if (
      action !== 'keep' &&
      action !== 'challenge'
    ) {
      throw new Error('Invalid pin action');
    }

    if (action === 'challenge') {
      const player = members.find(p =>
        String(p.player_id) === playerId
      );

      if (!player) {
        throw new Error(
          'New leader must belong to this group'
        );
      }
    }

    const previous =
      String(record.pins[hole] || '');


const expectedLeader =
  String(data.expectedLeader || '');

if (previous !== expectedLeader) {
  throw new Error(
    'The pin leader has changed since you opened ' +
    'this hole. Refresh the scoring screen ' +
    'before recording a new leader.'
  );
}


    if (action === 'challenge') {
      record.pins[hole] = playerId;
      saveCompetitionRecord(eventId, record);
    }

    pinHistorySheet().appendRow([
      new Date(),
      eventId,
      hole,
      groupNo,
      previous,
      action === 'challenge'
        ? playerId
        : previous,
      action
    ]);

    return {
      ok: true,
      hole: hole,
      leader: action === 'challenge'
        ? playerId
        : previous,
      competitions: getCompetitionData(eventId)
    };
  });
}


/* v3.5 - Explicit group completion */

function groupStatusSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('GroupStatus');

  if (!sheet) {
    sheet = ss.insertSheet('GroupStatus');
    sheet.appendRow([
      'event_id',
      'group_no',
      'finished_at'
    ]);
  }

  return sheet;
}

function getGroupStatus(eventId) {
  if (!eventId) return [];

  const sheet = getSpreadsheet().getSheetByName('GroupStatus');
  if (!sheet) return [];
  return getRowsAsObjects(sheet)
    .filter(r =>
      String(r.event_id) === String(eventId)
    )
    .map(r => ({
      group_no: Number(r.group_no),
      finished_at: r.finished_at
    }));
}

function requireEditableEvent(eventId) {
  const event = getEventById(eventId);

  if (!event) {
    throw new Error('Event not found');
  }

  const status = String(
    event.status || ''
  ).toLowerCase();

  if (
    status !== 'active' &&
    status !== 'complete'
  ) {
    throw new Error(
      'This round cannot be edited'
    );
  }

  return event;
}

function allGroupsFinished(eventId) {
  const groups = getGroups(eventId);
  const numbers = [
    ...new Set(groups.map(p => Number(p.group_no)))
  ];

  if (!numbers.length) return false;

  const finished = new Set(
    getGroupStatus(eventId)
      .map(r => r.group_no)
  );

  return numbers.every(no => finished.has(no));
}


function correctPinWinner(data) {
  return withScriptLock(function () {
    const eventId = String(data.eventId || '');
    v2Writable(eventId);
    v2RecheckActor(data._v2Actor);
    const hole = Number(data.hole);
    const playerId = String(data.playerId || '');
    const reason = String(data.reason || '').trim();

    // Admin authentication is also checked in doPost.
    requireAdmin(data.pin);

    const event = getEventById(eventId);

    if (!event) {
      throw new Error('Event not found');
    }

    const record = competitionRecord(eventId);

    if (
      !record.enabled ||
      !record.holes.includes(hole)
    ) {
      throw new Error(
        'Invalid Nearest the Pin hole'
      );
    }

    if (!reason) {
      throw new Error(
        'Please enter a reason for the correction'
      );
    }

    if (reason.length > 500) {
      throw new Error(
        'Correction reason is too long'
      );
    }

    const players = getGroups(eventId);

    if (
      playerId &&
      !players.some(p =>
        String(p.player_id) === playerId
      )
    ) {
      throw new Error(
        'Winner must belong to this event'
      );
    }

    const previous = String(
      record.pins[hole] || ''
    );

    if (playerId) {
      record.pins[hole] = playerId;
    } else {
      delete record.pins[hole];
    }

    saveCompetitionRecord(eventId, record);

    pinHistorySheet().appendRow([
      new Date(),
      eventId,
      hole,
      0,
      previous,
      playerId,
      'admin_correction: ' + reason
    ]);

    return {
      ok: true,
      hole: hole,
      previous_leader: previous,
      new_leader: playerId,
      competitions: getCompetitionData(eventId)
    };
  });
}
