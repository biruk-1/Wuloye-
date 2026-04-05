import { BarChart3, FlaskConical, MessageSquareText, ServerCog, Sparkles, Users } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/utils/cn";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/users", label: "Users", icon: Users },
  { to: "/interactions", label: "Interactions", icon: MessageSquareText },
  { to: "/recommendations", label: "Recommendations", icon: Sparkles },
  { to: "/system", label: "System", icon: ServerCog },
  { to: "/experiments", label: "Experiments", icon: FlaskConical },
];

export default function Sidebar() {
  return (
    <aside className="flex h-full w-72 flex-col border-r border-slate-200 bg-white p-4">
      <div className="mb-6 rounded-xl bg-slate-900 px-4 py-3 text-white">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Wuloye</p>
        <h1 className="text-xl font-bold">Admin Console</h1>
      </div>

      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-sky-100 text-sky-900" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
