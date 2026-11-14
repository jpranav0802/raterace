import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface CountdownProps {
  /** Unix seconds. */
  until: number;
  /** Text before the time, e.g. "Offers held for". */
  label: string;
  /** Shown when time is up. */
  expiredLabel: string;
  onExpire?: () => void;
}

export function Countdown({ until, label, expiredLabel, onExpire }: CountdownProps) {
  const [left, setLeft] = useState(() => Math.max(0, until - Math.floor(Date.now() / 1000)));

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, until - Math.floor(Date.now() / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [until]);

  useEffect(() => {
    if (left === 0) onExpire?.();
  }, [left, onExpire]);

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  return (
    <p role="timer" className={cn("text-sm", left === 0 ? "text-bad" : "text-muted-foreground")}>
      {left === 0 ? (
        expiredLabel
      ) : (
        <>
          {label}{" "}
          <span className={cn("money font-medium", left <= 20 ? "text-bad" : "text-foreground")}>
            {mm}:{ss}
          </span>
        </>
      )}
    </p>
  );
}
