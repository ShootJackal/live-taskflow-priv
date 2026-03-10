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
 *   Collector Rig History Log (auto-created if missing)
 *   Live Alerts (auto-created if missing)
 *   Collector Awards (auto-created if missing)
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
 *   Rig History:    A=EventTs B=Collector C=Rig D=Event E=SessionStart F=SessionEnd G=SessionHours H=Source I=WeekStart J=Notes
 *   Live Alerts:    A=AlertID B=Message C=Level D=Target E=CreatedAt F=CreatedBy G=Active
 *   Collector Awards: A=AwardID B=Collector C=Award D=Pinned E=GrantedBy F=GrantedAt G=Notes
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
  RIG_HISTORY: 'Collector Rig History Log',
  LIVE_ALERTS: 'Live Alerts',
  COLLECTOR_AWARDS: 'Collector Awards',
  RS_TASK_REQ: 'RS_Task_Req',
  APP_CACHE: '_AppCache'
};
// Backward-compat alias for projects that still reference SHEETS in old helper snippets.
var SHEETS = TASKFLOW_SHEETS;
var SF_RIG_NUMBERS = { '2': true, '3': true, '4': true, '5': true, '6': true, '9': true, '11': true };

// ── SF Rig Assignment System ─────────────────────────────────────────────────
// SF rig numbers as an ordered list for the SOD picker UI.
var SF_RIG_LIST = [2, 3, 4, 5, 6, 9, 11];

// SF team collectors. Add names here when the team grows.
// Comparison is case/whitespace-insensitive (uses normalizeCollectorKey).
var SF_COLLECTORS_LIST = ['Travis', 'Tony', 'Veronika'];

// Historical rig-to-collector mapping for last week's leaderboard attribution.
// Used as a fallback when no Rig History Log entry exists for a rig.
// Update this map whenever collectors swap rigs semi-permanently.
var SF_HISTORICAL_RIG_MAP = {
  '2': 'Travis',
  '3': 'Tony',
  '4': 'Travis',
  '5': 'Tony',
  '6': 'Veronika',
  '9': 'Veronika'
  // rig 11 is unassigned historically
};

var CACHE_CELL_MAX_CHARS = 49000; // Sheets hard limit is ~50000 chars per cell.
var SUBMIT_DEDUP_WINDOW_MS = 2 * 60 * 1000;
var SUBMIT_REQUEST_TTL_SECONDS = 6 * 60 * 60;
var SUBMIT_FINGERPRINT_TTL_SECONDS = 2 * 60;
// Bump this when deploying logic/schema changes that alter derived metrics (reported vs actual, etc).
var TASKFLOW_DEPLOY_EPOCH = '2026-03-04-cache-epoch-1';
var GET_CACHE_TTL_MS = {
  collectors: 5 * 60 * 1000,
  tasks: 5 * 60 * 1000,
  leaderboard: 45 * 1000,
  collectorStats: 60 * 1000,
  todayLog: 20 * 1000,
  dailyCarryover: 20 * 1000,
  recollections: 60 * 1000,
  fullLog: 30 * 1000,
  taskActuals: 60 * 1000,
  adminDashboard: 60 * 1000,
  activeRigsCount: 30 * 1000,
  liveAlerts: 20 * 1000,
  collectorProfile: 60 * 1000,
  adminStartPlan: 90 * 1000
};
var _rigHistorySnapshot = null;

// MONOLITH STABILITY MAP
// FOUNDATION (stable, write-critical): these should change rarely.
// - doPost submit/write path (ASSIGN/COMPLETE/CANCEL/NOTE_ONLY)
// - admin write actions: ADMIN_ASSIGN_TASK, ADMIN_CANCEL_TASK, ADMIN_EDIT_HOURS
// - rig history + collector/task base reads: getCollectors, getTasks, getTodayLog, getFullLog
// - carryover resolution writes: CARRYOVER_REPORT, CARRYOVER_CANCEL
//
// VOLATILE (derived analytics/cached): safe iteration zone.
// - getLeaderboard, getCollectorStats, getCollectorProfile
// - getTaskActualsSheet, getAdminDashboardData, getAdminStartPlan
// - recollection/active-rig counts and cache warming/force repull
var FOUNDATION_ACTIONS = {
  getCollectors: true,
  getTasks: true,
  getTodayLog: true,
  getFullLog: true,
  getDailyCarryover: true
};
var VOLATILE_ACTIONS = {
  getLeaderboard: true,
  getCollectorStats: true,
  getCollectorProfile: true,
  getTaskActualsSheet: true,
  getAdminDashboardData: true,
  getAdminStartPlan: true,
  getRecollections: true,
  getActiveRigsCount: true,
  refreshCache: true,
  forceServerRepull: true
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
    case 'getDailyCarryover':
      return normCollector ? { key: 'dailyCarryover_' + normCollector, ttlMs: GET_CACHE_TTL_MS.dailyCarryover } : null;
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
    case 'getLiveAlerts':
      return { key: 'liveAlerts', ttlMs: GET_CACHE_TTL_MS.liveAlerts };
    case 'getCollectorProfile':
      return normCollector ? { key: 'collectorProfile_' + normCollector, ttlMs: GET_CACHE_TTL_MS.collectorProfile } : null;
    case 'getAdminStartPlan':
      return { key: 'adminStartPlan', ttlMs: GET_CACHE_TTL_MS.adminStartPlan };
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

function clearDerivedCaches_(reason) {
  var rowsCleared = 0;
  try {
    var cacheSheet = getOrCreateCacheSheet();
    var lastRow = cacheSheet.getLastRow();
    if (lastRow >= 2) {
      rowsCleared = lastRow - 1;
      cacheSheet.getRange(2, 1, rowsCleared, 3).clearContent();
    }
  } catch (e) {}

  _rigHistorySnapshot = null;

  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty('TASKFLOW_CACHE_LAST_RESET_AT', new Date().toISOString());
    props.setProperty('TASKFLOW_CACHE_LAST_RESET_REASON', safeStr(reason) || 'manual');
  } catch (e2) {}

  return {
    clearedAppCacheRows: rowsCleared,
    reason: safeStr(reason) || 'manual',
    at: new Date().toISOString()
  };
}

function ensureDeployEpoch_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var appliedEpoch = safeStr(props.getProperty('TASKFLOW_DEPLOY_EPOCH'));
    if (appliedEpoch === TASKFLOW_DEPLOY_EPOCH) return null;

    var resetInfo = clearDerivedCaches_('deploy_epoch_change');
    props.setProperty('TASKFLOW_DEPLOY_EPOCH', TASKFLOW_DEPLOY_EPOCH);
    props.setProperty('TASKFLOW_DEPLOY_EPOCH_APPLIED_AT', new Date().toISOString());
    return resetInfo;
  } catch (e) {
    return null;
  }
}

function handleForceServerRepull(collectorName, scope, reason) {
  var resetInfo = clearDerivedCaches_('manual_force_repull:' + safeStr(reason));
  var warm = handleRefreshCache(collectorName || '', scope || 'full');
  return { reset: resetInfo, warmed: warm };
}

function doGet(e) {
  try {
    assertSheetConfig_();
    ensureDailyRollover_();
    ensureDeployEpoch_();
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
      case 'getDailyCarryover':     result = handleGetDailyCarryover(e.parameter.collector || ''); break;
      case 'getPendingReview':      result = handleGetPendingReview(e.parameter); break;
      case 'getRecollections':      result = handleGetRecollections(); break;
      case 'getFullLog':            result = handleGetFullLog(e.parameter.collector || ''); break;
      case 'getTaskActualsSheet':   result = handleGetTaskActuals(); break;
      case 'getAdminDashboardData': result = handleGetAdminDashboard(); break;
      case 'getActiveRigsCount':    result = handleGetActiveRigsCount(); break;
      case 'getLiveAlerts':         result = handleGetLiveAlerts(); break;
      case 'getCollectorProfile':        result = handleGetCollectorProfile(e.parameter.collector || ''); break;
      case 'getAdminStartPlan':          result = handleGetAdminStartPlan(); break;
      case 'getAppCache':                result = handleGetAppCache(e.parameter.keys || ''); break;
      case 'refreshCache':               result = handleRefreshCache(e.parameter.collector || '', e.parameter.scope || ''); break;
      case 'forceServerRepull':          result = handleForceServerRepull(e.parameter.collector || '', e.parameter.scope || 'full', e.parameter.reason || ''); break;
      case 'getRigStatus':               result = handleGetRigStatus(); break;
      case 'getPendingSwitchRequests':   result = handleGetPendingSwitchRequests(e.parameter || {}); break;
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
    ensureDailyRollover_();
    ensureDeployEpoch_();
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

    var metaAction = safeStr(body && body.metaAction).toUpperCase();
    if (metaAction === 'SET_RIG') {
      var rigResult = handleLogCollectorRig(body);
      return jsonOut({ success: true, data: rigResult, message: rigResult.message || 'Rig event logged' });
    }
    if (metaAction === 'PUSH_ALERT') {
      var alertResult = handlePushLiveAlert(body);
      return jsonOut({ success: true, data: alertResult, message: alertResult.message || 'Alert sent' });
    }
    if (metaAction === 'ADMIN_ASSIGN_TASK') {
      var adminAssign = handleAdminAssignTask(body);
      return jsonOut({ success: true, data: adminAssign, message: adminAssign.message || 'Task assigned' });
    }
    if (metaAction === 'ADMIN_CANCEL_TASK') {
      var adminCancel = handleAdminCancelTask(body);
      return jsonOut({ success: true, data: adminCancel, message: adminCancel.message || 'Task canceled' });
    }
    if (metaAction === 'ADMIN_EDIT_HOURS') {
      var adminEdit = handleAdminEditHours(body);
      return jsonOut({ success: true, data: adminEdit, message: adminEdit.message || 'Hours updated' });
    }
    if (metaAction === 'GRANT_AWARD') {
      var awardResult = handleGrantAward(body);
      return jsonOut({ success: true, data: awardResult, message: awardResult.message || 'Award granted' });
    }
    if (metaAction === 'CARRYOVER_REPORT') {
      var carryReport = handleCarryoverReport(body);
      return jsonOut({ success: true, data: carryReport, message: carryReport.message || 'Carryover reported' });
    }
    if (metaAction === 'CARRYOVER_CANCEL') {
      var carryCancel = handleCarryoverCancel(body);
      return jsonOut({ success: true, data: carryCancel, message: carryCancel.message || 'Carryover canceled' });
    }
    if (metaAction === 'FORCE_SERVER_REPULL') {
      var forceResult = handleForceServerRepull(body.collector || '', body.scope || 'full', body.reason || '');
      return jsonOut({ success: true, data: forceResult, message: 'Server repull completed' });
    }
    if (metaAction === 'ASSIGN_RIG_SOD') {
      var assignRig = handleAssignRigSOD(body);
      return jsonOut({ success: true, data: assignRig, message: assignRig.message || 'Rig assigned' });
    }
    if (metaAction === 'RELEASE_RIG') {
      var releaseRig = handleReleaseRig(body);
      return jsonOut({ success: true, data: releaseRig, message: releaseRig.message || 'Rig released' });
    }
    if (metaAction === 'REQUEST_RIG_SWITCH') {
      var switchReq = handleRequestRigSwitch(body);
      return jsonOut({ success: true, data: switchReq, message: switchReq.message || 'Switch requested' });
    }
    if (metaAction === 'RESPOND_RIG_SWITCH') {
      var switchResp = handleRespondRigSwitch(body);
      return jsonOut({ success: true, data: switchResp, message: switchResp.message || 'Response recorded' });
    }
    if (metaAction === 'CLEAR_ALL_ALERTS') {
      var clearResult = handleClearAllAlerts();
      return jsonOut({ success: true, data: clearResult, message: 'Cleared ' + clearResult.cleared + ' alerts' });
    }

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

function handleLogCollectorRig(body) {
  var collector = safeStr(body && body.collector);
  var rig = safeStr(body && body.rig);
  var source = safeStr(body && body.source) || 'TOOLS';
  var notes = safeStr(body && body.notes);
  if (!collector) throw new Error('Missing collector');
  if (!rig) throw new Error('Missing rig');

  var eventAt = new Date();
  if (body && body.at) {
    var parsed = new Date(body.at);
    if (!isNaN(parsed.getTime())) eventAt = parsed;
  }
  return logCollectorRigEvent(collector, rig, source, notes, eventAt);
}

function getOrCreateLiveAlertsSheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName(TASKFLOW_SHEETS.LIVE_ALERTS);
  if (!sheet) {
    sheet = ss.insertSheet(TASKFLOW_SHEETS.LIVE_ALERTS);
  }
  if (sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, 7).setValues([[
      'AlertID',
      'Message',
      'Level',
      'Target',
      'CreatedAt',
      'CreatedBy',
      'Active'
    ]]);
  }
  return sheet;
}

