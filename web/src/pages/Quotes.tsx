// Owner: Abhiraj (issue #18). Built from the components shown on /design.
import { contract, rpc } from "@stellar/stellar-sdk";
import { formatBps, formatMxn, formatUsd, hexToBytes, marketLocal, toUnits, type RankedQuote } from "@raterace/shared";
import { RateRaceClient, toContractQuote } from "@raterace/shared/chain";
import { useCallback, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Countdown } from "@/components/Countdown";
import { LockedCelebration, type LockedInfo } from "@/components/LockedCelebration";
import { Flag } from "@/components/Flag";
import { PageHeader } from "@/components/PageHeader";
import { Stepper } from "@/components/Stepper";
import { RaceTrack } from "@/components/RaceTrack";
import { Receipt } from "@/components/Receipt";
import { Button } from "@/components/ui/button";
import { api, type AuditRow, type RfqWithAudit } from "@/lib/api";
import { chainlog } from "@/lib/chainlog";
import { config } from "@/lib/config";
import { errorMessage } from "@/lib/format";
import { narrateRfq } from "@/lib/narrate";
import { rememberTransfer } from "@/lib/local";
import { clearPending, loadPending, savePending, type PendingTransfer } from "@/lib/transfer";
import { demoKeypair } from "@/lib/wallet";

/** Limits the sender can choose: refuse offers further below the market rate than this. */
const LIMIT_OPTIONS = [100, 200, 300];
/** Codes that mean "these offers can't be used any more; get fresh ones". */
const STALE_CODES = new Set([20, 21]);

