// Recent Jobs tracker — sessionStorage-based breadcrumb for quick navigation

const STORAGE_KEY = "starlight_recent_jobs";
const MAX_ENTRIES = 4;

export interface RecentJob {
  jobId: number;
  jobNumber: string;
  jobName: string;
  scopeId?: number;
  scopeName?: string;
  path: string; // deepest page visited
  lastVisited: number;
}

export function getRecentJobs(): RecentJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function trackJobVisit(entry: Omit<RecentJob, "lastVisited">) {
  if (typeof window === "undefined") return;
  const list = getRecentJobs();
  // Remove existing entry for this job
  const filtered = list.filter(j => j.jobId !== entry.jobId);
  // Add new entry at front
  filtered.unshift({ ...entry, lastVisited: Date.now() });
  // Trim to max
  const trimmed = filtered.slice(0, MAX_ENTRIES);
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* quota exceeded — ignore */ }
}

/** Get the most recent job that ISN'T the current page */
export function getLastJobContext(currentPath: string): RecentJob | null {
  const list = getRecentJobs();
  return list.find(j => j.path !== currentPath) || null;
}
