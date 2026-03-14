export interface Collector {
  id: string;
  name: string;
  rigs: string[];
  team?: "SF" | "MX";
  email?: string;
  weeklyCap?: number;
  active?: boolean;
  hoursUploaded?: number;
  rating?: string;
}

export interface RigStatus {
  rig: string;  // e.g. "EGO-PROD-9"
  status: "available" | "in_use" | "pending_transfer";
  assignedTo: string | null;
  assignmentId: string | null;
  assignedAt: string | null;
  pendingSwitchBy: string | null;
}

export interface RigAssignment {
  assignmentId: string;
  collector: string;
  team: string;
  rig: string;  // e.g. "EGO-PROD-9"
  assignedAt: string;
  releasedAt?: string;
  status: "ACTIVE" | "RELEASED";
  message?: string;
}

export interface RigSwitchRequest {
  type: "incoming" | "outgoing";
  assignmentId: string;
  rig: string;  // e.g. "EGO-PROD-9"
  requestedBy?: string;
  currentAssignee?: string;
  requestedAt: string | null;
}

export interface Task {
  id: string;
  name: string;
  label: string;
  taskId?: string;
  project?: "NP" | "OTS" | "OTHER";
}

export type ActionType = "ASSIGN" | "COMPLETE" | "CANCEL" | "NOTE_ONLY";

export type AssignmentStatus = "In Progress" | "Completed" | "Partial" | "Canceled";

export interface LogEntry {
  assignmentId: string;
  taskId: string;
  taskName: string;
  status: AssignmentStatus;
  loggedHours: number;
  plannedHours: number;
  remainingHours: number;
  taskCollectedHours?: number;
  taskGoodHours?: number;
  taskRemainingHours?: number;
  taskProgressPct?: number;
  notes: string;
  assignedDate: string;
  completedDate: string;
}


export interface SubmitPayload {
  collector: string;
  task: string;
  hours: number;
  actionType: ActionType;
  notes: string;
  rig?: string;
  requestId?: string;
}

export interface SubmitResponse {
  success: boolean;
  error?: string;
  action?: string;
  message?: string;
  assignmentId?: string;
  planned?: number;
  hours?: number;
  remaining?: number;
  status?: string;
}

export interface ActivityEntry {
  id: string;
  collectorName: string;
  taskName: string;
  action: ActionType;
  hoursLogged: number;
  plannedHours: number;
  status: string;
  timestamp: number;
  notes: string;
}

export interface CollectorStats {
  collectorName: string;
  totalAssigned: number;
  totalCompleted: number;
  totalCanceled: number;
  todayActualHours?: number;
  totalLoggedHours: number;
  totalPlannedHours: number;
  weeklyLoggedHours: number;
  weeklyCompleted: number;
  activeTasks: number;
  completionRate: number;
  avgHoursPerTask: number;
  topTasks: { name: string; hours: number; status: string }[];
}

export interface TaskActualRow {
  taskId?: string;
  taskName: string;
  status: string;
  collectedHours: number;
  goodHours: number;
  remainingHours: number;
  lastRedash: string;
  assignedCollector?: string;
  collectorHours?: number;
  collectorCount?: number;
  // Computed fields added by the recommendations useMemo in stats/index.tsx
  isActive?: boolean;
  isMine?: boolean;
  isRecollect?: boolean;
  remaining?: number;
  pct?: number;
}

export interface FullLogEntry {
  collector: string;
  taskId?: string;
  taskName: string;
  status: string;
  loggedHours: number;
  plannedHours: number;
  remainingHours: number;
  taskCollectedHours?: number;
  taskGoodHours?: number;
  taskRemainingHours?: number;
  taskProgressPct?: number;
  assignedDate: string;
}

export interface CollectorSummary {
  name: string;
  rig: string;
  email: string;
  weeklyCap: number;
  hoursUploaded: number;
  rating: string;
}

export interface TaskRequirement {
  taskName: string;
  requiredGoodHours: number;
}

export interface AdminDashboardData {
  recollections: string[];
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  recollectTasks: number;
  totalCollectors?: number;
  totalHoursUploaded?: number;
  activeRigsToday?: number;
  collectorSummary?: CollectorSummary[];
  taskRequirements?: TaskRequirement[];
}

export interface LeaderboardEntry {
  rank: number;
  collectorName: string;
  hoursLogged: number;
  reportedHours?: number;
  actualHours?: number;
  hoursSource?: "actual" | "reported";
  tasksCompleted: number;
  tasksAssigned: number;
  completionRate: number;
  region: string;
}

export interface LiveAlert {
  id: string;
  message: string;
  level: string;
  target: string;
  createdAt: string;
  createdBy?: string;
}

export interface CollectorAward {
  id: string;
  award: string;
  pinned: boolean;
  grantedBy: string;
  grantedAt: string;
  notes?: string;
}

export interface CollectorProfile {
  collectorName: string;
  totalActualHours: number;
  weeklyActualHours: number;
  tasksAssigned: number;
  tasksCompleted: number;
  completionRate: number;
  longestRecordingHours: number;
  shortestDowntimeMinutes: number;
  medalsCount: number;
  pinnedAwards: CollectorAward[];
  recentAwards: CollectorAward[];
  topTasks: { taskName: string; hours: number }[];
}

export interface AdminStartPlanCollector {
  collector: string;
  carryOver: string[];
  suggested: string[];
  hadCarryOver: boolean;
}

export interface AdminStartPlanData {
  generatedAt: string;
  yesterday: string;
  regions: {
    SF: AdminStartPlanCollector[];
    MX: AdminStartPlanCollector[];
  };
  globalSuggestedTasks: { taskName: string; taskKey: string; remainingHours: number }[];
}

export interface DailyCarryoverItem {
  assignmentId: string;
  collector: string;
  taskName: string;
  assignedDate: string;
  plannedHours: number;
  actualHours: number;
  status: string;
}

export interface PendingReviewItem {
  rig: string;
  taskName: string;
  taskKey: string;
  redashHours: number;
  date: string;
}
