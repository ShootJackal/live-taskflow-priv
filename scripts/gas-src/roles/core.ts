var SCRIPT_ROLE = 'CORE';
var CORE_GET_ACTIONS = {
  getCollectors: true,
  getTasks: true,
  getTodayLog: true,
  getDailyCarryover: true,
  getFullLog: true,
  getLiveAlerts: true
};
var CORE_META_ACTIONS = {
  '': true, // default submitAction payload
  SET_RIG: true,
  PUSH_ALERT: true,
  ADMIN_ASSIGN_TASK: true,
  ADMIN_CANCEL_TASK: true,
  ADMIN_EDIT_HOURS: true,
  GRANT_AWARD: true,
  CARRYOVER_REPORT: true,
  CARRYOVER_CANCEL: true
};
