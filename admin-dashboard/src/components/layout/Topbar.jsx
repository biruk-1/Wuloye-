import { LayoutGrid, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Topbar({ onOpenSidebar }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <Button
          variant="ghost"
          size="sm"
          className="md:hidden"
          onClick={onOpenSidebar}
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <LayoutGrid className="h-4 w-4 text-slate-500" />
        <span className="text-sm font-semibold text-slate-600">Admin Dashboard</span>
      </div>
    </header>
  );
}
