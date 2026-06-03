import { PmSidebar } from "@/components/pm-sidebar";
import { ViewSwitcher } from "@/components/view-switcher";
import { RoleGuard } from "@/components/role-guard";

export default function PmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-base">
      <RoleGuard />
      <PmSidebar />
      <main className="ml-56 min-h-screen">
        <div className="sticky top-0 z-30 flex items-center justify-end gap-3 px-6 h-12 bg-base/95 backdrop-blur border-b border-subtle">
          <ViewSwitcher />
        </div>
        <div className="p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
