// Owner: Abhiraj (issue #18). Built from the components shown on /design.
import { contract, rpc } from "@stellar/stellar-sdk";
import { formatBps, formatMxn, formatUsd, hexToBytes, marketLocal, toUnits, type RankedQuote } from "@raterace/shared";
import { RateRaceClient, toContractQuote } from "@raterace/shared/chain";
import { useCallback, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Countdown } from "@/components/Countdown";
import { LockedCelebration, type LockedInfo } from "@/components/LockedCelebration";
import { PageHeader } from "@/components/PageHeader";
import { RaceTrack } from "@/components/RaceTrack";
import { Receipt } from "@/components/Receipt";
import { Button } from "@/components/ui/button";
import { api, type RfqWithAudit } from "@/lib/api";
import { chainlog } from "@/lib/chainlog";
import { config } from "@/lib/config";
import { errorMessage } from "@/lib/format";
import { narrateRfq } from "@/lib/narrate";
import { clearPending, loadPending, savePending, type PendingTransfer } from "@/lib/transfer";
import { demoKeypair } from "@/lib/wallet";

/** The most an offer may land below the market rate, all fees included (3%). */
const MAX_MARKUP_BPS = 300;
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

async function lockOffer(t: PendingTransfer, q: RankedQuote): Promise<LockedInfo> {
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
      max_markup_bps: MAX_MARKUP_BPS,
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
    detail: `signature ✓ · market price fresh ✓ · ${formatBps(q.markupBps)} ≤ 3.00% ✓ · ${q.displayName}'s bond covers it ✓`,
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
    recipientName: t.recipientName,
    landedLocal: q.landedLocal,
    sendUsdc: q.sendUsdc,
  };
  try {
    const order = (await client.get_order({ order_id: BigInt(res.returnValue) })).result.unwrap();
    info.reservedBond = order.reserved_bond.toString();
    info.payoutDeadline = Number(order.payout_deadline);
    chainlog.add({
      title: `${q.displayName}'s bond: ${formatUsd(info.reservedBond)} USDC at stake`,
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
  const picked = rfq.quotes.find((q) => q.anchorName === selectedId) ?? rfq.quotes[0];
  const payoutFee = BigInt(picked.fees.payoutFeeLocal);
  const margin = market - payoutFee - BigInt(picked.landedLocal);

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
    if (!transfer || busy || expired) return;
    setError(null);
    setBusy(`Locking ${picked.displayName}'s offer…`);
    try {
      const info = await lockOffer(transfer, picked);
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
      <PageHeader
        title="The race is on"
        lead={
          <>
            Licensed providers compete to deliver the most pesos for{" "}
            <span className="money text-foreground">{formatUsd(send)}</span> to {transfer.recipientName}.
          </>
        }
      />

      <RaceTrack
        raceId={rfq.requestId}
        quotes={rfq.quotes}
        audit={rfq.audit}
        marketLocal={market}
        selectedId={picked.anchorName}
        onSelect={setSelectedId}
      />

      <div className="mt-4">
        {expired ? (
          <p role="timer" className="text-sm text-bad">
            Offers expired.
          </p>
        ) : (
          <Countdown until={rfq.expiresAt} label="Offers held for" expiredLabel="Offers expired." onExpire={onExpire} />
        )}
      </div>

      <div className="mt-6">
        <Receipt
          lines={[
            { label: "You send", amount: formatUsd(send) },
            { label: "Sending fee", amount: formatUsd(toUnits(rfq.onRampFeeUsd)) },
            { label: "At the market rate", amount: formatMxn(market) },
            { label: `${picked.displayName}'s rate margin`, amount: `− ${formatMxn(margin)}`, kind: "minus" },
            { label: "Bank payout fee", amount: `− ${formatMxn(payoutFee)}`, kind: "minus" },
          ]}
          totalLabel="Your family receives"
          total={formatMxn(picked.landedLocal)}
          note={`Your money is held until ${picked.displayName} pays your family. If ${picked.displayName} misses the deadline, you get it all back plus a penalty.`}
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-bad">
          {error}
        </p>
      )}

      <div className="mt-6">
        {expired ? (
          <Button size="lg" className="w-full" onClick={refresh} disabled={!!busy}>
            {busy ?? "Get new offers"}
          </Button>
        ) : (
          <Button size="lg" className="w-full" onClick={lock} disabled={!!busy} aria-busy={!!busy}>
            {busy ?? `Send with ${picked.displayName}`}
          </Button>
        )}
      </div>
    </div>
  );
}
