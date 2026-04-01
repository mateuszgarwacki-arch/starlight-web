"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "starlight_recent_jobs";
const MAX_ITEMS = 5;

export interface JobHistoryEntry {
  jobId: number;
  jobNumber: string;
  jobName: string;
  scopeId?: number;
  scopeName?: string;
  path: string;
  visitedAt: string;
}

function readHistory(): JobHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeHistory(entries: JobHistoryEntry[]) {
  if (typeof window === "undefined") return;
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch {}
}

/** Call from any job-related page to record a visit */
export function recordJobVisit(entry: Omit<JobHistoryEntry, "visitedAt">) {
  const history = readHistory();
  const now = new Date().toISOString();
  // Remove existing entry for same job
  const filtered = history.filter(h => h.jobId !== entry.jobId);
  // Add new entry at front
  const updated = [{ ...entry, visitedAt: now }, ...filtered].slice(0, MAX_ITEMS);
  writeHistory(updated);
  // Dispatch event so strip updates without re-render cycle
  window.dispatchEvent(new Event("jobhistory"));
}

/** Hook to read recent job history — updates when recordJobVisit fires */
export function useJobHistory() {
  const [history, setHistory] = useState<JobHistoryEntry[]>([]);

  const refresh = useCallback(() => { setHistory(readHistory()); }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("jobhistory", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("jobhistory", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  return history;
}
