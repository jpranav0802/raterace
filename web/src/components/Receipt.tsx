import { cn } from "@/lib/utils";

export interface ReceiptLine {
  label: string;
  amount: string;
  /** "minus" lines are money the family does not get. */
  kind?: "plain" | "minus";
}

interface ReceiptProps {
  lines: ReceiptLine[];
  totalLabel: string;
  total: string;
  note?: string;
}

/** Every cost in the open: nothing hidden in the rate. */
export function Receipt({ lines, totalLabel, total, note }: ReceiptProps) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <dl className="flex flex-col gap-2.5 text-[0.95rem]">
        {lines.map((l) => (
          <div key={l.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">{l.label}</dt>
            <dd className={cn("money", l.kind === "minus" && "text-bad")}>{l.amount}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex items-baseline justify-between gap-4 border-t pt-4">
        <span className="font-medium">{totalLabel}</span>
        <span className="money text-xl font-semibold tracking-tight">{total}</span>
      </div>
      {note && <p className="mt-3 text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}
