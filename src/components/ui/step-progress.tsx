import * as React from "react";
import { cn } from "@/lib/utils";
import { Check, Loader2 } from "lucide-react";

export interface StepItem {
  id: number;
  title: string;
  description: string;
}

interface StepProgressProps {
  currentStep: number; // 1, 2, or 3
  steps?: StepItem[];
  className?: string;
}

const DEFAULT_STEPS: StepItem[] = [
  {
    id: 1,
    title: "Pre-processing & Auto-deskew",
    description: "วิเคราะห์มุมเอียง ครอบตัด และจัดระเบียบภาพ",
  },
  {
    id: 2,
    title: "Dual Engine Processing",
    description: "ถอดรหัสคู่ขนาน Witness A & Witness B",
  },
  {
    id: 3,
    title: "Consensus & Formatting",
    description: "เทียบเคียง 2 ชั้น ปรับสระไทย และสร้างโครงสร้าง",
  },
];

export function StepProgress({
  currentStep,
  steps = DEFAULT_STEPS,
  className,
}: StepProgressProps) {
  return (
    <div className={cn("w-full space-y-4", className)}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {steps.map((step) => {
          const isCompleted = step.id < currentStep;
          const isCurrent = step.id === currentStep;
          const isUpcoming = step.id > currentStep;

          return (
            <div
              key={step.id}
              className={cn(
                "relative flex items-start gap-3 rounded-xl border p-3.5 transition-all",
                isCurrent &&
                  "border-indigo-500/60 bg-indigo-950/30 text-indigo-200 shadow-md shadow-indigo-950/50 ring-1 ring-indigo-500/30",
                isCompleted &&
                  "border-emerald-500/40 bg-emerald-950/20 text-emerald-200",
                isUpcoming &&
                  "border-slate-800/80 bg-slate-950/30 text-slate-500"
              )}
            >
              {/* Icon badge */}
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all",
                  isCompleted && "bg-emerald-500 text-slate-950",
                  isCurrent && "bg-indigo-500 text-white animate-pulse shadow-sm shadow-indigo-500/50",
                  isUpcoming && "bg-slate-800 text-slate-400"
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4 stroke-[3]" />
                ) : isCurrent ? (
                  <Loader2 className="h-4 w-4 animate-spin stroke-[2.5]" />
                ) : (
                  <span>{step.id}</span>
                )}
              </div>

              {/* Step info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "text-xs font-semibold tracking-wide",
                      isCurrent && "text-indigo-300 font-bold",
                      isCompleted && "text-emerald-300 font-bold",
                      isUpcoming && "text-slate-400"
                    )}
                  >
                    Step {step.id}
                  </span>
                  {isCurrent && (
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-400 animate-ping" />
                  )}
                </div>
                <div
                  className={cn(
                    "text-xs font-medium truncate mt-0.5",
                    isCurrent ? "text-slate-100" : isCompleted ? "text-slate-200" : "text-slate-400"
                  )}
                >
                  {step.title}
                </div>
                <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                  {step.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
