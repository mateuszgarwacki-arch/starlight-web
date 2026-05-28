"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { getAuthHeaders } from "@/lib/auth-headers";
import { toast } from "sonner";
import { Settings, Check, Users, Shield, History, Plus, X, Key, ChevronDown, Lightbulb, Package, Receipt } from "lucide-react";
import { TypicalComponentsEditor } from "@/components/typical-components-editor";
import { MaterialCategoriesEditor } from "@/components/material-categories-editor";
import { OverheadCategoriesEditor } from "@/components/overhead-categories-editor";

interface RateCard { id: number; complexity: number; label: string; rate_per_hour: number; description: string | null; }
interface BusinessSetting { id: number; setting_key: string; setting_value: string; description: string | null; }
interface StaffUser { auth_id: string; email: string; name: string; role: string; freelancer_id: number | null; created_at: string; last_sign_in: string | null; }
interface AuditEntry { audit_id: number; user_name: string; user_role: string; table_name: string; record_id: number; field_name: string; old_value: string | null; new_value: string | null; changed_at: string; job_id: number | null; action_type: string; reverted_at: string | null; reverted_by: string | null; }

type TabKey = "rates" | "defaults" | "users" | "audit" | "prompts" | "materials" | "overhead";

export default function SettingsPage() {
  const supabase = createClient();
  const [rates, setRates] = useState<RateCard[]>([]);
  const [settings, setSettings] = useState<BusinessSetting[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("rates");
  const [currentUserRole, setCurrentUserRole] = useState("");

  // New user form
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "production_manager" });
  const [savingUser, setSavingUser] = useState(false);

  // Load data
  const loadData = useCallback(async () => {
    const [rateRes, settRes, userRes] = await Promise.all([
      supabase.from("tbl_rate_card").select("*").order("complexity"),
      supabase.from("tbl_business_settings").select("*").order("setting_key"),
      supabase.auth.getUser(),
    ]);
    if (rateRes.data) setRates(rateRes.data);
    if (settRes.data) setSettings(settRes.data);
    const role = userRes.data?.user?.app_metadata?.role || userRes.data?.user?.user_metadata?.role || "freelancer";
    setCurrentUserRole(role);

    // Load staff users (admin/PM only)
    if (["admin", "production_manager", "Production-Manager"].includes(role)) {
      const authH = await getAuthHeaders();
      const res = await fetch("/api/auth/manage-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authH },
        body: JSON.stringify({ action: "list_users" }),
      });
      const data = await res.json();
      if (data.users) setStaffUsers(data.users);
    }

    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Load audit log on tab switch
  const loadAudit = async () => {
    const { data } = await supabase
      .from("tbl_audit_log")
      .select("*")
      .order("changed_at", { ascending: false })
      .limit(100);
    if (data) setAuditEntries(data);
  };

  useEffect(() => {
    if (activeTab === "audit") loadAudit();
  }, [activeTab]);


  // Rate card update
  const updateRate = async (id: number, value: number) => {
    setRates(prev => prev.map(r => r.id === id ? { ...r, rate_per_hour: value } : r));
    await supabase.from("tbl_rate_card").update({ rate_per_hour: value }).eq("id", id);
    toast.success("Rate saved");
  };

  // Business setting update
  const updateSetting = async (key: string, value: string) => {
    setSettings(prev => prev.map(s => s.setting_key === key ? { ...s, setting_value: value } : s));
    await supabase.from("tbl_business_settings").upsert({ setting_key: key, setting_value: value }, { onConflict: "setting_key" });
    toast.success("Setting saved");
  };

  const getSetting = (key: string) => settings.find(s => s.setting_key === key)?.setting_value || "";

  // Create staff user
  const handleCreateUser = async () => {
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) return;
    setSavingUser(true);

    // 1. Create freelancer record (all users need one for FK references)
    const { data: fr, error: frErr } = await supabase.from("tbl_freelancers").insert({
      freelancer_name: newUser.name.trim(),
      email: newUser.email.trim(),
      role: newUser.role,
      active: "true",
      system_access: "true",
    }).select().single();

    if (frErr || !fr) { toast.error("Failed to create user record"); setSavingUser(false); return; }

    // 2. Create Supabase Auth account
    const authH = await getAuthHeaders();
    const res = await fetch("/api/auth/manage-user", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authH },
      body: JSON.stringify({
        action: "create_staff",
        freelancer_id: fr.freelancer_id,
        email: newUser.email.trim(),
        password: newUser.password.trim(),
        role: newUser.role,
        name: newUser.name.trim(),
      }),
    });
    const data = await res.json();
    if (data.error) { toast.error(data.error); setSavingUser(false); return; }

    toast.success(`Account created for ${newUser.name}`);
    setNewUser({ name: "", email: "", password: "", role: "production_manager" });
    setShowNewUser(false);
    setSavingUser(false);
    loadData();
  };

  // Revert audit entry
  const handleRevert = async (auditId: number, actionType: string) => {
    const msg = actionType === "archive"
      ? "Restore this archived record? It will be included in cost calculations again."
      : "Revert this change? The old value will be restored.";
    if (!confirm(msg)) return;
    const { getAuditContext, revertAuditEntry } = await import("@/lib/audit");
    const ctx = await getAuditContext(supabase);
    const result = await revertAuditEntry(ctx, auditId);
    if (result.success) {
      toast.success(actionType === "archive" ? "Record restored" : "Change reverted");
      loadAudit();
    } else {
      toast.error(result.error || "Revert failed");
    }
  };

  // Role badge colors
  const roleBadge = (role: string) => {
    const map: Record<string, string> = {
      admin: "bg-starlight-red/15 text-starlight-red",
      production_manager: "bg-navy/15 text-navy",
      "Production-Manager": "bg-navy/15 text-navy",
      foreman: "bg-starlight-amber/15 text-starlight-amber",
      freelancer: "bg-surface-mid text-muted",
    };
    return map[role] || "bg-surface-mid text-muted";
  };
  const roleLabel = (role: string) => {
    const map: Record<string, string> = { admin: "Admin", production_manager: "PM", "Production-Manager": "PM", foreman: "Foreman", freelancer: "Freelancer" };
    return map[role] || role;
  };

  const isAdmin = currentUserRole === "admin";
  const canManageUsers = isAdmin || ["production_manager", "Production-Manager"].includes(currentUserRole);

  if (loading) return <div className="p-8 text-muted">Loading settings...</div>;

  // Tab definitions — users and audit only visible to PM/admin
  const tabs: { key: TabKey; label: string; icon: any; show: boolean }[] = [
    { key: "rates", label: "Rate Card", icon: Settings, show: true },
    { key: "defaults", label: "Defaults", icon: Settings, show: true },
    { key: "users", label: "Users", icon: Users, show: canManageUsers },
    { key: "audit", label: "Audit Log", icon: History, show: canManageUsers },
    { key: "prompts", label: "Typical Components", icon: Lightbulb, show: true },
    { key: "materials", label: "Material Categories", icon: Package, show: canManageUsers },
    { key: "overhead", label: "Overhead Categories", icon: Receipt, show: canManageUsers },
  ];

  return (
    <div className={`${activeTab === "audit" || activeTab === "materials" ? "max-w-6xl" : "max-w-4xl"} mx-auto space-y-6 transition-all`}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-muted" />
        <div>
          <h1 className="text-xl font-bold text-navy">Settings</h1>
          <p className="text-xs text-muted">Logged in as {roleLabel(currentUserRole)}</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-subtle">
        {tabs.filter(t => t.show).map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${
              activeTab === t.key ? "border-starlight-red text-navy" : "border-transparent text-muted hover:text-muted"
            }`}>
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: Rate Card */}
      {activeTab === "rates" && (
        <section className="space-y-4">
          <p className="text-sm text-muted">Hourly rates by complexity level, used for estimated costs on work orders.</p>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-base text-left text-xs text-muted uppercase tracking-wider">
                  <th className="px-4 py-3 font-medium">Complexity</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium w-40">Rate per hour</th>
                </tr>
              </thead>
              <tbody>
                {rates.map(rate => (
                  <tr key={rate.id} className="border-t border-subtle">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-2 font-semibold ${
                        rate.complexity === 1 ? "text-starlight-green" : rate.complexity === 2 ? "text-starlight-blue" : "text-starlight-red"
                      }`}>
                        <span className="text-lg">{rate.complexity}</span>
                        <span className="text-xs font-normal text-muted">{rate.label}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      <input type="text" defaultValue={rate.description || ""}
                        onBlur={async (e) => { await supabase.from("tbl_rate_card").update({ description: e.target.value.trim() || null }).eq("id", rate.id); toast.success("Saved"); }}
                        className="w-full bg-transparent border border-transparent hover:border-subtle focus:border-starlight-blue focus:outline-none rounded px-2 py-1" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className="text-muted">£</span>
                        <input type="number" step="0.50" value={rate.rate_per_hour}
                          onChange={(e) => setRates(prev => prev.map(r => r.id === rate.id ? { ...r, rate_per_hour: parseFloat(e.target.value) || 0 } : r))}
                          onBlur={(e) => updateRate(rate.id, parseFloat(e.target.value) || 0)}
                          className="w-24 px-2 py-1 text-right font-mono border border-subtle focus:border-starlight-blue focus:outline-none rounded bg-surface" />
                        <span className="text-xs text-muted">/hr</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB: Defaults */}
      {activeTab === "defaults" && (
        <section className="space-y-4">
          <div className="card p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Default target margin</p>
                <p className="text-xs text-muted mt-0.5">Applied to new jobs. Override per job on the job page.</p>
              </div>
              <div className="flex items-center gap-1">
                <input type="number" step="1" min="0" max="100"
                  value={getSetting("default_target_margin_pct") || "40"}
                  onChange={(e) => setSettings(prev => prev.map(s => s.setting_key === "default_target_margin_pct" ? { ...s, setting_value: e.target.value } : s))}
                  onBlur={(e) => updateSetting("default_target_margin_pct", e.target.value || "40")}
                  className="w-20 px-2 py-1.5 text-right font-mono border border-subtle focus:border-starlight-blue focus:outline-none rounded" />
                <span className="text-sm text-muted">%</span>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-subtle pt-5">
              <div>
                <p className="text-sm font-medium text-foreground">Standard day hours</p>
                <p className="text-xs text-muted mt-0.5">Default working hours per day for capacity calculations.</p>
              </div>
              <div className="flex items-center gap-1">
                <input type="number" step="0.5" min="1" max="16"
                  value={getSetting("standard_day_hours") || "10"}
                  onChange={(e) => setSettings(prev => prev.map(s => s.setting_key === "standard_day_hours" ? { ...s, setting_value: e.target.value } : s))}
                  onBlur={(e) => updateSetting("standard_day_hours", e.target.value || "10")}
                  className="w-20 px-2 py-1.5 text-right font-mono border border-subtle focus:border-starlight-blue focus:outline-none rounded" />
                <span className="text-sm text-muted">hrs</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TAB: Users */}
      {activeTab === "users" && canManageUsers && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">Staff accounts with desktop access (PM, Foreman, Admin).</p>
            <button onClick={() => setShowNewUser(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-starlight-red transition-colors">
              <Plus className="h-4 w-4" /> Add User
            </button>
          </div>

          {/* New user form */}
          {showNewUser && (
            <div className="card p-5 border-2 border-starlight-blue/30 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-navy">New Staff Account</h3>
                <button onClick={() => setShowNewUser(false)} className="text-muted hover:text-muted"><X className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Full Name <span className="text-starlight-red">*</span></label>
                  <input type="text" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    placeholder="e.g. Sarah Johnson" autoFocus
                    className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Email <span className="text-starlight-red">*</span></label>
                  <input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="sarah@starlightdesign.co.uk"
                    className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Password <span className="text-starlight-red">*</span></label>
                  <input type="text" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="Temporary password"
                    className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue" />
                  <p className="text-xs text-faint mt-1">User should change this on first login</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Role</label>
                  <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    className="w-full px-3 py-2 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-blue bg-surface">
                    <option value="production_manager">Production Manager</option>
                    <option value="foreman">Foreman</option>
                    {isAdmin && <option value="admin">Admin</option>}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button onClick={() => setShowNewUser(false)} className="px-4 py-2 text-sm text-muted hover:text-foreground">Cancel</button>
                <button onClick={handleCreateUser} disabled={savingUser || !newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()}
                  className="px-5 py-2 bg-starlight-red text-white text-sm font-medium rounded-lg hover:bg-starlight-red disabled:opacity-50 transition-colors">
                  {savingUser ? "Creating..." : "Create Account"}
                </button>
              </div>
            </div>
          )}

          {/* Staff users table */}
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-base text-left text-xs text-muted uppercase tracking-wider">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Last Sign In</th>
                  <th className="px-4 py-3 font-medium w-24"></th>
                </tr>
              </thead>
              <tbody>
                {staffUsers.map(u => (
                  <tr key={u.auth_id} className="border-t border-subtle">
                    <td className="px-4 py-3 font-medium text-navy">{u.name || "—"}</td>
                    <td className="px-4 py-3 text-muted">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${roleBadge(u.role)}`}>
                        {roleLabel(u.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {u.last_sign_in ? new Date(u.last_sign_in).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={async () => {
                        const pw = prompt("New password for " + u.name + ":");
                        if (!pw) return;
                        const authH = await getAuthHeaders();
                        const res = await fetch("/api/auth/manage-user", {
                          method: "POST", headers: { "Content-Type": "application/json", ...authH },
                          body: JSON.stringify({ action: "reset_password", auth_user_id: u.auth_id, new_password: pw }),
                        });
                        const data = await res.json();
                        if (data.error) toast.error(data.error); else toast.success("Password reset");
                      }} title="Reset password" className="p-1.5 text-muted hover:text-navy rounded transition-colors">
                        <Key className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {staffUsers.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No staff accounts yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB: Audit Log */}
      {activeTab === "audit" && canManageUsers && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">Recent changes across the system. Click Revert to undo a field change.</p>
            <button onClick={loadAudit} className="text-xs text-muted hover:text-navy transition-colors">Refresh</button>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="bg-base text-left text-xs text-muted uppercase tracking-wider">
                  <th className="px-3 py-2.5 font-medium">When</th>
                  <th className="px-3 py-2.5 font-medium">Who</th>
                  <th className="px-3 py-2.5 font-medium">Table</th>
                  <th className="px-3 py-2.5 font-medium">Field</th>
                  <th className="px-3 py-2.5 font-medium">Old</th>
                  <th className="px-3 py-2.5 font-medium">New</th>
                  <th className="px-3 py-2.5 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody>
                {auditEntries.map(e => {
                  const isReverted = !!e.reverted_at;
                  const isRevert = e.action_type === "revert";
                  const displayOld = e.old_value ? (e.old_value.length > 60 ? e.old_value.slice(0, 60) + "..." : e.old_value) : "—";
                  const displayNew = e.new_value ? (e.new_value.length > 60 ? e.new_value.slice(0, 60) + "..." : e.new_value) : "—";
                  return (
                    <tr key={e.audit_id} className={`border-t border-subtle ${isReverted ? "opacity-40 line-through" : ""} ${isRevert ? "bg-starlight-amber/10/30" : ""}`}>
                      <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                        {new Date(e.changed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{" "}
                        {new Date(e.changed_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-3 py-2 text-xs font-medium text-navy">{e.user_name || "System"}</td>
                      <td className="px-3 py-2 text-xs text-muted font-mono">{e.table_name.replace("tbl_", "")}</td>
                      <td className="px-3 py-2 text-xs text-muted">
                        {e.field_name === "_record" || e.field_name === "_archive" || e.field_name === "_unarchive" ? (
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${e.action_type === "insert" ? "bg-starlight-green/15 text-starlight-green" : e.action_type === "delete" ? "bg-starlight-red/15 text-starlight-red" : e.action_type === "archive" ? "bg-starlight-red/15 text-starlight-red" : e.action_type === "revert" ? "bg-starlight-blue/15 text-starlight-blue" : "bg-starlight-amber/15 text-starlight-amber"}`}>
                            {e.action_type}
                          </span>
                        ) : e.field_name}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted max-w-[120px] truncate" title={e.old_value || ""}>{displayOld}</td>
                      <td className="px-3 py-2 text-xs text-foreground max-w-[120px] truncate" title={e.new_value || ""}>{displayNew}</td>
                      <td className="px-3 py-2">
                        {(e.action_type === "update" || e.action_type === "archive") && !isReverted && (
                          <button onClick={() => handleRevert(e.audit_id, e.action_type)}
                            className="text-xs text-starlight-blue hover:text-navy font-medium transition-colors">
                            {e.action_type === "archive" ? "Restore" : "Revert"}
                          </button>
                        )}
                        {isReverted && <span className="text-xs text-faint">Reverted</span>}
                        {isRevert && <span className="text-xs text-starlight-amber">Undo</span>}
                      </td>
                    </tr>
                  );
                })}
                {auditEntries.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">No audit entries yet. Changes will appear here once audited updates are made.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Typical Components */}
      {activeTab === "prompts" && (
        <section className="space-y-4">
          <p className="text-sm text-muted">
            Manage suggested items shown on scope breakdown pages. Add stock items or bespoke descriptions per category.
          </p>
          <TypicalComponentsEditor />
        </section>
      )}

      {/* Material Categories */}
      {activeTab === "materials" && canManageUsers && (
        <section className="space-y-4">
          <p className="text-sm text-muted">
            Configure how each material category is priced by suppliers, how you order it, and how cut lists calculate quantities.
          </p>
          <MaterialCategoriesEditor />
        </section>
      )}

      {/* Overhead Categories */}
      {activeTab === "overhead" && canManageUsers && (
        <section className="space-y-4">
          <p className="text-sm text-muted">
            Buckets for non-job workshop running costs (consumables, cleaning, general labour). These drive the category picker on the Workshop &rarr; Overhead panel.
          </p>
          <OverheadCategoriesEditor />
        </section>
      )}
    </div>
  );
}
