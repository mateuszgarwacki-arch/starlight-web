"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ClipboardList, CalendarDays, User, Star, Wrench } from "lucide-react";
import { FloatingActionButton } from "@/components/floating-action-button";

const tabs = [
  { href: "/m", icon: ClipboardList, label: "Tasks" },
  { href: "/m/schedule", icon: CalendarDays, label: "Schedule" },
  { href: "/m/maintenance", icon: Wrench, label: "Maint." },
  { href: "/m/me", icon: User, label: "Me" },
];

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Login page gets no chrome
  if (pathname === "/m/login") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-base flex flex-col">
      {/* Header */}
      <header className="bg-navy px-4 py-3 flex items-center gap-2 shrink-0">
        <Star className="h-5 w-5 text-starlight-amber" />
        <span className="text-white font-semibold text-sm tracking-wide">STARLIGHT</span>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-20">
        <div className="px-4 py-4">{children}</div>
      </main>

      {/* FAB */}
      <FloatingActionButton />

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-subtle flex justify-around py-2 z-50">
        {tabs.map((tab) => {
          const isActive = tab.href === "/m" ? pathname === "/m" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={"flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg transition-colors " + (isActive ? "text-starlight-red" : "text-muted")}
            >
              <tab.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
