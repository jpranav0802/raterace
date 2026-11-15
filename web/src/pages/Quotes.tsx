// Owner: Abhiraj (issue #18). Built from the components shown on /design.
import { contract, rpc } from "@stellar/stellar-sdk";
import { formatMxn, formatUsd, hexToBytes, marketLocal, toUnits, type RankedQuote } from "@raterace/shared";
import { RateRaceClient, toContractQuote } from "@raterace/shared/chain";
import { useCallback, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Countdown } from "@/components/Countdown";
import { PageHeader } from "@/components/PageHeader";
import { RaceBoard, type RaceOffer } from "@/components/RaceBoard";
import { Receipt } from "@/components/Receipt";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { config } from "@/lib/config";
import { errorMessage } from "@/lib/format";
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

async function lockOffer(t: PendingTransfer, q: RankedQuote): Promise<{ orderId: string; hash: string }> {
  const kp = demoKeypair();
  const signer = contract.basicNodeSigner(kp, config.networkPassphrase);
  const client = new RateRaceClient({
    contractId: config.rateraceContractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
    publicKey: kp.publicKey(),
    signTransaction: signer.signTransaction,
  });

  const tx = await client.open_order({
    sender: kp.publicKey(),
    quote: toContractQuote(q),
    signature: Buffer.from(hexToBytes(q.signature)),
    recipient_hash: Buffer.from(hexToBytes(t.recipientHash)),
    max_markup_bps: MAX_MARKUP_BPS,
  });
  // The contract is run once in simulation first, so most problems show up here, before signing.
  if (tx.simulation && rpc.Api.isSimulationError(tx.simulation)) {
    throw new SendError(contractErrorCode(tx.simulation.error));
  }
  await tx.sign();
  if (!tx.signed) throw new SendError();

  const res = await api.submit(tx.signed.toXDR());
  if (res.status !== "SUCCESS" || !res.returnValue) throw new SendError(res.errorCode);
  return { orderId: res.returnValue, hash: res.hash };
}

export default function Quotes() {
  const navigate = useNavigate();
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

  const onExpire = useCallback(() => setExpired(true), []);

  const offers: RaceOffer[] = useMemo(
    () =>
      (transfer?.rfq.quotes ?? []).map((q) => ({
        id: q.anchorName,
        name: q.displayName,
        landedLocal: q.landedLocal,
        markupBps: q.markupBps,
        delivered: q.reputation.filled,
        penalties: q.reputation.slashed,
      })),
    [transfer],
  );

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

  const { rfq, request } = transfer;
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

  async function send_() {
    if (!transfer || busy || expired) return;
    setError(null);
    setBusy(`Locking ${picked.displayName}'s offer…`);
    try {
      const { orderId, hash } = await lockOffer(transfer, picked);
      clearPending();
      navigate(`/order/${orderId}`, { state: { hash } });
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
      <PageHeader
        title="Offers for your transfer"
        lead={
          <>
            {rfq.quotes.length} providers competed to send{" "}
            <span className="money text-foreground">{formatUsd(send)}</span> to {transfer.recipientName}.
          </>
        }
      />

      <div className="mb-3">
        {expired ? (
          <p role="timer" className="text-sm text-bad">
            Offers expired.
          </p>
        ) : (
          <Countdown
            until={rfq.expiresAt}
            label="Offers held for"
            expiredLabel="Offers expired."
            onExpire={onExpire}
          />
        )}
      </div>

      <RaceBoard
        offers={offers}
        marketLocal={market.toString()}
        selectedId={picked.anchorName}
        onSelect={setSelectedId}
      />

      <div className="mt-8">
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
          <Button size="lg" className="w-full" onClick={send_} disabled={!!busy} aria-busy={!!busy}>
            {busy ?? `Send with ${picked.displayName}`}
          </Button>
        )}
      </div>
    </div>
  );
}
