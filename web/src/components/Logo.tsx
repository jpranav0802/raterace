// RateRace logo: a rounded tile with three rising bars, the tallest one in brand orange with
// a sparkle above it (the best offer), and the wordmark "Rate" + "Race".
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-8", className)} aria-hidden="true">
      <rect width="40" height="40" rx="9.5" fill="var(--secondary)" />
      <rect x="7.5" y="22.3" width="5.6" height="10.4" rx="2.8" fill="#5f6268" />
      <rect x="17.2" y="16.9" width="5.6" height="15.8" rx="2.8" fill="#5f6268" />
      <rect x="27" y="13.4" width="5.6" height="19.3" rx="2.8" fill="var(--brand)" />
      <path
        d="M29.8 3.9 L30.9 7.1 L34.1 8.2 L30.9 9.3 L29.8 12.5 L28.7 9.3 L25.5 8.2 L28.7 7.1 Z"
        fill="var(--brand)"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-semibold tracking-tight", className)}>
      Rate<span className="text-brand">Race</span>
    </span>
  );
}
