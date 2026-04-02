"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { uploadToOneDrive, jobFolder, scopePhotoName } from "@/lib/onedrive-client";
import { Camera, Check, AlertTriangle, RefreshCw } from "lucide-react";
import { getAuditContext, auditedUpdate } from "@/lib/audit";

interface ScopePhotoItem {
  scope_item_id: number;
  item_name: string;
  job_name: string;
  job_number: string;
  job_id: number | null;
  event_zone: string | null;
  status: string;
  completion_photo_path: string | null;
}

export default function MobilePhotosPage() {
  const supabase = createClient();
  const router = useRouter();
  const [items, setItems] = useState<ScopePhotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<number | null>(null);
  const [showWaiver, setShowWaiver] = useState<number | null>(null);
  const [waiverReason, setWaiverReason] = useState("");
  const [photoPreview, setPhotoPreview] = useState<{ id: number; url: string } | null>(null);
  const cameraRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const loadItems = useCallback(async () => {
    setLoading(true);
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) { router.push("/m/login"); return; }

    const { data: scopeData } = await supabase
      .from("tbl_scope_items")
      .select("scope_item_id, item_name, status, event_zone, completion_photo_path, job_id")
      .eq("status", "Workshop Complete")
      .order("scope_item_id");

    if (!scopeData || scopeData.length === 0) { setItems([]); setLoading(false); return; }

    const jobIds = [...new Set(scopeData.map(s => s.job_id))];
    const { data: jobs } = await supabase
      .from("tbl_production_plan")
      .select("job_id, job_name, job_number")
      .in("job_id", jobIds);

    const jMap: Record<number, { name: string; number: string }> = {};
    (jobs || []).forEach(j => { jMap[j.job_id] = { name: j.job_name || "—", number: j.job_number || "—" }; });

    setItems(scopeData.map(s => ({
      scope_item_id: s.scope_item_id,
      item_name: s.item_name || "Unnamed",
      job_name: jMap[s.job_id]?.name || "—",
      job_number: jMap[s.job_id]?.number || "—",
      job_id: s.job_id,
      event_zone: s.event_zone,
      status: s.status,
      completion_photo_path: s.completion_photo_path,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handlePhotoCapture = async (scopeId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(scopeId);
    setPhotoPreview({ id: scopeId, url: URL.createObjectURL(file) });

    // Find the item to get job context
    const item = items.find(i => i.scope_item_id === scopeId);
    const ext = file.name.split(".").pop() || "jpg";
    const folder = `${jobFolder(item?.job_number || "unknown", item?.job_name || "unknown")}/Scope-Photos`;
    const fileName = scopePhotoName(item?.item_name || `scope-${scopeId}`, ext);

    try {
      const result = await uploadToOneDrive(file, folder, fileName);
      const ctx = await getAuditContext(supabase);
      await auditedUpdate(ctx, "tbl_scope_items", scopeId, {
        completion_photo_path: result.path,
        status: "Completed",
      }, item?.job_id);
    } catch (err: any) {
      alert("Upload failed: " + (err.message || "Unknown error. Check OneDrive configuration."));
      setUploading(null);
      setPhotoPreview(null);
      return;
    }
    setUploading(null);
    setPhotoPreview(null);
    await loadItems();
  };

  const handleWaiver = async (scopeId: number) => {
    if (!waiverReason.trim()) return;
    setUploading(scopeId);
    const ctx = await getAuditContext(supabase);
    const item = items.find(i => i.scope_item_id === scopeId);
    await auditedUpdate(ctx, "tbl_scope_items", scopeId, {
      photo_waiver: true,
      photo_waiver_reason: waiverReason.trim(),
      status: "Completed",
    }, item?.job_id);
    setShowWaiver(null);
    setWaiverReason("");
    setUploading(null);
    await loadItems();
  };

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-muted text-sm animate-pulse">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-navy">Site Photos</h1>
        <button onClick={loadItems} className="p-2 text-muted active:text-navy">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {items.length === 0 ? (
        <div className="bg-surface rounded-xl border border-subtle p-8 text-center">
          <Check className="h-10 w-10 text-starlight-green mx-auto" />
          <p className="text-sm text-muted mt-3 font-medium">All caught up</p>
          <p className="text-xs text-muted mt-1">No scope items awaiting site photos right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            {items.length} item{items.length !== 1 ? "s" : ""} awaiting completion photo
          </p>
          {items.map(item => (
            <div key={item.scope_item_id} className="bg-surface rounded-xl border border-subtle p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy">{item.item_name}</p>
                  <p className="text-xs text-muted mt-0.5">{item.job_name}</p>
                  <div className="flex gap-2 mt-1">
                    <span className="text-[10px] font-mono text-muted bg-surface-mid px-1.5 py-0.5 rounded">{item.job_number}</span>
                    {item.event_zone && (
                      <span className="text-[10px] text-muted bg-surface-mid px-1.5 py-0.5 rounded">{item.event_zone}</span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] px-2 py-1 rounded-full font-medium bg-starlight-amber/10 text-starlight-amber">
                  Workshop Complete
                </span>
              </div>
              {photoPreview?.id === item.scope_item_id && (
                <div className="mt-3 relative">
                  <img src={photoPreview.url} alt="Preview" className="w-full h-40 object-cover rounded-lg" />
                  {uploading === item.scope_item_id && (
                    <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center">
                      <p className="text-white text-sm font-medium animate-pulse">Uploading...</p>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2 mt-3">
                <input
                  ref={el => { cameraRefs.current[item.scope_item_id] = el; }}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handlePhotoCapture(item.scope_item_id, e)}
                  className="hidden"
                />
                <button
                  onClick={() => cameraRefs.current[item.scope_item_id]?.click()}
                  disabled={uploading === item.scope_item_id}
                  className="flex-1 py-3 bg-starlight-green text-white text-sm font-semibold rounded-xl active:bg-starlight-green transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Camera className="h-4 w-4" />
                  Take Photo
                </button>
                <button
                  onClick={() => setShowWaiver(item.scope_item_id)}
                  disabled={uploading === item.scope_item_id}
                  className="py-3 px-4 bg-surface-mid text-muted text-sm font-medium rounded-xl active:bg-surface-hi transition-colors disabled:opacity-50"
                >
                  Waiver
                </button>
              </div>
              {showWaiver === item.scope_item_id && (
                <div className="mt-3 bg-starlight-amber/5 border border-starlight-amber/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm text-starlight-amber font-medium">
                    <AlertTriangle className="h-4 w-4" />
                    Photo Waiver
                  </div>
                  <p className="text-xs text-muted">Why can&apos;t a completion photo be taken?</p>
                  <input
                    type="text"
                    value={waiverReason}
                    onChange={(e) => setWaiverReason(e.target.value)}
                    placeholder="e.g. Item consumed during event, client denied access..."
                    className="w-full px-3 py-2.5 border border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-starlight-amber"
                    maxLength={200}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowWaiver(null); setWaiverReason(""); }}
                      className="flex-1 py-2 text-muted bg-surface-mid rounded-lg text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleWaiver(item.scope_item_id)}
                      disabled={!waiverReason.trim() || uploading === item.scope_item_id}
                      className="flex-1 py-2 bg-starlight-amber text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                    >
                      Confirm Waiver
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
