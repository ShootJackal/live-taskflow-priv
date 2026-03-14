export type TaskProject = "NP" | "OTS" | "OTHER";
export type ProjectFilter = "overall" | TaskProject;

export interface TaskProjectMeta {
  project: TaskProject;
  taskCode: string;
}

const PROJECT_CODE_RE = /^((NP|OTS)[\s_-]*[A-Z0-9]*)\b/i;
const PROJECT_ONLY_RE = /^(NP|OTS)\b/i;

function normalizeTaskCode(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, "")
    .replace(/_/g, "-")
    .toUpperCase();
}

function parseProjectFromText(text: string): TaskProjectMeta | null {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;

  const idMatch = trimmed.match(PROJECT_CODE_RE);
  if (idMatch) {
    const taskCode = normalizeTaskCode(idMatch[1]);
    const project = taskCode.startsWith("OTS") ? "OTS" : "NP";
    return { project, taskCode };
  }

  const projectOnly = trimmed.match(PROJECT_ONLY_RE);
  if (projectOnly) {
    const project = projectOnly[1].toUpperCase() === "OTS" ? "OTS" : "NP";
    return { project, taskCode: project };
  }

  return null;
}

export function extractTaskProject(taskName?: string, taskId?: string): TaskProjectMeta {
  const fromId = parseProjectFromText(String(taskId ?? ""));
  if (fromId) return fromId;

  const fromName = parseProjectFromText(String(taskName ?? ""));
  if (fromName) return fromName;

  return { project: "OTHER", taskCode: "" };
}

export function matchesProjectFilter(filter: ProjectFilter, project: TaskProject): boolean {
  if (filter === "overall") return true;
  return filter === project;
}

export function buildTaskProjectLabel(taskName: string, taskId?: string): string {
  const meta = extractTaskProject(taskName, taskId);
  const cleanName = String(taskName ?? "").trim();
  if (meta.project === "OTHER") return cleanName;

  if (meta.taskCode && cleanName.toUpperCase().startsWith(meta.taskCode)) {
    return cleanName;
  }

  const tag = meta.taskCode || meta.project;
  return `${tag} · ${cleanName}`;
}

export function getProjectFilterOptions(): { value: ProjectFilter; label: string }[] {
  return [
    { value: "overall", label: "Overall (All Projects)" },
    { value: "NP", label: "Nexus Pilot (NP)" },
    { value: "OTS", label: "Off The Shelf (OTS)" },
    { value: "OTHER", label: "Other / Unmapped" },
  ];
}
