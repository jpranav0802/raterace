import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-11 w-full rounded-lg border border-input bg-transparent px-3.5 text-base text-foreground placeholder:text-muted-foreground/60 focus-visible:border-foreground disabled:opacity-50 aria-invalid:border-bad",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
