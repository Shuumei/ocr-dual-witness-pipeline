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
      "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-xs sm:text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none active:scale-[0.99]";

    const variantStyles = {
      default:
        "bg-black text-white shadow-xs hover:bg-slate-800 active:bg-slate-950",
      secondary:
        "bg-white text-slate-800 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 shadow-xs",
      outline:
        "border border-slate-300 bg-white text-slate-800 hover:border-black hover:bg-slate-50 hover:text-black shadow-xs",
      ghost:
        "text-slate-600 hover:bg-slate-100 hover:text-black",
      destructive:
        "bg-rose-600 text-white shadow-xs hover:bg-rose-700",
      emerald:
        "bg-emerald-600 text-white shadow-xs hover:bg-emerald-700",
      indigo:
        "bg-black text-white shadow-xs hover:bg-slate-800 active:bg-slate-950",
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
