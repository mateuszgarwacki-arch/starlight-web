"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import { uploadToOneDrive, getOneDriveUrl, jobFolder } from "@/lib/onedrive-client";
import { CutListExtractor } from "@/components/cutlist-extractor";
import {
  FileText, Image, Box, Upload, Trash2, Download,
  ChevronDown, ChevronRight, Eye, Plus, Loader2,
} from "lucide-react";

interface WODoc {
  doc_id: number;
  work_order_id: number | null;
  scope_item_id: number | null;
  job_id: number | null;
  doc_type: string;
  file_name: string;
  onedrive_path: string | null;
  mime_type: string | null;
  caption: string | null;
  sort_order: number;
  uploaded_at: string;
  extraction_status: string | null;
  extracted_data: any;
}

interface DocsPanelProps {
  workOrderId?: number;
  scopeItemId?: number;
  jobId: number;
  jobNumber: string;
  jobName: string;
  scopeName?: string;
  activityLabel?: string;
  readOnly?: boolean;
  onBomChanged?: () => void;
}

const DOC_TYPE_CONFIG: Record<string, { label: string; icon: typeof FileText; color: string; accept: string; folder: string }> = {
  drawing: { label: "Drawings", icon: Image, color: "text-starlight-blue", accept: "image/*,.pdf", folder: "Drawings" },
  reference: { label: "References", icon: Image, color: "text-starlight-amber", accept: "image/*,.pdf", folder: "References" },
  cut_list: { label: "Cut Lists", icon: FileText, color: "text-starlight-green", accept: ".csv,.pdf,.xlsx", folder: "Cut-Lists" },
  model: { label: "3D Models", icon: Box, color: "text-starlight-red", accept: ".glb,.gltf", folder: "Models" },
};

function sanitiseName(name: string, maxLen = 80): string {
  return name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").substring(0, maxLen) || "unnamed";
}

