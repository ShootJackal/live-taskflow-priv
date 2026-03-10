import { describe, expect, it } from "vitest";
import {
  buildAdminAssignTaskContract,
  buildAdminCancelTaskContract,
  buildAdminEditHoursContract,
  buildGetActionUrl,
  buildSubmitActionContract,
  getRoleForGetAction,
  getRoleForMetaAction,
  isValidScriptUrl,
  normalizeScriptUrl,
} from "@/services/gasRequestContracts";

describe("script URL normalization and validation", () => {
  it("normalizes /macros/s URLs to /exec", () => {
    expect(normalizeScriptUrl("https://script.google.com/macros/s/abc123")).toBe(
      "https://script.google.com/macros/s/abc123/exec",
    );
  });

  it("rejects redacted or malformed URLs", () => {
    expect(isValidScriptUrl("[REDACTED]")).toBe(false);
    expect(isValidScriptUrl("not-a-url")).toBe(false);
  });
});

describe("route selection", () => {
  it("routes analytics GET actions to analytics endpoint", () => {
    expect(getRoleForGetAction("getCollectorStats")).toBe("analytics");
    expect(getRoleForGetAction("getTodayLog")).toBe("core");
  });

  it("routes analytics meta actions to analytics endpoint", () => {
    expect(getRoleForMetaAction("FORCE_SERVER_REPULL")).toBe("analytics");
    expect(getRoleForMetaAction("PUSH_ALERT")).toBe("core");
  });
});

describe("request contract snapshots", () => {
  it("snapshots getTodayLog request URL shape", () => {
    const url = buildGetActionUrl("https://script.google.com/macros/s/abc/exec", "getTodayLog", {
      collector: "Alice Johnson",
    });

    expect(url).toMatchInlineSnapshot(
      '"https://script.google.com/macros/s/abc/exec?action=getTodayLog&collector=Alice+Johnson"',
    );
  });

  it("snapshots getLiveAlerts request URL shape", () => {
    const url = buildGetActionUrl("https://script.google.com/macros/s/abc/exec", "getLiveAlerts", {});
    expect(url).toMatchInlineSnapshot(
      '"https://script.google.com/macros/s/abc/exec?action=getLiveAlerts"',
    );
  });

  it("snapshots submitAction payload shape", () => {
    const payload = buildSubmitActionContract({
      collector: "Alice Johnson",
      task: "Task-123",
      hours: 2.5,
      actionType: "COMPLETE",
      notes: "done",
      rig: "12",
      requestId: "req-1",
    });

    expect(payload).toMatchInlineSnapshot(`
      {
        "actionType": "COMPLETE",
        "collector": "Alice Johnson",
        "hours": 2.5,
        "notes": "done",
        "requestId": "req-1",
        "rig": "12",
        "task": "Task-123",
      }
    `);
  });

  it("snapshots admin action payload shapes", () => {
    const assignPayload = buildAdminAssignTaskContract({
      collector: "  Alice Johnson ",
      task: " Task-123 ",
      hours: 3,
      notes: " assign ",
      rig: " 9 ",
    });

    const cancelPayload = buildAdminCancelTaskContract({
      collector: "  Alice Johnson ",
      task: " Task-123 ",
      notes: " cancel ",
      rig: " 9 ",
    });

    const editPayload = buildAdminEditHoursContract({
      collector: " Alice Johnson ",
      task: " Task-123 ",
      hours: 1.25,
      plannedHours: 2,
      status: " Partial ",
      notes: " updated ",
    });

    expect({ assignPayload, cancelPayload, editPayload }).toMatchInlineSnapshot(`
      {
        "assignPayload": {
          "collector": "Alice Johnson",
          "hours": 3,
          "metaAction": "ADMIN_ASSIGN_TASK",
          "notes": "assign",
          "rig": "9",
          "task": "Task-123",
        },
        "cancelPayload": {
          "collector": "Alice Johnson",
          "metaAction": "ADMIN_CANCEL_TASK",
          "notes": "cancel",
          "rig": "9",
          "task": "Task-123",
        },
        "editPayload": {
          "collector": "Alice Johnson",
          "hours": 1.25,
          "metaAction": "ADMIN_EDIT_HOURS",
          "notes": "updated",
          "plannedHours": 2,
          "status": "Partial",
          "task": "Task-123",
        },
      }
    `);
  });
});
