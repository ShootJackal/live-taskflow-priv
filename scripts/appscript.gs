/**
 * TaskFlow Google Apps Script v4.3
 *
 * DEPLOYMENT:
 * 1. Open your Google Sheet → Extensions → Apps Script
 * 2. Delete ALL existing code, paste this entire file
 * 3. Deploy → New Deployment → Web app → Anyone access
 * 4. Copy URL → set as EXPO_PUBLIC_GOOGLE_SCRIPT_URL
 *
 * REQUIRED SHEET TAB NAMES (must match your spreadsheet exactly):
 *   Collectors
 *   TASK_LIST
 *   CA_TAGGED (preferred for live upload stats) or CA_PLUS
 *   CA_INDEX
 *   Task Actuals | Redashpull   (or Collector Actuals | RedashPull — script tries both)
 *   Collector Task Assignments Log
 *   RS_Task_Req
 *   _AppCache
 *
 * SHEET MAPPINGS:
 *   Collectors:     A=Name B=Rig-ID C=Email D=WeeklyCap E=Active F=HoursUploaded G=Rating
 *   CA_PLUS:        A=Date B=RigID  C=TaskName D=Hours (extra columns allowed)
 *   CA_TAGGED:      A=Date B=RigID  C=Site  D=Collector E=TaskName F=Hours (preferred)
 *   CA_INDEX:       A=Date B=RigID  C=TaskKey D=Hours
 *   TASK_LIST:      A=TaskName
 *   Task Actuals:   A=TaskID B=TaskName C=CollectedHrs D=GoodHrs E=Status F=RemainingHrs K=LastRedash
 *   RS_Task_Req:    A=TaskName B=RequiredGoodHrs
 *   Assignments:    A=AssignmentID B=TaskID C=TaskName D=Collector E=AssignedDate F=PlannedHrs G=Status H=LoggedHrs I=RemainingHrs J=CompletedDate K=Notes L=WeekStart
 *   _AppCache:      A=key B=jsonValue C=updatedAt
 */

var TASKFLOW_SHEETS = {
  COLLECTORS: 'Collectors',
  TASK_LIST: 'TASK_LIST',
  CA_PLUS: 'CA_PLUS',
  CA_TAGGED: 'CA_TAGGED',
  CA_INDEX: 'CA_INDEX',
  TASK_ACTUALS: 'Task Actuals | Redashpull',
  ASSIGNMENTS: 'Collector Task Assignments Log',
  RS_TASK_REQ: 'RS_Task_Req',
  APP_CACHE: '_AppCache'
};
// Backward-compat alias for projects that still reference SHEETS in old helper snippets.
var SHEETS = TASKFLOW_SHEETS;
var SF_RIG_NUMBERS = { '2': true, '3': true, '4': true, '5': true, '6': true, '9': true, '11': true };
var CACHE_CELL_MAX_CHARS = 49000; // Sheets hard limit is ~50000 chars per cell.
var SUBMIT_DEDUP_WINDOW_MS = 2 * 60 * 1000;
var SUBMIT_REQUEST_TTL_SECONDS = 6 * 60 * 60;
var SUBMIT_FINGERPRINT_TTL_SECONDS = 2 * 60;
var GET_CACHE_TTL_MS = {
  collectors: 5 * 60 * 1000,
  tasks: 5 * 60 * 1000,
  leaderboard: 45 * 1000,
  collectorStats: 60 * 1000,
  todayLog: 20 * 1000,
  recollections: 60 * 1000,
  fullLog: 30 * 1000,
  taskActuals: 60 * 1000,
  adminDashboard: 60 * 1000,
  activeRigsCount: 30 * 1000
};

function assertSheetConfig_() {
  var required = ['COLLECTORS', 'TASK_LIST', 'ASSIGNMENTS', 'RS_TASK_REQ', 'APP_CACHE'];
  for (var i = 0; i < required.length; i++) {
    var key = required[i];
    if (!TASKFLOW_SHEETS[key]) {
      throw new Error('Missing TASKFLOW_SHEETS key: ' + key + '. Check for duplicate globals or stale files in Apps Script.');
    }
  }
}

function getDoGetCachePolicy(action, params) {
  var collector = safeStr(params && params.collector);
  var normCollector = normalizeCollectorKey(collector);
  var period = safeStr(params && params.period);

  switch (action) {
    case 'getCollectors':
      return { key: 'collectors', ttlMs: GET_CACHE_TTL_MS.collectors };
    case 'getTasks':
      return { key: 'tasks', ttlMs: GET_CACHE_TTL_MS.tasks };
    case 'getLeaderboard': {
      var lbKey = (period === 'thisWeek' || period === 'lastWeek') ? ('leaderboard_' + period) : 'leaderboard';
      return { key: lbKey, ttlMs: GET_CACHE_TTL_MS.leaderboard };
    }
    case 'getCollectorStats':
      return normCollector ? { key: 'collectorStats_' + normCollector, ttlMs: GET_CACHE_TTL_MS.collectorStats } : null;
    case 'getTodayLog':
      return normCollector ? { key: 'todayLog_' + normCollector, ttlMs: GET_CACHE_TTL_MS.todayLog } : null;
    case 'getRecollections':
      return { key: 'recollections', ttlMs: GET_CACHE_TTL_MS.recollections };
    case 'getFullLog':
      return {
        key: normCollector ? ('fullLog_' + normCollector) : 'fullLog_all',
        ttlMs: GET_CACHE_TTL_MS.fullLog
      };
    case 'getTaskActualsSheet':
      return { key: 'taskActuals', ttlMs: GET_CACHE_TTL_MS.taskActuals };
    case 'getAdminDashboardData':
      return { key: 'adminDashboard', ttlMs: GET_CACHE_TTL_MS.adminDashboard };
    case 'getActiveRigsCount':
      return { key: 'activeRigsCount', ttlMs: GET_CACHE_TTL_MS.activeRigsCount };
    default:
      return null;
  }
}

function readCacheValueByKey(key) {
  if (!key) return null;
  try {
    var cacheSheet = getOrCreateCacheSheet();
    var lastRow = cacheSheet.getLastRow();
    if (lastRow < 2) return null;

    var keyColumn = cacheSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var rowNo = -1;
    for (var i = 0; i < keyColumn.length; i++) {
      if (safeStr(keyColumn[i][0]) === key) {
        rowNo = i + 2;
        break;
      }
    }
    if (rowNo < 0) return null;

    var valueAndTs = cacheSheet.getRange(rowNo, 2, 1, 2).getValues()[0];
    var rawJson = safeStr(valueAndTs[0]);
    if (!rawJson) return null;
    var parsed = JSON.parse(rawJson);
    if (parsed && parsed.skipped === true && parsed.reason === 'payload_too_large') return null;

    return {
      value: parsed,
      updatedAtMs: toTimestampMs(valueAndTs[1])
    };
  } catch (e) {
    return null;
  }
}

function readFreshCacheValue(key, ttlMs) {
  var entry = readCacheValueByKey(key);
  if (!entry) return null;
  if (safeNum(ttlMs) > 0) {
    if (!entry.updatedAtMs) return null;
    if ((new Date()).getTime() - entry.updatedAtMs > ttlMs) return null;
  }
  return entry.value;
}

function doGet(e) {
  try {
    assertSheetConfig_();
    var action = (e.parameter.action || '').trim();
    var period = (e.parameter.period || '').trim();

    var cachePolicy = getDoGetCachePolicy(action, e.parameter || {});
    if (cachePolicy) {
      var cachedValue = readFreshCacheValue(cachePolicy.key, cachePolicy.ttlMs);
      if (cachedValue !== null && cachedValue !== undefined) {
        return jsonOut({ success: true, data: cachedValue });
      }
    }

    var result;
    switch (action) {
      case 'getCollectors':         result = handleGetCollectors(); break;
      case 'getTasks':              result = handleGetTasks(); break;
      case 'getLeaderboard':        result = handleGetLeaderboard(period); break;
      case 'getCollectorStats':     result = handleGetCollectorStats(e.parameter.collector || ''); break;
      case 'getTodayLog':           result = handleGetTodayLog(e.parameter.collector || ''); break;
      case 'getRecollections':      result = handleGetRecollections(); break;
      case 'getFullLog':            result = handleGetFullLog(e.parameter.collector || ''); break;
      case 'getTaskActualsSheet':   result = handleGetTaskActuals(); break;
      case 'getAdminDashboardData': result = handleGetAdminDashboard(); break;
      case 'getActiveRigsCount':    result = handleGetActiveRigsCount(); break;
      case 'getAppCache':           result = handleGetAppCache(e.parameter.keys || ''); break;
      case 'refreshCache':          result = handleRefreshCache(e.parameter.collector || '', e.parameter.scope || ''); break;
      default:
        return jsonOut({ success: false, error: 'Unknown action: ' + action });
    }
    return jsonOut({ success: true, data: result });
  } catch (err) {
    return jsonOut({ success: false, error: err.message || String(err) });
  }
}