export function WODocumentsPanel({
  workOrderId, scopeItemId, jobId, jobNumber, jobName,
  scopeName, activityLabel, readOnly = false, onBomChanged,
}: DocsPanelProps) {
  const supabase = createClient();
  const [docs, setDocs] = useState<WODoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>("");
  const [showModelViewer, setShowModelViewer] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const loadDocs = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("tbl_wo_documents").select("*");
    if (workOrderId) {
      query = query.eq("work_order_id", workOrderId);
    } else if (scopeItemId) {
      query = query.eq("scope_item_id", scopeItemId).is("work_order_id", null);
    }
    const { data } = await query.order("doc_type").order("sort_order");
    setDocs(data || []);
    setLoading(false);
  }, [workOrderId, scopeItemId]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const handleUpload = async (docType: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(docType);
    const config = DOC_TYPE_CONFIG[docType];
    const jFolder = jobFolder(jobNumber, jobName);
    for (const file of Array.from(files)) {
      try {
        const ext = file.name.split(".").pop() || "bin";
        const prefix = activityLabel ? sanitiseName(activityLabel, 30) + "-" : "";
        const scopePart = scopeName ? sanitiseName(scopeName, 40) + "-" : "";
        const baseName = sanitiseName(file.name.replace(/\.[^.]+$/, ""), 60);
        const fileName = `${prefix}${scopePart}${baseName}.${ext}`;
        const folder = `${jFolder}/${config.folder}`;
        const result = await uploadToOneDrive(file, folder, fileName);
        const { data: { user } } = await supabase.auth.getUser();
        const freelancerId = user?.user_metadata?.freelancer_id || null;
        await supabase.from("tbl_wo_documents").insert({
          work_order_id: workOrderId || null,
          scope_item_id: scopeItemId || null,
          job_id: jobId,
          doc_type: docType,
          file_name: fileName,
          onedrive_path: result.path,
          file_size: file.size,
          mime_type: file.type,
          sort_order: docs.filter(d => d.doc_type === docType).length,
          uploaded_by: freelancerId,
          extraction_status: docType === "cut_list" ? "pending" : null,
        });
      } catch (err: any) {
        alert(`Upload failed for ${file.name}: ${err.message}`);
      }
    }
    setUploading(null);
    if (fileRefs.current[docType]) fileRefs.current[docType]!.value = "";
    await loadDocs();
  };

  const deleteDoc = async (docId: number) => {
    if (!confirm("Remove this file?")) return;
    await supabase.from("tbl_wo_documents").delete().eq("doc_id", docId);
    setDocs(prev => prev.filter(d => d.doc_id !== docId));
  };

  const openPreview = async (doc: WODoc) => {
    if (!doc.onedrive_path) return;
    if (doc.doc_type === "model") {
      try { const url = await getOneDriveUrl(doc.onedrive_path); setShowModelViewer(url); setPreviewName(doc.file_name); } catch { alert("Failed to load model"); }
      return;
    }
    if (doc.mime_type?.startsWith("image/") || doc.mime_type === "application/pdf") {
      try { const url = await getOneDriveUrl(doc.onedrive_path); setPreviewUrl(url); setPreviewName(doc.file_name); } catch { alert("Failed to load preview"); }
    }
  };

  const downloadDoc = async (doc: WODoc) => {
    if (!doc.onedrive_path) return;
    try { const url = await getOneDriveUrl(doc.onedrive_path); window.open(url, "_blank"); } catch { alert("Failed to get download link"); }
  };

  const grouped = {
    drawing: docs.filter(d => d.doc_type === "drawing"),
    reference: docs.filter(d => d.doc_type === "reference"),
    cut_list: docs.filter(d => d.doc_type === "cut_list"),
    model: docs.filter(d => d.doc_type === "model"),
  };
  const totalCount = docs.length;

  return (
    <>
      <div className="border-t border-gray-100">
        <button onClick={() => setExpanded(!expanded)} className="w-full px-5 py-2.5 flex items-center gap-2 hover:bg-gray-50/50 transition-colors text-left">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Documents & Files</span>
          {totalCount > 0 && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{totalCount}</span>}
        </button>
        {expanded && (
          <div className="px-5 pb-4 space-y-4">
            {loading ? (
              <p className="text-xs text-gray-400 animate-pulse py-2">Loading files...</p>
            ) : (
              <>
                {Object.entries(DOC_TYPE_CONFIG).map(([type, config]) => {
                  const typeDocs = grouped[type as keyof typeof grouped] || [];
                  const Icon = config.icon;
                  const isUploading = uploading === type;
                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{config.label}</span>
                          {typeDocs.length > 0 && <span className="text-[10px] text-gray-400">({typeDocs.length})</span>}
                        </div>
                        {!readOnly && (
                          <>
                            <input ref={el => { fileRefs.current[type] = el; }} type="file" accept={config.accept} multiple onChange={(e) => handleUpload(type, e.target.files)} className="hidden" />
                            <button onClick={() => fileRefs.current[type]?.click()} disabled={isUploading} className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-navy font-medium transition-colors disabled:opacity-50">
                              {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add
                            </button>
                          </>
                        )}
                      </div>

                      {typeDocs.length === 0 ? (
                        <p className="text-[10px] text-gray-300 pl-5">No {config.label.toLowerCase()} added</p>
                      ) : (
                        <div className={type === "drawing" || type === "reference" ? "flex flex-wrap gap-2" : "space-y-1"}>
                          {typeDocs.map(doc => (
                            type === "drawing" || type === "reference" ? (
                              <div key={doc.doc_id} className="relative group">
                                <button onClick={() => openPreview(doc)} className="w-16 h-16 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 hover:border-starlight-blue transition-colors" title={doc.caption || doc.file_name}>
                                  {doc.mime_type?.startsWith("image/") ? (
                                    <OneDriveThumb path={doc.onedrive_path} />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center"><FileText className="h-6 w-6 text-gray-300" /></div>
                                  )}
                                </button>
                                {!readOnly && (
                                  <button onClick={() => deleteDoc(doc.doc_id)} className="absolute -top-1.5 -right-1.5 p-0.5 bg-white border border-gray-200 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-starlight-red">
                                    <Trash2 className="h-2.5 w-2.5" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div key={doc.doc_id}>
                                <div className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-gray-50 group">
                                  <Icon className={`h-3.5 w-3.5 ${config.color} shrink-0`} />
                                  <span className="text-xs text-navy flex-1 truncate">{doc.caption || doc.file_name}</span>
                                  {doc.doc_type === "cut_list" && doc.extraction_status && (
                                    <span className={"text-[10px] px-1.5 py-0.5 rounded-full font-medium " + (
                                      doc.extraction_status === "confirmed" ? "bg-starlight-green/10 text-starlight-green" :
                                      doc.extraction_status === "extracted" ? "bg-starlight-blue/10 text-starlight-blue" :
                                      doc.extraction_status === "pending" ? "bg-starlight-amber/10 text-starlight-amber" :
                                      "bg-red-50 text-starlight-red"
                                    )}>{doc.extraction_status}</span>
                                  )}
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {doc.doc_type === "model" && <button onClick={() => openPreview(doc)} className="p-1 text-gray-400 hover:text-navy" title="View 3D model"><Eye className="h-3.5 w-3.5" /></button>}
                                    <button onClick={() => downloadDoc(doc)} className="p-1 text-gray-400 hover:text-navy" title="Download"><Download className="h-3.5 w-3.5" /></button>
                                    {!readOnly && <button onClick={() => deleteDoc(doc.doc_id)} className="p-1 text-gray-400 hover:text-starlight-red" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>}
                                  </div>
                                </div>
                                {doc.doc_type === "cut_list" && workOrderId && (
                                  <CutListExtractor
                                    docId={doc.doc_id}
                                    workOrderId={workOrderId}
                                    jobId={jobId}
                                    onedrivePath={doc.onedrive_path}
                                    fileName={doc.file_name}
                                    mimeType={doc.mime_type}
                                    extractionStatus={doc.extraction_status}
                                    extractedData={doc.extracted_data}
                                    onUpdate={() => { loadDocs(); if (onBomChanged) onBomChanged(); }}
                                  />
                                )}
                              </div>
                            )
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* Image preview lightbox */}
      {previewUrl && !showModelViewer && (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
          <div className="max-w-4xl max-h-[90vh] relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewUrl(null)} className="absolute -top-3 -right-3 bg-white rounded-full p-1.5 shadow-lg text-gray-600 hover:text-navy z-10">✕</button>
            <p className="text-white text-xs text-center mb-2">{previewName}</p>
            {previewName.endsWith(".pdf") ? (
              <iframe src={previewUrl} className="w-full h-[80vh] rounded-lg" />
            ) : (
              <img src={previewUrl} alt={previewName} className="max-w-full max-h-[85vh] object-contain rounded-lg" />
            )}
          </div>
        </div>
      )}

      {/* 3D Model viewer — Phase C will replace with Three.js */}
      {showModelViewer && (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4" onClick={() => setShowModelViewer(null)}>
          <div className="bg-white rounded-xl p-8 max-w-md text-center" onClick={e => e.stopPropagation()}>
            <Box className="h-12 w-12 text-starlight-red mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-navy">3D Model Viewer</h3>
            <p className="text-sm text-gray-400 mt-1">{previewName}</p>
            <p className="text-xs text-gray-400 mt-3">Interactive Three.js viewer coming next phase</p>
            <button onClick={() => { window.open(showModelViewer, "_blank"); }} className="mt-4 px-4 py-2 bg-starlight-blue text-white text-sm rounded-lg">Download Model</button>
            <button onClick={() => setShowModelViewer(null)} className="mt-2 block w-full text-sm text-gray-500">Close</button>
          </div>
        </div>
      )}
    </>
  );
}

function OneDriveThumb({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { if (path) getOneDriveUrl(path).then(setUrl).catch(() => {}); }, [path]);
  if (!url) return <div className="w-full h-full bg-gray-100 animate-pulse" />;
  return <img src={url} alt="" className="w-full h-full object-cover" />;
}
