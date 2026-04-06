import { cn } from "@/utils/cn";

export function Progress({ value = 0, className, ...props }) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className={cn("h-2 w-full rounded-full bg-slate-100", className)} {...props}>
      <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${clamped}%` }} />
    </div>
  );
}
