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
  ShoppingCart,
  Settings,
  Bell,
  Warehouse,
  Wrench,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";
import { useRealtimeRefresh } from "@/lib/use-realtime";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, zone: 1 },
  { href: "/jobs", label: "Jobs", icon: Briefcase, zone: 1 },
  { href: "/workshop", label: "Workshop", icon: Hammer, zone: 2 },
  { href: "/review", label: "Review", icon: AlertTriangle, zone: 3 },
  { href: "/capacity", label: "Capacity", icon: Users, zone: 1 },
  { href: "/materials", label: "Materials", icon: Package, zone: 1 },
  { href: "/stock", label: "Stock", icon: Warehouse, zone: 1 },
  { href: "/orders", label: "Orders", icon: ShoppingCart, zone: 1 },
  { href: "/invoices", label: "Invoices", icon: FileText, zone: 1 },
  { href: "/suppliers", label: "Suppliers", icon: Truck, zone: 1 },
  { href: "/crew", label: "Crew", icon: Calendar, zone: 1 },
  { href: "/reports", label: "Reports", icon: FileText, zone: 1 },
  { href: "/maintenance", label: "Maintenance", icon: Wrench, zone: 1 },
  { href: "/notifications", label: "Notifications", icon: Bell, zone: 1, hasBadge: true },
  { href: "/settings", label: "Settings", icon: Settings, zone: 1 },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch unread notification count
  const fetchCount = useCallback(async () => {
    const supabase = createClient();
    const { count } = await supabase
      .from("tbl_notifications")
      .select("*", { count: "exact", head: true })
      .is("read_at", null)
      .is("dismissed_at", null);
    setUnreadCount(count || 0);
  }, []);

  useEffect(() => { fetchCount(); }, [fetchCount]);

  // Real-time: update badge instantly when notifications change
  useRealtimeRefresh("tbl_notifications", fetchCount);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 h-screen bg-base text-white flex flex-col transition-all duration-200 z-50 border-r border-subtle",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-subtle">
        <Star className="h-6 w-6 text-starlight-pink shrink-0" />
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
          const showBadge = (item as any).hasBadge && unreadCount > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors relative",
                isActive
                  ? "bg-navy/15 text-navy"
                  : "text-muted hover:text-white hover:bg-surface-mid"
              )}
            >
              <div className="relative shrink-0">
                <item.icon className="h-4.5 w-4.5" />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-starlight-pink text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-subtle p-2 space-y-1">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-faint hover:text-muted w-full"
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
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-faint hover:text-starlight-red w-full"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
