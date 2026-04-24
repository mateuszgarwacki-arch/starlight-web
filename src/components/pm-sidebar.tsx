"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Briefcase, Star, LogOut, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";

/**
 * Simplified sidebar for PM view.
 * One nav item (Jobs) — PM view is deliberately narrow in pilot.
 */
export function PmSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = pathname === "/pm/jobs" || pathname.startsWith("/pm/jobs/");

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <aside className="fixed top-0 left-0 h-screen w-56 bg-base text-white flex flex-col z-50 border-r border-subtle print:hidden">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-subtle">
        <Star className="h-6 w-6 text-starlight-pink shrink-0" />
        <span className="font-semibold text-sm tracking-wide">STARLIGHT</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-starlight-blue bg-starlight-blue/10 px-1.5 py-0.5 rounded">
          <Eye className="h-3 w-3" /> PM
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        <Link
          href="/pm/jobs"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
            isActive ? "bg-navy/15 text-navy" : "text-muted hover:text-white hover:bg-surface-mid"
          )}
        >
          <Briefcase className="h-4 w-4" />
          <span>Jobs</span>
        </Link>
      </nav>

      {/* Bottom */}
      <div className="border-t border-subtle p-2 space-y-1">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-faint hover:text-starlight-red w-full"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
