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
 *   CA_PLUS (preferred for live upload stats) or CA_TAGGED
 *   CA_INDEX
 *   Task Actuals | Redashpull   (or Collector Actuals | RedashPull — script tries both)
 *   Collector Task Assignments Log
 *   RS_Task_Req
 *   _AppCache
 *
 * SHEET MAPPINGS:
 *   Collectors:     A=Name B=Rig-ID C=Email D=WeeklyCap E=Active F=HoursUploaded G=Rating
 *   CA_PLUS:        A=Date B=RigID  C=TaskName D=Hours (extra columns allowed)
 *   CA_TAGGED:      A=Date B=RigID  C=Site  D=Collector E=TaskName F=Hours (fallback)
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

function assertSheetConfig_() {
  var required = ['COLLECTORS', 'TASK_LIST', 'ASSIGNMENTS', 'RS_TASK_REQ', 'APP_CACHE'];
  for (var i = 0; i < required.length; i++) {
    var key = required[i];
    if (!TASKFLOW_SHEETS[key]) {
      throw new Error('Missing TASKFLOW_SHEETS key: ' + key + '. Check for duplicate globals or stale files in Apps Script.');
    }
  }
}

function doGet(e) {
  try {
    assertSheetConfig_();
    var action = (e.parameter.action || '').trim();
    var period = (e.parameter.period || '').trim();
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
      case 'getAppCache':           result = handleGetAppCache(); break;
      case 'refreshCache':          result = handleRefreshCache(e.parameter.collector || ''); break;
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
    var body = JSON.parse(e.postData.contents);
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
  var tz = Session.getScriptTimeZone();
  var parts = Utilities.formatDate(now, tz, 'yyyy,M,d').split(',');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function getWeekStartDate(refDate) {
  var dt = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
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
  var map = {};
  var rows = getCollectorRows();
  for (var i = 0; i < rows.length; i++) {
    var cName = normalizeCollectorKey(rows[i].name);
    var rig = safeStr(rows[i].rigId).toLowerCase();
    if (cName && rig) map[cName] = rig;
  }
  return map;
}

/**
 * Returns normalized collector upload rows from CA_PLUS (preferred) or CA_TAGGED (fallback).
 * Output row shape: { date: Date|null, rigId: string, collector: string, taskName: string, taskKey: string, hours: number, site: string }
 */
function getCollectorActualRows() {
  var ss = getSS();
  var sourceSheet = ss.getSheetByName(TASKFLOW_SHEETS.CA_PLUS) || ss.getSheetByName(TASKFLOW_SHEETS.CA_TAGGED);
  if (!sourceSheet) return [];

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
    if (!rigId || !taskName) continue;

    out.push({
      date: toDateSafe(r[idxDate]),
      rigId: rigId,
      collector: safeStr(r[idxCollector]),
      taskName: taskName,
      taskKey: normalizeTaskKey(taskName),
      hours: safeNum(r[idxHours]),
      site: idxSite >= 0 ? safeStr(r[idxSite]).toUpperCase() : ''
    });
  }
  return out;
}

function buildLiveHoursIndex(actualRows) {
  var index = {};
  for (var i = 0; i < actualRows.length; i++) {
    var row = actualRows[i];
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
    var cHours = safeNum(collectorsData[i].hoursUploaded);
    if (cName) {
      var region = getRegionFromRigId(cRig);
      collectorMeta[normalizeCollectorKey(cName)] = { name: cName, hoursUploaded: cHours, rig: cRig, region: region };
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
    var tCol = row.collector;
    if (!tCol && tRig) tCol = rigToName[tRig] || '';
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

  var map = {};
  for (var a = 1; a < assignData.length; a++) {
    var aRow = assignData[a];
    var collector = safeStr(aRow[3]);
    if (!collector) continue;
    var key = normalizeCollectorKey(collector);

    // For weekly views, only include assignments whose AssignedDate falls in the requested week.
    if (useWeekly) {
      var d = toDateSafe(aRow[4]);
      if (!d || d < weekRange.start || d > weekRange.end) continue;
    }

    var hours = safeNum(aRow[7]);
    var status = safeStr(aRow[6]).toLowerCase();
    var isCompleted = (status === 'completed' || status === 'complete');

    if (!map[key]) {
      var reg = taggedRegion[key] || (collectorMeta[key] ? collectorMeta[key].region : 'MX');
      map[key] = { rank: 0, collectorName: collector, hoursLogged: 0, tasksCompleted: 0, tasksAssigned: 0, completionRate: 0, region: reg };
    }
    map[key].hoursLogged += hours;
    map[key].tasksAssigned += 1;
    if (isCompleted) map[key].tasksCompleted += 1;
  }

  // Overlay upload-hours from collector actuals (CA_PLUS preferred). This keeps hours "live" from rig keyed ingest.
  for (var ahKey in actualHoursByCollector) {
    if (!map[ahKey]) {
      var metaFromCollector = collectorMeta[ahKey];
      var displayName = (metaFromCollector && metaFromCollector.name) || actualNameByCollector[ahKey] || ahKey;
      var regionFromCollector = taggedRegion[ahKey] || (metaFromCollector ? metaFromCollector.region : 'MX');
      map[ahKey] = {
        rank: 0,
        collectorName: displayName,
        hoursLogged: 0,
        tasksCompleted: 0,
        tasksAssigned: 0,
        completionRate: 0,
        region: regionFromCollector
      };
    }
    if (actualHoursByCollector[ahKey] > map[ahKey].hoursLogged) {
      map[ahKey].hoursLogged = actualHoursByCollector[ahKey];
    }
  }

  // For all‑time view (older clients), keep the fallback that uses collectors.hoursUploaded.
  if (!useWeekly) {
    for (var ck in collectorMeta) {
      var meta = collectorMeta[ck];
      if (map[ck]) {
        if (meta.hoursUploaded > map[ck].hoursLogged) {
          map[ck].hoursLogged = meta.hoursUploaded;
        }
      } else if (meta.hoursUploaded > 0) {
        map[ck] = { rank: 0, collectorName: meta.name, hoursLogged: meta.hoursUploaded, tasksCompleted: 0, tasksAssigned: 0, completionRate: 0, region: meta.region };
      }
    }
  }

  var entries = [];
  for (var k in map) {
    var en = map[k];
    if (en.hoursLogged <= 0 && en.tasksAssigned <= 0) continue;
    en.hoursLogged = Math.round(en.hoursLogged * 100) / 100;
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
  if (!collectorName) throw new Error('Missing collector');
  var normName = normalizeCollectorKey(collectorName);

  var collectorsData = getCollectorRows();
  var myRig = '', myHoursUploaded = 0;
  for (var c = 0; c < collectorsData.length; c++) {
    if (normalizeCollectorKey(collectorsData[c].name) === normName) {
      myRig = safeStr(collectorsData[c].rigId).toLowerCase();
      myHoursUploaded = safeNum(collectorsData[c].hoursUploaded);
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

  for (var a = 1; a < assignData.length; a++) {
    var row = assignData[a];
    var aCol = normalizeCollectorKey(row[3]);
    if (aCol !== normName) continue;
    totalAssigned++;
    var st = safeStr(row[6]).toLowerCase();
    var logged = safeNum(row[7]);
    var planned = safeNum(row[5]);
    totalLoggedHours += logged;
    totalPlannedHours += planned;
    if (st === 'completed' || st === 'complete') totalCompleted++;
    else if (st === 'canceled' || st === 'cancelled') totalCanceled++;
    var assignDate = toDateSafe(row[4]);
    if (assignDate && assignDate >= weekStart) {
      weeklyLoggedHours += logged;
      if (st === 'completed' || st === 'complete') weeklyCompleted++;
    }
    topTasks.push({ name: safeStr(row[2]), hours: Math.round(logged * 100) / 100, status: safeStr(row[6]) });
  }

  var actualRows = getCollectorActualRows();
  var actualHours = 0, actualWeeklyHours = 0;
  var actualTaskSet = {};
  for (var t = 0; t < actualRows.length; t++) {
    var ar = actualRows[t];
    var aRig = ar.rigId;
    var aCol = normalizeCollectorKey(ar.collector);
    if (aCol === normName || (myRig && aRig === myRig)) {
      actualHours += safeNum(ar.hours);
      if (ar.taskKey) actualTaskSet[ar.taskKey] = true;
      if (ar.date && ar.date >= weekStart) {
        actualWeeklyHours += safeNum(ar.hours);
      }
    }
  }

  var actualTaskCount = Object.keys(actualTaskSet).length;
  if (actualHours > totalLoggedHours) totalLoggedHours = actualHours;
  if (actualWeeklyHours > weeklyLoggedHours) weeklyLoggedHours = actualWeeklyHours;
  if (actualTaskCount > totalAssigned) totalAssigned = actualTaskCount;
  if (myHoursUploaded > totalLoggedHours) totalLoggedHours = myHoursUploaded;

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
  var results = [];
  for (var i = 1; i < assignData.length; i++) {
    var row = assignData[i];
    var aCol = normalizeCollectorKey(row[3]);
    if (aCol !== normName) continue;
    var assignDate = toDateSafe(row[4]);
    var dateStr = assignDate ? Utilities.formatDate(assignDate, Session.getScriptTimeZone(), 'yyyy-MM-dd') : safeStr(row[4]);
    var status = safeStr(row[6]);
    var isActive = status.toLowerCase() === 'in progress' || status.toLowerCase() === 'partial';
    var plannedHours = safeNum(row[5]);
    var loggedHours = safeNum(row[7]);
    var remainingHours = safeNum(row[8]);
    var taskKey = normalizeTaskKey(row[2]);
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

    if (dateStr === todayStr || isActive) {
      results.push({
        assignmentId: safeStr(row[0]), taskId: safeStr(row[1]), taskName: safeStr(row[2]),
        status: status, loggedHours: Math.round(loggedHours * 100) / 100, plannedHours: Math.round(plannedHours * 100) / 100,
        remainingHours: Math.round(remainingHours * 100) / 100, notes: safeStr(row[10]),
        taskCollectedHours: Math.round(taskCollected * 100) / 100,
        taskGoodHours: Math.round(taskGood * 100) / 100,
        taskRemainingHours: Math.round(taskRemaining * 100) / 100,
        taskProgressPct: taskProgressPct,
        assignedDate: dateStr, completedDate: safeStr(row[9])
      });
    }
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
  var results = [];
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

    results.push({
      collector: collector, taskName: safeStr(data[i][2]), status: status,
      loggedHours: Math.round(loggedHours * 100) / 100, plannedHours: Math.round(plannedHours * 100) / 100,
      remainingHours: Math.round(remainingHours * 100) / 100,
      taskCollectedHours: Math.round(taskCollected * 100) / 100,
      taskGoodHours: Math.round(taskGood * 100) / 100,
      taskRemainingHours: Math.round(taskRemaining * 100) / 100,
      taskProgressPct: taskProgressPct,
      assignedDate: safeStr(data[i][4])
    });
  }
  writeCache(normFilter ? ('fullLog_' + normFilter) : 'fullLog_all', results);
  return results;
}

function handleGetTaskActuals() {
  var data = getTaskActualRows();

  // Build collector data from CA_PLUS (preferred) or CA_TAGGED (fallback)
  var actualRows = getCollectorActualRows();
  var rigToCollectorName = {};
  var collectorsData = getCollectorRows();
  for (var c = 0; c < collectorsData.length; c++) {
    var rig = safeStr(collectorsData[c].rigId).toLowerCase();
    var name = safeStr(collectorsData[c].name);
    if (rig && name) rigToCollectorName[rig] = name;
  }

  // Map: taskName (lower) -> { collectors: { name -> totalHours }, totalUploaded }
  var taskCollectorMap = {};
  for (var t = 0; t < actualRows.length; t++) {
    var ar = actualRows[t];
    var tTask = ar.taskKey;
    var tCollector = safeStr(ar.collector);
    if (!tCollector && ar.rigId) tCollector = rigToCollectorName[ar.rigId] || ar.rigId;
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
  var totalCollectors = 0, totalHoursUploaded = 0;
  var collectorSummary = [];
  for (var c = 0; c < collectorsData.length; c++) {
    var nm = safeStr(collectorsData[c].name);
    if (!nm) continue;
    totalCollectors++;
    var hrs = safeNum(collectorsData[c].hoursUploaded);
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
 * Count unique rigs that have an upload today from CA_PLUS (preferred) or CA_TAGGED (fallback).
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

function handleGetAppCache() {
  var cacheSheet;
  try { cacheSheet = getOrCreateCacheSheet(); } catch(e) { return {}; }
  var data = cacheSheet.getDataRange().getValues();
  var cache = {};
  for (var i = 1; i < data.length; i++) {
    var key = safeStr(data[i][0]);
    if (!key) continue;
    try { cache[key] = { value: JSON.parse(data[i][1]), updatedAt: safeStr(data[i][2]) }; }
    catch(e) { cache[key] = { value: data[i][1], updatedAt: safeStr(data[i][2]) }; }
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
    var cacheSheet = getOrCreateCacheSheet();
    var data = cacheSheet.getDataRange().getValues();
    var targetRow = -1;
    var existingJson = '';
    for (var i = 0; i < data.length; i++) {
      if (safeStr(data[i][0]) === key) {
        targetRow = i + 1;
        existingJson = safeStr(data[i][1]);
        break;
      }
    }

    var nextJson = JSON.stringify(value);
    if (targetRow !== -1 && existingJson === nextJson) return;

    if (targetRow === -1) targetRow = Math.max(data.length + 1, 2);
    cacheSheet.getRange(targetRow, 1, 1, 3).setValues([[key, nextJson, new Date().toISOString()]]);
  } catch(e) {}
}

function handleRefreshCache(collectorName) {
  var collectors = handleGetCollectors();
  var tasks = handleGetTasks();
  var thisWeek = handleGetLeaderboard('thisWeek');
  var lastWeek = handleGetLeaderboard('lastWeek');
  var admin = handleGetAdminDashboard();
  var taskActuals = handleGetTaskActuals();
  var recollections = handleGetRecollections();
  var activeRigs = handleGetActiveRigsCount();

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
    collectors: collectors.length,
    tasks: tasks.length,
    leaderboardThisWeek: thisWeek.length,
    leaderboardLastWeek: lastWeek.length,
    taskActuals: taskActuals.length,
    recollections: recollections.length,
    activeRigsToday: activeRigs.activeRigsToday,
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

function handleSubmit(body) {
  var collector = safeStr(body.collector);
  var task = safeStr(body.task);
  var hours = safeNum(body.hours);
  var actionType = safeStr(body.actionType);
  var notes = safeStr(body.notes);
  if (!collector) throw new Error('Missing collector');
  if (!task) throw new Error('Missing task');
  if (!actionType) throw new Error('Missing actionType');

  var sheet = getSheet(TASKFLOW_SHEETS.ASSIGNMENTS);
  var data = sheet.getDataRange().getValues();

  if (actionType === 'ASSIGN') {
    var aId = 'A-' + Date.now();
    sheet.appendRow([aId, '', task, collector, new Date(), hours, 'In Progress', 0, hours, '', notes, getWeekStart(new Date())]);
    refreshPostSubmitCaches(collector);
    return { success: true, message: 'Assigned: ' + task, assignmentId: aId, planned: hours, hours: 0, remaining: hours, status: 'In Progress' };
  }

  var normCol = collector.toLowerCase().replace(/\s+/g, ' ');
  var normTask = task.toLowerCase().replace(/[_\s]+/g, ' ');

  for (var i = data.length - 1; i >= 1; i--) {
    var rCol = safeStr(data[i][3]).toLowerCase().replace(/\s+/g, ' ');
    var rTask = safeStr(data[i][2]).toLowerCase().replace(/[_\s]+/g, ' ');
    var rStatus = safeStr(data[i][6]).toLowerCase();
    if (rCol !== normCol || rTask !== normTask) continue;
    if (rStatus !== 'in progress' && rStatus !== 'partial') continue;

    var ri = i + 1;
    var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');

    if (actionType === 'COMPLETE') {
      var prev = safeNum(data[i][7]);
      var newL = prev + hours;
      var pln = safeNum(data[i][5]);
      var rem = Math.max(0, pln - newL);
      sheet.getRange(ri, 7).setValue('Completed');
      sheet.getRange(ri, 8).setValue(newL > 0 ? newL : hours);
      sheet.getRange(ri, 9).setValue(rem);
      sheet.getRange(ri, 10).setValue(new Date());
      if (notes) { var pn = safeStr(data[i][10]); sheet.getRange(ri, 11).setValue(pn + (pn ? '\n' : '') + '--- ' + ts + ' ---\n' + notes); }
      refreshPostSubmitCaches(collector);
      return { success: true, message: 'Completed: ' + task, hours: newL || hours, planned: pln, remaining: rem, status: 'Completed' };
    }
    if (actionType === 'CANCEL') {
      sheet.getRange(ri, 7).setValue('Canceled');
      sheet.getRange(ri, 10).setValue(new Date());
      if (notes) { var cn = safeStr(data[i][10]); sheet.getRange(ri, 11).setValue(cn + (cn ? '\n' : '') + '--- ' + ts + ' --- CANCELED\n' + notes); }
      refreshPostSubmitCaches(collector);
      return { success: true, message: 'Canceled: ' + task, status: 'Canceled' };
    }
    if (actionType === 'NOTE_ONLY' && notes) {
      var en = safeStr(data[i][10]);
      sheet.getRange(ri, 11).setValue(en + (en ? '\n' : '') + '--- ' + ts + ' ---\n' + notes);
      refreshPostSubmitCaches(collector);
      return { success: true, message: 'Note saved', status: safeStr(data[i][6]) };
    }
    break;
  }

  if (actionType === 'COMPLETE') {
    var fId = 'A-' + Date.now();
    sheet.appendRow([fId, '', task, collector, new Date(), hours, 'Completed', hours, 0, new Date(), notes, getWeekStart(new Date())]);
    refreshPostSubmitCaches(collector);
    return { success: true, message: 'Completed (new): ' + task, assignmentId: fId, hours: hours, planned: hours, remaining: 0, status: 'Completed' };
  }

  return { success: false, message: 'No open assignment found for: ' + task };
}

function getWeekStart(d) {
  var dt = getWeekStartDate(new Date(d));
  return Utilities.formatDate(dt, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
