"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { toast } from "sonner";
import { Plus, Trash2, Eye, EyeOff } from "lucide-react";

interface Cat {
  lookup_id: number;
  lookup_value: string;
  active: boolean;
  display_order: number | null;
}

export function OverheadCategoriesEditor() {
  const supabase = createClient();
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [usage, setUsage] = useState<Record<number, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tbl_master_lookups")
      .select("lookup_id, lookup_value, active, display_order")
      .eq("category", "OVERHEAD_CATEGORY")
      .order("display_order");
    const list = (data || []) as Cat[];
    setCats(list);
    // How many overhead entries reference each category (so we can warn on delete)
    const { data: rows } = await supabase
      .from("tbl_overhead_costs")
      .select("category_id");
    const u: Record<number, number> = {};
    (rows || []).forEach((r: any) => {
      if (r.category_id != null) u[r.category_id] = (u[r.category_id] || 0) + 1;
    });
    setUsage(u);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    if (cats.some((c) => c.lookup_value.toLowerCase() === name.toLowerCase())) {
      toast.error("That category already exists");
      return;
    }
    setAdding(true);
    const nextOrder = Math.max(0, ...cats.map((c) => c.display_order || 0)) + 1;
    const { error } = await supabase.from("tbl_master_lookups").insert({
      category: "OVERHEAD_CATEGORY",
      lookup_value: name,
      display_order: nextOrder,
      active: true,
    });
    setAdding(false);
    if (error) { toast.error("Couldn't add"); return; }
    setNewName("");
    toast.success("Category added");
    load();
  };

  const toggleActive = async (c: Cat) => {
    setCats((prev) => prev.map((x) => x.lookup_id === c.lookup_id ? { ...x, active: !x.active } : x));
    const { error } = await supabase.from("tbl_master_lookups").update({ active: !c.active }).eq("lookup_id", c.lookup_id);
    if (error) { toast.error("Couldn't update"); load(); return; }
    toast.success(!c.active ? "Category shown" : "Category hidden");
  };

  const rename = async (id: number, value: string) => {
    const v = value.trim();
    if (!v) { load(); return; }
    const { error } = await supabase.from("tbl_master_lookups").update({ lookup_value: v }).eq("lookup_id", id);
    if (error) { toast.error("Couldn't rename"); return; }
    toast.success("Renamed");
  };

  const handleDelete = async (id: number) => {
    const { error } = await supabase.from("tbl_master_lookups").delete().eq("lookup_id", id);
    if (error) { toast.error("Couldn't delete"); return; }
    setConfirmDelete(null);
    toast.success("Category deleted");
    load();
  };

  if (loading) return <div className="card p-6 text-sm text-muted">Loading categories…</div>;

  return (
    <div className="space-y-4">
      {/* Add */}
      <div className="flex items-end gap-2">
        <div className="flex-1 max-w-sm">
          <label className="block text-xs font-medium text-muted mb-1">New category</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            placeholder="e.g. Vehicle & fuel"
            className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
          />
        </div>
        <button onClick={handleAdd} disabled={adding || !newName.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-starlight-amber text-white text-sm font-medium rounded-lg hover:bg-starlight-amber/90 disabled:opacity-50 transition-colors">
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-base text-left text-xs text-muted uppercase tracking-wider">
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium w-28">In use</th>
              <th className="px-4 py-3 font-medium w-28">Status</th>
              <th className="px-4 py-3 font-medium w-20"></th>
            </tr>
          </thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.lookup_id} className={"border-t border-subtle " + (c.active ? "" : "opacity-50")}>
                <td className="px-4 py-2.5">
                  <input
                    type="text"
                    defaultValue={c.lookup_value}
                    onBlur={(e) => { if (e.target.value.trim() !== c.lookup_value) rename(c.lookup_id, e.target.value); }}
                    className="w-full bg-transparent border border-transparent hover:border-subtle focus:border-starlight-blue focus:outline-none rounded px-2 py-1 text-navy"
                  />
                </td>
                <td className="px-4 py-2.5 text-xs text-muted">{usage[c.lookup_id] ? `${usage[c.lookup_id]} entr${usage[c.lookup_id] === 1 ? "y" : "ies"}` : "—"}</td>
                <td className="px-4 py-2.5">
                  <button onClick={() => toggleActive(c)}
                    className={"inline-flex items-center gap-1.5 text-xs font-medium " + (c.active ? "text-starlight-green" : "text-muted")}>
                    {c.active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {c.active ? "Active" : "Hidden"}
                  </button>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {confirmDelete === c.lookup_id ? (
                    <span className="inline-flex items-center gap-2">
                      <button onClick={() => handleDelete(c.lookup_id)} className="text-xs text-starlight-red font-medium">Delete</button>
                      <button onClick={() => setConfirmDelete(null)} className="text-xs text-muted">Cancel</button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmDelete(c.lookup_id)} className="text-faint hover:text-starlight-red transition-colors" title="Delete category">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {cats.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No categories yet — add one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-faint">
        Hiding a category keeps it on past entries but removes it from the cost-entry dropdown. Deleting a category in use leaves those entries as &ldquo;Uncategorised&rdquo; — hide instead if you want to keep the history clean.
      </p>
    </div>
  );
}