function handlePushLiveAlert(body) {
  var message = safeStr(body && body.message);
  if (!message) throw new Error('Missing message');
  if (message === '__CLEAR_ALL__') { return handleClearAllAlerts_(); }

  var level      = safeStr(body && body.level).toUpperCase() || 'INFO';
  var target     = safeStr(body && body.target).toUpperCase() || 'ALL';
  var createdBy  = safeStr(body && body.createdBy) || safeStr(body && body.collector) || 'ADMIN';
  var expiryHours = safeNum(body && body.expiryHours);
  var now = new Date();
  var alertId = 'AL-' + now.getTime();
  var expiresAt = '';
  if (expiryHours > 0 && expiryHours <= 720) {
    expiresAt = new Date(now.getTime() + expiryHours * 3600000).toISOString();
  }
  var sheet = getOrCreateLiveAlertsSheet();
  if (sheet.getLastColumn() < 8) { sheet.getRange(1, 8).setValue('ExpiresAt'); }
  sheet.insertRows(2, 1);
  sheet.getRange(2, 1, 1, 8).setValues([[alertId, message, level, target, now.toISOString(), createdBy, true, expiresAt]]);
  var latest = handleGetLiveAlerts();
  writeCache('liveAlerts', latest);
  return { id: alertId, message: message, level: level, target: target, createdAt: now.toISOString(), createdBy: createdBy, expiresAt: expiresAt, success: true };
}

function handleClearAllAlerts_() {
  var sheet;
  try { sheet = getOrCreateLiveAlertsSheet(); } catch (e) { return { success: true, cleared: 0 }; }
  var data = sheet.getDataRange().getValues();
  var cleared = 0;
  for (var i = 1; i < data.length; i++) {
    var activeRaw = safeStr(data[i][6]).toLowerCase();
    if (!(activeRaw === 'false' || activeRaw === '0' || activeRaw === 'no')) {
      sheet.getRange(i + 1, 7).setValue(false);
      cleared++;
    }
  }
  writeCache('liveAlerts', []);
  return { success: true, cleared: cleared };
}

function handleGetLiveAlerts() {
  var sheet;
  try {
    sheet = getOrCreateLiveAlertsSheet();
  } catch (e) {
    return [];
  }

  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];

  var out = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var id = safeStr(row[0]);
    var msg = safeStr(row[1]);
    if (!id || !msg) continue;

    var activeRaw = safeStr(row[6]).toLowerCase();
    var isActive = !(activeRaw === 'false' || activeRaw === '0' || activeRaw === 'no');
    if (!isActive) continue;
    var expiresAt = safeStr(row[7]);
    if (expiresAt) {
      var expDate = new Date(expiresAt);
      if (!isNaN(expDate.getTime()) && expDate.getTime() < Date.now()) {
        sheet.getRange(i + 1, 7).setValue(false);
        continue;
      }
    }
    out.push({
      id: id,
      message: msg,
      level: safeStr(row[2]).toUpperCase() || 'INFO',
      target: safeStr(row[3]).toUpperCase() || 'ALL',
      createdAt: safeStr(row[4]),
      createdBy: safeStr(row[5])
    });
    if (out.length >= 25) break;
  }

  writeCache('liveAlerts', out);
  return out;
}

function toBool(v) {
  if (typeof v === 'boolean') return v;
  var s = safeStr(v).toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 'on';
}

function normalizeAssignmentStatusText(status) {
  var s = safeStr(status).toLowerCase();
  if (s === 'completed' || s === 'complete' || s === 'done' || s === 'finished') return 'Completed';
  if (s === 'canceled' || s === 'cancelled' || s === 'cancel') return 'Canceled';
  if (s === 'partial') return 'Partial';
  return 'In Progress';
}

function getOrCreateCollectorAwardsSheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName(TASKFLOW_SHEETS.COLLECTOR_AWARDS);
  if (!sheet) sheet = ss.insertSheet(TASKFLOW_SHEETS.COLLECTOR_AWARDS);
  if (sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, 7).setValues([[
      'AwardID',
      'Collector',
      'Award',
      'Pinned',
      'GrantedBy',
      'GrantedAt',
      'Notes'
    ]]);
  }
  return sheet;
}

function enforcePinnedAwardLimit(sheet, collectorName) {
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return;
  var normCollector = normalizeCollectorKey(collectorName);
  var pinnedRows = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (normalizeCollectorKey(row[1]) !== normCollector) continue;
    if (!toBool(row[3])) continue;
    pinnedRows.push(i + 1);
  }
  if (pinnedRows.length <= 3) return;
  for (var p = 3; p < pinnedRows.length; p++) {
    sheet.getRange(pinnedRows[p], 4).setValue(false);
  }
}

function getCollectorAwards(collectorName) {
  var sheet = getSS().getSheetByName(TASKFLOW_SHEETS.COLLECTOR_AWARDS);
  if (!sheet) return { all: [], pinned: [] };
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return { all: [], pinned: [] };

  var normCollector = normalizeCollectorKey(collectorName);
  var all = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (normalizeCollectorKey(row[1]) !== normCollector) continue;
    var awardName = safeStr(row[2]);
    if (!awardName) continue;
    all.push({
      id: safeStr(row[0]),
      award: awardName,
      pinned: toBool(row[3]),
      grantedBy: safeStr(row[4]),
      grantedAt: safeStr(row[5]),
      notes: safeStr(row[6])
    });
  }
  var pinned = [];
  for (var a = 0; a < all.length; a++) {
    if (all[a].pinned) pinned.push(all[a]);
    if (pinned.length >= 3) break;
  }
  return { all: all, pinned: pinned };
}

function handleGrantAward(body) {
  var collector = safeStr(body && body.collector);
  var award = safeStr(body && body.award);
  if (!collector) throw new Error('Missing collector');
  if (!award) throw new Error('Missing award');

  var grantedBy = safeStr(body && body.grantedBy) || 'ADMIN';
  var notes = safeStr(body && body.notes);
  var pinned = toBool(body && body.pinned);
  var now = new Date();
  var id = 'AW-' + now.getTime();

  var sheet = getOrCreateCollectorAwardsSheet();
  sheet.insertRowsBefore(2, 1);
  sheet.getRange(2, 1, 1, 7).setValues([[
    id,
    collector,
    award,
    pinned,
    grantedBy,
    now.toISOString(),
    notes
  ]]);
  if (pinned) enforcePinnedAwardLimit(sheet, collector);

  var normCollector = normalizeCollectorKey(collector);
  var profile = handleGetCollectorProfile(collector);
  writeCache('collectorProfile_' + normCollector, profile);
  return {
    id: id,
    collector: collector,
    award: award,
    pinned: pinned,
    grantedBy: grantedBy,
    grantedAt: now.toISOString(),
    notes: notes,
    success: true,
    message: 'Award granted'
  };
}

function handleAdminAssignTask(body) {
  var collector = safeStr(body && body.collector);
  var task = safeStr(body && body.task);
  var hours = safeNum(body && body.hours);
  var notes = safeStr(body && body.notes) || 'Admin assignment';
  if (!collector) throw new Error('Missing collector');
  if (!task) throw new Error('Missing task');
  if (!(hours > 0)) hours = 0.5;
  return handleSubmit({
    collector: collector,
    task: task,
    hours: hours,
    actionType: 'ASSIGN',
    notes: notes,
    rig: safeStr(body && body.rig),
    requestId: safeStr(body && body.requestId)
  });
}

function handleAdminCancelTask(body) {
  var collector = safeStr(body && body.collector);
  var task = safeStr(body && body.task);
  var notes = safeStr(body && body.notes) || 'Admin cancellation';
  if (!collector) throw new Error('Missing collector');
  if (!task) throw new Error('Missing task');
  return handleSubmit({
    collector: collector,
    task: task,
    hours: 0,
    actionType: 'CANCEL',
    notes: notes,
    rig: safeStr(body && body.rig),
    requestId: safeStr(body && body.requestId)
  });
}

