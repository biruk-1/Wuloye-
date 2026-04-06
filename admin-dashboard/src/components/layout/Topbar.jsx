import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Topbar() {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Operations</p>
        <h2 className="text-xl font-bold text-slate-900">Control Center</h2>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 md:flex">
          <Search className="h-4 w-4 text-slate-500" />
          <span className="text-sm text-slate-500">Search</span>
        </div>
        <Button variant="secondary" size="sm">
          <Bell className="mr-2 h-4 w-4" /> Alerts
        </Button>
      </div>
    </header>
  );
}