function doPost(e) {
  try {
    assertSheetConfig_();
    var raw = '';
    if (e && e.postData && typeof e.postData.contents === 'string') {
      raw = e.postData.contents;
    } else if (e && e.parameter && typeof e.parameter.payload === 'string') {
      // Fallback path for clients sending payload in query param.
      raw = e.parameter.payload;
    }
    if (!raw) throw new Error('Missing POST payload');

    var body;
    try {
      body = JSON.parse(raw);
    } catch (parseErr) {
      throw new Error('Invalid JSON payload');
    }
    body = unwrapSubmitBody(body);

    var result = handleSubmit(body);
    return jsonOut({ success: true, data: result, message: result.message || 'OK' });
  } catch (err) {
    return jsonOut({ success: false, error: err.message || String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function unwrapSubmitBody(body) {
  var current = body;
  for (var i = 0; i < 2; i++) {
    if (!current || typeof current !== 'object' || current instanceof Date || Array.isArray(current)) break;
    if (typeof current.collector !== 'undefined' || typeof current.task !== 'undefined' || typeof current.actionType !== 'undefined') break;
    if (current.payload && typeof current.payload === 'object' && !Array.isArray(current.payload)) {
      current = current.payload;
      continue;
    }
    if (current.data && typeof current.data === 'object' && !Array.isArray(current.data)) {
      current = current.data;
      continue;
    }
    if (current.body && typeof current.body === 'object' && !Array.isArray(current.body)) {
      current = current.body;
      continue;
    }
    break;
  }
  return current;
}

function getSS() { return SpreadsheetApp.getActiveSpreadsheet(); }

function getSheet(name) {
  if (!name) {
    throw new Error('Sheet key resolved to undefined. Check for duplicate global vars in Apps Script files (especially SHEETS) and redeploy the latest code.');
  }
  var sheet = getSS().getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name);
  return sheet;
}

function getSheetData(name) {
  return getSheet(name).getDataRange().getValues();
}

/** Task actuals data: uses "Task Actuals | Redashpull" or "Collector Actuals | RedashPull" (tries both). */
function getTaskActualsData() {
  var ss = getSS();
  var sheet = ss.getSheetByName('Task Actuals | Redashpull') || ss.getSheetByName('Collector Actuals | RedashPull');
  if (!sheet) return [];
  return sheet.getDataRange().getValues();
}

function getScriptTodayDate() {
  var now = new Date();
  try {
    var tz = Session.getScriptTimeZone();
    var parts = Utilities.formatDate(now, tz, 'yyyy,M,d').split(',');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  } catch (e) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
}

function getWeekStartDate(refDate) {
  var base = (refDate instanceof Date) ? refDate : new Date();
  if (isNaN(base.getTime())) base = new Date();
  var dt = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  var day = dt.getDay();
  dt.setDate(dt.getDate() - (day === 0 ? 6 : day - 1)); // Monday at 00:00
  return dt;
}

function safeStr(v) { return String(v == null ? '' : v).trim(); }
function safeNum(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function safeHours(v) {
  if (v instanceof Date) return 0;
  var n = Number(v);
  if (!isFinite(n)) return 0;
  // Guard against accidental date serials/timestamps being treated as hours.
  if (Math.abs(n) > 10000) return 0;
  return n;
}

/** Normalize cell value to a Date (for comparison). Returns null if invalid. */
function toDateSafe(cell) {
  if (cell instanceof Date) return new Date(cell.getFullYear(), cell.getMonth(), cell.getDate());
  if (cell == null || cell === '') return null;
  var d;
  if (typeof cell === 'number') {
    // Google Sheets serial dates are whole days since 1899-12-30 (timezone-less).
    if (cell > 10000000000) {
      d = new Date(cell);
    } else {
      var wholeDays = Math.floor(cell);
      var utcMs = Date.UTC(1899, 11, 30) + (wholeDays * 86400000);
      var utcDate = new Date(utcMs);
      d = new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate());
    }
  } else {
    d = new Date(cell);
  }
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function normalizeCollectorKey(name) {
  return safeStr(name).toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeTaskKey(name) {
  return safeStr(name).toLowerCase().replace(/[_\s]+/g, ' ').trim();
}

function getRegionFromRigId(rigId) {
  var clean = safeStr(rigId).toLowerCase();
  if (!clean) return 'MX';
  if (clean.indexOf('ego-sf') >= 0 || clean.indexOf('-sf') >= 0 || clean.indexOf('sf') === 0) return 'SF';
  var match = clean.match(/(\d+)(?!.*\d)/); // last numeric suffix in rig id
  if (match && SF_RIG_NUMBERS[match[1]]) return 'SF';
  return 'MX';
}

function getCollectorRows() {
  var data = getSheetData(TASKFLOW_SHEETS.COLLECTORS);
  if (!data || data.length === 0) return [];

  var header = data[0] || [];
  var headerLower = [];
  for (var h = 0; h < header.length; h++) headerLower.push(safeStr(header[h]).toLowerCase());
  var hasHeader = false;
  for (var hh = 0; hh < headerLower.length; hh++) {
    var hv = headerLower[hh];
    if (hv.indexOf('collector') >= 0 || hv.indexOf('rig') >= 0 || hv.indexOf('email') >= 0 || hv.indexOf('hour') >= 0) {
      hasHeader = true;
      break;
    }
  }

  var idx = {
    name: 0,
    rigId: 1,
    email: 2,
    weeklyCap: 3,
    active: 4,
    hoursUploaded: 5,
    rating: 6
  };

  if (hasHeader) {
    for (var c = 0; c < headerLower.length; c++) {
      var col = headerLower[c].replace(/\s+/g, ' ').trim();
      if ((col.indexOf('collector') >= 0 && col.indexOf('name') >= 0) || col === 'name') idx.name = c;
      if (col.indexOf('rig') >= 0) idx.rigId = c;
      if (col.indexOf('email') >= 0) idx.email = c;
      if (col.indexOf('weekly') >= 0 && (col.indexOf('cap') >= 0 || col.indexOf('hour') >= 0)) idx.weeklyCap = c;
      if (col.indexOf('active') >= 0) idx.active = c;
      if ((col.indexOf('upload') >= 0) && (col.indexOf('hour') >= 0 || col.indexOf('hrs') >= 0)) idx.hoursUploaded = c;
      if (col.indexOf('rating') >= 0) idx.rating = c;
    }
  }

  var start = hasHeader ? 1 : 0;
  var out = [];
  for (var i = start; i < data.length; i++) {
    var row = data[i];
    var name = safeStr(row[idx.name]);
    if (!name) continue;

    var activeRaw = safeStr(row[idx.active]).toLowerCase();
    var active = true;
    if (activeRaw) {
      active = !(activeRaw === 'false' || activeRaw === '0' || activeRaw === 'no' || activeRaw === 'inactive');
    }

    out.push({
      name: name,
      rigId: safeStr(row[idx.rigId]),
      email: safeStr(row[idx.email]),
      weeklyCap: safeNum(row[idx.weeklyCap]),
      active: active,
      hoursUploaded: safeNum(row[idx.hoursUploaded]),
      rating: safeStr(row[idx.rating])
    });
  }
  return out;
}

function getCollectorRigMap() {
  return getCollectorRigMaps().collectorToRig;
}

function getCollectorRigMaps() {
  var collectorToRig = {};
  var rigToCollectorName = {};
  var rows = getCollectorRows();
  for (var i = 0; i < rows.length; i++) {
    var collectorName = safeStr(rows[i].name);
    var collectorKey = normalizeCollectorKey(collectorName);
    var rig = safeStr(rows[i].rigId).toLowerCase();
    if (!collectorName || !collectorKey || !rig) continue;
    collectorToRig[collectorKey] = rig;
    rigToCollectorName[rig] = collectorName;
  }
  return {
    collectorToRig: collectorToRig,
    rigToCollectorName: rigToCollectorName
  };
}

/**
 * Returns normalized collector upload rows from CA_TAGGED (preferred) or CA_PLUS (fallback).
 * Output row shape: { date: Date|null, rigId: string, collector: string, taskName: string, taskKey: string, hours: number, site: string }
 */
function getCollectorActualRows() {
  var ss = getSS();
  var sourceSheet = ss.getSheetByName(TASKFLOW_SHEETS.CA_TAGGED) || ss.getSheetByName(TASKFLOW_SHEETS.CA_PLUS);
  if (!sourceSheet) return [];
  var rigMaps = getCollectorRigMaps();

  var rows = sourceSheet.getDataRange().getValues();
  if (!rows || rows.length === 0) return [];

  var sheetName = sourceSheet.getName();
  var header = rows[0] || [];
  var headerLower = [];
  for (var h = 0; h < header.length; h++) headerLower.push(safeStr(header[h]).toLowerCase());
  var hasHeader = false;
  for (var hh = 0; hh < headerLower.length; hh++) {
    var hv = headerLower[hh];
    if (hv === 'date' || hv.indexOf('rig') >= 0 || hv.indexOf('task') >= 0 || hv.indexOf('hour') >= 0 || hv.indexOf('collector') >= 0) {
      hasHeader = true;
      break;
    }
  }

  var idxDate = -1;
  var idxRig = 1;
  var idxTask = (sheetName === TASKFLOW_SHEETS.CA_PLUS) ? 2 : 4;
  var idxHours = (sheetName === TASKFLOW_SHEETS.CA_PLUS) ? 3 : 5;
  var idxCollector = (sheetName === TASKFLOW_SHEETS.CA_PLUS) ? 4 : 3;
  var idxSite = (sheetName === TASKFLOW_SHEETS.CA_PLUS) ? -1 : 2;

  if (hasHeader) {
    var preferredHoursIdx = -1;
    var fallbackHoursIdx = -1;
    for (var c = 0; c < headerLower.length; c++) {
      var col = headerLower[c].replace(/\s+/g, ' ').trim();
      if (idxDate === -1 && (col === 'date' || col.indexOf('date') >= 0)) idxDate = c;
      if (col.indexOf('rig') >= 0 || col === 'rigid' || col === 'rig_id') idxRig = c;
      if (col.indexOf('task') >= 0 && col.indexOf('id') < 0) idxTask = c;
      if (col.indexOf('collector') >= 0) idxCollector = c;
      if (col === 'site' || col === 'region') idxSite = c;

      var looksLikeHours = (col.indexOf('hour') >= 0 || col.indexOf('hrs') >= 0);
      var isMinutes = col.indexOf('minute') >= 0 || col.indexOf('min') >= 0;
      var isDerived = col.indexOf('remaining') >= 0 || col.indexOf('good') >= 0 || col.indexOf('collected') >= 0;
      if (looksLikeHours && !isMinutes && !isDerived) {
        if (col.indexOf('upload') >= 0) preferredHoursIdx = c;
        else if (fallbackHoursIdx === -1) fallbackHoursIdx = c;
      }
    }
    if (preferredHoursIdx >= 0) idxHours = preferredHoursIdx;
    else if (fallbackHoursIdx >= 0) idxHours = fallbackHoursIdx;
    else if (sheetName === TASKFLOW_SHEETS.CA_PLUS && headerLower.length > 5) {
      idxHours = 5; // Known CA_PLUS default: "Hours Uploaded"
    }
  }
  if (idxDate < 0) idxDate = 0;

  var start = hasHeader ? 1 : 0;
  var out = [];
  for (var i = start; i < rows.length; i++) {
    var r = rows[i];
    if (!r) continue;
    var rigId = safeStr(r[idxRig]).toLowerCase();
    var taskName = safeStr(r[idxTask]);
    var hours = safeNum(r[idxHours]);
    if (!rigId || !taskName || hours <= 0) continue;
    var collectorFromRig = rigMaps.rigToCollectorName[rigId] || '';
    var collectorRaw = safeStr(r[idxCollector]);
    var collectorName = collectorFromRig || collectorRaw;
    var site = idxSite >= 0 ? safeStr(r[idxSite]).toUpperCase() : '';
    if (!site) site = getRegionFromRigId(rigId);

    out.push({
      date: toDateSafe(r[idxDate]),
      rigId: rigId,
      collector: collectorName,
      taskName: taskName,
      taskKey: normalizeTaskKey(taskName),
      hours: hours,
      site: site
    });
  }
  return out;
}

function buildLiveHoursIndex(actualRows) {
  if (!actualRows || !actualRows.length) {
    try { actualRows = getCollectorActualRows(); } catch (e) { actualRows = []; }
  }
  if (!actualRows || !actualRows.length) return {};
  var index = {};
  for (var i = 0; i < actualRows.length; i++) {
    var row = actualRows[i];
    if (!row) continue;
    if (!row.rigId || !row.taskKey) continue;
    var key = row.rigId + '|' + row.taskKey;
    if (!index[key]) index[key] = [];
    index[key].push({ date: row.date, hours: safeNum(row.hours) });
  }
  return index;
}

function getLiveHoursForAssignment(liveIndex, rigId, taskName, sinceDate) {
  if (!rigId || !taskName) return 0;
  var key = safeStr(rigId).toLowerCase() + '|' + normalizeTaskKey(taskName);
  var entries = liveIndex[key];
  if (!entries || entries.length === 0) return 0;
  var sinceMs = sinceDate ? sinceDate.getTime() : 0;
  var sum = 0;
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (!e.date || e.date.getTime() >= sinceMs) sum += safeNum(e.hours);
  }
  return sum;
}

function buildTaskActualLookup() {
  var map = {};
  var rows = getTaskActualRows();
  for (var i = 0; i < rows.length; i++) {
    var taskName = rows[i].taskName;
    if (!taskName) continue;
    var key = normalizeTaskKey(taskName);
    map[key] = {
      collectedHours: Math.round(safeHours(rows[i].collectedHours) * 100) / 100,
      goodHours: Math.round(safeHours(rows[i].goodHours) * 100) / 100,
      remainingHours: Math.round(safeHours(rows[i].remainingHours) * 100) / 100
    };
  }
  return map;
}

function getTaskActualRows() {
  var data;
  try { data = getTaskActualsData(); } catch(e) { data = []; }
  if (!data || data.length === 0) return [];

  var header = data[0] || [];
  var headerLower = [];
  for (var h = 0; h < header.length; h++) headerLower.push(safeStr(header[h]).toLowerCase());
  var hasHeader = false;
  for (var hh = 0; hh < headerLower.length; hh++) {
    var hv = headerLower[hh];
    if (
      hv.indexOf('task') >= 0 ||
      hv.indexOf('collected') >= 0 ||
      hv.indexOf('good') >= 0 ||
      hv.indexOf('remaining') >= 0 ||
      hv.indexOf('status') >= 0 ||
      hv.indexOf('redash') >= 0
    ) {
      hasHeader = true;
      break;
    }
  }

  var idx = {
    taskId: 0,
    taskName: 1,
    collectedHours: 2,
    goodHours: 3,
    status: 4,
    remainingHours: 5,
    lastRedash: 10
  };

  if (hasHeader) {
    for (var c = 0; c < headerLower.length; c++) {
      var col = headerLower[c].replace(/\s+/g, '');
      if (col === 'taskid' || col === 'task_id' || col === 'id') idx.taskId = c;
      if (col === 'task' || col === 'taskname' || (col.indexOf('task') >= 0 && col.indexOf('name') >= 0)) idx.taskName = c;
      if (col.indexOf('collected') >= 0) idx.collectedHours = c;
      if (col.indexOf('good') >= 0 && col.indexOf('hour') >= 0 || col === 'goodhrs' || col === 'good') idx.goodHours = c;
      if (col.indexOf('status') >= 0) idx.status = c;
      if (col.indexOf('remaining') >= 0) idx.remainingHours = c;
      if (col.indexOf('redash') >= 0 || col.indexOf('lastupdate') >= 0 || col.indexOf('timestamp') >= 0) idx.lastRedash = c;
    }
  }

  var start = hasHeader ? 1 : 0;
  var rows = [];
  for (var i = start; i < data.length; i++) {
    var row = data[i];
    if (!row) continue;
    var taskName = safeStr(row[idx.taskName]);
    if (!taskName) continue;
    rows.push({
      taskId: safeStr(row[idx.taskId]),
      taskName: taskName,
      collectedHours: Math.round(safeHours(row[idx.collectedHours]) * 100) / 100,
      goodHours: Math.round(safeHours(row[idx.goodHours]) * 100) / 100,
      status: safeStr(row[idx.status]),
      remainingHours: Math.round(safeHours(row[idx.remainingHours]) * 100) / 100,
      lastRedash: safeStr(row[idx.lastRedash])
    });
  }
  return rows;
}

function handleGetCollectors() {
  var data = getCollectorRows();
  var results = [];
  for (var i = 0; i < data.length; i++) {
    var name = safeStr(data[i].name);
    if (!name) continue;
    var rigId = safeStr(data[i].rigId);
    results.push({
      name: name,
      rigs: rigId ? [rigId] : [],
      email: safeStr(data[i].email),
      weeklyCap: safeNum(data[i].weeklyCap),
      active: !!data[i].active,
      hoursUploaded: safeNum(data[i].hoursUploaded),
      rating: safeStr(data[i].rating)
    });
  }
  writeCache('collectors', results);
  return results;
}

function handleGetTasks() {
  var data = getSheetData(TASKFLOW_SHEETS.TASK_LIST);
  var results = [];
  for (var i = 1; i < data.length; i++) {
    var name = safeStr(data[i][0]).replace(/^[\u2705]\s*/, '').trim();
    if (!name) continue;
    results.push({ name: name });
  }
  writeCache('tasks', results);
  return results;
}

function getWeekRange(period) {
  // Returns { start: Date, end: Date } for "thisWeek" or "lastWeek" (Mon–Sun).
  var today = getScriptTodayDate();
  var thisMonday = getWeekStartDate(today);
  var thisSunday = new Date(thisMonday);
  thisSunday.setDate(thisSunday.getDate() + 6);

  if (period === 'lastWeek') {
    var lastMonday = new Date(thisMonday);
    lastMonday.setDate(lastMonday.getDate() - 7);
    var lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastSunday.getDate() + 6);
    return { start: lastMonday, end: lastSunday };
  }

  // Default to this week.
  return { start: thisMonday, end: thisSunday };
}

function handleGetLeaderboard(period) {
  var useWeekly = (period === 'thisWeek' || period === 'lastWeek');
  var weekRange = useWeekly ? getWeekRange(period) : null;
  var collectorsData = getCollectorRows();
  var rigToName = {};
  var collectorMeta = {};
  for (var i = 0; i < collectorsData.length; i++) {
    var cName = safeStr(collectorsData[i].name);
    var cRig = safeStr(collectorsData[i].rigId).toLowerCase();
    if (cName) {
      var region = getRegionFromRigId(cRig);
      collectorMeta[normalizeCollectorKey(cName)] = { name: cName, rig: cRig, region: region };
      if (cRig) {
        rigToName[cRig] = cName;
      }
    }
  }

  var actualRows = getCollectorActualRows();
  var taggedRegion = {};
  var actualHoursByCollector = {};
  var actualNameByCollector = {};
  for (var j = 0; j < actualRows.length; j++) {
    var row = actualRows[j];
    var tRig = row.rigId;
    var tSite = row.site;
    var tCol = (tRig && rigToName[tRig]) ? rigToName[tRig] : safeStr(row.collector);
    if (!tCol && tRig) tCol = tRig;
    if (!tCol) continue;
    var tKey = normalizeCollectorKey(tCol);
    if (!actualNameByCollector[tKey]) actualNameByCollector[tKey] = tCol;

    var cleanSite = tSite.replace(/^EGO-/i, '');
    if (cleanSite === 'SF' || cleanSite === 'MX') {
      taggedRegion[tKey] = cleanSite;
    } else if (tRig) {
      taggedRegion[tKey] = getRegionFromRigId(tRig);
    }

    if (useWeekly) {
      var rowDate = row.date;
      if (!rowDate || rowDate < weekRange.start || rowDate > weekRange.end) continue;
    }
    actualHoursByCollector[tKey] = (actualHoursByCollector[tKey] || 0) + safeNum(row.hours);
  }

  var assignData;
  try { assignData = getSheetData(TASKFLOW_SHEETS.ASSIGNMENTS); } catch(e) { assignData = []; }

  var latestAssignments = {};
  for (var a = 1; a < assignData.length; a++) {
    var aRow = assignData[a];
    var collector = safeStr(aRow[3]);
    if (!collector) continue;
    var collectorKey = normalizeCollectorKey(collector);
    var taskKey = normalizeTaskKey(aRow[2]);
    var dedupeKey = collectorKey + '|' + (taskKey || safeStr(aRow[0]));
    var eventTs = Math.max(toTimestampMs(aRow[9]), toTimestampMs(aRow[4]));
    var existingLatest = latestAssignments[dedupeKey];
    if (!existingLatest || eventTs > existingLatest._ts || (eventTs === existingLatest._ts && a < existingLatest._rowOrder)) {
      latestAssignments[dedupeKey] = {
        row: aRow,
        collector: collector,
        collectorKey: collectorKey,
        eventDate: toDateSafe(aRow[9]) || toDateSafe(aRow[4]),
        _ts: eventTs,
        _rowOrder: a
      };
    }
  }

  var map = {};
  for (var lk in latestAssignments) {
    var latest = latestAssignments[lk];
    var aRow = latest.row;
    var collector = latest.collector;
    var key = latest.collectorKey;

    // For weekly views, include latest task state only if latest action is in the requested week.
    if (useWeekly) {
      var d = latest.eventDate;
      if (!d || d < weekRange.start || d > weekRange.end) continue;
    }

    var hours = safeNum(aRow[7]);
    var status = safeStr(aRow[6]).toLowerCase();
    var isCompleted = (status === 'completed' || status === 'complete');

    if (!map[key]) {
      var reg = taggedRegion[key] || (collectorMeta[key] ? collectorMeta[key].region : 'MX');
      map[key] = {
        rank: 0,
        collectorName: collector,
        hoursLogged: 0,
        reportedHours: 0,
        actualHours: 0,
        hoursSource: 'actual',
        tasksCompleted: 0,
        tasksAssigned: 0,
        completionRate: 0,
        region: reg
      };
    }
    map[key].reportedHours += hours;
    map[key].tasksAssigned += 1;
    if (isCompleted) map[key].tasksCompleted += 1;
  }

  // Overlay upload-hours from collector actuals (CA_TAGGED preferred). This keeps hours "live" from rig keyed ingest.
  for (var ahKey in actualHoursByCollector) {
    if (!map[ahKey]) {
      var metaFromCollector = collectorMeta[ahKey];
      var displayName = (metaFromCollector && metaFromCollector.name) || actualNameByCollector[ahKey] || ahKey;
      var regionFromCollector = taggedRegion[ahKey] || (metaFromCollector ? metaFromCollector.region : 'MX');
      map[ahKey] = {
        rank: 0,
        collectorName: displayName,
        hoursLogged: 0,
        reportedHours: 0,
        actualHours: 0,
        hoursSource: 'actual',
        tasksCompleted: 0,
        tasksAssigned: 0,
        completionRate: 0,
        region: regionFromCollector
      };
    }
    map[ahKey].actualHours = Math.max(safeNum(map[ahKey].actualHours), safeNum(actualHoursByCollector[ahKey]));
  }

  var entries = [];
  for (var k in map) {
    var en = map[k];
    var actual = safeNum(en.actualHours);
    var reported = safeNum(en.reportedHours);
    en.hoursLogged = actual;
    en.hoursSource = 'actual';
    if (en.hoursLogged <= 0 && en.tasksAssigned <= 0) continue;
    en.hoursLogged = Math.round(en.hoursLogged * 100) / 100;
    en.actualHours = Math.round(actual * 100) / 100;
    en.reportedHours = Math.round(reported * 100) / 100;
    en.completionRate = en.tasksAssigned > 0 ? Math.round(en.tasksCompleted / en.tasksAssigned * 100) : 0;
    entries.push(en);
  }
  entries.sort(function(a, b) { return b.hoursLogged - a.hoursLogged; });
  for (var idx = 0; idx < entries.length; idx++) entries[idx].rank = idx + 1;

  var cacheKey = useWeekly ? ('leaderboard_' + period) : 'leaderboard';
  writeCache(cacheKey, entries);
  return entries;
}

function handleGetCollectorStats(collectorName) {
  if (!collectorName) {
    return {
      collectorName: '',
      totalAssigned: 0, totalCompleted: 0, totalCanceled: 0,
      totalLoggedHours: 0, totalPlannedHours: 0,
      weeklyLoggedHours: 0, weeklyCompleted: 0,
      activeTasks: 0, completionRate: 0, avgHoursPerTask: 0,
      topTasks: []
    };
  }
  var normName = normalizeCollectorKey(collectorName);

  var collectorsData = getCollectorRows();
  var myRig = '';
  for (var c = 0; c < collectorsData.length; c++) {
    if (normalizeCollectorKey(collectorsData[c].name) === normName) {
      myRig = safeStr(collectorsData[c].rigId).toLowerCase();
      break;
    }
  }

  var assignData;
  try { assignData = getSheetData(TASKFLOW_SHEETS.ASSIGNMENTS); } catch(e) { assignData = []; }

  var totalAssigned = 0, totalCompleted = 0, totalCanceled = 0;
  var totalLoggedHours = 0, totalPlannedHours = 0;
  var weeklyLoggedHours = 0, weeklyCompleted = 0;
  var topTasks = [];
  var weekStart = getWeekStartDate(getScriptTodayDate());

  var latestByTask = {};
  for (var a = 1; a < assignData.length; a++) {
    var row = assignData[a];
    var aCol = normalizeCollectorKey(row[3]);
    if (aCol !== normName) continue;
    var taskKey = normalizeTaskKey(row[2]) || safeStr(row[0]);
    var eventTs = Math.max(toTimestampMs(row[9]), toTimestampMs(row[4]));
    var existing = latestByTask[taskKey];
    if (!existing || eventTs > existing._ts || (eventTs === existing._ts && a < existing._rowOrder)) {
      latestByTask[taskKey] = { row: row, _ts: eventTs, _rowOrder: a };
    }
  }

  var assignmentStatusByTask = {};
  for (var tk in latestByTask) {
    var row = latestByTask[tk].row;
    totalAssigned++;
    var st = safeStr(row[6]).toLowerCase();
    var planned = safeNum(row[5]);
    totalPlannedHours += planned;
    var rowTaskKey = normalizeTaskKey(row[2]);
    if (rowTaskKey) assignmentStatusByTask[rowTaskKey] = safeStr(row[6]) || 'In Progress';
    if (st === 'completed' || st === 'complete') totalCompleted++;
    else if (st === 'canceled' || st === 'cancelled') totalCanceled++;
    var eventDate = toDateSafe(row[9]) || toDateSafe(row[4]);
    if (eventDate && eventDate >= weekStart) {
      if (st === 'completed' || st === 'complete') weeklyCompleted++;
    }
  }

  var actualRows = getCollectorActualRows();
  var actualHours = 0, actualWeeklyHours = 0;
  var actualTaskSet = {};
  var actualTaskHoursByKey = {};
  var actualTaskNameByKey = {};
  for (var t = 0; t < actualRows.length; t++) {
    var ar = actualRows[t];
    var aRig = ar.rigId;
    var aCol = normalizeCollectorKey(ar.collector);
    var matchesCollector = (myRig && aRig === myRig) || aCol === normName;
    if (matchesCollector) {
      var hours = safeNum(ar.hours);
      if (hours <= 0) continue;
      actualHours += hours;
      var arTaskKey = ar.taskKey || normalizeTaskKey(ar.taskName);
      if (arTaskKey) {
        actualTaskSet[arTaskKey] = true;
        actualTaskHoursByKey[arTaskKey] = (actualTaskHoursByKey[arTaskKey] || 0) + hours;
        if (!actualTaskNameByKey[arTaskKey]) actualTaskNameByKey[arTaskKey] = safeStr(ar.taskName);
      }
      if (ar.date && ar.date >= weekStart) {
        actualWeeklyHours += hours;
      }
    }
  }

  var actualTaskCount = Object.keys(actualTaskSet).length;
  totalLoggedHours = actualHours;
  weeklyLoggedHours = actualWeeklyHours;
  if (actualTaskCount > totalAssigned) totalAssigned = actualTaskCount;

  for (var ak in actualTaskHoursByKey) {
    topTasks.push({
      name: actualTaskNameByKey[ak] || ak,
      hours: Math.round(safeNum(actualTaskHoursByKey[ak]) * 100) / 100,
      status: assignmentStatusByTask[ak] || 'Actual Upload'
    });
  }
  if (topTasks.length === 0) {
    for (var fallbackKey in latestByTask) {
      var fallbackRow = latestByTask[fallbackKey].row;
      topTasks.push({
        name: safeStr(fallbackRow[2]),
        hours: 0,
        status: safeStr(fallbackRow[6]) || 'In Progress'
      });
    }
  }

  topTasks.sort(function(a, b) { return b.hours - a.hours; });
  var completionRate = totalAssigned > 0 ? Math.round(totalCompleted / totalAssigned * 100) : 0;
  var avgHPT = totalCompleted > 0 ? totalLoggedHours / totalCompleted : 0;

  var result = {
    collectorName: collectorName,
    totalAssigned: totalAssigned, totalCompleted: totalCompleted, totalCanceled: totalCanceled,
    totalLoggedHours: Math.round(totalLoggedHours * 100) / 100,
    totalPlannedHours: Math.round(totalPlannedHours * 100) / 100,
    weeklyLoggedHours: Math.round(weeklyLoggedHours * 100) / 100,
    weeklyCompleted: weeklyCompleted,
    activeTasks: Math.max(0, totalAssigned - totalCompleted - totalCanceled),
    completionRate: completionRate,
    avgHoursPerTask: Math.round(avgHPT * 100) / 100,
    topTasks: topTasks.slice(0, 10)
  };
  writeCache('collectorStats_' + normName, result);
  return result;
}

function handleGetTodayLog(collectorName) {
  if (!collectorName) return [];
  var normName = normalizeCollectorKey(collectorName);
  var assignData;
  try { assignData = getSheetData(TASKFLOW_SHEETS.ASSIGNMENTS); } catch(e) { return []; }
  var collectorRigMap = getCollectorRigMap();
  var liveHoursIndex = buildLiveHoursIndex(getCollectorActualRows());
  var taskActualLookup = buildTaskActualLookup();
  var today = getScriptTodayDate();
  var todayStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var latestByTask = {};
  for (var i = 1; i < assignData.length; i++) {
    var row = assignData[i];
    var aCol = normalizeCollectorKey(row[3]);
    if (aCol !== normName) continue;
    var assignDate = toDateSafe(row[4]);
    var completeDate = toDateSafe(row[9]);
    var dateStr = assignDate ? Utilities.formatDate(assignDate, Session.getScriptTimeZone(), 'yyyy-MM-dd') : safeStr(row[4]);
    var completedStr = completeDate ? Utilities.formatDate(completeDate, Session.getScriptTimeZone(), 'yyyy-MM-dd') : safeStr(row[9]);
    var status = safeStr(row[6]);
    var statusLower = status.toLowerCase();
    var isActive = statusLower === 'in progress' || statusLower === 'partial' || statusLower === 'assigned';
    var plannedHours = safeNum(row[5]);
    var loggedHours = safeNum(row[7]);
    var remainingHours = safeNum(row[8]);
    var taskName = safeStr(row[2]);
    var taskKey = normalizeTaskKey(taskName);
    var taskActual = taskActualLookup[taskKey] || null;
    var taskCollected = taskActual ? safeNum(taskActual.collectedHours) : 0;
    var taskGood = taskActual ? safeNum(taskActual.goodHours) : 0;
    var taskRemaining = taskActual ? safeNum(taskActual.remainingHours) : 0;
    var taskTotal = Math.max(taskCollected + taskRemaining, 0);
    var taskProgressPct = taskTotal > 0 ? Math.round((taskCollected / taskTotal) * 100) : 0;

    if (isActive) {
      var rigId = collectorRigMap[aCol] || '';
      var liveHours = getLiveHoursForAssignment(liveHoursIndex, rigId, safeStr(row[2]), assignDate);
      if (liveHours > loggedHours) {
        loggedHours = liveHours;
        remainingHours = Math.max(0, plannedHours - loggedHours);
      }
    }

    var include = (dateStr === todayStr || completedStr === todayStr || isActive);
    if (!include) continue;

    var eventTs = Math.max(toTimestampMs(row[9]), toTimestampMs(row[4]));
    var dedupeKey = taskKey || ('task:' + safeStr(row[0]));
    var existing = latestByTask[dedupeKey];
    if (!existing || eventTs > existing._ts || (eventTs === existing._ts && i < existing._rowOrder)) {
      latestByTask[dedupeKey] = {
        assignmentId: safeStr(row[0]),
        taskId: safeStr(row[1]),
        taskName: taskName,
        status: status,
        loggedHours: Math.round(loggedHours * 100) / 100,
        plannedHours: Math.round(plannedHours * 100) / 100,
        remainingHours: Math.round(remainingHours * 100) / 100,
        notes: safeStr(row[10]),
        taskCollectedHours: Math.round(taskCollected * 100) / 100,
        taskGoodHours: Math.round(taskGood * 100) / 100,
        taskRemainingHours: Math.round(taskRemaining * 100) / 100,
        taskProgressPct: taskProgressPct,
        assignedDate: dateStr,
        completedDate: completedStr,
        _ts: eventTs,
        _rowOrder: i
      };
    }
  }
  var results = [];
  for (var key in latestByTask) {
    var item = latestByTask[key];
    results.push(item);
  }
  results.sort(function(a, b) {
    if (b._ts !== a._ts) return b._ts - a._ts;
    return a._rowOrder - b._rowOrder;
  });
  for (var r = 0; r < results.length; r++) {
    delete results[r]._ts;
    delete results[r]._rowOrder;
  }
  writeCache('todayLog_' + normName, results);
  return results;
}

function handleGetRecollections() {
  var data = getTaskActualRows();
  var results = [];
  for (var i = 0; i < data.length; i++) {
    var st = safeStr(data[i].status).toLowerCase();
    var tn = safeStr(data[i].taskName);
    var rem = safeHours(data[i].remainingHours);
    if (tn && (st === 'recollect' || st === 'needs recollection' || rem < 0)) {
      results.push(tn + (rem !== 0 ? ' (' + (Math.round(rem * 100) / 100).toFixed(2) + 'h)' : ''));
    }
  }
  writeCache('recollections', results);
  return results;
}

function handleGetFullLog(collectorFilter) {
  var data;
  try { data = getSheetData(TASKFLOW_SHEETS.ASSIGNMENTS); } catch(e) { return []; }
  var normFilter = collectorFilter ? normalizeCollectorKey(collectorFilter) : '';
  var collectorRigMap = getCollectorRigMap();
  var liveHoursIndex = buildLiveHoursIndex(getCollectorActualRows());
  var taskActualLookup = buildTaskActualLookup();
  var latestByKey = {};
  for (var i = 1; i < data.length; i++) {
    var collector = safeStr(data[i][3]);
    var collectorKey = normalizeCollectorKey(collector);
    if (normFilter && collectorKey !== normFilter) continue;

    var status = safeStr(data[i][6]);
    var statusLower = status.toLowerCase();
    var isActive = statusLower === 'in progress' || statusLower === 'partial';
    var plannedHours = safeNum(data[i][5]);
    var loggedHours = safeNum(data[i][7]);
    var remainingHours = safeNum(data[i][8]);
    var taskKey = normalizeTaskKey(data[i][2]);
    var taskActual = taskActualLookup[taskKey] || null;
    var taskCollected = taskActual ? safeNum(taskActual.collectedHours) : 0;
    var taskGood = taskActual ? safeNum(taskActual.goodHours) : 0;
    var taskRemaining = taskActual ? safeNum(taskActual.remainingHours) : 0;
    var taskTotal = Math.max(taskCollected + taskRemaining, 0);
    var taskProgressPct = taskTotal > 0 ? Math.round((taskCollected / taskTotal) * 100) : 0;
    if (isActive) {
      var assignedDate = toDateSafe(data[i][4]);
      var rigId = collectorRigMap[collectorKey] || '';
      var liveHours = getLiveHoursForAssignment(liveHoursIndex, rigId, safeStr(data[i][2]), assignedDate);
      if (liveHours > loggedHours) {
        loggedHours = liveHours;
        remainingHours = Math.max(0, plannedHours - loggedHours);
      }
    }

    var eventTs = Math.max(toTimestampMs(data[i][9]), toTimestampMs(data[i][4]));
    var dedupeKey = collectorKey + '|' + (taskKey || safeStr(data[i][0]));
    var existing = latestByKey[dedupeKey];
    if (!existing || eventTs > existing._ts || (eventTs === existing._ts && i < existing._rowOrder)) {
      latestByKey[dedupeKey] = {
        collector: collector,
        taskName: safeStr(data[i][2]),
        status: status,
        loggedHours: Math.round(loggedHours * 100) / 100,
        plannedHours: Math.round(plannedHours * 100) / 100,
        remainingHours: Math.round(remainingHours * 100) / 100,
        taskCollectedHours: Math.round(taskCollected * 100) / 100,
        taskGoodHours: Math.round(taskGood * 100) / 100,
        taskRemainingHours: Math.round(taskRemaining * 100) / 100,
        taskProgressPct: taskProgressPct,
        assignedDate: safeStr(data[i][4]),
        _ts: eventTs,
        _rowOrder: i
      };
    }
  }
  var results = [];
  for (var key in latestByKey) {
    results.push(latestByKey[key]);
  }
  results.sort(function(a, b) {
    if (b._ts !== a._ts) return b._ts - a._ts;
    return a._rowOrder - b._rowOrder;
  });
  for (var r = 0; r < results.length; r++) {
    delete results[r]._ts;
    delete results[r]._rowOrder;
  }
  writeCache(normFilter ? ('fullLog_' + normFilter) : 'fullLog_all', results);
  return results;
}

function handleGetTaskActuals() {
  var data = getTaskActualRows();

  // Build collector data from CA_TAGGED (preferred) or CA_PLUS (fallback)
  var actualRows = getCollectorActualRows();
  var rigToCollectorName = getCollectorRigMaps().rigToCollectorName;

  // Map: taskName (lower) -> { collectors: { name -> totalHours }, totalUploaded }
  var taskCollectorMap = {};
  for (var t = 0; t < actualRows.length; t++) {
    var ar = actualRows[t];
    var tTask = ar.taskKey;
    var tCollector = '';
    if (ar.rigId && rigToCollectorName[ar.rigId]) tCollector = rigToCollectorName[ar.rigId];
    if (!tCollector) tCollector = safeStr(ar.collector);
    if (!tCollector && ar.rigId) tCollector = ar.rigId;
    var tHours = safeNum(ar.hours);
    if (!tTask || !tCollector) continue;
    if (!taskCollectorMap[tTask]) taskCollectorMap[tTask] = { collectors: {}, totalUploaded: 0 };
    var cKey = normalizeCollectorKey(tCollector);
    if (!taskCollectorMap[tTask].collectors[cKey]) {
      taskCollectorMap[tTask].collectors[cKey] = { name: tCollector, hours: 0 };
    }
    taskCollectorMap[tTask].collectors[cKey].hours += tHours;
    taskCollectorMap[tTask].totalUploaded += tHours;
  }

  var results = [];
  for (var i = 0; i < data.length; i++) {
    var tn = safeStr(data[i].taskName);
    if (!tn) continue;
    var tnKey = normalizeTaskKey(tn);
    var tcData = taskCollectorMap[tnKey];

    // Find the top contributor (collector with most hours on this task)
    var topCollector = '';
    var topHours = 0;
    var collectorCount = 0;
    if (tcData) {
      for (var ck in tcData.collectors) {
        collectorCount++;
        var c = tcData.collectors[ck];
        if (c.hours > topHours) {
          topHours = c.hours;
          topCollector = c.name;
        }
      }
    }

    results.push({
      taskId: safeStr(data[i].taskId), taskName: tn,
      collectedHours: Math.round(safeHours(data[i].collectedHours) * 100) / 100,
      goodHours: Math.round(safeHours(data[i].goodHours) * 100) / 100,
      status: safeStr(data[i].status),
      remainingHours: Math.round(safeHours(data[i].remainingHours) * 100) / 100,
      lastRedash: safeStr(data[i].lastRedash),
      assignedCollector: topCollector,
      collectorHours: Math.round(topHours * 100) / 100,
      collectorCount: collectorCount
    });
  }
  writeCache('taskActuals', results);
  return results;
}

function handleGetAdminDashboard() {
  var taskData = getTaskActualRows();
  var totalTasks = 0, completedTasks = 0, inProgressTasks = 0, recollectTasks = 0;
  var recollections = [];
  for (var i = 0; i < taskData.length; i++) {
    var st = safeStr(taskData[i].status).toLowerCase();
    var tn = safeStr(taskData[i].taskName);
    if (!tn) continue;
    totalTasks++;
    if (st === 'done' || st === 'completed' || st === 'complete') {
      completedTasks++;
    } else if (st === 'recollect' || st === 'needs recollection' || st === 'needs_recollection') {
      recollectTasks++;
      recollections.push(tn);
    } else if (
      st === 'in progress' || st === 'in_progress' || st === 'inprogress' ||
      st === 'active' || st === 'ip' || st === 'open' || st === 'partial' || st === 'assigned'
    ) {
      inProgressTasks++;
    }
  }

  var collectorsData = getCollectorRows();
  var rigMaps = getCollectorRigMaps();
  var actualRows = getCollectorActualRows();
  var actualHoursByCollector = {};
  for (var ah = 0; ah < actualRows.length; ah++) {
    var ar = actualRows[ah];
    var rigId = safeStr(ar.rigId).toLowerCase();
    var collectorName = (rigId && rigMaps.rigToCollectorName[rigId]) ? rigMaps.rigToCollectorName[rigId] : safeStr(ar.collector);
    if (!collectorName && rigId) collectorName = rigId;
    var collectorKey = normalizeCollectorKey(collectorName);
    if (!collectorKey) continue;
    actualHoursByCollector[collectorKey] = (actualHoursByCollector[collectorKey] || 0) + safeNum(ar.hours);
  }

  var totalCollectors = 0, totalHoursUploaded = 0;
  var collectorSummary = [];
  for (var c = 0; c < collectorsData.length; c++) {
    var nm = safeStr(collectorsData[c].name);
    if (!nm) continue;
    totalCollectors++;
    var hrs = safeNum(actualHoursByCollector[normalizeCollectorKey(nm)]);
    totalHoursUploaded += hrs;
    collectorSummary.push({
      name: nm, rig: safeStr(collectorsData[c].rigId), email: safeStr(collectorsData[c].email),
      weeklyCap: safeNum(collectorsData[c].weeklyCap), hoursUploaded: hrs, rating: safeStr(collectorsData[c].rating)
    });
  }

  var reqData;
  try { reqData = getSheetData(TASKFLOW_SHEETS.RS_TASK_REQ); } catch(e) { reqData = []; }
  var taskReqs = [];
  for (var r = 1; r < reqData.length; r++) {
    var rn = safeStr(reqData[r][0]);
    if (rn) taskReqs.push({ taskName: rn, requiredGoodHours: safeNum(reqData[r][1]) });
  }

  var activeRigsToday = getActiveRigsToday();
  var result = {
    totalTasks: totalTasks, completedTasks: completedTasks, inProgressTasks: inProgressTasks,
    recollectTasks: recollectTasks, recollections: recollections,
    totalCollectors: totalCollectors, totalHoursUploaded: Math.round(totalHoursUploaded * 100) / 100,
    collectorSummary: collectorSummary, taskRequirements: taskReqs,
    activeRigsToday: activeRigsToday
  };
  writeCache('adminDashboard', result);
  return result;
}

/**
 * Count unique rigs that have an upload today from CA_TAGGED (preferred) or CA_PLUS (fallback).
 */
function getActiveRigsToday() {
  var actualRows = getCollectorActualRows();
  var today = getScriptTodayDate();
  var todayStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var rigsToday = {};
  for (var i = 0; i < actualRows.length; i++) {
    var row = actualRows[i];
    var dateStr = row.date ? Utilities.formatDate(row.date, Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';
    if (dateStr !== todayStr) continue;
    var rigId = safeStr(row.rigId).toLowerCase();
    if (rigId) rigsToday[rigId] = true;
  }
  return Object.keys(rigsToday).length;
}

function handleGetActiveRigsCount() {
  var result = { activeRigsToday: getActiveRigsToday() };
  writeCache('activeRigsCount', result);
  return result;
}

function parseCacheKeys(keysCsv) {
  var out = [];
  var seen = {};
  var parts = safeStr(keysCsv).split(',');
  for (var i = 0; i < parts.length; i++) {
    var key = safeStr(parts[i]);
    if (!key || seen[key]) continue;
    seen[key] = true;
    out.push(key);
  }
  return out;
}

function handleGetAppCache(keysCsv) {
  var cacheSheet;
  try { cacheSheet = getOrCreateCacheSheet(); } catch(e) { return {}; }
  var cache = {};
  var lastRow = cacheSheet.getLastRow();
  if (lastRow < 2) return cache;

  var keyFilter = parseCacheKeys(keysCsv);
  if (keyFilter.length > 0) {
    var keyColumn = cacheSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var rowByKey = {};
    for (var i = 0; i < keyColumn.length; i++) {
      var cacheKey = safeStr(keyColumn[i][0]);
      if (!cacheKey) continue;
      rowByKey[cacheKey] = i + 2;
    }
    for (var k = 0; k < keyFilter.length; k++) {
      var requestedKey = keyFilter[k];
      var rowNo = rowByKey[requestedKey];
      if (!rowNo) continue;
      var row = cacheSheet.getRange(rowNo, 1, 1, 3).getValues()[0];
      try { cache[requestedKey] = { value: JSON.parse(row[1]), updatedAt: safeStr(row[2]) }; }
      catch(e) { cache[requestedKey] = { value: row[1], updatedAt: safeStr(row[2]) }; }
    }
    return cache;
  }

  var data = cacheSheet.getRange(2, 1, lastRow - 1, 3).getValues();
  for (var d = 0; d < data.length; d++) {
    var key = safeStr(data[d][0]);
    if (!key) continue;
    try { cache[key] = { value: JSON.parse(data[d][1]), updatedAt: safeStr(data[d][2]) }; }
    catch(e2) { cache[key] = { value: data[d][1], updatedAt: safeStr(data[d][2]) }; }
  }
  return cache;
}

function getOrCreateCacheSheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName(TASKFLOW_SHEETS.APP_CACHE);
  if (!sheet) {
    sheet = ss.insertSheet(TASKFLOW_SHEETS.APP_CACHE);
    sheet.getRange(1, 1, 1, 3).setValues([['key', 'jsonValue', 'updatedAt']]);
  }
  return sheet;
}

function writeCache(key, value) {
  try {
    if (!key) return;
    var cacheSheet = getOrCreateCacheSheet();
    var lastRow = cacheSheet.getLastRow();
    var targetRow = -1;
    var existingJson = '';
    if (lastRow >= 1) {
      var keyColumn = cacheSheet.getRange(1, 1, lastRow, 1).getValues();
      for (var i = 0; i < keyColumn.length; i++) {
        if (safeStr(keyColumn[i][0]) === key) {
          targetRow = i + 1;
          existingJson = safeStr(cacheSheet.getRange(targetRow, 2).getValue());
          break;
        }
      }
    }

    if (targetRow === -1) {
      targetRow = Math.max(lastRow + 1, 2);
      if (targetRow > lastRow + 1) {
        cacheSheet.insertRowsAfter(lastRow, targetRow - (lastRow + 1));
      }
    }

    var nextJson = JSON.stringify(value);
    if (!nextJson) return;

    if (nextJson.length > CACHE_CELL_MAX_CHARS) {
      // Do not fail request flow because cache payload is too large for one cell.
      var oversizedMarker = JSON.stringify({
        skipped: true,
        reason: 'payload_too_large',
        size: nextJson.length,
        key: key
      });
      if (existingJson !== oversizedMarker) {
        cacheSheet.getRange(targetRow, 1, 1, 3).setValues([[key, oversizedMarker, new Date().toISOString()]]);
      }
      return;
    }

    if (existingJson === nextJson) return;

    cacheSheet.getRange(targetRow, 1, 1, 3).setValues([[key, nextJson, new Date().toISOString()]]);
  } catch(e) {}
}

function handleRefreshCache(collectorName, scope) {
  var scopeKey = safeStr(scope).toLowerCase();
  var isLight = (scopeKey === 'light');
  var collectors = handleGetCollectors();
  var tasks = handleGetTasks();
  var thisWeek = handleGetLeaderboard('thisWeek');
  var recollections = handleGetRecollections();
  var activeRigs = handleGetActiveRigsCount();

  var lastWeek = [];
  var admin = null;
  var taskActuals = [];
  if (!isLight) {
    lastWeek = handleGetLeaderboard('lastWeek');
    admin = handleGetAdminDashboard();
    taskActuals = handleGetTaskActuals();
  }

  var collectorCached = false;
  if (collectorName) {
    var normCollector = normalizeCollectorKey(collectorName);
    if (normCollector) {
      handleGetCollectorStats(collectorName);
      handleGetTodayLog(collectorName);
      handleGetFullLog(collectorName);
      collectorCached = true;
    }
  }

  return {
    cached: true,
    scope: isLight ? 'light' : 'full',
    collectors: collectors.length,
    tasks: tasks.length,
    leaderboardThisWeek: thisWeek.length,
    leaderboardLastWeek: lastWeek.length,
    taskActuals: taskActuals.length,
    recollections: recollections.length,
    activeRigsToday: activeRigs.activeRigsToday,
    adminCached: !!admin,
    collectorCached: collectorCached
  };
}

function refreshPostSubmitCaches(collectorName) {
  try {
    handleGetTodayLog(collectorName);
    handleGetCollectorStats(collectorName);
    handleGetFullLog(collectorName);
    handleGetLeaderboard('thisWeek');
    handleGetAdminDashboard();
    handleGetActiveRigsCount();
  } catch (e) {}
}

function toTimestampMs(cell) {
  if (cell instanceof Date) return cell.getTime();
  if (cell == null || cell === '') return 0;
  var d;
  if (typeof cell === 'number') {
    if (cell > 10000000000) {
      d = new Date(cell);
    } else {
      d = new Date((cell - 25569) * 86400 * 1000);
    }
  } else {
    d = new Date(cell);
  }
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function roundedHours(v) {
  return Math.round(safeNum(v) * 100) / 100;
}

function buildSubmitFingerprint(collector, task, actionType, hours, notes) {
  var noteKey = safeStr(notes).replace(/\s+/g, ' ').toLowerCase();
  if (noteKey.length > 80) noteKey = noteKey.substring(0, 80);
  return [
    normalizeCollectorKey(collector),
    normalizeTaskKey(task),
    safeStr(actionType).toUpperCase(),
    roundedHours(hours).toFixed(2),
    noteKey
  ].join('|');
}

function getSubmitCacheInfo(requestId, fingerprint) {
  if (requestId) {
    return { key: 'submit:req:' + requestId, ttl: SUBMIT_REQUEST_TTL_SECONDS };
  }
  return { key: 'submit:fp:' + fingerprint, ttl: SUBMIT_FINGERPRINT_TTL_SECONDS };
}

function readCachedSubmitResult(cacheKey) {
  try {
    var cached = CacheService.getScriptCache().get(cacheKey);
    if (!cached) return null;
    var parsed = JSON.parse(cached);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    return null;
  }
}

function writeCachedSubmitResult(cacheInfo, result) {
  try {
    CacheService.getScriptCache().put(cacheInfo.key, JSON.stringify(result), cacheInfo.ttl);
  } catch (e) {}
}

function insertAssignmentLogRow(sheet, rowValues) {
  sheet.insertRowBefore(2);
  sheet.getRange(2, 1, 1, rowValues.length).setValues([rowValues]);
}

function getLatestAssignmentState(data, normCol, normTask) {
  var best = null;
  var bestTs = -1;
  var bestOrder = Number.MAX_VALUE;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowCollector = normalizeCollectorKey(row[3]);
    var rowTask = normalizeTaskKey(row[2]);
    if (rowCollector !== normCol || rowTask !== normTask) continue;
    var rowTs = Math.max(toTimestampMs(row[9]), toTimestampMs(row[4]));
    if (rowTs > bestTs || (rowTs === bestTs && i < bestOrder)) {
      bestTs = rowTs;
      bestOrder = i;
      best = {
        assignmentId: safeStr(row[0]),
        taskId: safeStr(row[1]),
        taskName: safeStr(row[2]),
        collector: safeStr(row[3]),
        assignedDate: row[4],
        planned: safeNum(row[5]),
        status: safeStr(row[6]),
        logged: safeNum(row[7]),
        remaining: safeNum(row[8]),
        completedDate: row[9],
        notes: safeStr(row[10]),
        weekStart: safeStr(row[11])
      };
    }
  }
  return best;
}

function findRecentOpenAssignment(data, normCol, normTask, plannedHours, nowMs) {
  var targetPlanned = roundedHours(plannedHours);
  var best = null;
  var bestTs = -1;
  var bestOrder = Number.MAX_VALUE;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rCol = normalizeCollectorKey(row[3]);
    var rTask = normalizeTaskKey(row[2]);
    if (rCol !== normCol || rTask !== normTask) continue;

    var rStatus = safeStr(row[6]).toLowerCase();
    if (rStatus !== 'in progress' && rStatus !== 'partial' && rStatus !== 'assigned') continue;

    var rowTs = Math.max(toTimestampMs(row[9]), toTimestampMs(row[4]));
    if (!rowTs || (nowMs - rowTs) > SUBMIT_DEDUP_WINDOW_MS) continue;

    var rowPlanned = roundedHours(row[5]);
    if (targetPlanned > 0 && rowPlanned !== targetPlanned) continue;

    if (rowTs > bestTs || (rowTs === bestTs && i < bestOrder)) {
      bestTs = rowTs;
      bestOrder = i;
      best = {
        assignmentId: safeStr(row[0]),
        status: safeStr(row[6]) || 'In Progress',
        planned: safeNum(row[5]),
        logged: safeNum(row[7]),
        remaining: safeNum(row[8])
      };
    }
  }
  return best;
}

function findRecentCompletedAssignment(data, normCol, normTask, hours, nowMs) {
  var targetHours = roundedHours(hours);
  var best = null;
  var bestTs = -1;
  var bestOrder = Number.MAX_VALUE;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rCol = normalizeCollectorKey(row[3]);
    var rTask = normalizeTaskKey(row[2]);
    if (rCol !== normCol || rTask !== normTask) continue;

    var rStatus = safeStr(row[6]).toLowerCase();
    if (rStatus !== 'completed' && rStatus !== 'complete') continue;

    var rowTs = Math.max(toTimestampMs(row[9]), toTimestampMs(row[4]));
    if (!rowTs || (nowMs - rowTs) > SUBMIT_DEDUP_WINDOW_MS) continue;

    var rowLogged = roundedHours(row[7]);
    var rowPlanned = roundedHours(row[5]);
    if (targetHours > 0 && rowLogged !== targetHours && rowPlanned !== targetHours) continue;

    if (rowTs > bestTs || (rowTs === bestTs && i < bestOrder)) {
      bestTs = rowTs;
      bestOrder = i;
      best = {
        assignmentId: safeStr(row[0]),
        status: 'Completed',
        planned: safeNum(row[5]),
        logged: safeNum(row[7]),
        remaining: safeNum(row[8])
      };
    }
  }
  return best;
}

function handleSubmitCore(collector, task, hours, actionType, notes, normCol, normTask) {
  var sheet = getSheet(TASKFLOW_SHEETS.ASSIGNMENTS);
  var data = sheet.getDataRange().getValues();
  var now = new Date();
  var nowMs = now.getTime();
  var latest = getLatestAssignmentState(data, normCol, normTask);
  var latestTaskId = latest ? safeStr(latest.taskId) : '';
  var latestAssignedDate = latest ? latest.assignedDate : now;
  var latestWeekStart = latest ? safeStr(latest.weekStart) : getWeekStart(now);

  if (actionType === 'ASSIGN') {
    var dupAssign = findRecentOpenAssignment(data, normCol, normTask, hours, nowMs);
    if (dupAssign) {
      return {
        success: true,
        duplicate: true,
        message: 'Assign already logged recently',
        assignmentId: dupAssign.assignmentId,
        planned: dupAssign.planned,
        hours: dupAssign.logged,
        remaining: dupAssign.remaining,
        status: dupAssign.status
      };
    }

    var plannedAssign = Math.max(0, safeNum(hours));
    var aId = 'A-' + Date.now();
    insertAssignmentLogRow(sheet, [aId, latestTaskId, task, collector, now, plannedAssign, 'In Progress', 0, plannedAssign, '', notes, getWeekStart(now)]);
    refreshPostSubmitCaches(collector);
    return { success: true, message: 'Assigned: ' + task, assignmentId: aId, planned: plannedAssign, hours: 0, remaining: plannedAssign, status: 'In Progress' };
  }

  if (actionType === 'COMPLETE') {
    var dupComplete = findRecentCompletedAssignment(data, normCol, normTask, hours, nowMs);
    if (dupComplete) {
      return {
        success: true,
        duplicate: true,
        message: 'Complete already logged recently',
        assignmentId: dupComplete.assignmentId,
        hours: dupComplete.logged || hours,
        planned: dupComplete.planned || hours,
        remaining: dupComplete.remaining,
        status: dupComplete.status
      };
    }

    var prevLogged = latest ? safeNum(latest.logged) : 0;
    var prevPlanned = latest ? safeNum(latest.planned) : 0;
    var plannedComplete = prevPlanned > 0 ? prevPlanned : Math.max(0, safeNum(hours));
    var newLogged = prevLogged + Math.max(0, safeNum(hours));
    var remComplete = Math.max(0, plannedComplete - newLogged);
    var fId = 'A-' + Date.now();
    insertAssignmentLogRow(sheet, [fId, latestTaskId, task, collector, latestAssignedDate, plannedComplete, 'Completed', newLogged, remComplete, now, notes, latestWeekStart || getWeekStart(now)]);
    refreshPostSubmitCaches(collector);
    return { success: true, message: 'Completed: ' + task, assignmentId: fId, hours: newLogged, planned: plannedComplete, remaining: remComplete, status: 'Completed' };
  }

  if (actionType === 'CANCEL') {
    var cancelId = 'A-' + Date.now();
    insertAssignmentLogRow(sheet, [cancelId, latestTaskId, task, collector, latestAssignedDate, latest ? safeNum(latest.planned) : 0, 'Canceled', latest ? safeNum(latest.logged) : 0, latest ? safeNum(latest.remaining) : 0, now, notes, latestWeekStart || getWeekStart(now)]);
    refreshPostSubmitCaches(collector);
    return { success: true, message: 'Canceled: ' + task, assignmentId: cancelId, status: 'Canceled' };
  }

  if (actionType === 'NOTE_ONLY') {
    if (!notes) return { success: false, message: 'No note text provided' };
    var noteStatus = latest ? safeStr(latest.status) : 'In Progress';
    var noteId = 'A-' + Date.now();
    insertAssignmentLogRow(sheet, [noteId, latestTaskId, task, collector, latestAssignedDate, latest ? safeNum(latest.planned) : 0, noteStatus || 'In Progress', latest ? safeNum(latest.logged) : 0, latest ? safeNum(latest.remaining) : 0, latest ? latest.completedDate : '', notes, latestWeekStart || getWeekStart(now)]);
    refreshPostSubmitCaches(collector);
    return { success: true, message: 'Note saved', assignmentId: noteId, status: noteStatus || 'In Progress' };
  }

  return { success: false, message: 'Unsupported actionType: ' + actionType };
}

function handleSubmit(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Invalid submit payload: expected JSON object with collector/task/actionType');
  }
  var collector = safeStr(body.collector);
  var task = safeStr(body.task);
  var hours = safeNum(body.hours);
  var actionType = safeStr(body.actionType);
  var notes = safeStr(body.notes);
  var requestId = safeStr(body.requestId);
  if (!collector) throw new Error('Missing collector');
  if (!task) throw new Error('Missing task');
  if (!actionType) throw new Error('Missing actionType');

  var normCol = normalizeCollectorKey(collector);
  var normTask = normalizeTaskKey(task);
  var fingerprint = buildSubmitFingerprint(collector, task, actionType, hours, notes);
  var cacheInfo = getSubmitCacheInfo(requestId, fingerprint);
  var cached = readCachedSubmitResult(cacheInfo.key);
  if (cached) {
    cached.duplicate = true;
    cached.message = cached.message || 'Duplicate submit ignored';
    return cached;
  }

  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  try {
    try {
      lock.waitLock(5000);
      lockAcquired = true;
    } catch (e) {}

    cached = readCachedSubmitResult(cacheInfo.key);
    if (cached) {
      cached.duplicate = true;
      cached.message = cached.message || 'Duplicate submit ignored';
      return cached;
    }

    var result = handleSubmitCore(collector, task, hours, actionType, notes, normCol, normTask);
    writeCachedSubmitResult(cacheInfo, result);
    return result;
  } finally {
    if (lockAcquired) {
      try { lock.releaseLock(); } catch (e2) {}
    }
  }
}

function getWeekStart(d) {
  var dt = getWeekStartDate(new Date(d));
  return Utilities.formatDate(dt, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
