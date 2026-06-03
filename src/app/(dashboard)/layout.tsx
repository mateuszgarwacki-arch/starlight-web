import { Sidebar } from "@/components/sidebar";
import { RecentJobsStrip } from "@/components/recent-jobs-strip";
import { ViewSwitcher } from "@/components/view-switcher";
import { RoleGuard } from "@/components/role-guard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-base">
      <RoleGuard />
      <Sidebar />
      {/* Main content — offset by sidebar width (removed on print) */}
      <main className="ml-56 min-h-screen print:ml-0">
        {/* Top bar with view switcher — chrome, hide on print */}
        <div className="sticky top-0 z-30 flex items-center justify-end gap-3 px-6 h-12 bg-base/95 backdrop-blur border-b border-subtle print:hidden">
          <ViewSwitcher />
        </div>
        <div className="p-6 max-w-7xl mx-auto print:p-0 print:max-w-none">
          <div className="print:hidden">
            <RecentJobsStrip />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
