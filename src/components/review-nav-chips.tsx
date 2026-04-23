"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Inbox, AlertTriangle, BarChart3 } from "lucide-react";

// Chip strip that appears on /review, /review/inbox, /review/timesheets.
// Active page is highlighted; counts auto-fetch (inbox = pending tasks +
// open requests; timesheets = open timesheet flags). Realtime-subscribed
// so counts update instantly on any change.

interface Tab {
  href: string;
  label: string;
  icon: any;
  countKey: "inbox" | "timesheets" | null;
  activeColor: string;
}

const TABS: Tab[] = [
  { href: "/review", label: "Cost Visibility", icon: BarChart3, countKey: null, activeColor: "text-navy" },
  { href: "/review/inbox", label: "Workshop Inbox", icon: Inbox, countKey: "inbox", activeColor: "text-starlight-amber" },
  { href: "/review/timesheets", label: "Timesheet gaps", icon: AlertTriangle, countKey: "timesheets", activeColor: "text-starlight-red" },
];

export function ReviewNavChips() {
  const supabase = createClient();
  const pathname = usePathname();
  const [counts, setCounts] = useState<{ inbox: number; timesheets: number }>({ inbox: 0, timesheets: 0 });

  const load = async () => {
    const [{ count: taskCount }, { count: reqCount }, { count: flagCount }] = await Promise.all([
      supabase.from("tbl_tasks").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("tbl_workshop_requests").select("*", { count: "exact", head: true }).in("status", ["open", "acknowledged"]),
      supabase.from("tbl_timesheet_flags").select("*", { count: "exact", head: true }).eq("status", "open"),
    ]);
    setCounts({
      inbox: (taskCount || 0) + (reqCount || 0),
      timesheets: flagCount || 0,
    });
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("review-nav-counts")
      .on("postgres_changes", { event: "*", schema: "public", table: "tbl_tasks" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "tbl_workshop_requests" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "tbl_timesheet_flags" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => {
        const isActive = pathname === t.href;
        const count = t.countKey ? counts[t.countKey] : 0;
        const hasCount = count > 0;
        const activeClasses = isActive
          ? `bg-surface-mid border-subtle ${t.activeColor}`
          : hasCount
            ? `bg-starlight-amber/10 border-starlight-amber/40 text-starlight-amber hover:bg-starlight-amber/15`
            : "bg-surface border-subtle text-muted hover:bg-surface-dim";
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${activeClasses}`}
          >
            <Icon className="h-4 w-4" />
            <span className="font-medium">{t.label}</span>
            {hasCount && (
              <span className={`ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
                isActive
                  ? "bg-surface-hi text-navy"
                  : "bg-starlight-amber/20 text-starlight-amber"
              }`}>
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