function handleAdminEditHours(body) {
  var collector = safeStr(body && body.collector);
  var task = safeStr(body && body.task);
  var hours = Math.max(0, safeNum(body && body.hours));
  var notes = safeStr(body && body.notes);
  var desiredStatus = safeStr(body && body.status);
  var desiredPlanned = safeNum(body && body.plannedHours);
  if (!collector) throw new Error('Missing collector');
  if (!task) throw new Error('Missing task');

  var sheet = getSheet(TASKFLOW_SHEETS.ASSIGNMENTS);
  var data = sheet.getDataRange().getValues();
  var normCol = normalizeCollectorKey(collector);
  var normTask = normalizeTaskKey(task);
  var latest = getLatestAssignmentState(data, normCol, normTask);
  if (!latest) throw new Error('No assignment history found for collector/task');

  var planned = desiredPlanned > 0 ? desiredPlanned : Math.max(safeNum(latest.planned), hours);
  if (planned < hours) planned = hours;
  var status = desiredStatus ? normalizeAssignmentStatusText(desiredStatus) : normalizeAssignmentStatusText(latest.status);
  if (!status) status = (hours >= planned) ? 'Completed' : 'In Progress';
  var remaining = Math.max(0, planned - hours);
  if (status === 'Completed' && remaining > 0) status = 'Partial';
  if (status === 'In Progress' && remaining <= 0) status = 'Completed';
  var now = new Date();
  var completedDate = (status === 'Completed') ? now : '';

  var noteParts = [];
  noteParts.push('ADMIN_EDIT ' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') + ' -> ' + hours.toFixed(2) + 'h');
  if (notes) noteParts.push(notes);
  var mergedNotes = noteParts.join(' | ');
  var editId = 'A-' + now.getTime();

  insertAssignmentLogRow(sheet, [
    editId,
    safeStr(latest.taskId),
    task,
    collector,
    latest.assignedDate || now,
    planned,
    status,
    hours,
    remaining,
    completedDate,
    mergedNotes,
    safeStr(latest.weekStart) || getWeekStart(now)
  ]);

  refreshPostSubmitCaches(collector);
  return {
    success: true,
    assignmentId: editId,
    message: 'Hours updated: ' + task,
    collector: collector,
    task: task,
    hours: hours,
    planned: planned,
    remaining: remaining,
    status: status
  };
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

function dateKey_(d) {
  var dt = (d instanceof Date) ? d : new Date();
  if (isNaN(dt.getTime())) dt = new Date();
  return Utilities.formatDate(dt, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function isCompletedStatus_(status) {
  var s = safeStr(status).toLowerCase();
  return s === 'completed' || s === 'complete' || s === 'done' || s === 'finished';
}

function isCanceledStatus_(status) {
  var s = safeStr(status).toLowerCase();
  return s === 'canceled' || s === 'cancelled' || s === 'cancel';
}

function isIncompleteStatus_(status) {
  return safeStr(status).toLowerCase() === 'incomplete';
}

function ensureDailyRollover_() {
  ensureEndOfDayTrigger_();
  var today = getScriptTodayDate();
  var target = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  runDailyRolloverForDateIfNeeded_(target);
}

function ensureEndOfDayTrigger_() {
  try {
    var props = PropertiesService.getScriptProperties();
    if (safeStr(props.getProperty('TASKFLOW_EOD_TRIGGER_READY')) === '1') return;

    var existing = ScriptApp.getProjectTriggers();
    for (var i = 0; i < existing.length; i++) {
      if (existing[i].getHandlerFunction && existing[i].getHandlerFunction() === 'runEndOfDayRollover') {
        props.setProperty('TASKFLOW_EOD_TRIGGER_READY', '1');
        return;
      }
    }

    ScriptApp.newTrigger('runEndOfDayRollover')
      .timeBased()
      .everyDays(1)
      .atHour(23)
      .nearMinute(59)
      .create();

    props.setProperty('TASKFLOW_EOD_TRIGGER_READY', '1');
  } catch (e) {
    // Trigger creation can fail in limited contexts; rollover still runs on next-day first request.
  }
}

function runDailyRolloverForDateIfNeeded_(targetDate) {
  var targetKey = dateKey_(targetDate);
  var props = PropertiesService.getScriptProperties();
  var doneTarget = safeStr(props.getProperty('TASKFLOW_LAST_ROLLOVER_TARGET'));
  if (doneTarget === targetKey) return false;

  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  try {
    try {
      lock.waitLock(3000);
      lockAcquired = true;
    } catch (e) {}

    doneTarget = safeStr(props.getProperty('TASKFLOW_LAST_ROLLOVER_TARGET'));
    if (doneTarget === targetKey) return false;

    runDailyRolloverForDate_(targetDate);
    props.setProperty('TASKFLOW_LAST_ROLLOVER_TARGET', targetKey);
    props.setProperty('TASKFLOW_LAST_ROLLOVER_DAY', dateKey_(getScriptTodayDate()));
    return true;
  } finally {
    if (lockAcquired) {
      try { lock.releaseLock(); } catch (e2) {}
    }
  }
}

function runEndOfDayRollover() {
  var today = getScriptTodayDate();
  // Release all active SF rig assignments before marking the day done.
  try { handleEODRigRelease_(); } catch(e) {}
  return runDailyRolloverForDateIfNeeded_(today);
}

function runDailyRolloverForDate_(targetDate) {
  var sheet;
  try { sheet = getSheet(TASKFLOW_SHEETS.ASSIGNMENTS); } catch (e) { return; }
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return;

  var targetKey = dateKey_(targetDate);
  var latestByCollectorTask = {};

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var collector = safeStr(row[3]);
    var collectorKey = normalizeCollectorKey(collector);
    if (!collectorKey) continue;

    var assignDate = toDateSafe(row[4]);
    if (!assignDate || dateKey_(assignDate) !== targetKey) continue;

    var taskName = safeStr(row[2]);
    var taskKey = normalizeTaskKey(taskName);
    if (!taskKey) continue;

    var dedupeKey = collectorKey + '|' + taskKey;
    var eventTs = Math.max(toTimestampMs(row[9]), toTimestampMs(row[4]));
    var existing = latestByCollectorTask[dedupeKey];
    if (!existing || eventTs > existing._ts || (eventTs === existing._ts && i < existing._order)) {
      latestByCollectorTask[dedupeKey] = {
        row: row,
        collector: collector,
        taskName: taskName,
        _ts: eventTs,
        _order: i
      };
    }
  }

  var rowsToInsert = [];
  for (var key in latestByCollectorTask) {
    var state = latestByCollectorTask[key];
    var row = state.row;
    var status = safeStr(row[6]);
    if (isCompletedStatus_(status) || isCanceledStatus_(status) || isIncompleteStatus_(status)) continue;

    var now = new Date();
    var planned = Math.max(0, safeNum(row[5]));
    var note = 'AUTO_EOD_INCOMPLETE ' + targetKey + ' | prior_status=' + (status || 'In Progress');
    rowsToInsert.push([
      'A-' + now.getTime() + '-I' + rowsToInsert.length,
      safeStr(row[1]),
      safeStr(row[2]),
      safeStr(row[3]),
      row[4] || targetDate,
      planned,
      'Incomplete',
      0,
      planned,
      '',
      note,
      safeStr(row[11]) || getWeekStart(row[4] || targetDate)
    ]);
  }

  if (rowsToInsert.length === 0) return;
  // Keep newest rollover rows at the top, preserving the same top-insert behavior used by assignments.
  for (var r = rowsToInsert.length - 1; r >= 0; r--) {
    insertAssignmentLogRow(sheet, rowsToInsert[r]);
  }
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
  // Strip parenthetical suffixes (e.g. "(MX)", "(SF)") to match client-side
  // normalizeCollectorName() behavior. Without this, lookups for collectors
  // whose names are stored with region tags in the sheet (e.g. "Jane Smith (MX)")
  // would fail to match requests sent by the client as "Jane Smith".
  return safeStr(name).replace(/\s*\(.*?\)\s*$/, '').toLowerCase().replace(/\s+/g, ' ').trim();
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
  // Inject SF historical mappings as fallback so last week's leaderboard still
  // resolves even after rig columns are removed from the Collectors sheet.
  for (var histRig in SF_HISTORICAL_RIG_MAP) {
    if (!rigToCollectorName[histRig]) {
      rigToCollectorName[histRig] = SF_HISTORICAL_RIG_MAP[histRig];
    }
  }

  return {
    collectorToRig: collectorToRig,
    rigToCollectorName: rigToCollectorName
  };
}

function normalizeRigKey(rig) {
  return safeStr(rig).toLowerCase();
}

function getOrCreateRigHistorySheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName(TASKFLOW_SHEETS.RIG_HISTORY);
  if (!sheet) {
    sheet = ss.insertSheet(TASKFLOW_SHEETS.RIG_HISTORY);
    sheet.getRange(1, 1, 1, 10).setValues([[
      'EventTs',
      'Collector',
      'Rig',
      'Event',
      'SessionStart',
      'SessionEnd',
      'SessionHours',
      'Source',
      'WeekStart',
      'Notes'
    ]]);
  } else if (sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, 10).setValues([[
      'EventTs',
      'Collector',
      'Rig',
      'Event',
      'SessionStart',
      'SessionEnd',
      'SessionHours',
      'Source',
      'WeekStart',
      'Notes'
    ]]);
  }
  return sheet;
}

function getRigHistorySnapshot() {
  if (_rigHistorySnapshot) return _rigHistorySnapshot;

  var byCollector = {};
  var byRigLatest = {};
  var tsByRig = {};
  var sheet = getSS().getSheetByName(TASKFLOW_SHEETS.RIG_HISTORY);
  if (!sheet) {
    _rigHistorySnapshot = { byCollector: byCollector, byRigLatest: byRigLatest };
    return _rigHistorySnapshot;
  }
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) {
    _rigHistorySnapshot = { byCollector: byCollector, byRigLatest: byRigLatest };
    return _rigHistorySnapshot;
  }

  for (var i = 1; i < data.length; i++) {
    var collectorName = safeStr(data[i][1]);
    var collectorKey = normalizeCollectorKey(collectorName);
    var rig = normalizeRigKey(data[i][2]);
    if (!collectorKey || !rig) continue;

    if (!byCollector[collectorKey]) byCollector[collectorKey] = {};
    byCollector[collectorKey][rig] = true;

    var ts = Math.max(toTimestampMs(data[i][0]), toTimestampMs(data[i][4]));
    if (!tsByRig[rig] || ts > tsByRig[rig]) {
      tsByRig[rig] = ts;
      byRigLatest[rig] = collectorName;
    }
  }

  _rigHistorySnapshot = {
    byCollector: byCollector,
    byRigLatest: byRigLatest
  };
  return _rigHistorySnapshot;
}

