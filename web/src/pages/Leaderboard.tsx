// Provider leaderboard (issue #21). Each provider's public record, read from the chain.
import { explorerContract, formatUsd, type LeaderboardRow } from "@raterace/shared";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { config } from "@/lib/config";

const POLL_MS = 5000;

export default function Leaderboard() {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${config.indexerUrl}/leaderboard`);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as LeaderboardRow[];
        if (alive) {
          setRows(data);
          setOffline(false);
        }
      } catch {
        if (alive) setOffline(true);
      }
    };
    void load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div>
      <PageHeader
        title="Providers"
        lead="Every provider puts up a deposit. If it fails to deliver, part of that deposit goes to the sender and the provider is suspended."
      />

      {!rows && (
        <p className="text-muted-foreground">
          {offline ? "We can't reach the service right now. This page keeps trying." : "Loading providers…"}
        </p>
      )}

      {rows && rows.length === 0 && <p className="text-muted-foreground">No providers yet.</p>}

      {rows && rows.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {rows.map((r) => (
            <li key={r.anchor} className="px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-lg font-medium">{r.displayName}</span>
                <Badge variant={r.active ? "good" : "bad"}>{r.active ? "Active" : "Suspended"}</Badge>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Delivered</dt>
                  <dd className="money">{r.filled}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Penalties</dt>
                  <dd className={r.slashed > 0 ? "money text-bad" : "money"}>{r.slashed}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Deposit</dt>
                  <dd className="money">{formatUsd(r.bond)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Locked now</dt>
                  <dd className="money">{formatUsd(r.reserved)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}

      {config.rateraceContractId && (
        <p className="mt-4 text-sm text-muted-foreground">
          These numbers are public.{" "}
          <a
            href={explorerContract(config.rateraceContractId, config.explorerUrl)}
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline decoration-muted-foreground underline-offset-4 hover:decoration-foreground"
          >
            See the contract on Stellar
          </a>
          .
        </p>
      )}
    </div>
  );
}
