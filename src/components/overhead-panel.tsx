"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getAuditContext, auditedInsert, auditedDelete } from "@/lib/audit";
import { toast } from "sonner";
import {
  Receipt, ChevronDown, ChevronRight, Plus, Trash2, Coins, Clock,
} from "lucide-react";

interface Category { lookup_id: number; lookup_value: string; active: boolean; display_order: number | null; }
interface Supplier { supplier_id: number; supplier_name: string; }
interface MonthRow { month: string; category_id: number | null; category: string; cost_type: "spend" | "labour"; entries: number; total: number; }
interface Entry {
  overhead_cost_id: number; cost_date: string; cost_type: "spend" | "labour";
  category_id: number | null; description: string; amount: number;
  hours: number | null; supplier_id: number | null;
}

const todayStr = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};
const thisMonthStr = () => todayStr().slice(0, 7); // YYYY-MM

export function OverheadPanel() {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [cats, setCats] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);

  // Spend entry form
  const [fDate, setFDate] = useState(todayStr());
  const [fCat, setFCat] = useState<string>("");
  const [fDesc, setFDesc] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fSupplier, setFSupplier] = useState<string>("");
  const [fNote, setFNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [catRes, supRes, monthRes, entRes] = await Promise.all([
      supabase.from("tbl_master_lookups").select("lookup_id, lookup_value, active, display_order").eq("category", "OVERHEAD_CATEGORY").order("display_order"),
      supabase.from("tbl_suppliers").select("supplier_id, supplier_name").eq("active", true).order("supplier_name"),
      supabase.from("qry_overhead_monthly").select("*").order("month", { ascending: false }),
      supabase.from("tbl_overhead_costs").select("overhead_cost_id, cost_date, cost_type, category_id, description, amount, hours, supplier_id").order("cost_date", { ascending: false }).limit(50),
    ]);
    setCats((catRes.data || []) as Category[]);
    setSuppliers((supRes.data || []) as Supplier[]);
    setMonths((monthRes.data || []) as MonthRow[]);
    setEntries((entRes.data || []) as Entry[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const catMap: Record<number, string> = {};
  cats.forEach((c) => { catMap[c.lookup_id] = c.lookup_value; });
  const supMap: Record<number, string> = {};
  suppliers.forEach((s) => { supMap[s.supplier_id] = s.supplier_name; });

  // Totals
  const tm = thisMonthStr();
  const thisMonthTotal = months.filter((m) => m.month.slice(0, 7) === tm).reduce((s, m) => s + Number(m.total), 0);
  const last12Total = months.reduce((s, m) => s + Number(m.total), 0);

  // Group monthly rollup: month -> { spend, labour, total }
  const byMonth: Record<string, { spend: number; labour: number; total: number }> = {};
  months.forEach((m) => {
    const k = m.month.slice(0, 7);
    if (!byMonth[k]) byMonth[k] = { spend: 0, labour: 0, total: 0 };
    if (m.cost_type === "labour") byMonth[k].labour += Number(m.total);
    else byMonth[k].spend += Number(m.total);
    byMonth[k].total += Number(m.total);
  });
  const monthKeys = Object.keys(byMonth).sort().reverse().slice(0, 12);

  // By category over last 12 months
  const byCat: Record<string, number> = {};
  months.forEach((m) => { byCat[m.category] = (byCat[m.category] || 0) + Number(m.total); });
  const catRows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  const handleAddSpend = async () => {
    if (!fCat) { toast.error("Pick a category"); return; }
    if (!fDesc.trim()) { toast.error("Add a description"); return; }
    const amt = parseFloat(fAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    const ctx = await getAuditContext(supabase);
    const ins = await auditedInsert(ctx, "tbl_overhead_costs", {
      cost_date: fDate || todayStr(),
      cost_type: "spend",
      category_id: parseInt(fCat),
      description: fDesc.trim(),
      amount: Math.round(amt * 100) / 100,
      supplier_id: fSupplier ? parseInt(fSupplier) : null,
      note: fNote.trim() || null,
      created_by: ctx.userId,
    });
    setSaving(false);
    if (ins.error) { toast.error("Couldn't save — check fields"); return; }
    toast.success(`Logged ${formatCurrency(amt)} overhead`);
    setFDesc(""); setFAmount(""); setFNote(""); setFSupplier("");
    load();
  };

  const handleDelete = async (id: number) => {
    const ctx = await getAuditContext(supabase);
    const res = await auditedDelete(ctx, "tbl_overhead_costs", id);
    if (res.error) { toast.error("Couldn't delete"); return; }
    setConfirmDelete(null);
    toast.success("Entry removed");
    load();
  };

  return (
    <div className="card overflow-hidden">
      {/* Header — always visible, shows the running figure */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-surface-dim/50 transition-colors text-left"
      >
        <div className="text-faint">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</div>
        <Receipt className="h-4 w-4 text-starlight-amber shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-navy">Workshop Overhead</p>
          <p className="text-[11px] text-muted">Non-job running costs — consumables, cleaning, general labour</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-navy font-mono">{formatCurrency(thisMonthTotal)}</p>
          <p className="text-[10px] text-muted">this month</p>
        </div>
        <div className="text-right shrink-0 w-24">
          <p className="text-sm font-semibold text-muted font-mono">{formatCurrency(last12Total)}</p>
          <p className="text-[10px] text-muted">last 12 mo</p>
        </div>
      </button>

      {open && (
        <div className="border-t border-subtle">
          {loading ? (
            <p className="px-5 py-8 text-xs text-muted text-center animate-pulse">Loading overhead…</p>
          ) : (
            <div className="p-5 space-y-5">
              {/* Spend entry form */}
              <div className="bg-surface-dim/40 border border-subtle rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2 text-[10px] font-semibold text-muted uppercase tracking-wider">
                  <Plus className="h-3 w-3" /> Log a cost
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="text-[9px] text-muted block mb-0.5">Date</label>
                    <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)}
                      className="px-2 py-1.5 text-xs border border-subtle rounded bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted block mb-0.5">Category</label>
                    <select value={fCat} onChange={(e) => setFCat(e.target.value)}
                      className="px-2 py-1.5 text-xs border border-subtle rounded bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue">
                      <option value="">Select…</option>
                      {cats.filter((c) => c.active).map((c) => (
                        <option key={c.lookup_id} value={c.lookup_id}>{c.lookup_value}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <label className="text-[9px] text-muted block mb-0.5">Description</label>
                    <input type="text" value={fDesc} onChange={(e) => setFDesc(e.target.value)}
                      placeholder="e.g. 12x sabre blades"
                      className="w-full px-2 py-1.5 text-xs border border-subtle rounded bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
                  </div>
                  <div className="w-28">
                    <label className="text-[9px] text-muted block mb-0.5">Amount (£, ex-VAT)</label>
                    <input type="number" step="0.01" min="0" value={fAmount} onChange={(e) => setFAmount(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs text-right border border-subtle rounded bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue" />
                  </div>
                  <div className="w-40">
                    <label className="text-[9px] text-muted block mb-0.5">Supplier (optional)</label>
                    <select value={fSupplier} onChange={(e) => setFSupplier(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-subtle rounded bg-surface focus:outline-none focus:ring-1 focus:ring-starlight-blue">
                      <option value="">—</option>
                      {suppliers.map((s) => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
                    </select>
                  </div>
                  <button onClick={handleAddSpend} disabled={saving}
                    className="px-4 py-1.5 bg-starlight-amber text-white text-xs font-medium rounded hover:bg-starlight-amber/90 disabled:opacity-50">
                    {saving ? "Saving…" : "Add"}
                  </button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                {/* By month */}
                <div>
                  <h4 className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">By month (last 12)</h4>
                  {monthKeys.length === 0 ? (
                    <p className="text-xs text-faint italic">No costs logged yet.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] text-muted uppercase tracking-wider border-b border-subtle">
                          <th className="text-left py-1.5 font-medium">Month</th>
                          <th className="text-right py-1.5 px-2 font-medium">Spend</th>
                          <th className="text-right py-1.5 px-2 font-medium">Labour</th>
                          <th className="text-right py-1.5 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthKeys.map((k) => (
                          <tr key={k} className="border-b border-subtle last:border-0">
                            <td className="py-1.5 text-xs text-navy font-medium">
                              {new Date(k + "-01").toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                            </td>
                            <td className="py-1.5 px-2 text-right text-xs font-mono text-muted">{formatCurrency(byMonth[k].spend)}</td>
                            <td className="py-1.5 px-2 text-right text-xs font-mono text-muted">{formatCurrency(byMonth[k].labour)}</td>
                            <td className="py-1.5 text-right text-xs font-mono font-semibold text-navy">{formatCurrency(byMonth[k].total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* By category */}
                <div>
                  <h4 className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">By category (last 12 mo)</h4>
                  {catRows.length === 0 ? (
                    <p className="text-xs text-faint italic">No costs logged yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {catRows.map(([name, total]) => {
                        const pct = last12Total > 0 ? (total / last12Total) * 100 : 0;
                        return (
                          <div key={name}>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-navy">{name}</span>
                              <span className="font-mono text-muted">{formatCurrency(total)}</span>
                            </div>
                            <div className="h-1.5 bg-surface-mid rounded-full overflow-hidden mt-0.5">
                              <div className="h-full bg-starlight-amber/60" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Recent entries */}
              <div>
                <h4 className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Recent entries</h4>
                {entries.length === 0 ? (
                  <p className="text-xs text-faint italic">Nothing logged yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {entries.map((e) => (
                          <tr key={e.overhead_cost_id} className="border-b border-subtle last:border-0">
                            <td className="py-1.5 pr-2 text-xs text-muted font-mono whitespace-nowrap">{formatDate(e.cost_date)}</td>
                            <td className="py-1.5 pr-2">
                              <span className={"inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium " + (e.cost_type === "labour" ? "bg-navy/10 text-navy" : "bg-starlight-amber/10 text-starlight-amber")}>
                                {e.cost_type === "labour" ? <Clock className="h-2.5 w-2.5" /> : <Coins className="h-2.5 w-2.5" />}
                                {e.cost_type === "labour" ? "Labour" : "Spend"}
                              </span>
                            </td>
                            <td className="py-1.5 pr-2 text-xs text-muted whitespace-nowrap">{e.category_id ? catMap[e.category_id] || "Uncategorised" : "Uncategorised"}</td>
                            <td className="py-1.5 pr-2 text-xs text-navy max-w-[260px] truncate">
                              {e.description}
                              {e.hours != null ? <span className="text-faint"> · {e.hours}h</span> : null}
                              {e.supplier_id ? <span className="text-faint"> · {supMap[e.supplier_id] || ""}</span> : null}
                            </td>
                            <td className="py-1.5 pr-2 text-right text-xs font-mono font-semibold text-navy whitespace-nowrap">{formatCurrency(Number(e.amount))}</td>
                            <td className="py-1.5 text-right w-16">
                              {confirmDelete === e.overhead_cost_id ? (
                                <span className="inline-flex items-center gap-1">
                                  <button onClick={() => handleDelete(e.overhead_cost_id)} className="text-[10px] text-starlight-red font-medium">Delete</button>
                                  <button onClick={() => setConfirmDelete(null)} className="text-[10px] text-muted">Cancel</button>
                                </span>
                              ) : (
                                <button onClick={() => setConfirmDelete(e.overhead_cost_id)} className="text-faint hover:text-starlight-red transition-colors" title="Delete entry">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
