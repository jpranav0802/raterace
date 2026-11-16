// Past transfers from this browser, with their live status read from the contract.
// Owner: Abhiraj (demo polish).
import { explorerTx, formatMxn, formatUsd } from "@raterace/shared";
import { RateRaceClient } from "@raterace/shared/chain";
import { ArrowUpRight, Send as SendIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Flag } from "@/components/Flag";
import { Button } from "@/components/ui/button";
import { config } from "@/lib/config";
import { transfers as transferStore, type TransferRecord } from "@/lib/local";
import { cn } from "@/lib/utils";
import { demoKeypair } from "@/lib/wallet";

type Tone = "good" | "bad" | "neutral" | "busy";
interface StatusView {
  label: string;
  tone: Tone;
}

function statusView(status: string, deadline: number): StatusView {
  const now = Math.floor(Date.now() / 1000);
  switch (status) {
    case "Open":
      return now > deadline ? { label: "Deadline missed · refund available", tone: "bad" } : { label: "On its way", tone: "busy" };
    case "Paid":
      return { label: "Delivered", tone: "good" };
    case "Settled":
      return { label: "Completed", tone: "good" };
    case "Refunded":
      return { label: "Refunded + penalty", tone: "neutral" };
    case "Disputed":
      return { label: "Under review", tone: "bad" };
    case "Slashed":
      return { label: "Refunded · provider penalised", tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
}

function useStatuses(list: TransferRecord[]) {
  const [map, setMap] = useState<Record<string, StatusView>>({});
  const ids = list.map((t) => t.orderId).join(",");
  useEffect(() => {
    if (!ids || !config.rateraceContractId) return;
    let alive = true;
    const client = new RateRaceClient({
      contractId: config.rateraceContractId,
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
      publicKey: demoKeypair().publicKey(),
    });
    const load = async () => {
      const entries = await Promise.all(
        ids.split(",").map(async (id) => {
          try {
            const o = (await client.get_order({ order_id: BigInt(id) })).result.unwrap();
            return [id, statusView(o.status.tag, Number(o.payout_deadline))] as const;
          } catch {
            return [id, { label: "Unknown", tone: "neutral" as Tone }] as const;
          }
        }),
      );
      if (alive) setMap(Object.fromEntries(entries));
    };
    load();
    const t = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [ids]);
  return map;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

const TONE: Record<Tone, string> = {
  good: "text-good before:bg-good",
  bad: "text-bad before:bg-bad",
  neutral: "text-muted-foreground before:bg-muted-foreground",
  busy: "text-foreground before:bg-foreground before:animate-pulse",
};

export default function Activity() {
  const list = transferStore.use();
  const statuses = useStatuses(list);

  return (
    <div>
      <h1 className="text-[1.9rem]">Activity</h1>
      <p className="mt-2 text-muted-foreground">Every transfer you've sent from this device, with its live status.</p>

      {list.length === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary">
            <SendIcon className="size-5" />
          </span>
          <p className="mt-4 font-medium">No transfers yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Your transfers will show up here.</p>
          <Button asChild className="mt-5">
            <Link to="/send">Send money</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-7 divide-y overflow-hidden rounded-2xl border bg-card">
          {list.map((t) => {
            const s = statuses[t.orderId];
            return (
              <li key={t.orderId} className="flex items-center gap-3 px-4 py-3.5">
                <span className="relative">
                  <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
                    {initials(t.recipientName)}
                  </span>
                  <Flag country={t.country} className="absolute -right-1 -bottom-1 size-4.5 ring-2 ring-card" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.recipientName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {new Date(t.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    {" · "}
                    {t.provider}
                    {t.standIn ? ` (via test anchor ${t.standIn})` : ""}
                    {" · "}
                    <a
                      href={explorerTx(t.hash, config.explorerUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center underline decoration-muted-foreground/50 underline-offset-2 hover:text-foreground"
                    >
                      proof <ArrowUpRight className="size-3" />
                    </a>
                  </p>
                  <p
                    className={cn(
                      "mt-1 inline-flex items-center gap-1.5 text-xs before:size-1.5 before:rounded-full before:content-['']",
                      TONE[s?.tone ?? "neutral"],
                    )}
                  >
                    {s?.label ?? "Checking…"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="money font-semibold">{formatMxn(t.landedLocal)}</p>
                  <p className="money text-xs text-muted-foreground">{formatUsd(t.sendUsdc)} sent</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
