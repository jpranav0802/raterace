import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Step {
  title: string;
  detail?: ReactNode;
  state: "done" | "current" | "upcoming" | "failed";
}

/** A transfer's progress, top to bottom. The order is real, so the steps are numbered. */
export function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={s.title} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-7 bottom-0 left-[13px] w-px",
                  s.state === "done" ? "bg-foreground/60" : "bg-border",
                )}
              />
            )}
            <span
              className={cn(
                "money relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                s.state === "done" && "bg-foreground text-background",
                s.state === "current" && "border border-foreground text-foreground",
                s.state === "upcoming" && "border text-muted-foreground",
                s.state === "failed" && "bg-bad text-background",
              )}
            >
              {s.state === "done" ? (
                <Check className="size-3.5" strokeWidth={3} />
              ) : s.state === "failed" ? (
                <X className="size-3.5" strokeWidth={3} />
              ) : (
                i + 1
              )}
            </span>
            <div className="pt-0.5">
              <p
                className={cn(
                  "font-medium",
                  s.state === "upcoming" && "text-muted-foreground",
                  s.state === "failed" && "text-bad",
                )}
              >
                {s.title}
                {s.state === "current" && <span className="sr-only"> (in progress)</span>}
              </p>
              {s.detail && <div className="mt-0.5 text-sm text-muted-foreground">{s.detail}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