function contractErrorCode(text: string): number | undefined {
  const m = text.match(/Error\(Contract, #(\d+)\)/);
  return m ? Number(m[1]) : undefined;
}

class SendError extends Error {
  constructor(readonly code?: number) {
    super(errorMessage(code));
  }
}

async function lockOffer(
  t: PendingTransfer,
  q: RankedQuote,
  limitBps: number,
  standIn?: AuditRow["standIn"],
): Promise<LockedInfo> {
  /** Who signed the price and whose bond backs it (the stand-in in market mode). */
  const backer = standIn?.displayName ?? q.displayName;
  const kp = demoKeypair();
  const signer = contract.basicNodeSigner(kp, config.networkPassphrase);
  const client = new RateRaceClient({
    contractId: config.rateraceContractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
    publicKey: kp.publicKey(),
    signTransaction: signer.signTransaction,
  });

  // 1. The contract runs once in simulation: every check happens here, before anything is signed.
  const sim = chainlog.start(`Contract checks ${q.displayName}'s offer`, "simulating open_order on Stellar");
  let tx: Awaited<ReturnType<typeof client.open_order>>;
  try {
    tx = await client.open_order({
      sender: kp.publicKey(),
      quote: toContractQuote(q),
      signature: Buffer.from(hexToBytes(q.signature)),
      recipient_hash: Buffer.from(hexToBytes(t.recipientHash)),
      max_markup_bps: limitBps,
    });
  } catch (e) {
    chainlog.fail(sim);
    throw e;
  }
  if (tx.simulation && rpc.Api.isSimulationError(tx.simulation)) {
    const code = contractErrorCode(tx.simulation.error);
    chainlog.fail(sim, `refused: ${errorMessage(code)}`);
    throw new SendError(code);
  }
  chainlog.done(sim, {
    title: "Contract checks passed",
    detail: `signature ✓ · market price fresh ✓ · ${q.markupBps < 0 ? "above market" : `${formatBps(q.markupBps)} ≤ your ${formatBps(limitBps)} limit`} ✓ · ${backer}'s bond covers it ✓`,
  });

  // 2. Signed here; the key never leaves this device.
  await tx.sign();
  if (!tx.signed) throw new SendError();

  // 3. RateRace wraps it in a fee bump and pays the network fee.
  const sub = chainlog.start("Locking the offer", "you signed · RateRace pays the network fee");
  const res = await api.submit(tx.signed.toXDR()).catch((e) => {
    chainlog.fail(sub);
    throw e;
  });
  if (res.status !== "SUCCESS" || !res.returnValue) {
    chainlog.fail(sub, errorMessage(res.errorCode));
    throw new SendError(res.errorCode);
  }
  chainlog.done(sub, {
    title: `${formatUsd(q.sendUsdc)} USDC locked in escrow · order #${res.returnValue}`,
    detail: "held by the RateRace contract, not by any company",
    hash: res.hash,
    sponsored: true,
  });

  // 4. Read the order back from the chain for the real bond and deadline.
  const info: LockedInfo = {
    orderId: res.returnValue,
    hash: res.hash,
    provider: q.displayName,
    standIn: standIn?.displayName,
    recipientName: t.recipientName,
    landedLocal: q.landedLocal,
    sendUsdc: q.sendUsdc,
  };
  try {
    const order = (await client.get_order({ order_id: BigInt(res.returnValue) })).result.unwrap();
    info.reservedBond = order.reserved_bond.toString();
    info.payoutDeadline = Number(order.payout_deadline);
    chainlog.add({
      title: `${backer}'s bond: ${formatUsd(info.reservedBond)} USDC at stake`,
      detail: `must deliver ${formatMxn(q.landedLocal)} within ${Math.max(0, info.payoutDeadline - Math.floor(Date.now() / 1000))} s or lose part of it`,
    });
  } catch {
    // Not needed to continue; the celebration shows without the exact numbers.
  }
  return info;
}

export default function Quotes() {
  const location = useLocation();
  const [transfer, setTransfer] = useState<PendingTransfer | null>(
    () => (location.state as PendingTransfer | null) ?? loadPending(),
  );
  const [selectedId, setSelectedId] = useState<string | undefined>(() => transfer?.rfq.quotes[0]?.anchorName);
  const [expired, setExpired] = useState(
    () => !!transfer && transfer.rfq.expiresAt <= Math.floor(Date.now() / 1000),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState<LockedInfo | null>(null);
  const [limitBps, setLimitBps] = useState(300);

  const onExpire = useCallback(() => setExpired(true), []);

  if (!transfer) {
    return (
      <div>
        <PageHeader title="Offers for your transfer" lead="Start a transfer first to see offers." />
        <Button asChild size="lg" className="w-full">
          <Link to="/send">Start a transfer</Link>
        </Button>
      </div>
    );
  }

  const rfq = transfer.rfq as RfqWithAudit;
  const { request } = transfer;
  const send = BigInt(request.sendUsdc);
  const market = marketLocal(send, BigInt(rfq.oracle.price));
  const allowed = rfq.quotes.filter((q) => q.markupBps <= limitBps);
  const picked =
    allowed.find((q) => q.anchorName === selectedId) ?? allowed[0] ?? rfq.quotes.find((q) => q.anchorName === selectedId) ?? rfq.quotes[0];
  const pickedAllowed = picked.markupBps <= limitBps;
  const payoutFee = BigInt(picked.fees.payoutFeeLocal);
  // Work in whole centavos as displayed, so the receipt lines add up exactly to the total.
  const CENT = 100_000n;
  const margin = ((market / CENT) - (payoutFee / CENT) - (BigInt(picked.landedLocal) / CENT)) * CENT;
  const liveMode = rfq.mode === "market" || rfq.mode === "anchors";
  const anchorsMode = rfq.mode === "anchors";
  const pickedAudit = rfq.audit?.find((a) => a.name === picked.anchorName);
  const standIn = pickedAudit?.standIn;
  const feeLabel = anchorsMode
    ? `${picked.displayName}'s payout fee`
    : liveMode
      ? `${picked.displayName}'s fee${pickedAudit?.live ? ` ($${pickedAudit.live.feeUsd.toFixed(2)})` : ""}`
      : "Bank payout fee";
  const deliverer = standIn ? `test anchor ${standIn.displayName}` : picked.displayName;

  async function refresh() {
    if (!transfer) return;
    setError(null);
    setBusy("Getting new offers…");
    try {
      const fresh = await api.rfq(transfer.request);
      if (fresh.quotes.length === 0) throw new Error("No provider can take this transfer right now.");
      narrateRfq(fresh);
      const next = { ...transfer, rfq: fresh };
      savePending(next);
      setTransfer(next);
      setSelectedId(fresh.quotes[0].anchorName);
      setExpired(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : errorMessage());
    } finally {
      setBusy(null);
    }
  }

  async function lock() {
    if (!transfer || busy || expired || !pickedAllowed) return;
    setError(null);
    setBusy(`Locking ${picked.displayName}'s price…`);
    try {
      const info = await lockOffer(transfer, picked, limitBps, standIn);
      rememberTransfer({
        orderId: info.orderId,
        hash: info.hash,
        at: Date.now(),
        recipientName: transfer.recipientName,
        country: transfer.country ?? "mx",
        currency: transfer.currency ?? "MXN",
        sendUsdc: picked.sendUsdc,
        landedLocal: picked.landedLocal,
        provider: picked.displayName,
        standIn: standIn?.displayName,
      });
      clearPending();
      setLocked(info);
    } catch (e) {
      const code = e instanceof SendError ? e.code : undefined;
      if (code !== undefined && STALE_CODES.has(code)) setExpired(true);
      setError(e instanceof SendError ? e.message : errorMessage());
      console.error(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {locked && <LockedCelebration info={locked} />}
      <Stepper current={1} />

      <div className="mt-6 flex items-center gap-3 rounded-2xl border bg-card px-4 py-3">
        <Flag country={transfer.country ?? "mx"} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            <span className="money">{formatUsd(send)}</span> to {transfer.recipientName}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {transfer.recipientBank ?? `${transfer.countryName ?? "Mexico"} · bank deposit`}
          </p>
        </div>
        <Link to="/send" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Edit
        </Link>
      </div>

      <h1 className="mt-7 text-[1.9rem]">Choose an offer</h1>
      <p className="mt-2 mb-6 text-muted-foreground">
        {anchorsMode
          ? `${rfq.audit?.length ?? 0} Stellar anchors that pay out in Mexico are bidding for this exact transfer, best first.`
          : liveMode
            ? `Live prices from ${rfq.audit?.length ?? 0} providers for this exact transfer, best first.`
            : "Signed offers from licensed providers for this exact transfer, best first."}
      </p>

      <RaceTrack
        raceId={rfq.requestId}
        quotes={rfq.quotes}
        audit={rfq.audit}
        marketLocal={market}
        selectedId={picked.anchorName}
        onSelect={setSelectedId}
        limitBps={limitBps}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm">
        <span className="text-muted-foreground">Protect me from offers worse than</span>
        <div role="radiogroup" aria-label="Your limit below the market rate" className="flex gap-1">
          {LIMIT_OPTIONS.map((bps) => (
            <button
              key={bps}
              type="button"
              role="radio"
              aria-checked={limitBps === bps}
              onClick={() => setLimitBps(bps)}
              className={
                limitBps === bps
                  ? "money rounded-full bg-brand px-3 py-1 text-xs font-semibold text-brand-foreground"
                  : "money rounded-full border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
              }
            >
              {bps / 100}%
            </button>
          ))}
        </div>
        <span className="w-full text-xs text-muted-foreground">
          below the market rate. The contract enforces your choice: it won't lock an offer past this line.
        </span>
      </div>

      <div className="mt-4">
        {expired ? (
          <p role="timer" className="text-sm text-bad">
            Offers expired.
          </p>
        ) : (
          <Countdown until={rfq.expiresAt} label="Offers held for" expiredLabel="Offers expired." onExpire={onExpire} />
        )}
      </div>

      {anchorsMode && (
        <p className="mt-3 text-[0.72rem] leading-relaxed text-muted-foreground">
          Bitso, Koywe, Etherfuse, Alfred Pay and MoneyGram are real Stellar anchors that serve Mexico. Their prices here are
          simulated for this demo, not quotes from these companies, and they aren't RateRace partners. On the Stellar test
          network, each price is signed and backed by one of our test anchors.
        </p>
      )}
      {liveMode && !anchorsMode && (
        <p className="mt-3 text-[0.72rem] leading-relaxed text-muted-foreground">
          Prices are each provider's live public quote for this amount, fee and exchange-rate margin included, from{" "}
          {rfq.source ? (
            <a href={rfq.source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {rfq.source.name}
            </a>
          ) : (
            "Wise's public comparison data"
          )}
          {rfq.source?.oldestCollected ? ` (collected since ${rfq.source.oldestCollected.slice(0, 10)})` : ""}. These companies
          aren't part of RateRace: on the Stellar test network, each allowed price is signed and backed by one of our test
          providers standing in for them.
        </p>
      )}

      <div className="mt-6">
        <Receipt
          lines={[
            { label: "You send", amount: formatUsd(send) },
            { label: "Sending fee", amount: formatUsd(toUnits(rfq.onRampFeeUsd)) },
            { label: "At the market rate", amount: formatMxn(market) },
            margin >= 0n
              ? { label: `${picked.displayName}'s rate margin`, amount: `− ${formatMxn(margin)}`, kind: "minus" as const }
              : { label: `${picked.displayName} pays above market`, amount: `+ ${formatMxn(-margin)}` },
            ...(payoutFee > 0n || !liveMode
              ? [{ label: feeLabel, amount: `− ${formatMxn(payoutFee)}`, kind: "minus" as const }]
              : []),
          ]}
          totalLabel="Your family receives"
          total={formatMxn(picked.landedLocal)}
          note={
            standIn
              ? `Locked at ${picked.displayName}'s price. Your money is held until ${deliverer} pays your family; if it misses the deadline, you get it all back plus a penalty from its bond.`
              : `Your money is held until ${picked.displayName} pays your family. If ${picked.displayName} misses the deadline, you get it all back plus a penalty.`
          }
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-bad">
          {error}
        </p>
      )}

      <div className="mt-6">
        {expired ? (
          <Button size="lg" variant="brand" className="w-full" onClick={refresh} disabled={!!busy}>
            {busy ?? "Get new offers"}
          </Button>
        ) : (
          <Button size="lg" variant="brand" className="w-full" onClick={lock} disabled={!!busy || !pickedAllowed} aria-busy={!!busy}>
            {busy ?? (liveMode ? `Lock ${picked.displayName}'s price` : `Send with ${picked.displayName}`)}
          </Button>
        )}
      </div>
    </div>
  );
}
