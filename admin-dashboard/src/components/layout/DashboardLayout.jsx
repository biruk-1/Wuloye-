import { Outlet } from "react-router-dom";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";

export default function DashboardLayout() {
  return (
    <div className="flex min-h-screen bg-transparent">
      <div className="hidden md:block">
        <Sidebar />
      </div>

      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar />
        <main className="flex-1 p-6">
          <div className="mx-auto w-full max-w-7xl rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
