"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { getOneDriveUrl } from "@/lib/onedrive-client";
import { Loader2, Check, Plus, FileText, Zap, ArrowRightLeft, Search, Settings2 } from "lucide-react";
import { getAuditContext, auditedUpdate } from "@/lib/audit";
import {
  buildMaterialSummary,
  sheetLayoutFields,
  timberLayoutFields,
  resolveCutSettings,
  stackCountForThickness,
  parseSheetSize,
  DEFAULT_CUT_SETTINGS,
  type ExtractedLine,
  type MaterialSummary,
  type CatalogueMat,
  type CutSettings,
} from "@/lib/cut-layout";
import { CutPlanSection } from "@/components/cut-layout-renderer";

interface CutListExtractorProps {
  docId: number;
  workOrderId: number;
  jobId: number;
  onedrivePath: string | null;
  fileName: string;
  mimeType: string | null;
  extractionStatus: string | null;
  extractedData: any;
  onUpdate: () => void;
}

export function CutListExtractor({
  docId, workOrderId, jobId, onedrivePath, fileName,
  mimeType, extractionStatus: initialStatus, extractedData, onUpdate,
}: CutListExtractorProps) {
  const supabase = createClient();
  const [extracting, setExtracting] = useState(false);
  const [status, setStatus] = useState(initialStatus || "pending");
  const [parts, setParts] = useState<ExtractedLine[]>(extractedData?.lines || []);
  const [matSummary, setMatSummary] = useState<MaterialSummary[]>([]);
  const [summary, setSummary] = useState<any>(extractedData?.summary || null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showParts, setShowParts] = useState(false);
  const [showLayout, setShowLayout] = useState(false);
  const [swappingIdx, setSwappingIdx] = useState<number | null>(null);
  const [catSearch, setCatSearch] = useState("");
  const [allCatMats, setAllCatMats] = useState<CatalogueMat[]>([]);
  // Per-WO cut-nesting overrides. null = workshop defaults.
  const [cutSettings, setCutSettings] = useState<Partial<CutSettings> | null>(null);
  const [showCutSettings, setShowCutSettings] = useState(false);
  const [draftSettings, setDraftSettings] = useState<CutSettings>(DEFAULT_CUT_SETTINGS);
  const [savingSettings, setSavingSettings] = useState(false);

  // Load this WO's saved cut settings (kerf / squaring / stack overrides)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("tbl_work_orders")
        .select("cut_settings")
        .eq("work_order_id", workOrderId)
        .single();
      setCutSettings((data?.cut_settings as Partial<CutSettings>) || null);
    })();
  }, [workOrderId]);

  // Recalculate material summary from parts data whenever parts or settings change
  useEffect(() => {
    if (parts.length === 0 || status === "pending") return;
    const recalc = async () => {
      const { data: catMats } = await supabase.from("tbl_materials")
        .select("material_id, material_name, standard_length, standard_sheet_size, unit, current_unit_cost, material_category")
        .eq("active", true);
      setAllCatMats((catMats || []) as CatalogueMat[]);
      const recalced = buildMaterialSummary(parts, (catMats || []) as CatalogueMat[], resolveCutSettings(cutSettings));
      setMatSummary(recalced);
    };
    recalc();
  }, [parts, status, cutSettings]);

  const handleExtract = async () => {
    if (!onedrivePath) return;
    setExtracting(true);
    setError(null);

    try {
      const { data: materials } = await supabase
        .from("tbl_materials")
        .select("material_id, material_name, unit, current_unit_cost, standard_length, standard_sheet_size, spec_val_1, spec_val_2, spec_val_3")
        .eq("active", true);

      const matContext = (materials || []).map(m => {
        const specs = [m.spec_val_1, m.spec_val_2, m.spec_val_3].filter(Boolean);
        return `${m.material_name} (unit: ${m.unit}${m.standard_length ? ', std length: ' + m.standard_length + 'mm' : ''}${m.standard_sheet_size ? ', std sheet: ' + m.standard_sheet_size : ''} ${specs.length ? 'dims: ' + specs.join('x') + 'mm' : ''})`;
      }).join('\n');

      let body: any = { file_name: fileName, materials_context: matContext };
      const isCSV = fileName.toLowerCase().endsWith(".csv");

      if (isCSV) {
        const url = await getOneDriveUrl(onedrivePath);
        const res = await fetch(url);
        body.csv_text = await res.text();
      } else {
        const url = await getOneDriveUrl(onedrivePath);
        const res = await fetch(url);
        const blob = await res.blob();
        body.file_data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.readAsDataURL(blob);
        });
        body.media_type = mimeType || "application/pdf";
      }

      const { data: { session } } = await supabase.auth.getSession();
      const extractRes = await fetch("/api/extract-cutlist", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(body),
      });

      if (!extractRes.ok) {
        const err = await extractRes.json().catch(() => ({}));
        throw new Error(err.error || `Extraction failed: ${extractRes.status}`);
      }

      const data = await extractRes.json();
      const extractedParts = data.lines || [];
      setParts(extractedParts);

      // Fetch catalogue materials for calculation reference
      const { data: catMats } = await supabase.from("tbl_materials")
        .select("material_id, material_name, standard_length, standard_sheet_size, unit, current_unit_cost, material_category")
        .eq("active", true);

      setAllCatMats((catMats || []) as CatalogueMat[]);

      // Client-side calculation — all math done deterministically in the lib
      const recalced = buildMaterialSummary(extractedParts, (catMats || []) as CatalogueMat[], resolveCutSettings(cutSettings));
      setMatSummary(recalced);
      setSummary(data.summary || null);
      setStatus("extracted");

      // Audited write: extraction status + extracted data
      const ctx = await getAuditContext(supabase);
      await auditedUpdate(ctx, "tbl_wo_documents", docId, {
        extraction_status: "extracted",
        extracted_data: data,
      }, jobId);
    } catch (err: any) {
      setError(err.message);
    }
    setExtracting(false);
  };

  const toggleMat = (idx: number) => {
    setMatSummary(prev => prev.map((m, i) => i === idx ? { ...m, _selected: !m._selected } : m));
  };

  // Swap catalogue material for a summary row and recalculate layout.
  // Uses the same shared helpers as buildMaterialSummary — single source of truth.
  const swapCatalogueMat = (idx: number, newCat: CatalogueMat) => {
    const settings = resolveCutSettings(cutSettings);
    setMatSummary(prev => prev.map((m, i) => {
      if (i !== idx) return m;
      const matLower = (m.material || "").toLowerCase();
      const matParts = parts.filter(p => (p.material || "").toLowerCase() === matLower);
      const cat = m.material_category.toLowerCase();

      if (cat === "timber") {
        return {
          ...m,
          _catalogueMatch: newCat,
          patterns: undefined,
          total_passes: undefined,
          stack_count: undefined,
          ...timberLayoutFields(matParts, newCat.standard_length || 4800, settings),
        };
      }
      if (cat === "sheet") {
        const catSheet = parseSheetSize(newCat.standard_sheet_size);
        return {
          ...m,
          _catalogueMatch: newCat,
          length_bins: undefined,
          ...sheetLayoutFields(matParts, catSheet?.w || 2440, catSheet?.h || 1220, settings),
        };
      }
      return { ...m, _catalogueMatch: newCat };
    }));
    setSwappingIdx(null);
    setCatSearch("");
  };

  // Cut settings editor: open seeds the draft from current resolved settings.
  const openCutSettings = () => {
    setDraftSettings(resolveCutSettings(cutSettings));
    setShowCutSettings(true);
  };

  const saveCutSettings = async () => {
    setSavingSettings(true);
    // Store NULL when the draft is just the workshop defaults (keeps rows clean).
    const noOverrides = !draftSettings.stack_overrides || Object.keys(draftSettings.stack_overrides).length === 0;
    const isDefault =
      draftSettings.kerf_mm === DEFAULT_CUT_SETTINGS.kerf_mm &&
      draftSettings.squaring_mm === DEFAULT_CUT_SETTINGS.squaring_mm &&
      noOverrides;
    const toStore = isDefault ? null : draftSettings;
    const ctx = await getAuditContext(supabase);
    await auditedUpdate(ctx, "tbl_work_orders", workOrderId, { cut_settings: toStore }, jobId);
    setCutSettings(toStore);
    setSavingSettings(false);
    setShowCutSettings(false);
  };

  // Distinct sheet thicknesses present, for the per-thickness stack table.
  const sheetThicknesses = Array.from(new Set(
    parts
      .filter(p => (p.material_category || "").toLowerCase() === "sheet" && p.thickness_mm)
      .map(p => p.thickness_mm as number)
  )).sort((a, b) => b - a);

  const addToBom = async () => {
    const selected = matSummary.filter(m => m._selected);
    if (selected.length === 0) return;
    setAdding(true);

    const { data: lookups } = await supabase
      .from("tbl_master_lookups").select("lookup_id, lookup_value")
      .eq("category", "MATERIAL_CATEGORY").eq("active", true);
    const catMap: Record<string, number> = {};
    (lookups || []).forEach((l: any) => { catMap[(l.lookup_value || "").toLowerCase()] = l.lookup_id; });

    const { data: materials } = await supabase
      .from("tbl_materials")
      .select("material_id, material_name, unit, current_unit_cost, material_category, standard_length, standard_sheet_size")
      .eq("active", true);

    // Recalculate inline from parts — deterministic JS math via shared lib
    const recalced = buildMaterialSummary(parts, (materials || []) as CatalogueMat[], resolveCutSettings(cutSettings));
    // Apply user's checkbox selections and catalogue overrides from matSummary state
    const selectedMats = new Set(matSummary.filter(m => m._selected).map(m => (m.material || "").toLowerCase()));
    const overrideMap: Record<string, CatalogueMat | null> = {};
    for (const m of matSummary) { if (m._catalogueMatch) overrideMap[(m.material || "").toLowerCase()] = m._catalogueMatch; }
    for (const m of recalced) {
      m._selected = selectedMats.has((m.material || "").toLowerCase());
      const override = overrideMap[(m.material || "").toLowerCase()];
      if (override) m._catalogueMatch = override;
    }

    for (const mat of recalced) {
      if (!mat._selected) continue;
      const matLower = (mat.material || "").toLowerCase();
      let matched: any = mat._catalogueMatch || null;
      if (!matched) {
        matched = (materials || []).find(m => (m.material_name || "").toLowerCase() === matLower);
        if (!matched) matched = (materials || []).find(m => matLower.includes((m.material_name || "").toLowerCase()) || (m.material_name || "").toLowerCase().includes(matLower));
      }

      const catKey = (mat.material_category || "other").toLowerCase();

      const partsForMat = parts.filter(p => (p.material || "").toLowerCase() === matLower);
      const expandedParts: string[] = [];
      for (const p of partsForMat) {
        const dims = [p.length_mm, p.width_mm].filter(Boolean).join("x");
        expandedParts.push(`${p.quantity || 1}× ${p.description}${dims ? ` ${dims}mm` : ""}`);
      }
      const partsNote = expandedParts.length > 0
        ? `${expandedParts.length} parts: ${expandedParts.join(", ")}`.substring(0, 250)
        : "";

      const isTimber = mat.total_linear_mm != null && mat.total_linear_mm > 0;
      const stdLen = mat.standard_length_mm || 4800;
      const lengthsNeeded = mat.lengths_needed || 1;
      const totalMm = mat.total_linear_mm || 0;
      const totalMetresActual = Math.ceil(totalMm / 100) / 10;
      const bomQty = isTimber ? lengthsNeeded
        : mat.sheets_needed || mat.lengths_needed || 1;
      const bomUnit = isTimber ? "Length"
        : mat.sheets_needed ? "Sheet"
        : mat.lengths_needed ? "Length"
        : (matched?.unit || "Each");
      const displayName = matched?.material_name || mat.material;
      const bomDesc = isTimber
        ? `${displayName} - ${totalMetresActual}m actual (${lengthsNeeded}× ${stdLen / 1000}m)`
        : displayName + (mat.standard_sheet_size ? ` (${mat.standard_sheet_size})` : "");

      const catUnitCost = matched?.current_unit_cost || null;
      let bomUnitCost = catUnitCost;
      if (isTimber && catUnitCost && matched?.unit?.toLowerCase() === "metre") {
        bomUnitCost = Math.round(catUnitCost * (stdLen / 1000) * 100) / 100;
      }

      // NOTE: tbl_wo_bom is an audited table but this bulk insert path predates
      // the audit registry. Backlog item: migrate to auditedInsert.
      await supabase.from("tbl_wo_bom").insert({
        work_order_id: workOrderId,
        job_id: jobId,
        material_id: matched?.material_id || null,
        material_category: matched?.material_category || catMap[catKey] || null,
        item_description: bomDesc,
        quantity: bomQty,
        unit: bomUnit,
        unit_cost: bomUnitCost,
        needs_ordering: matched ? "false" : "true",
        notes: partsNote || null,
      });
    }

    const ctx = await getAuditContext(supabase);
    await auditedUpdate(ctx, "tbl_wo_documents", docId, {
      extraction_status: "confirmed",
    }, jobId);
    setStatus("confirmed");
    setAdding(false);
    onUpdate();
  };

  const selectedCount = matSummary.filter(m => m._selected).length;
  const hasLayoutData = matSummary.some(m =>
    (m.patterns && m.patterns.length > 0) ||
    (m.length_bins && m.length_bins.length > 0)
  );

  // PENDING
  if (status === "pending" && parts.length === 0) {
    return (
      <div className="mt-2 p-3 bg-starlight-amber/5 border border-starlight-amber/20 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-starlight-amber" />
            <span className="text-xs text-muted">{fileName}</span>
          </div>
          <button onClick={handleExtract} disabled={extracting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-starlight-amber text-white text-xs font-medium rounded-lg hover:bg-starlight-amber transition-colors disabled:opacity-50">
            {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            {extracting ? "Extracting..." : "Extract BOM"}
          </button>
        </div>
        {error && <p className="text-xs text-starlight-red mt-2">{error}</p>}
      </div>
    );
  }

  // CONFIRMED
  if (status === "confirmed") {
    return (
      <div className="mt-2 p-2 bg-starlight-green/5 border border-starlight-green/20 rounded-lg">
        <div className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-starlight-green" />
            <span className="text-[10px] text-starlight-green font-medium">
              {matSummary.length} material{matSummary.length !== 1 ? "s" : ""} added to BOM ({parts.length} parts extracted)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {hasLayoutData && (
              <button
                onClick={() => setShowLayout(!showLayout)}
                className="text-[10px] text-muted hover:text-starlight-blue px-2 py-0.5 rounded hover:bg-starlight-blue/10 transition-colors"
              >
                {showLayout ? "▾ Hide" : "▸ Show"} cut layout
              </button>
            )}
            <button
              onClick={async () => {
                // Delete existing BOM rows for this WO so we don't duplicate
                await supabase.from("tbl_wo_bom").delete().eq("work_order_id", workOrderId);
                const ctx = await getAuditContext(supabase);
                await auditedUpdate(ctx, "tbl_wo_documents", docId, {
                  extraction_status: "extracted",
                }, jobId);
                setStatus("extracted");
                if (onUpdate) onUpdate();
              }}
              className="text-[10px] text-muted hover:text-starlight-blue px-2 py-0.5 rounded hover:bg-starlight-blue/10 transition-colors"
            >
              Re-add to BOM
            </button>
          </div>
        </div>
        {showLayout && hasLayoutData && (
          <div className="mt-2 pt-2 border-t border-starlight-green/20">
            <CutPlanSection summaries={matSummary} compact />
          </div>
        )}
      </div>
    );
  }

  // EXTRACTED — show material summary (what to order) + cut layout + expandable parts list
  if (matSummary.length > 0) {
    return (
      <div className="mt-2 border border-subtle rounded-lg overflow-hidden">
        {summary && (
          <div className="px-3 py-2 bg-surface-dim border-b border-subtle flex items-center justify-between">
            <span className="text-[10px] text-muted">{summary.total_parts} parts → {matSummary.length} material{matSummary.length !== 1 ? "s" : ""} to order</span>
          </div>
        )}

        {/* Material summary — what to add to BOM */}
        <div className="px-3 py-2">
          <p className="text-[9px] text-muted uppercase tracking-wider font-semibold mb-1.5">Materials to Order</p>
          <div className="space-y-1.5">
            {matSummary.map((mat, idx) => {
              const hasOverride = mat._catalogueMatch && mat._catalogueMatch.material_name.toLowerCase() !== (mat.material || "").toLowerCase();
              const isSwapping = swappingIdx === idx;
              const searchLower = catSearch.toLowerCase();
              const filtered = allCatMats.filter(m => !searchLower || (m.material_name || "").toLowerCase().includes(searchLower));
              const sorted = [...filtered].sort((a, b) => {
                const aName = (a.material_name || "").toLowerCase();
                const bName = (b.material_name || "").toLowerCase();
                const aiName = (mat.material || "").toLowerCase();
                const aMatch = aName.includes(aiName) || aiName.includes(aName);
                const bMatch = bName.includes(aiName) || aiName.includes(bName);
                if (aMatch && !bMatch) return -1;
                if (!aMatch && bMatch) return 1;
                return aName.localeCompare(bName);
              });

              return (
                <div key={idx}>
                  <div className={"flex items-center gap-2 py-1 px-2 rounded-lg " + (mat._selected ? "bg-starlight-green/5" : "bg-surface-dim opacity-50")}>
                    <input type="checkbox" checked={!!mat._selected} onChange={() => toggleMat(idx)} className="h-3 w-3 rounded border-subtle" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-navy font-medium">{hasOverride ? mat._catalogueMatch!.material_name : mat.material}</span>
                        <button onClick={() => { setSwappingIdx(isSwapping ? null : idx); setCatSearch(""); }}
                          className={"p-0.5 rounded transition-colors " + (isSwapping ? "text-starlight-blue bg-starlight-blue/10" : "text-faint hover:text-starlight-blue")}
                          title="Change catalogue material">
                          <ArrowRightLeft className="h-3 w-3" />
                        </button>
                      </div>
                      {hasOverride && (
                        <p className="text-[9px] text-muted line-through">{mat.material}</p>
                      )}
                      {!hasOverride && mat._catalogueMatch && (
                        <p className="text-[9px] text-starlight-green">✓ matched to catalogue</p>
                      )}
                      {!mat._catalogueMatch && (
                        <p className="text-[9px] text-starlight-amber">no catalogue match — click ⇄ to assign</p>
                      )}
                    </div>
                    {mat.total_linear_mm != null && mat.total_linear_mm > 0 && (
                      <span className="text-[10px] font-mono text-muted shrink-0">{mat.total_linear_mm}mm</span>
                    )}
                    {mat.lengths_needed != null && mat.lengths_needed > 0 && (
                      <span className="text-xs font-mono text-starlight-blue font-medium shrink-0">{mat.lengths_needed}× {mat.standard_length_mm || 4800}mm</span>
                    )}
                    {mat.sheets_needed != null && mat.sheets_needed > 0 && (
                      <span className="text-xs font-mono text-starlight-blue font-medium shrink-0">{mat.sheets_needed} sheet{mat.sheets_needed > 1 ? "s" : ""}</span>
                    )}
                    <span className="text-[10px] text-muted shrink-0">{mat.total_parts} parts</span>
                    {mat.waste_pct != null && (
                      <span className={"text-[10px] shrink-0 " + (mat.waste_pct > 40 ? "text-starlight-amber" : "text-muted")}>{mat.waste_pct}% waste</span>
                    )}
                  </div>

                  {/* Catalogue material search dropdown */}
                  {isSwapping && (
                    <div className="ml-7 mt-1 mb-1 border border-starlight-blue/30 rounded-lg bg-surface overflow-hidden">
                      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-subtle">
                        <Search className="h-3 w-3 text-muted shrink-0" />
                        <input type="text" value={catSearch} onChange={e => setCatSearch(e.target.value)}
                          placeholder="Search catalogue materials..."
                          autoFocus
                          className="flex-1 text-xs bg-transparent focus:outline-none placeholder:text-faint" />
                      </div>
                      <div className="max-h-40 overflow-y-auto">
                        {sorted.slice(0, 20).map(cm => {
                          const isCurrent = mat._catalogueMatch?.material_id === cm.material_id;
                          return (
                            <button key={cm.material_id}
                              onClick={() => swapCatalogueMat(idx, cm)}
                              className={"w-full text-left px-2 py-1.5 text-xs flex items-center justify-between gap-2 hover:bg-starlight-blue/5 transition-colors border-b border-subtle last:border-0 " + (isCurrent ? "bg-starlight-green/5 text-starlight-green" : "text-navy")}>
                              <div className="min-w-0">
                                <span className="font-medium">{cm.material_name}</span>
                                <span className="text-[10px] text-muted ml-1.5">
                                  {cm.standard_sheet_size ? `Sheet: ${cm.standard_sheet_size}` : cm.standard_length ? `${cm.standard_length}mm` : cm.unit}
                                </span>
                              </div>
                              {cm.current_unit_cost != null && (
                                <span className="text-[10px] text-muted font-mono shrink-0">£{cm.current_unit_cost.toFixed(2)}/{cm.unit}</span>
                              )}
                            </button>
                          );
                        })}
                        {sorted.length === 0 && <p className="px-2 py-2 text-[10px] text-muted">No materials match</p>}
                        {sorted.length > 20 && <p className="px-2 py-1 text-[10px] text-muted">Type to narrow — {sorted.length - 20} more</p>}
                      </div>
                    </div>
                  )}

                  {mat.anomalies && mat.anomalies.length > 0 && (
                    <div className="ml-7 mt-0.5 mb-1">
                      {mat.anomalies.map((a, ai) => (
                        <p key={ai} className="text-[10px] text-starlight-amber flex items-start gap-1">
                          <span className="shrink-0">⚠</span> {a}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Cut layout — collapsible, with per-WO cut settings */}
        {hasLayoutData && (
          <div className="border-t border-subtle">
            <div className="flex items-center justify-between">
              <button onClick={() => setShowLayout(!showLayout)} className="flex-1 px-3 py-1.5 text-left text-[10px] text-muted hover:text-foreground">
                {showLayout ? "▾" : "▸"} Cut layout preview
              </button>
              <button
                onClick={openCutSettings}
                className="px-2 py-1.5 text-muted hover:text-starlight-blue"
                aria-label="Cut settings"
              >
                <span title="Cut settings — kerf, squaring, stacking">
                  <Settings2 className="h-3.5 w-3.5" />
                </span>
              </button>
            </div>

            {showCutSettings && (
              <div className="px-3 py-2 border-t border-subtle bg-surface-dim space-y-2">
                <p className="text-[9px] text-muted uppercase tracking-wider font-semibold">
                  Cut settings — this work order
                </p>
                <div className="flex gap-3">
                  <label className="text-[10px] text-muted flex flex-col gap-0.5">
                    Blade kerf (mm)
                    <input
                      type="number" step="0.1" min="0"
                      value={draftSettings.kerf_mm}
                      onChange={e => setDraftSettings(s => ({ ...s, kerf_mm: parseFloat(e.target.value) || 0 }))}
                      className="w-20 px-1.5 py-0.5 text-xs border border-subtle rounded bg-surface"
                    />
                  </label>
                  <label className="text-[10px] text-muted flex flex-col gap-0.5">
                    Squaring (mm)
                    <input
                      type="number" step="0.5" min="0"
                      value={draftSettings.squaring_mm}
                      onChange={e => setDraftSettings(s => ({ ...s, squaring_mm: parseFloat(e.target.value) || 0 }))}
                      className="w-20 px-1.5 py-0.5 text-xs border border-subtle rounded bg-surface"
                    />
                  </label>
                </div>

                {sheetThicknesses.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted mb-1">Sheets stacked per cut <span className="text-faint">(blank = auto)</span></p>
                    <div className="flex flex-wrap gap-2">
                      {sheetThicknesses.map(t => {
                        const auto = stackCountForThickness(t, { kerf_mm: draftSettings.kerf_mm, squaring_mm: draftSettings.squaring_mm });
                        const override = draftSettings.stack_overrides?.[String(t)];
                        return (
                          <label key={t} className="text-[10px] text-muted flex flex-col gap-0.5">
                            {t}mm
                            <input
                              type="number" min="1" max="20"
                              placeholder={`auto ${auto}`}
                              value={override ?? ""}
                              onChange={e => setDraftSettings(s => {
                                const next = { ...(s.stack_overrides || {}) };
                                const v = parseInt(e.target.value);
                                if (!e.target.value || isNaN(v)) delete next[String(t)];
                                else next[String(t)] = v;
                                return { ...s, stack_overrides: next };
                              })}
                              className="w-16 px-1.5 py-0.5 text-xs border border-subtle rounded bg-surface"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={saveCutSettings}
                    disabled={savingSettings}
                    className="text-[10px] px-2 py-1 rounded bg-starlight-blue text-white hover:bg-starlight-blue/90 disabled:opacity-50"
                  >
                    {savingSettings ? "Saving…" : "Save & recompute"}
                  </button>
                  <button
                    onClick={() => setDraftSettings(DEFAULT_CUT_SETTINGS)}
                    className="text-[10px] px-2 py-1 rounded border border-subtle text-muted hover:text-foreground"
                  >
                    Reset to defaults
                  </button>
                  <button
                    onClick={() => setShowCutSettings(false)}
                    className="text-[10px] px-2 py-1 text-muted hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {showLayout && (
              <div className="px-3 pb-2 border-t border-subtle">
                <CutPlanSection summaries={matSummary} compact />
              </div>
            )}
          </div>
        )}

        {/* Expandable parts list — reference */}
        <div className="border-t border-subtle">
          <button onClick={() => setShowParts(!showParts)} className="w-full px-3 py-1.5 text-left text-[10px] text-muted hover:text-muted">
            {showParts ? "▾" : "▸"} {parts.length} individual parts (reference)
          </button>
          {showParts && (
            <div className="overflow-x-auto max-h-48 overflow-y-auto border-t border-subtle">
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-[9px] text-muted uppercase tracking-wider border-b border-subtle">
                    <th className="px-2 py-1 text-left">Label</th>
                    <th className="px-2 py-1 text-left">Part</th>
                    <th className="px-2 py-1 text-left">Material</th>
                    <th className="px-2 py-1 text-right">L</th>
                    <th className="px-2 py-1 text-right">W</th>
                    <th className="px-2 py-1 text-right">T</th>
                    <th className="px-2 py-1 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((p, idx) => (
                    <tr key={idx} className="border-b border-subtle">
                      <td className="px-2 py-0.5 font-mono text-muted">{p.part_label || "—"}</td>
                      <td className="px-2 py-0.5 text-navy">{p.description}</td>
                      <td className="px-2 py-0.5 text-muted">{p.material}</td>
                      <td className="px-2 py-0.5 text-right font-mono text-muted">{p.length_mm || "—"}</td>
                      <td className="px-2 py-0.5 text-right font-mono text-muted">{p.width_mm || "—"}</td>
                      <td className="px-2 py-0.5 text-right font-mono text-muted">{p.thickness_mm || "—"}</td>
                      <td className="px-2 py-0.5 text-right font-mono text-navy">{p.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add to BOM button */}
        <div className="px-3 py-2 border-t border-subtle bg-surface-dim flex items-center justify-between">
          <span className="text-[10px] text-muted">{selectedCount} material{selectedCount !== 1 ? "s" : ""} selected</span>
          <button onClick={addToBom} disabled={selectedCount === 0 || adding}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-starlight-green text-white text-xs font-medium rounded-lg hover:bg-starlight-green transition-colors disabled:opacity-50">
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {adding ? "Adding..." : `Add ${selectedCount} to BOM`}
          </button>
        </div>
      </div>
    );
  }
  return null;
}
