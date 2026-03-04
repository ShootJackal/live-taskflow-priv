export interface Collector {
  id: string;
  name: string;
  rigs: string[];
  email?: string;
  weeklyCap?: number;
  active?: boolean;
  hoursUploaded?: number;
  rating?: string;
}

export interface Task {
  id: string;
  name: string;
  label: string;
}

export type ActionType = "ASSIGN" | "COMPLETE" | "CANCEL" | "NOTE_ONLY";

export type AssignmentStatus = "In Progress" | "Completed" | "Partial" | "Canceled";

export interface LogEntry {
  assignmentId: string;
  taskId: string;
  taskName: string;
  status: AssignmentStatus | string;
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

export interface TaskMeta {
  taskId: string;
  status: string;
  requiredHours: number;
  collectedHours: number;
  remainingHours: number;
  plannedChunk: number;
  goodHours: number;
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
  dailyPlanned?: number;
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
}

export interface FullLogEntry {
  collector: string;
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
