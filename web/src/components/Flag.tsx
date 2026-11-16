import { useState } from "react";
import { cn } from "@/lib/utils";

/** Round country flag. Falls back to the country code if the image can't load. */
export function Flag({ country, className }: { country: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-[0.6rem] font-semibold uppercase ring-1 ring-border",
        className,
      )}
    >
      {failed ? (
        country
      ) : (
        <img
          src={`https://flagcdn.com/w80/${country}.png`}
          alt=""
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
