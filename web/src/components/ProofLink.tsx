import { explorerTx } from "@raterace/shared";
import { ArrowUpRight } from "lucide-react";
import { config } from "@/lib/config";

/** Link to the public record of a step on the Stellar explorer. */
export function ProofLink({ hash, label = "View proof on Stellar" }: { hash: string; label?: string }) {
  return (
    <a
      href={explorerTx(hash, config.explorerUrl)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 text-sm text-foreground underline decoration-muted-foreground underline-offset-4 hover:decoration-foreground"
    >
      {label}
      <ArrowUpRight className="size-3.5" />
    </a>
  );
}
