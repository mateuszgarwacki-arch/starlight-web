"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { Plus, Pencil, X, Check, Building2, Search } from "lucide-react";

interface Contractor {
  contractor_id: number;
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  speciality: string | null;
  notes: string | null;
  active: boolean | null;
}

export default function ContractorsPage() {
  const supabase = createClient();
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Form state
  const [form, setForm] = useState({
    company_name: "",
    contact_name: "",
    phone: "",
    email: "",
    speciality: "",
    notes: "",
  });

  const loadData = async () => {
    const { data } = await supabase
      .from("tbl_contractors")
      .select("*")
      .order("company_name");
    if (data) setContractors(data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setForm({ company_name: "", contact_name: "", phone: "", email: "", speciality: "", notes: "" });
  };

  const handleAdd = async () => {
    if (!form.company_name.trim()) return;
    await supabase.from("tbl_contractors").insert({
      company_name: form.company_name.trim(),
      contact_name: form.contact_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      speciality: form.speciality.trim() || null,
      notes: form.notes.trim() || null,
      active: true,
    });
    resetForm();
    setShowAdd(false);
    loadData();
  };

  const startEdit = (c: Contractor) => {
    setEditingId(c.contractor_id);
    setForm({
      company_name: c.company_name || "",
      contact_name: c.contact_name || "",
      phone: c.phone || "",
      email: c.email || "",
      speciality: c.speciality || "",
      notes: c.notes || "",
    });
  };

  const handleSave = async () => {
    if (!editingId) return;
    await supabase
      .from("tbl_contractors")
      .update({
        company_name: form.company_name.trim() || null,
        contact_name: form.contact_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        speciality: form.speciality.trim() || null,
        notes: form.notes.trim() || null,
      })
      .eq("contractor_id", editingId);
    setEditingId(null);
    resetForm();
    loadData();
  };

  const toggleActive = async (c: Contractor) => {
    await supabase
      .from("tbl_contractors")
      .update({ active: !c.active })
      .eq("contractor_id", c.contractor_id);
    loadData();
  };

  const filtered = contractors.filter(
    (c) =>
      !search ||
      (c.company_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.contact_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.speciality || "").toLowerCase().includes(search.toLowerCase())
  );

  const formFields = (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Company Name *</label>
        <input
          type="text"
          value={form.company_name}
          onChange={(e) => setForm({ ...form, company_name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
          placeholder="e.g. Pro AV Solutions Ltd"
          autoFocus
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Contact Name</label>
        <input
          type="text"
          value={form.contact_name}
          onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
          placeholder="John Smith"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Speciality</label>
        <input
          type="text"
          value={form.speciality}
          onChange={(e) => setForm({ ...form, speciality: e.target.value })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
          placeholder="e.g. Lighting, AV, Pyrotechnics"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Phone</label>
        <input
          type="text"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
          placeholder="07700 900000"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Email</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
          placeholder="john@proav.co.uk"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Notes</label>
        <input
          type="text"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue"
          placeholder="Any notes..."
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy">Contractors</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            External suppliers for subcontracted work
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(true); resetForm(); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Contractor
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by company, contact, or speciality..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue bg-white"
        />
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="card px-5 py-4 space-y-3 border-l-4 border-l-starlight-blue">
          <p className="text-sm font-medium text-navy">New Contractor</p>
          {formFields}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowAdd(false); resetForm(); }}
              className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              className="px-4 py-1.5 bg-starlight-blue text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Contractors list */}
      {loading ? (
        <div className="card px-5 py-8 text-center text-gray-400 text-sm animate-pulse">
          Loading contractors...
        </div>
      ) : filtered.length === 0 ? (
        <div className="card px-5 py-8 text-center text-gray-400 text-sm">
          {search ? "No matching contractors" : "No contractors yet. Add one above."}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-starlight-bg text-left">
                <th className="px-4 py-2.5 font-medium text-gray-500">Company</th>
                <th className="px-4 py-2.5 font-medium text-gray-500">Contact</th>
                <th className="px-4 py-2.5 font-medium text-gray-500">Speciality</th>
                <th className="px-4 py-2.5 font-medium text-gray-500">Phone</th>
                <th className="px-4 py-2.5 font-medium text-gray-500">Email</th>
                <th className="px-4 py-2.5 font-medium text-gray-500 text-center w-20">Active</th>
                <th className="px-4 py-2.5 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.contractor_id} className="border-t border-gray-100">
                  {editingId === c.contractor_id ? (
                    <>
                      <td className="px-4 py-2" colSpan={5}>
                        {formFields}
                      </td>
                      <td className="px-4 py-2 text-center" colSpan={2}>
                        <div className="flex gap-1 justify-center">
                          <button onClick={handleSave} className="p-1.5 text-starlight-green hover:bg-green-50 rounded">
                            <Check className="h-4 w-4" />
                          </button>
                          <button onClick={() => { setEditingId(null); resetForm(); }} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-starlight-blue shrink-0" />
                          <span className="font-medium text-navy">{c.company_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{c.contact_name}</td>
                      <td className="px-4 py-2.5">
                        {c.speciality && (
                          <span className="text-xs bg-blue-50 text-starlight-blue px-2 py-0.5 rounded">
                            {c.speciality}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{c.phone}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{c.email}</td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => toggleActive(c)}
                          className={`w-5 h-5 rounded border-2 inline-flex items-center justify-center transition-all ${
                            c.active
                              ? "bg-starlight-green border-starlight-green text-white"
                              : "border-gray-300"
                          }`}
                        >
                          {c.active && <Check className="h-3 w-3" />}
                        </button>
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => startEdit(c)}
                          className="p-1.5 text-gray-400 hover:text-navy hover:bg-gray-100 rounded transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
