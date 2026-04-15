"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Plus, X, Clock, ClipboardList } from "lucide-react";

export function FloatingActionButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Hide on pages that have their own primary actions
  if (pathname.startsWith("/m/wo/")) return null;
  if (pathname === "/m/login") return null;
  if (pathname === "/m/task") return null;
  if (pathname === "/m/request") return null;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Action buttons (expanded) */}
      {open && (
        <div className="fixed bottom-36 right-4 z-50 flex flex-col gap-3 items-end">
          <button
            onClick={() => { setOpen(false); router.push("/m/task"); }}
            className="flex items-center gap-2 bg-navy text-white pl-4 pr-5 py-3 rounded-full shadow-lg active:bg-navy/90 transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">Log Task</span>
          </button>
          <button
            onClick={() => { setOpen(false); router.push("/m/request"); }}
            className="flex items-center gap-2 bg-starlight-amber text-base pl-4 pr-5 py-3 rounded-full shadow-lg active:bg-starlight-amber/90 transition-all animate-in fade-in slide-in-from-bottom-2 duration-150"
          >
            <ClipboardList className="h-4 w-4" />
            <span className="text-sm font-medium">Raise Request</span>
          </button>
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={() => setOpen(!open)}
        className={
          "fixed bottom-[5.5rem] right-4 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 " +
          (open
            ? "bg-surface-bright rotate-0"
            : "bg-starlight-red")
        }
      >
        {open ? (
          <X className="h-6 w-6 text-white" />
        ) : (
          <Plus className="h-6 w-6 text-white" />
        )}
      </button>
    </>
  );
}
