"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Briefcase,
  Hammer,
  AlertTriangle,
  Users,
  Package,
  Calendar,
  ChevronLeft,
  LogOut,
  Star,
  FileText,
  Truck,
} from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, zone: 1 },
  { href: "/jobs", label: "Jobs", icon: Briefcase, zone: 1 },
  { href: "/workshop", label: "Workshop", icon: Hammer, zone: 2 },
  { href: "/review", label: "Review", icon: AlertTriangle, zone: 3 },
  { href: "/capacity", label: "Capacity", icon: Users, zone: 1 },
  { href: "/materials", label: "Materials", icon: Package, zone: 1 },
  { href: "/invoices", label: "Invoices", icon: FileText, zone: 1 },
  { href: "/suppliers", label: "Suppliers", icon: Truck, zone: 1 },
  { href: "/crew", label: "Crew", icon: Calendar, zone: 1 },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 h-screen bg-navy text-white flex flex-col transition-all duration-200 z-50",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/10">
        <Star className="h-6 w-6 text-starlight-amber shrink-0" />
        {!collapsed && (
          <span className="font-semibold text-sm tracking-wide">
            STARLIGHT
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-white/15 text-white"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              )}
            >
              <item.icon className="h-4.5 w-4.5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-white/10 p-2 space-y-1">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-white/40 hover:text-white/70 w-full"
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-transform",
              collapsed && "rotate-180"
            )}
          />
          {!collapsed && <span>Collapse</span>}
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-white/40 hover:text-starlight-red w-full"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
