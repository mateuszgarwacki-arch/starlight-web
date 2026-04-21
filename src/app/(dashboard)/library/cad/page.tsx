"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { getOneDriveUrl } from "@/lib/onedrive-client";
import { formatDate, formatCurrency, cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";
import {
  Library, Search, Download, FileCode2, Box,
  ArrowUpDown, X, Filter, ExternalLink, Loader2,
} from "lucide-react";

/* ---------- Types ---------- */

interface CadFile {
  doc_id: number;
  doc_type: "cad_concept" | "cad_breakdown";
  file_name: string;
  onedrive_path: string | null;
  file_size: number | null;
  uploaded_at: string;
  job_id: number | null;
  scope_item_id: number | null;
  work_order_id: number | null;
  job: {
    job_id: number;
    job_number: string | null;
    job_name: string | null;
    client_name: string | null;
    event_date: string | null;
  } | null;
  scope: {
    scope_item_id: number;
    item_name: string | null;
    category: { category_id: number; category_name: string | null } | null;
  } | null;
}

type SortKey = "uploaded_at" | "job_name" | "file_name" | "event_date";
type SortDir = "asc" | "desc";
type DatePreset = "all" | "month" | "quarter" | "year";

/* ---------- Helpers ---------- */

function prettyBytes(n: number | null): string {
  if (!n || n === 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function cutoffForPreset(preset: DatePreset): Date | null {
  if (preset === "all") return null;
  const now = new Date();
  if (preset === "month") now.setMonth(now.getMonth() - 1);
  if (preset === "quarter") now.setMonth(now.getMonth() - 3);
  if (preset === "year") now.setFullYear(now.getFullYear() - 1);
  return now;
}

/* ---------- Page ---------- */

export default function CadLibraryPage() {
  const supabase = createClient();
  const [files, setFiles] = useState<CadFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  // Filters
  const [searchText, setSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | "all">("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "cad_concept" | "cad_breakdown">("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [sortKey, setSortKey] = useState<SortKey>("uploaded_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  /* ---------- Load CAD files from Supabase ---------- */
  const loadFiles = useCallback(async () => {
    setLoading(true);
    // Single nested select joining job + scope + category.
    // Filter doc_type to CAD only. Order newest first.
    const { data, error } = await supabase
      .from("tbl_wo_documents")
      .select(`
        doc_id, doc_type, file_name, onedrive_path, file_size, uploaded_at,
        job_id, scope_item_id, work_order_id,
        job:tbl_production_plan!inner(job_id, job_number, job_name, client_name, event_date),
        scope:tbl_scope_items(scope_item_id, item_name,
          category:tbl_scope_item_categories(category_id, category_name)
        )
      `)
      .in("doc_type", ["cad_concept", "cad_breakdown"])
      .order("uploaded_at", { ascending: false });

    if (error) {
      toast.error("Failed to load CAD library");
      console.error("CAD library load error:", error);
      setLoading(false);
      return;
    }
    setFiles((data as unknown as CadFile[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  /* ---------- Derived filter options ---------- */
  const categories = useMemo(() => {
    const m = new Map<number, string>();
    files.forEach((f) => {
      const c = f.scope?.category;
      if (c?.category_id && c.category_name) m.set(c.category_id, c.category_name);
    });
    return Array.from(m.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [files]);

  const clients = useMemo(() => {
    const s = new Set<string>();
    files.forEach((f) => {
      if (f.job?.client_name) s.add(f.job.client_name);
    });
    return Array.from(s).sort();
  }, [files]);

  /* ---------- Apply filters + sort ---------- */
  const filtered = useMemo(() => {
    const cutoff = cutoffForPreset(datePreset);
    const q = searchText.trim().toLowerCase();

    let rows = files.filter((f) => {
      if (typeFilter !== "all" && f.doc_type !== typeFilter) return false;
      if (categoryFilter !== "all" && f.scope?.category?.category_id !== categoryFilter) return false;
      if (clientFilter !== "all" && f.job?.client_name !== clientFilter) return false;
      if (cutoff && new Date(f.uploaded_at) < cutoff) return false;
      if (q) {
        const haystack = [
          f.file_name,
          f.job?.job_name,
          f.job?.job_number,
          f.job?.client_name,
          f.scope?.item_name,
          f.scope?.category?.category_name,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    rows = [...rows].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "file_name":
          return (a.file_name || "").localeCompare(b.file_name || "") * dir;
        case "job_name":
          return (a.job?.job_name || "").localeCompare(b.job?.job_name || "") * dir;
        case "event_date": {
          const da = a.job?.event_date ? new Date(a.job.event_date).getTime() : 0;
          const db = b.job?.event_date ? new Date(b.job.event_date).getTime() : 0;
          return (da - db) * dir;
        }
        case "uploaded_at":
        default: {
          const da = new Date(a.uploaded_at).getTime();
          const db = new Date(b.uploaded_at).getTime();
          return (da - db) * dir;
        }
      }
    });
    return rows;
  }, [files, searchText, categoryFilter, clientFilter, typeFilter, datePreset, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "file_name" || key === "job_name" ? "asc" : "desc"); }
  };

  const clearFilters = () => {
    setSearchText(""); setCategoryFilter("all"); setClientFilter("all");
    setTypeFilter("all"); setDatePreset("all");
  };

  const hasActiveFilters = searchText || categoryFilter !== "all" || clientFilter !== "all"
    || typeFilter !== "all" || datePreset !== "all";

  const handleDownload = async (file: CadFile) => {
    if (!file.onedrive_path) { toast.error("File path missing"); return; }
    setDownloadingId(file.doc_id);
    try {
      const url = await getOneDriveUrl(file.onedrive_path);
      window.open(url, "_blank");
    } catch (err) {
      toast.error("Failed to generate download link");
    }
    setDownloadingId(null);
  };

  /* ---------- Render ---------- */

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy flex items-center gap-2">
            <Library className="h-5 w-5 text-starlight-blue" /> CAD Library
          </h1>
          <p className="text-sm text-muted mt-1">
            Searchable archive of every SketchUp / AutoCAD / STEP file uploaded against jobs,
            scopes, and work orders. For PM and lead reference.
          </p>
        </div>
        <div className="text-right text-xs text-muted">
          <span className="font-semibold text-navy">{files.length}</span> total
          {hasActiveFilters && files.length > 0 && (
            <> · showing <span className="font-semibold text-navy">{filtered.length}</span></>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="card px-4 py-3 space-y-3">
        {/* Row 1: search + clear */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
            <input
              type="text" value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search filename, job, scope, client…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-subtle rounded-lg bg-surface focus:outline-none focus:ring-2 focus:ring-starlight-blue"
            />
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters}
              className="inline-flex items-center gap-1 text-xs text-muted hover:text-navy px-2 py-1.5">
              <X className="h-3 w-3" /> Clear filters
            </button>
          )}
        </div>

        {/* Row 2: dropdowns + date presets */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Filter className="h-3.5 w-3.5 text-faint" />

          {/* Type toggle pills */}
          <div className="inline-flex rounded-lg border border-subtle overflow-hidden">
            {(["all", "cad_concept", "cad_breakdown"] as const).map((t) => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={cn(
                  "px-2.5 py-1 text-xs transition-colors",
                  typeFilter === t ? "bg-navy text-white" : "text-muted hover:bg-surface-mid"
                )}>
                {t === "all" ? "All" : t === "cad_concept" ? "Concept" : "Breakdown"}
              </button>
            ))}
          </div>

          <select value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="px-2 py-1 border border-subtle rounded bg-surface text-navy">
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="px-2 py-1 border border-subtle rounded bg-surface text-navy">
            <option value="all">All clients</option>
            {clients.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Date preset pills */}
          <div className="inline-flex rounded-lg border border-subtle overflow-hidden ml-auto">
            {(["all", "year", "quarter", "month"] as const).map((p) => (
              <button key={p} onClick={() => setDatePreset(p)}
                className={cn(
                  "px-2.5 py-1 text-xs transition-colors",
                  datePreset === p ? "bg-navy text-white" : "text-muted hover:bg-surface-mid"
                )}>
                {p === "all" ? "All time" : p === "year" ? "Last year" : p === "quarter" ? "Last 3m" : "Last month"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="card px-5 py-12 text-center text-muted text-sm animate-pulse">
          Loading CAD library…
        </div>
      ) : files.length === 0 ? (
        <div className="card px-5 py-12 text-center">
          <Library className="h-8 w-8 mx-auto text-faint mb-3" />
          <p className="text-sm text-muted">No CAD files uploaded yet.</p>
          <p className="text-xs text-faint mt-1">
            Upload SketchUp / AutoCAD / STEP files on the Job, Scope, or Work Order page.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card px-5 py-12 text-center">
          <p className="text-sm text-muted">No files match these filters.</p>
          <button onClick={clearFilters}
            className="text-xs text-starlight-blue hover:underline mt-1">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-mid text-muted">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium w-14">Type</th>
                  <SortableHeader label="Filename" sortKey="file_name" currentKey={sortKey} currentDir={sortDir} onToggle={toggleSort} />
                  <SortableHeader label="Job" sortKey="job_name" currentKey={sortKey} currentDir={sortDir} onToggle={toggleSort} />
                  <th className="px-3 py-2 font-medium">Scope / Category</th>
                  <SortableHeader label="Event date" sortKey="event_date" currentKey={sortKey} currentDir={sortDir} onToggle={toggleSort} className="w-24" />
                  <SortableHeader label="Uploaded" sortKey="uploaded_at" currentKey={sortKey} currentDir={sortDir} onToggle={toggleSort} className="w-24" />
                  <th className="px-3 py-2 font-medium w-16 text-right">Size</th>
                  <th className="px-3 py-2 font-medium w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <CadRow key={f.doc_id} file={f} onDownload={handleDownload} isDownloading={downloadingId === f.doc_id} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Sub-components ---------- */

function SortableHeader({ label, sortKey, currentKey, currentDir, onToggle, className }: {
  label: string; sortKey: SortKey; currentKey: SortKey; currentDir: SortDir;
  onToggle: (k: SortKey) => void; className?: string;
}) {
  const active = sortKey === currentKey;
  return (
    <th className={cn("px-3 py-2 font-medium", className)}>
      <button onClick={() => onToggle(sortKey)}
        className={cn("inline-flex items-center gap-1 hover:text-navy transition-colors",
          active && "text-navy font-semibold")}>
        {label}
        <ArrowUpDown className={cn("h-3 w-3", active ? "text-navy" : "text-faint")} />
        {active && <span className="text-[10px]">{currentDir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

function CadRow({ file, onDownload, isDownloading }: {
  file: CadFile;
  onDownload: (f: CadFile) => void;
  isDownloading: boolean;
}) {
  const isConcept = file.doc_type === "cad_concept";
  const anchorLabel = file.work_order_id
    ? "WO-level"
    : file.scope_item_id
      ? "Scope-level"
      : "Job-level";
  const scopeLink = file.scope_item_id && file.job_id
    ? `/jobs/${file.job_id}/scope/${file.scope_item_id}`
    : null;
  const jobLink = file.job_id ? `/jobs/${file.job_id}` : null;
  const ext = (file.file_name.split(".").pop() || "").toLowerCase();

  return (
    <tr className="border-t border-subtle hover:bg-surface-mid/30">
      {/* Type chip */}
      <td className="px-3 py-2.5 align-top">
        <span className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium",
          isConcept
            ? "bg-starlight-blue/10 text-starlight-blue"
            : "bg-starlight-amber/10 text-starlight-amber"
        )}>
          <FileCode2 className="h-2.5 w-2.5" />
          {isConcept ? "Concept" : "Breakdown"}
        </span>
      </td>

      {/* Filename */}
      <td className="px-3 py-2.5 align-top max-w-xs">
        <div className="text-sm text-foreground truncate" title={file.file_name}>
          {file.file_name}
        </div>
        <div className="text-[10px] text-faint mt-0.5 uppercase">
          .{ext} · {anchorLabel}
        </div>
      </td>

      {/* Job */}
      <td className="px-3 py-2.5 align-top">
        {jobLink ? (
          <Link href={jobLink} className="text-sm text-navy hover:text-starlight-blue transition-colors inline-flex items-center gap-1">
            {file.job?.job_name || "—"}
            <ExternalLink className="h-3 w-3 opacity-40" />
          </Link>
        ) : (
          <span className="text-sm text-muted">{file.job?.job_name || "—"}</span>
        )}
        <div className="text-[10px] text-muted mt-0.5 font-mono">
          {file.job?.job_number}
          {file.job?.client_name && <span className="ml-1 font-sans text-faint">· {file.job.client_name}</span>}
        </div>
      </td>

      {/* Scope + category */}
      <td className="px-3 py-2.5 align-top">
        {file.scope_item_id ? (
          scopeLink ? (
            <Link href={scopeLink} className="text-sm text-navy hover:text-starlight-blue transition-colors inline-flex items-center gap-1">
              {file.scope?.item_name || `Scope #${file.scope_item_id}`}
              <ExternalLink className="h-3 w-3 opacity-40" />
            </Link>
          ) : (
            <span className="text-sm text-muted">{file.scope?.item_name}</span>
          )
        ) : (
          <span className="text-xs text-faint italic">Job-level — not scope specific</span>
        )}
        {file.scope?.category?.category_name && (
          <div className="mt-0.5">
            <span className="inline-block text-[10px] bg-surface-mid text-muted px-1.5 py-0.5 rounded">
              {file.scope.category.category_name}
            </span>
          </div>
        )}
      </td>

      {/* Event date */}
      <td className="px-3 py-2.5 align-top text-xs text-muted whitespace-nowrap">
        {file.job?.event_date ? formatDate(file.job.event_date) : "—"}
      </td>

      {/* Uploaded at */}
      <td className="px-3 py-2.5 align-top text-xs text-muted whitespace-nowrap">
        {new Date(file.uploaded_at).toLocaleDateString("en-GB")}
      </td>

      {/* Size */}
      <td className="px-3 py-2.5 align-top text-xs text-muted text-right whitespace-nowrap">
        {prettyBytes(file.file_size)}
      </td>

      {/* Download */}
      <td className="px-3 py-2.5 align-top text-right">
        <button onClick={() => onDownload(file)}
          disabled={isDownloading || !file.onedrive_path}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-starlight-blue/10 text-starlight-blue rounded hover:bg-starlight-blue/20 transition-colors disabled:opacity-40"
          title="Download original CAD file">
          {isDownloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
        </button>
      </td>
    </tr>
  );
}
