"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { formatCurrency } from "@/lib/utils";
import { isTruthy } from "@/lib/types";
import type { Freelancer } from "@/lib/types";
import {
  Users, Plus, Key, Pencil, X, Check, Smartphone,
  UserCheck, UserX, Copy, Eye, EyeOff,
} from "lucide-react";

interface FreelancerRow extends Freelancer {
  _editing?: boolean;
  _pinStatus?: "unknown" | "synced" | "syncing" | "error";
}

export default function CrewPage() {
  const supabase = createClient();
  const [crew, setCrew] = useState<FreelancerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  // Add/Edit state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // PIN dialog state
  const [pinDialog, setPinDialog] = useState<{ id: number; name: string } | null>(null);
  const [newPin, setNewPin] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [pinResult, setPinResult] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);

  // Form state for add/edit
  const [form, setForm] = useState({
    freelancer_name: "",
    phone: "",
    email: "",
    role: "Freelancer",
    speciality: "",
    day_rate: "",
    standard_day_hours: "10",
    notes: "",
  });

  const loadCrew = useCallback(async () => {
    const { data } = await supabase
      .from("tbl_freelancers")
      .select("*")
      .order("freelancer_name");
    if (data) setCrew(data as FreelancerRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadCrew(); }, [loadCrew]);

  const filtered = showInactive ? crew : crew.filter((f) => isTruthy(f.active));
  const activeCount = crew.filter((f) => isTruthy(f.active)).length;

  // ============================================================
  // PIN Management
  // ============================================================
  const openPinDialog = (f: FreelancerRow) => {
    setPinDialog({ id: f.freelancer_id, name: f.freelancer_name || "" });
    setNewPin(f.pin || "");
    setPinResult(null);
    setShowPin(!!f.pin);
  };

  const generatePin = () => {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    setNewPin(pin);
    setShowPin(true);
  };

  const savePin = async () => {
    if (!pinDialog || !newPin.trim()) return;
    setPinSaving(true);
    setPinResult(null);

    const freelancer = crew.find((f) => f.freelancer_id === pinDialog.id);
    if (!freelancer) { setPinSaving(false); return; }

    try {
      const res = await fetch("/api/auth/freelancer-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freelancer_id: freelancer.freelancer_id,
          phone: freelancer.phone,
          pin: newPin.trim(),
          role: (freelancer.role || "Freelancer").toLowerCase().replace(" ", "_"),
          name: freelancer.freelancer_name,
        }),
      });
      const json = await res.json();
      if (json.error) {
        setPinResult("Error: " + json.error);
      } else {
        setPinResult(json.status === "created" ? "Account created — PIN set" : "PIN updated");
        // Update pin in tbl_freelancers too
        await supabase.from("tbl_freelancers").update({ pin: newPin.trim() }).eq("freelancer_id", pinDialog.id);
        setCrew((prev) => prev.map((f) => f.freelancer_id === pinDialog.id ? { ...f, pin: newPin.trim() } : f));
      }
    } catch (err) {
      setPinResult("Network error");
    }
    setPinSaving(false);
  };

  // ============================================================
  // Add / Edit
  // ============================================================
  const openAdd = () => {
    setForm({ freelancer_name: "", phone: "", email: "", role: "Freelancer", speciality: "", day_rate: "", standard_day_hours: "10", notes: "" });
    setEditingId(null);
    setShowAddDialog(true);
  };

  const openEdit = (f: FreelancerRow) => {
    setForm({
      freelancer_name: f.freelancer_name || "",
      phone: f.phone || "",
      email: f.email || "",
      role: f.role || "Freelancer",
      speciality: f.speciality || "",
      day_rate: f.day_rate ? String(f.day_rate) : "",
      standard_day_hours: f.standard_day_hours ? String(f.standard_day_hours) : "10",
      notes: f.notes || "",
    });
    setEditingId(f.freelancer_id);
    setShowAddDialog(true);
  };

  const saveFreelancer = async () => {
    const data: any = {
      freelancer_name: form.freelancer_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      role: form.role,
      speciality: form.speciality || null,
      day_rate: form.day_rate ? parseFloat(form.day_rate) : null,
      standard_day_hours: form.standard_day_hours ? parseFloat(form.standard_day_hours) : 10,
      notes: form.notes.trim() || null,
    };

    if (!data.freelancer_name || !data.phone) return;

    if (editingId) {
      await supabase.from("tbl_freelancers").update(data).eq("freelancer_id", editingId);
    } else {
      data.active = true;
      data.system_access = true;
      data.created_at = new Date().toISOString();
      await supabase.from("tbl_freelancers").insert(data);
    }
    setShowAddDialog(false);
    loadCrew();
  };

  const toggleActive = async (id: number, current: string | boolean | null) => {
    const newVal = isTruthy(current) ? false : true;
    await supabase.from("tbl_freelancers").update({ active: newVal }).eq("freelancer_id", id);
    setCrew((prev) => prev.map((f) => f.freelancer_id === id ? { ...f, active: newVal as any } : f));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // ============================================================
  // RENDER
  // ============================================================
  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400 text-sm animate-pulse">Loading crew...</div>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy">Crew & Scheduling</h1>
          <p className="text-sm text-gray-400 mt-0.5">{activeCount} active freelancers</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded" />
            Show inactive
          </label>
          <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
            <Plus className="h-4 w-4" /> Add Freelancer
          </button>
        </div>
      </div>

      {/* Crew table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-starlight-bg text-left">
                <th className="px-4 py-2.5 font-medium text-gray-500">Name</th>
                <th className="px-4 py-2.5 font-medium text-gray-500 w-32">Phone</th>
                <th className="px-4 py-2.5 font-medium text-gray-500 w-28">Role</th>
                <th className="px-4 py-2.5 font-medium text-gray-500 w-28">Speciality</th>
                <th className="px-4 py-2.5 font-medium text-gray-500 w-24 text-right">Day Rate</th>
                <th className="px-4 py-2.5 font-medium text-gray-500 w-16 text-right">Hrs/Day</th>
                <th className="px-4 py-2.5 font-medium text-gray-500 w-24 text-right">£/hr</th>
                <th className="px-4 py-2.5 font-medium text-gray-500 w-28 text-center">PIN / Mobile</th>
                <th className="px-4 py-2.5 font-medium text-gray-500 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => {
                const hourlyRate = f.day_rate && f.standard_day_hours ? f.day_rate / f.standard_day_hours : null;
                const isActive = isTruthy(f.active);
                return (
                  <tr key={f.freelancer_id} className={"border-t border-gray-100 " + (!isActive ? "opacity-50" : "")}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-navy">{f.freelancer_name}</p>
                      {f.email && <p className="text-xs text-gray-400">{f.email}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{f.phone}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{f.role}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{f.speciality || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{f.day_rate ? formatCurrency(f.day_rate) : "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600">{f.standard_day_hours || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{hourlyRate ? formatCurrency(hourlyRate) : "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {f.pin ? (
                          <span className="font-mono text-xs text-navy bg-gray-100 px-2 py-0.5 rounded">{f.pin}</span>
                        ) : (
                          <span className="text-xs text-gray-300 italic">No PIN</span>
                        )}
                        <button
                          onClick={() => openPinDialog(f)}
                          className={"p-1 rounded transition-colors " + (f.pin ? "text-gray-300 hover:text-navy hover:bg-gray-100" : "text-starlight-amber hover:bg-amber-50")}
                          title={f.pin ? "Change PIN" : "Set PIN"}
                        >
                          <Key className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEdit(f)} className="p-1.5 text-gray-300 hover:text-navy hover:bg-gray-100 rounded-lg transition-colors" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => toggleActive(f.freelancer_id, f.active)}
                          className={"p-1.5 rounded-lg transition-colors " + (isActive ? "text-gray-300 hover:text-starlight-red hover:bg-red-50" : "text-starlight-green hover:bg-green-50")}
                          title={isActive ? "Deactivate" : "Reactivate"}
                        >
                          {isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* PIN Dialog */}
      {pinDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-navy">Mobile Access — {pinDialog.name}</h3>
              <p className="text-xs text-gray-400 mt-0.5">Set a PIN for mobile app login. Share via WhatsApp.</p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">PIN (4–6 digits)</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPin ? "text" : "password"}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg text-center text-xl tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-starlight-blue"
                      placeholder="• • • •"
                      inputMode="numeric"
                      maxLength={6}
                      autoFocus
                    />
                    <button onClick={() => setShowPin(!showPin)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600" type="button">
                      {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <button onClick={generatePin} className="px-3 py-2 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap" type="button">
                    Generate
                  </button>
                </div>
              </div>

              {/* WhatsApp copy block */}
              {newPin.length >= 4 && showPin && (
                <div className="bg-starlight-bg rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Message to copy</p>
                    <button
                      onClick={() => copyToClipboard(`Hi ${pinDialog.name.split(" ")[0]}, here are your Starlight workshop app login details:\n\nURL: workshop-five-gamma.vercel.app/m/login\nPhone: ${crew.find(f => f.freelancer_id === pinDialog.id)?.phone || ""}\nPIN: ${newPin}\n\nSave the link to your home screen.`)}
                      className="inline-flex items-center gap-1 text-xs text-starlight-blue hover:text-blue-700 font-medium"
                    >
                      <Copy className="h-3 w-3" /> Copy
                    </button>
                  </div>
                  <p className="text-xs text-gray-600 whitespace-pre-line leading-relaxed">
                    Hi {pinDialog.name.split(" ")[0]}, here are your Starlight workshop app login details:{"\n\n"}
                    URL: workshop-five-gamma.vercel.app/m/login{"\n"}
                    Phone: {crew.find(f => f.freelancer_id === pinDialog.id)?.phone || ""}{"\n"}
                    PIN: {newPin}{"\n\n"}
                    Save the link to your home screen.
                  </p>
                </div>
              )}

              {pinResult && (
                <div className={"text-sm rounded-lg px-3 py-2 " + (pinResult.startsWith("Error") ? "text-starlight-red bg-red-50" : "text-starlight-green bg-green-50")}>
                  {pinResult}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setPinDialog(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                Close
              </button>
              <button
                onClick={savePin}
                disabled={newPin.length < 4 || pinSaving}
                className="px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {pinSaving ? "Saving..." : "Set PIN & Create Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-navy">{editingId ? "Edit Freelancer" : "Add Freelancer"}</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
                  <input type="text" value={form.freelancer_name} onChange={(e) => setForm({ ...form, freelancer_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="John Smith" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Phone *</label>
                  <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="07712 345 678" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="john@email.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-starlight-blue">
                    <option value="Freelancer">Freelancer</option>
                    <option value="Foreman">Foreman</option>
                    <option value="Production-Manager">Production Manager</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Speciality</label>
                  <input type="text" value={form.speciality} onChange={(e) => setForm({ ...form, speciality: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="Carpenter" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Day Rate (£)</label>
                  <input type="number" value={form.day_rate} onChange={(e) => setForm({ ...form, day_rate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="250" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Hours/Day</label>
                  <input type="number" value={form.standard_day_hours} onChange={(e) => setForm({ ...form, standard_day_hours: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="10" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                  <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" placeholder="Skills, availability notes..." />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowAddDialog(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              <button
                onClick={saveFreelancer}
                disabled={!form.freelancer_name.trim() || !form.phone.trim()}
                className="px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {editingId ? "Save Changes" : "Add Freelancer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
