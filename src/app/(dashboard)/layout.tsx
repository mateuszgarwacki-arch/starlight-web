import { Sidebar } from "@/components/sidebar";
import { RecentJobsStrip } from "@/components/recent-jobs-strip";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-base">
      <Sidebar />
      {/* Main content — offset by sidebar width */}
      <main className="ml-56 min-h-screen">
        <div className="p-6 max-w-7xl mx-auto">
          <RecentJobsStrip />
          {children}
        </div>
      </main>
    </div>
  );
}
