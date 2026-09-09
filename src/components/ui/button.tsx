import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "default"
    | "secondary"
    | "outline"
    | "ghost"
    | "destructive"
    | "emerald"
    | "indigo";
  size?: "default" | "sm" | "lg" | "icon" | "h9";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-xs sm:text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none active:scale-[0.98]";

    const variantStyles = {
      default:
        "bg-slate-100 text-slate-900 shadow-sm hover:bg-white hover:shadow-md",
      secondary:
        "bg-slate-800 text-slate-200 border border-slate-700/80 hover:bg-slate-700/80 hover:text-white shadow-sm",
      outline:
        "border border-slate-700 bg-transparent text-slate-300 hover:border-slate-500 hover:bg-slate-800/60 hover:text-white",
      ghost:
        "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200",
      destructive:
        "bg-rose-600 text-white shadow-sm hover:bg-rose-500 hover:shadow-rose-600/30",
      emerald:
        "bg-emerald-600 text-white shadow-sm shadow-emerald-950/30 hover:bg-emerald-500 hover:shadow-emerald-600/20",
      indigo:
        "bg-indigo-600 text-white shadow-sm shadow-indigo-950/30 hover:bg-indigo-500 hover:shadow-indigo-600/20",
    };

    const sizeStyles = {
      default: "h-9 px-4 py-2",
      sm: "h-8 rounded-md px-3 text-xs",
      lg: "h-10 rounded-lg px-6 text-sm sm:text-base font-semibold",
      icon: "h-9 w-9 p-0",
      h9: "h-9 px-3.5 text-xs sm:text-sm",
    };

    return (
      <button
        ref={ref}
        type={type}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
