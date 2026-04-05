import { cn } from "@/utils/cn";

function Card({ className, ...props }) {
  return (
    <div
      className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }) {
  return <div className={cn("border-b border-slate-100 px-4 py-3", className)} {...props} />;
}

function CardTitle({ className, ...props }) {
  return <h4 className={cn("text-sm font-semibold text-slate-700", className)} {...props} />;
}

function CardContent({ className, ...props }) {
  return <div className={cn("px-4 py-4", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardContent };
