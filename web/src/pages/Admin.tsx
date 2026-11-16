// Admin panel (issue #20). For the operator, not for senders.
//
// The admin key is pasted in at runtime and kept in memory only: it is never stored, never
// sent anywhere except as signatures on transactions, and never part of the built app.
// Admin transactions are signed here and sent straight to the network (the admin account
// pays its own fees; the fee-sponsoring router only serves senders).
import { Keypair, contract } from "@stellar/stellar-sdk";
import {
  ASSET_MXN,
  ORACLE_DECIMALS,
  explorerTx,
  formatUsd,
  localPerUsd,
  type LeaderboardRow,
  type OrderView,
} from "@raterace/shared";
import { OracleClient, RateRaceClient, oraclePrice } from "@raterace/shared/chain";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { config } from "@/lib/config";

interface ChainState {
  paused: boolean;
  oracleId: string;
  price: bigint | null;
  priceAt: number;
  maxOracleAgeS: number;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function errorText(e: unknown): string {
  const msg = String((e as Error)?.message ?? e);
  const code = msg.match(/Error\(Contract, #(\d+)\)/)?.[1];
  return code ? `The contract refused this (code ${code}).` : msg.split("\n")[0].slice(0, 200);
}

export default function Admin() {
  const [secret, setSecret] = useState("");
  const [admin, setAdmin] = useState<Keypair | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [chain, setChain] = useState<ChainState | null>(null);
  const [providers, setProviders] = useState<LeaderboardRow[]>([]);
  const [disputes, setDisputes] = useState<OrderView[]>([]);
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string; hash?: string } | null>(null);

  // Read-only client for the unlock check and status; any funded account works as source.
  const reader = useMemo(
    () =>
      new RateRaceClient({
        contractId: config.rateraceContractId,
        networkPassphrase: config.networkPassphrase,
        rpcUrl: config.rpcUrl,
      }),
    [],
  );

  const clients = useMemo(() => {
    if (!admin || !chain) return null;
    const base = {
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
      publicKey: admin.publicKey(),
      signTransaction: contract.basicNodeSigner(admin, config.networkPassphrase).signTransaction,
    };
    return {
      raterace: new RateRaceClient({ ...base, contractId: config.rateraceContractId }),
      oracle: new OracleClient({ ...base, contractId: chain.oracleId }),
    };
  }, [admin, chain]);

  const refresh = useCallback(async () => {
    try {
      const cfg = (await reader.get_config()).result.unwrap();
      const oracle = new OracleClient({
        contractId: cfg.oracle,
        networkPassphrase: config.networkPassphrase,
        rpcUrl: config.rpcUrl,
      });
      const [paused, price] = await Promise.all([reader.paused(), oraclePrice(oracle, ASSET_MXN)]);
      setChain({
        paused: paused.result,
        oracleId: cfg.oracle,
        price: price?.price ?? null,
        priceAt: price?.timestamp ?? 0,
        maxOracleAgeS: Number(cfg.max_oracle_age_s),
      });
    } catch {
      // keep the last known state; the next refresh will retry
    }
    try {
      const [lb, orders] = await Promise.all([
        fetch(`${config.indexerUrl}/leaderboard`).then((r) => r.json() as Promise<LeaderboardRow[]>),
        fetch(`${config.indexerUrl}/orders`).then((r) => r.json() as Promise<OrderView[]>),
      ]);
      setProviders(lb);
      setDisputes(orders.filter((o) => o.status === "Disputed"));
    } catch {
      // indexer offline: lists stay as they were
    }
  }, [reader]);

  useEffect(() => {
    if (!admin) return;
    void refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [admin, refresh]);

  async function unlock(e: FormEvent) {
    e.preventDefault();
    setUnlockError(null);
    let kp: Keypair;
    try {
      kp = Keypair.fromSecret(secret.trim());
    } catch {
      setUnlockError("That is not a valid secret key. It starts with S and has 56 characters.");
      return;
    }
    try {
      const cfg = (await reader.get_config()).result.unwrap();
      if (cfg.admin !== kp.publicKey()) {
        setUnlockError("This key is not the admin of this contract.");
        return;
      }
    } catch {
      setUnlockError("Could not reach the contract. Check that the app is configured (.env) and try again.");
      return;
    }
    setSecret("");
    setAdmin(kp);
  }

  /** Sign and send one admin transaction, then show what happened. */
  async function run(label: string, build: () => Promise<{ signAndSend: () => Promise<unknown> }>) {
    setBusy(label);
    setResult(null);
    try {
      const tx = await build();
      const sent = (await tx.signAndSend()) as { sendTransactionResponse?: { hash?: string } };
      setResult({ ok: true, text: `${label}: done.`, hash: sent.sendTransactionResponse?.hash });
      await refresh();
    } catch (e) {
      setResult({ ok: false, text: `${label} failed. ${errorText(e)}` });
    } finally {
      setBusy(null);
    }
  }

  if (!config.rateraceContractId) {
    return <PageHeader title="Admin" lead="The app is not configured yet. Deploy first, then reload." />;
  }

  if (!admin) {
    return (
      <div>
        <PageHeader
          title="Admin"
          lead="For the operator. Paste the admin secret key to continue. It stays in this tab's memory and is never stored."
        />
        <form onSubmit={unlock} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="admin-secret">Admin secret key</Label>
            <Input
              id="admin-secret"
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              aria-invalid={unlockError ? "true" : undefined}
            />
            {unlockError && <p className="mt-1.5 text-sm text-bad">{unlockError}</p>}
          </div>
          <Button size="lg" type="submit" disabled={!secret}>
            Unlock
          </Button>
        </form>
      </div>
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const priceAge = chain?.priceAt ? now - chain.priceAt : null;
  const stale = chain && priceAge !== null && priceAge > chain.maxOracleAgeS;
  const disabled = busy !== null || !clients;

  return (
    <div>
      <PageHeader title="Admin" lead="Every action here is a signed transaction on the Stellar test network." />

      {result && (
        <p role="status" className={result.ok ? "text-sm text-good" : "text-sm text-bad"}>
          {result.text}{" "}
          {result.hash && (
            <a
              href={explorerTx(result.hash, config.explorerUrl)}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              View on Stellar
            </a>
          )}
        </p>
      )}

      <Section title="New transfers">
        <Card className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">{chain?.paused ? "Paused" : "Open"}</p>
            <p className="text-sm text-muted-foreground">
              {chain?.paused
                ? "No new transfers can start. Transfers already under way can still finish or be refunded."
                : "Senders can start new transfers."}
            </p>
          </div>
          {chain?.paused ? (
            <Button disabled={disabled} onClick={() => run("Resume transfers", () => clients!.raterace.unpause())}>
              Resume
            </Button>
          ) : (
            <Button
              variant="destructive"
              disabled={disabled}
              onClick={() => run("Pause transfers", () => clients!.raterace.pause())}
            >
              Pause
            </Button>
          )}
        </Card>
      </Section>

      <Section title="Providers">
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {providers.map((p) => (
            <li key={p.anchor} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <div>
                <p className="flex items-center gap-2 font-medium">
                  {p.displayName}
                  <Badge variant={p.active ? "good" : "bad"}>{p.active ? "Active" : "Suspended"}</Badge>
                </p>
                <p className="money text-sm text-muted-foreground">
                  Deposit {formatUsd(p.bond)}, {p.filled} delivered, {p.slashed}{" "}
                  {p.slashed === 1 ? "penalty" : "penalties"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() =>
                  run(`${p.active ? "Suspend" : "Approve"} ${p.displayName}`, () =>
                    clients!.raterace.set_active({ anchor: p.anchor, active: !p.active }),
                  )
                }
              >
                {p.active ? "Suspend" : "Approve"}
              </Button>
            </li>
          ))}
          {providers.length === 0 && <li className="px-5 py-3.5 text-sm text-muted-foreground">No providers found.</li>}
        </ul>
      </Section>

      <Section title="Reported problems">
        {disputes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to review.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {disputes.map((o) => (
              <li key={o.id}>
                <Card>
                  <p className="font-medium">
                    Transfer {o.id}: {formatUsd(o.sendUsdc)} with {o.anchorName || "a provider"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The sender says the money did not arrive. Check the provider's payout record, then decide.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={disabled}
                      onClick={() =>
                        run(`Refund sender for transfer ${o.id}`, () =>
                          clients!.raterace.resolve({ order_id: BigInt(o.id), anchor_at_fault: true }),
                        )
                      }
                    >
                      Provider at fault: refund sender
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={disabled}
                      onClick={() =>
                        run(`Close transfer ${o.id} as delivered`, () =>
                          clients!.raterace.resolve({ order_id: BigInt(o.id), anchor_at_fault: false }),
                        )
                      }
                    >
                      Provider delivered
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Market rate (test oracle)">
        <Card>
          <p className="money font-medium">
            {chain?.price ? `1 USD = ${localPerUsd(chain.price).toFixed(4)} MXN` : "No rate set"}
          </p>
          <p className={stale ? "text-sm text-bad" : "text-sm text-muted-foreground"}>
            {priceAge === null
              ? ""
              : stale
                ? `Stale: last updated ${Math.floor(priceAge / 60)} min ago. New transfers are refused until it is refreshed.`
                : `Updated ${priceAge < 60 ? "just now" : `${Math.floor(priceAge / 60)} min ago`}.`}
          </p>
          <form
            className="mt-4 flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const mxnPerUsd = Number(rate);
              if (!(mxnPerUsd > 0)) return;
              // The oracle stores USD per 1 MXN with 14 decimals.
              const price = BigInt(Math.round(10 ** ORACLE_DECIMALS / mxnPerUsd));
              void run("Set market rate", () =>
                clients!.oracle.set_price({ asset: { tag: "Other", values: [ASSET_MXN] }, price }),
              ).then(() => setRate(""));
            }}
          >
            <div className="flex-1">
              <Label htmlFor="rate">Pesos per dollar</Label>
              <Input
                id="rate"
                inputMode="decimal"
                placeholder="18.58"
                value={rate}
                onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </div>
            <Button type="submit" disabled={disabled || !(Number(rate) > 0)}>
              Set rate
            </Button>
          </form>
          <p className="mt-3 text-sm text-muted-foreground">
            On mainnet this comes from the Reflector oracle. On testnet we set it by hand.
          </p>
        </Card>
      </Section>

      <Button variant="ghost" className="mt-8" onClick={() => setAdmin(null)}>
        Lock
      </Button>
    </div>
  );
}
