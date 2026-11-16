import { Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Fragment } from "react";
import { cn } from "@/lib/utils";

const STEPS = ["Details", "Choose offer", "Track"];

/** Where the sender is in the transfer: details, choose offer, track. */
export function Stepper({ current }: { current: number }) {
  const reduce = useReducedMotion();
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Transfer steps">
      {STEPS.map((s, i) => (
        <Fragment key={s}>
          {i > 0 && <li aria-hidden="true" className={cn("h-px w-6 sm:w-10", i <= current ? "bg-foreground/50" : "bg-border")} />}
          <li
            aria-current={i === current ? "step" : undefined}
            className={cn("flex items-center gap-1.5", i === current ? "text-brand" : "text-muted-foreground")}
          >
            <motion.span
              initial={reduce || i !== current ? false : { scale: 0.3, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 12, delay: 0.15 }}
              className={cn(
                "flex size-5 items-center justify-center rounded-full text-[0.65rem] font-semibold",
                i < current && "bg-foreground text-background",
                i === current && "border-2 border-brand text-brand",
                i > current && "border",
              )}
            >
              {i < current ? <Check className="size-3" strokeWidth={3} /> : i + 1}
            </motion.span>
            {s}
          </li>
        </Fragment>
      ))}
    </ol>
  );
}
