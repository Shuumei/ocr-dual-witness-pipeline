import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:
    | "default"
    | "secondary"
    | "outline"
    | "emerald"
    | "indigo"
    | "amber"
    | "destructive";
}

function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  const baseStyles =
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors whitespace-nowrap";

  const variantStyles = {
    default:
      "border border-slate-900 bg-black text-white",
    secondary:
      "border border-slate-200 bg-slate-100 text-slate-700",
    outline:
      "border border-slate-300 text-slate-800",
    emerald:
      "border border-emerald-200 bg-emerald-50 text-emerald-700",
    indigo:
      "border border-slate-300 bg-slate-100 text-slate-800",
    amber:
      "border border-amber-200 bg-amber-50 text-amber-800",
    destructive:
      "border border-rose-200 bg-rose-50 text-rose-700",
  };

  return (
    <div
      className={cn(baseStyles, variantStyles[variant], className)}
      {...props}
    />
  );
}

export { Badge };
