"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { getOneDriveUrl } from "@/lib/onedrive-client";
import { FileText, Image, Box, Download, Eye, ChevronDown, ChevronRight, X } from "lucide-react";

interface MobileDoc {
  doc_id: number;
  doc_type: string;
  file_name: string;
  onedrive_path: string | null;
  mime_type: string | null;
  caption: string | null;
}

interface MobileWODocsProps {
  workOrderId: number;
}

const DOC_ICONS: Record<string, { icon: typeof FileText; color: string; label: string }> = {
  drawing: { icon: Image, color: "text-starlight-blue", label: "Drawings" },
  reference: { icon: Image, color: "text-starlight-amber", label: "References" },
  cut_list: { icon: FileText, color: "text-starlight-green", label: "Cut Lists" },
  model: { icon: Box, color: "text-starlight-red", label: "3D Models" },
};

export function MobileWODocs({ workOrderId }: MobileWODocsProps) {
  const supabase = createClient();
  const [docs, setDocs] = useState<MobileDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("");
  const [showModel, setShowModel] = useState<string | null>(null);
  const [modelName, setModelName] = useState("");

  const loadDocs = useCallback(async () => {
    const { data } = await supabase
      .from("tbl_wo_documents")
      .select("doc_id, doc_type, file_name, onedrive_path, mime_type, caption")
      .eq("work_order_id", workOrderId)
      .order("doc_type")
      .order("sort_order");
    setDocs(data || []);
    setLoading(false);
  }, [workOrderId]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  if (loading || docs.length === 0) return null;

  const grouped: Record<string, MobileDoc[]> = {};
  docs.forEach(d => {
    if (!grouped[d.doc_type]) grouped[d.doc_type] = [];
    grouped[d.doc_type].push(d);
  });

  const openImage = async (doc: MobileDoc) => {
    if (!doc.onedrive_path) return;
    try {
      const url = await getOneDriveUrl(doc.onedrive_path);
      setPreviewUrl(url);
      setPreviewName(doc.caption || doc.file_name);
    } catch { alert("Failed to load image"); }
  };

  const openModel = async (doc: MobileDoc) => {
    if (!doc.onedrive_path) return;
    try {
      const url = await getOneDriveUrl(doc.onedrive_path);
      setShowModel(url);
      setModelName(doc.caption || doc.file_name);
    } catch { alert("Failed to load model"); }
  };

  const downloadFile = async (doc: MobileDoc) => {
    if (!doc.onedrive_path) return;
    try {
      const url = await getOneDriveUrl(doc.onedrive_path);
      window.open(url, "_blank");
    } catch { alert("Failed to get download link"); }
  };

  return (
    <>
      <div className="bg-surface rounded-xl border border-subtle overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-3 flex items-center justify-between active:bg-surface-dim"
        >
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
            <span className="text-sm font-semibold text-navy">Documents</span>
            <span className="text-[10px] bg-surface-mid text-muted px-1.5 py-0.5 rounded-full">{docs.length}</span>
          </div>
        </button>

        {expanded && (
          <div className="px-4 pb-4 space-y-4">
            {Object.entries(grouped).map(([type, typeDocs]) => {
              const config = DOC_ICONS[type] || DOC_ICONS.reference;
              const Icon = config.icon;
              return (
                <div key={type}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                    <span className="text-xs font-semibold text-muted uppercase tracking-wider">{config.label}</span>
                    <span className="text-[10px] text-muted">({typeDocs.length})</span>
                  </div>

                  {/* Drawings and references: thumbnail grid */}
                  {(type === "drawing" || type === "reference") && (
                    <div className="flex flex-wrap gap-2">
                      {typeDocs.map(doc => (
                        <button
                          key={doc.doc_id}
                          onClick={() => openImage(doc)}
                          className="w-20 h-20 rounded-lg border border-subtle overflow-hidden bg-surface-dim active:border-starlight-blue transition-colors"
                          title={doc.caption || doc.file_name}
                        >
                          {doc.mime_type?.startsWith("image/") ? (
                            <MobileThumb path={doc.onedrive_path} />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <FileText className="h-6 w-6 text-faint" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Models: view + download buttons */}
                  {type === "model" && (
                    <div className="space-y-1.5">
                      {typeDocs.map(doc => (
                        <div key={doc.doc_id} className="flex items-center gap-2 py-2 px-3 bg-surface-dim rounded-lg">
                          <Box className="h-4 w-4 text-starlight-red shrink-0" />
                          <span className="text-sm text-navy flex-1 truncate">{doc.caption || doc.file_name}</span>
                          <button onClick={() => openModel(doc)} className="px-2.5 py-1 bg-starlight-blue text-white text-[11px] font-medium rounded-md active:bg-navy">
                            <Eye className="h-3 w-3 inline mr-1" />3D
                          </button>
                          <button onClick={() => downloadFile(doc)} className="p-1.5 text-muted active:text-navy">
                            <Download className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Cut lists: download only */}
                  {type === "cut_list" && (
                    <div className="space-y-1.5">
                      {typeDocs.map(doc => (
                        <button
                          key={doc.doc_id}
                          onClick={() => downloadFile(doc)}
                          className="w-full flex items-center gap-2 py-2 px-3 bg-surface-dim rounded-lg active:bg-surface-mid"
                        >
                          <FileText className="h-4 w-4 text-starlight-green shrink-0" />
                          <span className="text-sm text-navy flex-1 truncate text-left">{doc.caption || doc.file_name}</span>
                          <Download className="h-4 w-4 text-muted" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Image lightbox */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-3" onClick={() => setPreviewUrl(null)}>
          <div className="max-w-full max-h-full relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewUrl(null)} className="absolute -top-2 -right-2 bg-surface rounded-full p-1.5 shadow-lg text-muted active:text-navy z-10">
              <X className="h-4 w-4" />
            </button>
            <p className="text-white text-xs text-center mb-2 truncate max-w-[250px] mx-auto">{previewName}</p>
            {previewName.endsWith(".pdf") ? (
              <iframe src={previewUrl} className="w-[90vw] h-[75vh] rounded-lg bg-surface" />
            ) : (
              <img src={previewUrl} alt={previewName} className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg" />
            )}
          </div>
        </div>
      )}

      {/* 3D Model viewer */}
      {showModel && (
        <ModelViewerMobile url={showModel} fileName={modelName} onClose={() => setShowModel(null)} />
      )}
    </>
  );
}

/** Lazy-load OneDrive thumbnail for mobile */
function MobileThumb({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (path) getOneDriveUrl(path).then(setUrl).catch(() => {});
  }, [path]);
  if (!url) return <div className="w-full h-full bg-surface-mid animate-pulse" />;
  return <img src={url} alt="" className="w-full h-full object-cover" />;
}

/** Mobile-friendly 3D model viewer — wraps the full ModelViewer */
function ModelViewerMobile({ url, fileName, onClose }: { url: string; fileName: string; onClose: () => void }) {
  // Dynamic import of the full ModelViewer to keep mobile bundle lighter
  const [Viewer, setViewer] = useState<any>(null);
  useEffect(() => {
    import("@/components/model-viewer").then(mod => setViewer(() => mod.ModelViewer));
  }, []);

  if (!Viewer) {
    return (
      <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center">
        <div className="text-white text-sm">Loading viewer...</div>
      </div>
    );
  }

  return <Viewer url={url} fileName={fileName} onClose={onClose} />;
}
