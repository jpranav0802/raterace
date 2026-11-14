import { useId } from "react";
import { cn } from "@/lib/utils";

interface AmountFieldProps {
  label: string;
  /** Decimal string, e.g. "200" or "200.50". */
  value: string;
  onChange?: (value: string) => void;
  /** Shown before the number, e.g. "$" or "MX$". */
  symbol: string;
  /** Shown on the right, e.g. "USD". */
  currency: string;
  /** Display only (e.g. the amount the family receives). */
  readOnly?: boolean;
  hint?: string;
}

/** The big money amount. The number is the loudest thing on the screen. */
export function AmountField({
  label,
  value,
  onChange,
  symbol,
  currency,
  readOnly,
  hint,
}: AmountFieldProps) {
  const id = useId();
  const amountClass =
    "money min-w-0 flex-1 bg-transparent text-[2.75rem] leading-none font-medium tracking-tight outline-none";
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-muted-foreground">
        {label}
      </label>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="money text-2xl font-medium text-muted-foreground">{symbol}</span>
        {readOnly ? (
          <output id={id} className={amountClass}>
            {value}
          </output>
        ) : (
          <input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => onChange?.(e.target.value.replace(/[^\d.]/g, ""))}
            aria-describedby={hint ? `${id}-hint` : undefined}
            className={amountClass}
          />
        )}
        <span className="shrink-0 text-sm text-muted-foreground">{currency}</span>
      </div>
      {hint && (
        <p id={`${id}-hint`} className={cn("mt-2 text-sm text-muted-foreground")}>
          {hint}
        </p>
      )}
    </div>
  );
}
