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
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors whitespace-nowrap";

  const variantStyles = {
    default:
      "border border-slate-700 bg-slate-800 text-slate-200",
    secondary:
      "border border-slate-700/60 bg-slate-800/60 text-slate-300",
    outline:
      "border border-slate-600 text-slate-300",
    emerald:
      "border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 shadow-sm shadow-emerald-500/10",
    indigo:
      "border border-indigo-500/30 bg-indigo-500/15 text-indigo-300 shadow-sm shadow-indigo-500/10",
    amber:
      "border border-amber-500/30 bg-amber-500/15 text-amber-300 shadow-sm shadow-amber-500/10",
    destructive:
      "border border-rose-500/30 bg-rose-500/15 text-rose-300 shadow-sm shadow-rose-500/10",
  };

  return (
    <div
      className={cn(baseStyles, variantStyles[variant], className)}
      {...props}
    />
  );
}

export { Badge };