function getCollectorRigSet(normCollector, fallbackRig) {
  var set = {};
  var fallback = normalizeRigKey(fallbackRig);
  if (fallback) set[fallback] = true;

  var snap = getRigHistorySnapshot();
  var fromHistory = snap.byCollector[normCollector];
  if (fromHistory) {
    for (var rig in fromHistory) {
      if (fromHistory[rig]) set[rig] = true;
    }
  }
  return set;
}

function getRigToCollectorFromHistory() {
  var snap = getRigHistorySnapshot();
  return snap.byRigLatest || {};
}

function logCollectorRigEvent(collectorName, rigId, source, notes, eventDate) {
  var collector = safeStr(collectorName);
  var rig = safeStr(rigId);
  if (!collector) throw new Error('Missing collector');
  if (!rig) throw new Error('Missing rig');

  var sheet = getOrCreateRigHistorySheet();
  var now = eventDate instanceof Date ? eventDate : new Date();
  if (isNaN(now.getTime())) now = new Date();
  var normCollector = normalizeCollectorKey(collector);
  var normRig = normalizeRigKey(rig);
  var data = sheet.getDataRange().getValues();
  var openRow = -1;
  var openStartMs = 0;
  var openRig = '';
  var bestTs = -1;

  for (var i = 1; i < data.length; i++) {
    var rowCollector = normalizeCollectorKey(data[i][1]);
    if (rowCollector !== normCollector) continue;
    var sessionEnd = data[i][5];
    if (sessionEnd != null && safeStr(sessionEnd) !== '') continue;
    var rowRig = normalizeRigKey(data[i][2]);
    var rowTs = Math.max(toTimestampMs(data[i][4]), toTimestampMs(data[i][0]));
    if (rowTs > bestTs) {
      bestTs = rowTs;
      openRow = i + 1;
      openStartMs = rowTs;
      openRig = rowRig;
    }
  }

  if (openRow > 0 && openRig === normRig) {
    var openStartDate = openStartMs > 0 ? new Date(openStartMs) : null;
    var isSameDay = false;
    if (openStartDate && !isNaN(openStartDate.getTime())) {
      isSameDay = (
        openStartDate.getFullYear() === now.getFullYear() &&
        openStartDate.getMonth() === now.getMonth() &&
        openStartDate.getDate() === now.getDate()
      );
    }
    if (isSameDay) {
      return {
        logged: false,
        duplicate: true,
        collector: collector,
        rig: rig,
        message: 'Rig already active'
      };
    }

    // Same rig but a new day: close prior session at prior-day EOD, then open a new daily session.
    var closeAt = now;
    if (openStartDate && !isNaN(openStartDate.getTime())) {
      var eod = new Date(openStartDate.getFullYear(), openStartDate.getMonth(), openStartDate.getDate(), 23, 59, 59, 999);
      if (eod.getTime() > 0 && eod.getTime() < now.getTime()) {
        closeAt = eod;
      }
    }
    var sameRigHours = 0;
    if (openStartMs > 0 && closeAt.getTime() > openStartMs) {
      sameRigHours = Math.round(((closeAt.getTime() - openStartMs) / 3600000) * 100) / 100;
    }
    sheet.getRange(openRow, 6).setValue(closeAt);
    sheet.getRange(openRow, 7).setValue(sameRigHours);
    openRow = -1;
  }

  if (openRow > 0) {
    var endMs = now.getTime();
    var hours = 0;
    if (openStartMs > 0 && endMs > openStartMs) {
      hours = Math.round(((endMs - openStartMs) / 3600000) * 100) / 100;
    }
    sheet.getRange(openRow, 6).setValue(now);
    sheet.getRange(openRow, 7).setValue(hours);
  }

  sheet.insertRowsBefore(2, 1);
  sheet.getRange(2, 1, 1, 10).setValues([[
    now,
    collector,
    rig,
    'RIG_SELECTED',
    now,
    '',
    '',
    safeStr(source) || 'TOOLS',
    getWeekStart(now),
    safeStr(notes)
  ]]);
  _rigHistorySnapshot = null;

  return {
    logged: true,
    collector: collector,
    rig: rig,
    message: 'Rig event logged'
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
  var rigHistoryMap = getRigToCollectorFromHistory();

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
    var collectorRaw = safeStr(r[idxCollector]);
    var collectorFromHistory = rigHistoryMap[rigId] || '';
    var collectorFromRig = rigMaps.rigToCollectorName[rigId] || '';
    var collectorName = collectorRaw || collectorFromHistory || collectorFromRig;
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

function getLiveHoursForAssignmentAcrossRigs(liveIndex, rigSet, taskName, sinceDate) {
  if (!rigSet || !taskName) return 0;
  var sum = 0;
  for (var rig in rigSet) {
    if (!rigSet[rig]) continue;
    sum += getLiveHoursForAssignment(liveIndex, rig, taskName, sinceDate);
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
    var isSF = isSFCollector_(name);
    results.push({
      name: name,
      // SF collectors no longer have a single rig — they pick via SOD modal.
      // MX collectors still use the sheet-assigned rig.
      rigs: (!isSF && rigId) ? [rigId] : [],
      team: isSF ? 'SF' : 'MX',
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
      todayActualHours: 0,
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
  var collectorRigSet = getCollectorRigSet(normName, myRig);
  var actualHours = 0, actualWeeklyHours = 0, todayActualHours = 0;
  var todayKey = dateKey_(getScriptTodayDate());
  var actualTaskSet = {};
  var actualTaskHoursByKey = {};
  var actualTaskNameByKey = {};
  for (var t = 0; t < actualRows.length; t++) {
    var ar = actualRows[t];
    var aRig = ar.rigId;
    var aCol = normalizeCollectorKey(ar.collector);
    var matchesCollector = aCol === normName || (aRig && collectorRigSet[aRig]);
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
      if (ar.date && dateKey_(ar.date) === todayKey) {
        todayActualHours += hours;
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
    todayActualHours: Math.round(todayActualHours * 100) / 100,
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

function handleGetCollectorProfile(collectorName) {
  if (!collectorName) throw new Error('Missing collector');
  var normName = normalizeCollectorKey(collectorName);

  var collectors = getCollectorRows();
  var displayName = collectorName;
  var fallbackRig = '';
  for (var c = 0; c < collectors.length; c++) {
    if (normalizeCollectorKey(collectors[c].name) === normName) {
      displayName = safeStr(collectors[c].name) || collectorName;
      fallbackRig = safeStr(collectors[c].rigId).toLowerCase();
      break;
    }
  }

  var collectorRigSet = getCollectorRigSet(normName, fallbackRig);
  var actualRows = getCollectorActualRows();
  var weekStart = getWeekStartDate(getScriptTodayDate());
  var totalActualHours = 0;
  var weeklyActualHours = 0;
  var longestRecordingHours = 0;
  var hoursByTask = {};
  var taskNameByKey = {};
  for (var i = 0; i < actualRows.length; i++) {
    var ar = actualRows[i];
    if (!ar || !ar.rigId || !collectorRigSet[ar.rigId]) continue;
    var hrs = safeNum(ar.hours);
    if (hrs <= 0) continue;
    totalActualHours += hrs;
    if (ar.date && ar.date >= weekStart) weeklyActualHours += hrs;
    if (hrs > longestRecordingHours) longestRecordingHours = hrs;
    var tk = ar.taskKey || normalizeTaskKey(ar.taskName);
    if (tk) {
      hoursByTask[tk] = (hoursByTask[tk] || 0) + hrs;
      if (!taskNameByKey[tk]) taskNameByKey[tk] = safeStr(ar.taskName) || tk;
    }
  }

  var assignData;
  try { assignData = getSheetData(TASKFLOW_SHEETS.ASSIGNMENTS); } catch (e) { assignData = []; }
  var latestByTask = {};
  var sessions = [];
  for (var a = 1; a < assignData.length; a++) {
    var row = assignData[a];
    if (normalizeCollectorKey(row[3]) !== normName) continue;

    var taskKey = normalizeTaskKey(row[2]) || safeStr(row[0]);
    var eventTs = Math.max(toTimestampMs(row[9]), toTimestampMs(row[4]));
    var existing = latestByTask[taskKey];
    if (!existing || eventTs > existing._ts || (eventTs === existing._ts && a < existing._order)) {
      latestByTask[taskKey] = { row: row, _ts: eventTs, _order: a };
    }

    var startTs = toTimestampMs(row[4]);
    if (startTs > 0) {
      var endTs = toTimestampMs(row[9]);
      if (!endTs || endTs < startTs) endTs = startTs;
      sessions.push({ start: startTs, end: endTs });
    }
  }

  var tasksAssigned = 0;
  var tasksCompleted = 0;
  for (var tkLatest in latestByTask) {
    tasksAssigned++;
    var st = safeStr(latestByTask[tkLatest].row[6]).toLowerCase();
    if (st === 'completed' || st === 'complete' || st === 'done') tasksCompleted++;
  }
  var completionRate = tasksAssigned > 0 ? Math.round((tasksCompleted / tasksAssigned) * 100) : 0;

  sessions.sort(function(x, y) { return x.start - y.start; });
  var shortestDowntimeMinutes = 0;
  var hasDowntime = false;
  var prevEnd = 0;
  for (var s = 0; s < sessions.length; s++) {
    var session = sessions[s];
    if (prevEnd > 0 && session.start > prevEnd) {
      var gapMin = Math.round(((session.start - prevEnd) / 60000) * 100) / 100;
      if (gapMin > 0 && (!hasDowntime || gapMin < shortestDowntimeMinutes)) {
        shortestDowntimeMinutes = gapMin;
        hasDowntime = true;
      }
    }
    if (session.end > prevEnd) prevEnd = session.end;
  }
  if (!hasDowntime) shortestDowntimeMinutes = 0;

  var topTasks = [];
  for (var tkHours in hoursByTask) {
    topTasks.push({
      taskName: taskNameByKey[tkHours] || tkHours,
      hours: Math.round(safeNum(hoursByTask[tkHours]) * 100) / 100
    });
  }
  topTasks.sort(function(x, y) { return y.hours - x.hours; });

  var awards = getCollectorAwards(displayName);
  var result = {
    collectorName: displayName,
    totalActualHours: Math.round(totalActualHours * 100) / 100,
    weeklyActualHours: Math.round(weeklyActualHours * 100) / 100,
    tasksAssigned: tasksAssigned,
    tasksCompleted: tasksCompleted,
    completionRate: completionRate,
    longestRecordingHours: Math.round(longestRecordingHours * 100) / 100,
    shortestDowntimeMinutes: Math.round(shortestDowntimeMinutes * 100) / 100,
    medalsCount: awards.all.length,
    pinnedAwards: awards.pinned,
    recentAwards: awards.all.slice(0, 8),
    topTasks: topTasks.slice(0, 5)
  };
  writeCache('collectorProfile_' + normName, result);
  return result;
}

function handleGetAdminStartPlan() {
  var today = getScriptTodayDate();
  var yesterdayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  var yesterdayEnd = new Date(yesterdayStart.getFullYear(), yesterdayStart.getMonth(), yesterdayStart.getDate(), 23, 59, 59, 999);
  var yStartMs = yesterdayStart.getTime();
  var yEndMs = yesterdayEnd.getTime();

  var collectors = getCollectorRows();
  var activeCollectors = [];
  for (var c = 0; c < collectors.length; c++) {
    if (collectors[c].active === false) continue;
    var cname = safeStr(collectors[c].name);
    if (!cname) continue;
    activeCollectors.push({
      name: cname,
      key: normalizeCollectorKey(cname),
      region: getRegionFromRigId(collectors[c].rigId)
    });
  }

  var assignData;
  try { assignData = getSheetData(TASKFLOW_SHEETS.ASSIGNMENTS); } catch (e) { assignData = []; }
  var latestYesterdayByCollectorTask = {};
  for (var i = 1; i < assignData.length; i++) {
    var row = assignData[i];
    var collectorName = safeStr(row[3]);
    var collectorKey = normalizeCollectorKey(collectorName);
    if (!collectorKey) continue;
    var taskKey = normalizeTaskKey(row[2]);
    if (!taskKey) continue;
    var assignedTs = toTimestampMs(row[4]);
    if (!assignedTs || assignedTs < yStartMs || assignedTs > yEndMs) continue;

    var dedupeKey = collectorKey + '|' + taskKey;
    var eventTs = Math.max(toTimestampMs(row[9]), assignedTs);
    var existing = latestYesterdayByCollectorTask[dedupeKey];
    if (!existing || eventTs > existing._ts || (eventTs === existing._ts && i < existing._order)) {
      latestYesterdayByCollectorTask[dedupeKey] = {
        collector: collectorName,
        collectorKey: collectorKey,
        taskName: safeStr(row[2]),
        taskKey: taskKey,
        status: safeStr(row[6]),
        _ts: eventTs,
        _order: i
      };
    }
  }

  var carryOverByCollector = {};
  var completedYesterdayByCollector = {};
  for (var key in latestYesterdayByCollectorTask) {
    var item = latestYesterdayByCollectorTask[key];
    var ck = item.collectorKey;
    var status = safeStr(item.status).toLowerCase();
    if (!carryOverByCollector[ck]) carryOverByCollector[ck] = [];
    if (!completedYesterdayByCollector[ck]) completedYesterdayByCollector[ck] = {};
    if (status === 'completed' || status === 'complete' || status === 'done') {
      completedYesterdayByCollector[ck][item.taskKey] = true;
    } else if (status !== 'canceled' && status !== 'cancelled') {
      carryOverByCollector[ck].push(item.taskName);
    }
  }

  var taskRows = getTaskActualRows();
  var globalSuggestedTasks = [];
  for (var t = 0; t < taskRows.length; t++) {
    var tr = taskRows[t];
    var st = safeStr(tr.status).toLowerCase();
    if (st === 'done' || st === 'completed' || st === 'complete') continue;
    if (safeNum(tr.remainingHours) <= 0) continue;
    globalSuggestedTasks.push({
      taskName: safeStr(tr.taskName),
      taskKey: normalizeTaskKey(tr.taskName),
      remainingHours: safeNum(tr.remainingHours)
    });
  }
  globalSuggestedTasks.sort(function(a, b) { return b.remainingHours - a.remainingHours; });

  var regions = { SF: [], MX: [] };
  for (var ac = 0; ac < activeCollectors.length; ac++) {
    var collectorMeta = activeCollectors[ac];
    var collectorCarry = carryOverByCollector[collectorMeta.key] || [];
    var completedSet = completedYesterdayByCollector[collectorMeta.key] || {};
    var suggestion = [];
    var seen = {};

    for (var ci = 0; ci < collectorCarry.length; ci++) {
      var carryName = safeStr(collectorCarry[ci]);
      var carryKey = normalizeTaskKey(carryName);
      if (!carryName || seen[carryKey]) continue;
      seen[carryKey] = true;
      suggestion.push(carryName);
      if (suggestion.length >= 3) break;
    }

    for (var gs = 0; gs < globalSuggestedTasks.length && suggestion.length < 3; gs++) {
      var candidate = globalSuggestedTasks[gs];
      if (!candidate.taskName || seen[candidate.taskKey]) continue;
      if (completedSet[candidate.taskKey]) continue;
      seen[candidate.taskKey] = true;
      suggestion.push(candidate.taskName);
    }

    var region = collectorMeta.region === 'SF' ? 'SF' : 'MX';
    regions[region].push({
      collector: collectorMeta.name,
      carryOver: collectorCarry.slice(0, 4),
      suggested: suggestion,
      hadCarryOver: collectorCarry.length > 0
    });
  }

  regions.SF.sort(function(a, b) { return safeStr(a.collector).localeCompare(safeStr(b.collector)); });
  regions.MX.sort(function(a, b) { return safeStr(a.collector).localeCompare(safeStr(b.collector)); });

  var output = {
    generatedAt: new Date().toISOString(),
    yesterday: Utilities.formatDate(yesterdayStart, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    regions: regions,
    globalSuggestedTasks: globalSuggestedTasks.slice(0, 8)
  };
  writeCache('adminStartPlan', output);
  return output;
}

function getAssignmentStateById_(data, assignmentId) {
  var targetId = safeStr(assignmentId);
  if (!targetId) return null;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (safeStr(row[0]) !== targetId) continue;
    return {
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
  return null;
}

function getActualHoursForCollectorTaskOnDate_(actualRows, collectorRigSet, normCollector, taskKey, targetDate) {
  if (!taskKey || !targetDate) return 0;
  var targetKey = dateKey_(targetDate);
  var sum = 0;
  for (var i = 0; i < actualRows.length; i++) {
    var row = actualRows[i];
    if (!row) continue;
    if (!row.date || dateKey_(row.date) !== targetKey) continue;
    var rowTaskKey = row.taskKey || normalizeTaskKey(row.taskName);
    if (rowTaskKey !== taskKey) continue;

    var rowCollectorKey = normalizeCollectorKey(row.collector);
    var byCollector = rowCollectorKey && rowCollectorKey === normCollector;
    var byRig = row.rigId && collectorRigSet[row.rigId];
    if (!byCollector && !byRig) continue;

    sum += safeNum(row.hours);
  }
  return Math.round(sum * 100) / 100;
}

function handleGetDailyCarryover(collectorName) {
  if (!collectorName) return [];
  var normName = normalizeCollectorKey(collectorName);
  if (!normName) return [];

  var assignData;
  try { assignData = getSheetData(TASKFLOW_SHEETS.ASSIGNMENTS); } catch (e) { return []; }
  var todayKey = dateKey_(getScriptTodayDate());
  var latestByTask = {};
  for (var i = 1; i < assignData.length; i++) {
    var row = assignData[i];
    if (normalizeCollectorKey(row[3]) !== normName) continue;
    var taskKey = normalizeTaskKey(row[2]);
    if (!taskKey) continue;
    var eventTs = Math.max(toTimestampMs(row[9]), toTimestampMs(row[4]));
    var existing = latestByTask[taskKey];
    if (!existing || eventTs > existing._ts || (eventTs === existing._ts && i < existing._order)) {
      latestByTask[taskKey] = { row: row, _ts: eventTs, _order: i };
    }
  }

  var collectorRigMap = getCollectorRigMap();
  var collectorRigSet = getCollectorRigSet(normName, collectorRigMap[normName] || '');
  var actualRows = getCollectorActualRows();
  var output = [];
  for (var key in latestByTask) {
    var state = latestByTask[key].row;
    var status = safeStr(state[6]);
    if (!isIncompleteStatus_(status)) continue;
    var assignedDate = toDateSafe(state[4]);
    if (!assignedDate) continue;
    var assignedDateKey = dateKey_(assignedDate);
    if (assignedDateKey === todayKey) continue;

    var actualHours = getActualHoursForCollectorTaskOnDate_(actualRows, collectorRigSet, normName, key, assignedDate);
    output.push({
      assignmentId: safeStr(state[0]),
      collector: safeStr(state[3]),
      taskName: safeStr(state[2]),
      assignedDate: assignedDateKey,
      plannedHours: Math.round(safeNum(state[5]) * 100) / 100,
      actualHours: Math.round(actualHours * 100) / 100,
      status: 'Incomplete'
    });
  }

  output.sort(function(a, b) {
    if (a.assignedDate === b.assignedDate) return safeStr(a.taskName).localeCompare(safeStr(b.taskName));
    return safeStr(a.assignedDate) < safeStr(b.assignedDate) ? 1 : -1;
  });
  writeCache('dailyCarryover_' + normName, output);
  return output;
}

function handleCarryoverReport(body) {
  var collector = safeStr(body && body.collector);
  var task = safeStr(body && body.task);
  var assignmentId = safeStr(body && body.assignmentId);
  var notes = safeStr(body && body.notes);
  if (!collector) throw new Error('Missing collector');
  if (!task) throw new Error('Missing task');
  if (!assignmentId) throw new Error('Missing assignmentId');

  var sheet = getSheet(TASKFLOW_SHEETS.ASSIGNMENTS);
  var data = sheet.getDataRange().getValues();
  var normCol = normalizeCollectorKey(collector);
  var normTask = normalizeTaskKey(task);
  var state = getAssignmentStateById_(data, assignmentId);
  if (!state) state = getLatestAssignmentState(data, normCol, normTask);
  if (!state) throw new Error('Carryover assignment not found');
  if (normalizeCollectorKey(state.collector) !== normCol) throw new Error('Collector mismatch for carryover assignment');
  if (normalizeTaskKey(state.taskName) !== normTask) throw new Error('Task mismatch for carryover assignment');

  var statusLower = safeStr(state.status).toLowerCase();
  if (isCompletedStatus_(statusLower) || isCanceledStatus_(statusLower)) {
    return {
      success: true,
      duplicate: true,
      message: 'Carryover already resolved',
      assignmentId: state.assignmentId,
      status: safeStr(state.status)
    };
  }

  var actualHours = Math.max(0, safeNum(body && body.actualHours));
  if (!(actualHours > 0)) {
    var collectorRigMap = getCollectorRigMap();
    var collectorRigSet = getCollectorRigSet(normCol, collectorRigMap[normCol] || '');
    var actualRows = getCollectorActualRows();
    var assignedDate = toDateSafe(state.assignedDate) || getScriptTodayDate();
    actualHours = getActualHoursForCollectorTaskOnDate_(actualRows, collectorRigSet, normCol, normTask, assignedDate);
  }

  var planned = Math.max(0, safeNum(state.planned));
  if (planned <= 0) planned = actualHours;
  var logged = Math.round(actualHours * 100) / 100;
  var remaining = Math.max(0, Math.round((planned - logged) * 100) / 100);
  var now = new Date();
  var nextId = 'A-' + now.getTime();
  var reportNote = 'CARRYOVER_REPORT ' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') + ' | actual=' + logged.toFixed(2) + 'h';
  if (notes) reportNote += ' | ' + notes;

  insertAssignmentLogRow(sheet, [
    nextId,
    safeStr(state.taskId),
    safeStr(state.taskName) || task,
    safeStr(state.collector) || collector,
    state.assignedDate || now,
    planned,
    'Completed',
    logged,
    remaining,
    now,
    reportNote,
    safeStr(state.weekStart) || getWeekStart(state.assignedDate || now)
  ]);

  refreshPostSubmitCaches(collector);
  return {
    success: true,
    message: 'Carryover reported: ' + task,
    assignmentId: nextId,
    collector: collector,
    task: task,
    hours: logged,
    planned: planned,
    remaining: remaining,
    status: 'Completed'
  };
}

function handleCarryoverCancel(body) {
  var collector = safeStr(body && body.collector);
  var task = safeStr(body && body.task);
  var assignmentId = safeStr(body && body.assignmentId);
  var notes = safeStr(body && body.notes);
  if (!collector) throw new Error('Missing collector');
  if (!task) throw new Error('Missing task');
  if (!assignmentId) throw new Error('Missing assignmentId');

  var sheet = getSheet(TASKFLOW_SHEETS.ASSIGNMENTS);
  var data = sheet.getDataRange().getValues();
  var normCol = normalizeCollectorKey(collector);
  var normTask = normalizeTaskKey(task);
  var state = getAssignmentStateById_(data, assignmentId);
  if (!state) state = getLatestAssignmentState(data, normCol, normTask);
  if (!state) throw new Error('Carryover assignment not found');
  if (normalizeCollectorKey(state.collector) !== normCol) throw new Error('Collector mismatch for carryover assignment');
  if (normalizeTaskKey(state.taskName) !== normTask) throw new Error('Task mismatch for carryover assignment');

  var statusLower = safeStr(state.status).toLowerCase();
  if (isCanceledStatus_(statusLower)) {
    return {
      success: true,
      duplicate: true,
      message: 'Carryover already canceled',
      assignmentId: state.assignmentId,
      status: 'Canceled'
    };
  }
  if (isCompletedStatus_(statusLower)) {
    return {
      success: true,
      duplicate: true,
      message: 'Carryover already completed',
      assignmentId: state.assignmentId,
      status: 'Completed'
    };
  }

  var now = new Date();
  var cancelId = 'A-' + now.getTime();
  var cancelNote = 'CARRYOVER_CANCEL ' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  if (notes) cancelNote += ' | ' + notes;
  insertAssignmentLogRow(sheet, [
    cancelId,
    safeStr(state.taskId),
    safeStr(state.taskName) || task,
    safeStr(state.collector) || collector,
    state.assignedDate || now,
    Math.max(0, safeNum(state.planned)),
    'Canceled',
    0,
    Math.max(0, safeNum(state.planned)),
    now,
    cancelNote,
    safeStr(state.weekStart) || getWeekStart(state.assignedDate || now)
  ]);

  refreshPostSubmitCaches(collector);
  return {
    success: true,
    message: 'Carryover canceled: ' + task,
    assignmentId: cancelId,
    collector: collector,
    task: task,
    status: 'Canceled'
  };
}

function handleGetTodayLog(collectorName) {
  if (!collectorName) return [];
  var normName = normalizeCollectorKey(collectorName);
  var assignData;
  try { assignData = getSheetData(TASKFLOW_SHEETS.ASSIGNMENTS); } catch(e) { return []; }
  var collectorRigMap = getCollectorRigMap();
  var collectorRigSet = getCollectorRigSet(normName, collectorRigMap[normName] || '');
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
      var liveHours = getLiveHoursForAssignmentAcrossRigs(liveHoursIndex, collectorRigSet, safeStr(row[2]), assignDate);
      if (liveHours > loggedHours) {
        loggedHours = liveHours;
        remainingHours = Math.max(0, plannedHours - loggedHours);
      }
    }

    // Only include tasks assigned today OR completed/closed today.
    // Previous-day In Progress tasks are exclusively visible via getDailyCarryover.
    var include = (dateStr === todayStr || completedStr === todayStr);
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

function handleGetPendingReview(params) {
  var collectorName = safeStr(params && params.collector);
  var rig           = safeStr(params && params.rig);
  if (!collectorName || !rig) return [];

  var normName = normalizeCollectorKey(collectorName);
  var rigLower = rig.toLowerCase().trim();
  var today    = getScriptTodayDate();
  var todayStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  var ss = getSS();
  var caSheet = ss.getSheetByName('Collector Actuals | RedashPull');
  if (!caSheet || caSheet.getLastRow() < 3) return [];

  var caData   = caSheet.getDataRange().getValues();
  var headers  = (caData[1] || []).map(function(h) { return safeStr(h).trim().toLowerCase(); });
  var idxDate  = headers.indexOf('date');
  var idxRig   = headers.indexOf('rig id');
  var idxTask  = headers.indexOf('task name');
  var idxHrs   = headers.indexOf('hours uploaded');
  if (idxDate < 0 || idxRig < 0 || idxTask < 0 || idxHrs < 0) return [];

  var taskAgg = {};
  for (var i = 2; i < caData.length; i++) {
    var row = caData[i];
    if (!row || !row[idxDate]) continue;
    var rowDate = toDateSafe(row[idxDate]);
    if (!rowDate) continue;
    if (Utilities.formatDate(rowDate, Session.getScriptTimeZone(), 'yyyy-MM-dd') !== todayStr) continue;
    if (safeStr(row[idxRig]).toLowerCase().trim() !== rigLower) continue;
    var taskName = safeStr(row[idxTask]).trim();
    if (!taskName) continue;
    var hrs = safeNum(row[idxHrs]);
    if (hrs <= 0) continue;
    var taskKey = normalizeTaskKey(taskName);
    if (!taskAgg[taskKey]) taskAgg[taskKey] = { taskName: taskName, hours: 0 };
    taskAgg[taskKey].hours += hrs;
  }

  if (Object.keys(taskAgg).length === 0) return [];

  var assignData;
  try { assignData = getSheetData(TASKFLOW_SHEETS.ASSIGNMENTS); } catch (e) { assignData = []; }
  var resolvedKeys = {};
  for (var j = 1; j < assignData.length; j++) {
    var aRow = assignData[j];
    if (normalizeCollectorKey(safeStr(aRow[3])) !== normName) continue;
    var status = safeStr(aRow[6]).toLowerCase();
    if (status !== 'completed' && status !== 'canceled') continue;
    var closedStr   = (function(d) { return d ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd') : ''; })(toDateSafe(aRow[9]));
    var assignedStr = (function(d) { return d ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd') : ''; })(toDateSafe(aRow[4]));
    if (closedStr !== todayStr && assignedStr !== todayStr) continue;
    resolvedKeys[normalizeTaskKey(safeStr(aRow[2]))] = true;
  }

  var results = [];
  for (var key in taskAgg) {
    if (resolvedKeys[key]) continue;
    results.push({ rig: rig, taskName: taskAgg[key].taskName, taskKey: key,
                   redashHours: Math.round(taskAgg[key].hours * 100) / 100, date: todayStr });
  }
  results.sort(function(a, b) { return b.redashHours - a.redashHours; });
  writeCache('pendingReview_' + normName, results);
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
  var collectorRigSetCache = {};
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
      if (!collectorRigSetCache[collectorKey]) {
        collectorRigSetCache[collectorKey] = getCollectorRigSet(collectorKey, collectorRigMap[collectorKey] || '');
      }
      var liveHours = getLiveHoursForAssignmentAcrossRigs(liveHoursIndex, collectorRigSetCache[collectorKey], safeStr(data[i][2]), assignedDate);
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
  }
  // Always ensure the header row exists, even if the sheet was manually
  // created or had its content cleared. Without this, getLastRow() returns 0
  // which causes writeCache to call insertRowsAfter(0, ...) — invalid in
  // the Sheets API (rows are 1-indexed) — silently failing every write.
  if (sheet.getLastRow() === 0) {
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

    // Scan rows 2+ only (row 1 is always the header — never overwrite it).
    if (lastRow >= 2) {
      var keyColumn = cacheSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < keyColumn.length; i++) {
        if (safeStr(keyColumn[i][0]) === key) {
          targetRow = i + 2;  // i=0 → row 2, i=1 → row 3, etc.
          existingJson = safeStr(cacheSheet.getRange(targetRow, 2).getValue());
          break;
        }
      }
    }

    if (targetRow === -1) {
      // Append after the last row, but never before row 2 (row 1 is the header).
      // Crucially: do NOT call insertRowsAfter(0, ...) — row 0 is invalid in the
      // Sheets API and throws an exception that the outer catch silently swallows,
      // causing every write to silently fail on an empty sheet.
      targetRow = Math.max(lastRow + 1, 2);
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
  var liveAlerts = handleGetLiveAlerts();
  var adminStartPlan;
  try { adminStartPlan = handleGetAdminStartPlan(); } catch (e0) { adminStartPlan = { regions: { SF: [], MX: [] } }; }

  var lastWeek = [];
  var admin = null;
  var taskActuals = [];
  if (!isLight) {
    lastWeek = handleGetLeaderboard('lastWeek');
    admin = handleGetAdminDashboard();
    taskActuals = handleGetTaskActuals();
  }

  var collectorCached = false;
  var collectorProfileCached = false;
  if (collectorName) {
    var normCollector = normalizeCollectorKey(collectorName);
    if (normCollector) {
      handleGetCollectorStats(collectorName);
      handleGetCollectorProfile(collectorName);
      handleGetTodayLog(collectorName);
      handleGetDailyCarryover(collectorName);
      handleGetFullLog(collectorName);
      collectorCached = true;
      collectorProfileCached = true;
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
    liveAlerts: liveAlerts.length,
    adminStartPlanCollectors: safeNum((adminStartPlan.regions.SF || []).length) + safeNum((adminStartPlan.regions.MX || []).length),
    activeRigsToday: activeRigs.activeRigsToday,
    adminCached: !!admin,
    collectorCached: collectorCached,
    collectorProfileCached: collectorProfileCached
  };
}

function refreshPostSubmitCaches(collectorName) {
  try {
    handleGetTodayLog(collectorName);
    handleGetDailyCarryover(collectorName);
    handleGetCollectorStats(collectorName);
    handleGetCollectorProfile(collectorName);
    handleGetFullLog(collectorName);
    handleGetLeaderboard('thisWeek');
    handleGetAdminDashboard();
    handleGetAdminStartPlan();
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

function buildSubmitFingerprint(collector, task, actionType, hours, notes, rig) {
  var noteKey = safeStr(notes).replace(/\s+/g, ' ').toLowerCase();
  if (noteKey.length > 80) noteKey = noteKey.substring(0, 80);
  return [
    normalizeCollectorKey(collector),
    normalizeTaskKey(task),
    normalizeRigKey(rig),
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

    // plannedHours is always 0 for new assignments — actual hours are recorded on Done.
    var aId = 'A-' + Date.now();
    insertAssignmentLogRow(sheet, [aId, latestTaskId, task, collector, now, 0, 'In Progress', 0, 0, '', notes, getWeekStart(now)]);
    refreshPostSubmitCaches(collector);
    return { success: true, message: 'Assigned: ' + task, assignmentId: aId, planned: 0, hours: 0, remaining: 0, status: 'In Progress' };
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
  var rig = safeStr(body.rig);
  var requestId = safeStr(body.requestId);
  if (!collector) throw new Error('Missing collector');
  if (!task) throw new Error('Missing task');
  if (!actionType) throw new Error('Missing actionType');

  var normCol = normalizeCollectorKey(collector);
  var normTask = normalizeTaskKey(task);
  var fingerprint = buildSubmitFingerprint(collector, task, actionType, hours, notes, rig);
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

    if (rig) {
      logCollectorRigEvent(collector, rig, 'SUBMIT', actionType, new Date());
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

// ============================================================================
// RIG ASSIGNMENT SYSTEM (uses existing Collector Rig History Log)
// ============================================================================
// The Rig History Log already tracks open sessions (SessionEnd blank = active).
// We add two columns to that sheet:
//   K = SwitchRequestBy   (blank, or the collector requesting a rig switch)
//   L = SwitchStatus      (blank | PENDING | APPROVED | DENIED)
// No new sheet needed.

// Column indices (0-based) for Collector Rig History Log
var RH = {
  EVENT_TS:        0,  // A
  COLLECTOR:       1,  // B
  RIG:             2,  // C
  EVENT:           3,  // D
  SESSION_START:   4,  // E
  SESSION_END:     5,  // F
  SESSION_HOURS:   6,  // G
  SOURCE:          7,  // H
  WEEK_START:      8,  // I
  NOTES:           9,  // J
  SWITCH_REQ_BY:  10,  // K  (new — added on first use)
  SWITCH_STATUS:  11   // L  (new — added on first use)
};

function isSFCollector_(name) {
  var norm = normalizeCollectorKey(safeStr(name));
  for (var i = 0; i < SF_COLLECTORS_LIST.length; i++) {
    if (normalizeCollectorKey(SF_COLLECTORS_LIST[i]) === norm) return true;
  }
  return false;
}

// Stable assignment ID: derived from collector + rig + today so it survives
// row-order changes caused by prepend-inserts in the history log.
function makeRigAssignmentId_(collector, rig) {
  var today = Utilities.formatDate(getScriptTodayDate(), Session.getScriptTimeZone(), 'yyyyMMdd');
  return 'RH_' + today + '_' + normalizeCollectorKey(collector).replace(/\s+/g,'') + '_' + String(rig).replace(/\s+/g,'');
}

// Extend the Rig History Log header to include K and L if they aren't there yet.
function ensureRigHistorySwitchCols_(sh) {
  var lastCol = sh.getLastColumn();
  if (lastCol <= RH.SWITCH_STATUS) {
    var needed = RH.SWITCH_STATUS + 1 - lastCol;
    var headers = [];
    if (lastCol <= RH.SWITCH_REQ_BY) headers.push('SwitchRequestBy');
    if (lastCol <= RH.SWITCH_STATUS) headers.push('SwitchStatus');
    sh.getRange(1, lastCol + 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  }
}

// Find the open (active) session row for a given collector+rig today.
// Returns { rowIndex (1-based), data (row array) } or null.
function findOpenRigSession_(data, collector, rig) {
  var normCollector = normalizeCollectorKey(collector);
  var normRig = normalizeRigKey(rig);
  var today = getScriptTodayDate();

  for (var i = 1; i < data.length; i++) {
    var sessionEnd = data[i][RH.SESSION_END];
    if (sessionEnd != null && safeStr(sessionEnd) !== '') continue; // closed
    if (normalizeCollectorKey(safeStr(data[i][RH.COLLECTOR])) !== normCollector) continue;
    if (normalizeRigKey(safeStr(data[i][RH.RIG])) !== normRig) continue;
    var start = data[i][RH.SESSION_START];
    if (!start) continue;
    var startDate = new Date(start);
    if (startDate.toDateString() !== today.toDateString()) continue;
    return { rowIndex: i + 1, data: data[i] };
  }
  return null;
}

// Find the open session for a rig (any collector) today.
function findOpenRigSessionByRig_(data, rig) {
  var normRig = normalizeRigKey(String(rig));
  var today = getScriptTodayDate();

  for (var i = 1; i < data.length; i++) {
    var sessionEnd = data[i][RH.SESSION_END];
    if (sessionEnd != null && safeStr(sessionEnd) !== '') continue;
    if (normalizeRigKey(safeStr(data[i][RH.RIG])) !== normRig) continue;
    var start = data[i][RH.SESSION_START];
    if (!start) continue;
    if (new Date(start).toDateString() !== today.toDateString()) continue;
    return { rowIndex: i + 1, data: data[i] };
  }
  return null;
}

// Returns current status of all SF rigs for the SOD picker.
function handleGetRigStatus() {
  var ss = getSS();
  var sh = ss.getSheetByName(TASKFLOW_SHEETS.RIG_HISTORY);
  if (!sh) {
    return SF_RIG_LIST.map(function(rig) {
      return { rig: rig, status: 'available', assignedTo: null, assignmentId: null, assignedAt: null, pendingSwitchBy: null };
    });
  }

  ensureRigHistorySwitchCols_(sh);
  var data = sh.getDataRange().getValues();
  var result = [];

  for (var r = 0; r < SF_RIG_LIST.length; r++) {
    var rigNum = SF_RIG_LIST[r];
    var found = findOpenRigSessionByRig_(data, rigNum);
    if (!found) {
      result.push({ rig: rigNum, status: 'available', assignedTo: null, assignmentId: null, assignedAt: null, pendingSwitchBy: null });
      continue;
    }
    var collector = safeStr(found.data[RH.COLLECTOR]);
    var switchStatus = safeStr(found.data[RH.SWITCH_STATUS] || '');
    var switchBy = safeStr(found.data[RH.SWITCH_REQ_BY] || '');
    var sessionStart = found.data[RH.SESSION_START];
    result.push({
      rig: rigNum,
      status: switchStatus === 'PENDING' ? 'pending_transfer' : 'in_use',
      assignedTo: collector,
      assignmentId: makeRigAssignmentId_(collector, rigNum),
      assignedAt: sessionStart ? new Date(sessionStart).toISOString() : null,
      pendingSwitchBy: switchStatus === 'PENDING' ? switchBy : null
    });
  }
  return result;
}

// SOD rig assignment — wraps the existing handleLogCollectorRig.
function handleAssignRigSOD(body) {
  var collector = safeStr(body.collector).trim();
  var rig = String(body.rig || '').trim();
  if (!collector || !rig) throw new Error('collector and rig required');

  // Check if this collector already has an active session today (idempotent).
  var ss = getSS();
  var sh = ss.getSheetByName(TASKFLOW_SHEETS.RIG_HISTORY);
  if (sh) {
    ensureRigHistorySwitchCols_(sh);
    var data = sh.getDataRange().getValues();
    var existing = findOpenRigSession_(data, collector, rig);
    if (existing) {
      var start = existing.data[RH.SESSION_START];
      return { assignmentId: makeRigAssignmentId_(collector, rig), collector: collector, rig: Number(rig), assignedAt: start ? new Date(start).toISOString() : null, status: 'ACTIVE', message: 'Already assigned to rig ' + rig };
    }
    // Check if another collector has this rig open today.
    var taken = findOpenRigSessionByRig_(data, rig);
    if (taken) {
      throw new Error('Rig ' + rig + ' is currently assigned to ' + safeStr(taken.data[RH.COLLECTOR]));
    }
  }

  // Delegate to existing session-management logic.
  var result = handleLogCollectorRig({ collector: collector, rig: rig, source: 'SOD_ASSIGN' });
  var now = new Date();
  return {
    assignmentId: makeRigAssignmentId_(collector, rig),
    collector: collector,
    rig: Number(rig),
    assignedAt: now.toISOString(),
    status: 'ACTIVE',
    message: result.message || ('Rig ' + rig + ' assigned')
  };
}

// Close the open rig session for (collector, rig) today.
function handleReleaseRig(body) {
  var assignmentId = safeStr(body.assignmentId).trim();
  var reason = safeStr(body.reason || 'MANUAL').trim().toUpperCase();
  if (!assignmentId) throw new Error('assignmentId required');

  var sh = getSS().getSheetByName(TASKFLOW_SHEETS.RIG_HISTORY);
  if (!sh) throw new Error('Rig History Log not found');
  ensureRigHistorySwitchCols_(sh);
  var data = sh.getDataRange().getValues();
  var now = new Date();

  // Decode collector + rig from the assignmentId (RH_yyyyMMdd_collector_rig).
  var parts = assignmentId.split('_');
  // parts[0]=RH parts[1]=date parts[2]=collector parts[3]=rig (may have been split further)
  // Find row by scanning for open session where assignmentId matches.
  for (var i = 1; i < data.length; i++) {
    var sessionEnd = data[i][RH.SESSION_END];
    if (sessionEnd != null && safeStr(sessionEnd) !== '') continue;
    var rowCollector = safeStr(data[i][RH.COLLECTOR]);
    var rowRig = safeStr(data[i][RH.RIG]);
    if (makeRigAssignmentId_(rowCollector, rowRig) !== assignmentId) continue;

    var sessionStart = data[i][RH.SESSION_START] ? new Date(data[i][RH.SESSION_START]) : null;
    var hours = sessionStart ? Math.round(((now.getTime() - sessionStart.getTime()) / 3600000) * 100) / 100 : 0;
    sh.getRange(i + 1, RH.SESSION_END + 1).setValue(now);
    sh.getRange(i + 1, RH.SESSION_HOURS + 1).setValue(hours);
    sh.getRange(i + 1, RH.NOTES + 1).setValue(safeStr(data[i][RH.NOTES]) + ' | released:' + reason);
    _rigHistorySnapshot = null;
    return { assignmentId: assignmentId, collector: rowCollector, rig: Number(rowRig), releasedAt: now.toISOString(), hours: hours, reason: reason, message: 'Rig released. ' + hours.toFixed(2) + 'h recorded.' };
  }
  throw new Error('Active session not found for assignmentId: ' + assignmentId);
}

// Release all active SF rig sessions — called at EOD rollover.
function handleEODRigRelease_() {
  var sh = getSS().getSheetByName(TASKFLOW_SHEETS.RIG_HISTORY);
  if (!sh) return { released: 0 };
  ensureRigHistorySwitchCols_(sh);
  var data = sh.getDataRange().getValues();
  var today = getScriptTodayDate();
  var now = new Date();
  var released = 0;

  for (var i = 1; i < data.length; i++) {
    var sessionEnd = data[i][RH.SESSION_END];
    if (sessionEnd != null && safeStr(sessionEnd) !== '') continue;
    var rig = normalizeRigKey(safeStr(data[i][RH.RIG]));
    if (!SF_RIG_NUMBERS[rig]) continue; // only SF rigs
    var start = data[i][RH.SESSION_START];
    if (!start || new Date(start).toDateString() !== today.toDateString()) continue;

    var hours = start ? Math.round(((now.getTime() - new Date(start).getTime()) / 3600000) * 100) / 100 : 0;
    sh.getRange(i + 1, RH.SESSION_END + 1).setValue(now);
    sh.getRange(i + 1, RH.SESSION_HOURS + 1).setValue(hours);
    released++;
  }
  _rigHistorySnapshot = null;
  return { released: released };
}

// Request a rig switch — marks the open session row with K=requester, L=PENDING.
function handleRequestRigSwitch(body) {
  var requestingCollector = safeStr(body.requestingCollector).trim();
  var rig = String(body.rig || '').trim();
  if (!requestingCollector || !rig) throw new Error('requestingCollector and rig required');

  var sh = getSS().getSheetByName(TASKFLOW_SHEETS.RIG_HISTORY);
  if (!sh) throw new Error('Rig History Log not found');
  ensureRigHistorySwitchCols_(sh);
  var data = sh.getDataRange().getValues();

  var found = findOpenRigSessionByRig_(data, rig);
  if (!found) throw new Error('No active assignment for rig ' + rig);

  sh.getRange(found.rowIndex, RH.SWITCH_REQ_BY + 1).setValue(requestingCollector);
  sh.getRange(found.rowIndex, RH.SWITCH_STATUS + 1).setValue('PENDING');
  _rigHistorySnapshot = null;

  var currentAssignee = safeStr(found.data[RH.COLLECTOR]);
  return {
    assignmentId: makeRigAssignmentId_(currentAssignee, rig),
    currentAssignee: currentAssignee,
    requestingCollector: requestingCollector,
    rig: Number(rig),
    message: 'Switch request sent to ' + currentAssignee
  };
}

// Current assignee approves or denies the switch request.
function handleRespondRigSwitch(body) {
  var assignmentId = safeStr(body.assignmentId).trim();
  var action = safeStr(body.action || '').toUpperCase().trim();
  if (!assignmentId || !action) throw new Error('assignmentId and action required');

  var sh = getSS().getSheetByName(TASKFLOW_SHEETS.RIG_HISTORY);
  if (!sh) throw new Error('Rig History Log not found');
  ensureRigHistorySwitchCols_(sh);
  var data = sh.getDataRange().getValues();
  var now = new Date();

  // Find the row that matches the assignmentId and has a PENDING switch.
  for (var i = 1; i < data.length; i++) {
    var sessionEnd = data[i][RH.SESSION_END];
    if (sessionEnd != null && safeStr(sessionEnd) !== '') continue;
    var rowCollector = safeStr(data[i][RH.COLLECTOR]);
    var rowRig = safeStr(data[i][RH.RIG]);
    if (makeRigAssignmentId_(rowCollector, rowRig) !== assignmentId) continue;

    var requestingCollector = safeStr(data[i][RH.SWITCH_REQ_BY] || '');
    var rig = rowRig;

    if (action === 'DENY') {
      sh.getRange(i + 1, RH.SWITCH_REQ_BY + 1).setValue('');
      sh.getRange(i + 1, RH.SWITCH_STATUS + 1).setValue('DENIED');
      _rigHistorySnapshot = null;
      return { result: 'DENIED', rig: Number(rig), message: 'Switch denied. Rig ' + rig + ' stays with ' + rowCollector };
    }

    if (action === 'APPROVE') {
      // Open the requesting collector's session FIRST — before touching the current
      // assignee's row. If this throws (e.g. sheet write error), no changes have
      // been made and we can safely propagate the error without leaving the rig
      // in a half-transferred, unassigned state.
      handleLogCollectorRig({ collector: requestingCollector, rig: rig, source: 'SWITCH_APPROVE' });

      // New session is open — now safe to close the current assignee's session.
      var sessionStart = data[i][RH.SESSION_START] ? new Date(data[i][RH.SESSION_START]) : null;
      var hours = sessionStart ? Math.round(((now.getTime() - sessionStart.getTime()) / 3600000) * 100) / 100 : 0;
      sh.getRange(i + 1, RH.SESSION_END + 1).setValue(now);
      sh.getRange(i + 1, RH.SESSION_HOURS + 1).setValue(hours);
      sh.getRange(i + 1, RH.SWITCH_STATUS + 1).setValue('APPROVED');
      _rigHistorySnapshot = null;
      return {
        result: 'APPROVED',
        newAssignmentId: makeRigAssignmentId_(requestingCollector, rig),
        rig: Number(rig),
        hours: hours,
        message: 'Rig ' + rig + ' transferred to ' + requestingCollector + '. ' + hours.toFixed(2) + 'h recorded for ' + rowCollector
      };
    }
    throw new Error('Invalid action: ' + action);
  }
  throw new Error('Active PENDING session not found for: ' + assignmentId);
}

// Poll for incoming/outgoing switch requests (called every 20s by the app).
function handleGetPendingSwitchRequests(params) {
  var collector = safeStr((params && params.collector) || '').trim();
  if (!collector) return [];

  var sh = getSS().getSheetByName(TASKFLOW_SHEETS.RIG_HISTORY);
  if (!sh) return [];
  ensureRigHistorySwitchCols_(sh);
  var data = sh.getDataRange().getValues();
  var normCollector = normalizeCollectorKey(collector);
  var today = getScriptTodayDate();
  var results = [];

  for (var i = 1; i < data.length; i++) {
    var sessionEnd = data[i][RH.SESSION_END];
    if (sessionEnd != null && safeStr(sessionEnd) !== '') continue;
    var switchStatus = safeStr(data[i][RH.SWITCH_STATUS] || '');
    if (switchStatus !== 'PENDING') continue;
    var start = data[i][RH.SESSION_START];
    if (!start || new Date(start).toDateString() !== today.toDateString()) continue;

    var rowCollector = safeStr(data[i][RH.COLLECTOR]);
    var switchReqBy = safeStr(data[i][RH.SWITCH_REQ_BY] || '');
    var rowRig = safeStr(data[i][RH.RIG]);
    var assignmentId = makeRigAssignmentId_(rowCollector, rowRig);

    // Incoming: this collector is the current assignee and someone wants their rig.
    if (normalizeCollectorKey(rowCollector) === normCollector) {
      results.push({ type: 'incoming', assignmentId: assignmentId, rig: Number(rowRig), requestedBy: switchReqBy, requestedAt: start ? new Date(start).toISOString() : null });
    }
    // Outgoing: this collector sent the switch request.
    if (normalizeCollectorKey(switchReqBy) === normCollector) {
      results.push({ type: 'outgoing', assignmentId: assignmentId, rig: Number(rowRig), currentAssignee: rowCollector, requestedAt: start ? new Date(start).toISOString() : null });
    }
  }
  return results;
}

// Deactivate all live alerts (used by admin "Clear All Alerts" button).
function handleClearAllAlerts() {
  var ss = getSS();
  var sh = ss.getSheetByName(TASKFLOW_SHEETS.LIVE_ALERTS);
  if (!sh) return { cleared: 0 };
  var data = sh.getDataRange().getValues();
  var cleared = 0;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][6]).toLowerCase() !== 'false' && String(data[i][6]) !== '0') {
      sh.getRange(i + 1, 7).setValue(false);
      cleared++;
    }
  }
  return { cleared: cleared };
}
