// Order tracker (issue #19). Built from the components shown on /design.
import { formatMxn, formatUsd, type OrderView } from "@raterace/shared";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Countdown } from "@/components/Countdown";
import { PageHeader } from "@/components/PageHeader";
import { ProofLink } from "@/components/ProofLink";
import { Steps, type Step } from "@/components/Steps";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { config } from "@/lib/config";
import { runOrderAction, type OrderAction } from "@/lib/orderActions";
import { demoKeypair } from "@/lib/wallet";

const POLL_MS = 3000;
/** A new order takes a few seconds to show up in the indexer. */
const FIND_GRACE_MS = 30_000;
/** The network's clock runs a few seconds behind ours, so wait a moment before offering a refund. */
const DEADLINE_GRACE_S = 8;

const PROVIDER_NAMES: Record<string, string> = { alpha: "Alpha", beta: "Beta", gamma: "Gamma" };

function proof(order: OrderView, event: string) {
  const tx = order.txs.find((t) => t.event === event);
  return tx ? <ProofLink hash={tx.hash} /> : null;
}

/** The transfer's story, in plain words, for whatever state it is in. */
function buildSteps(order: OrderView, provider: string, now: number): Step[] {
  const family = formatMxn(order.landedLocal);
  const locked: Step = {
    title: "Offer locked, your money is held safely",
    detail: proof(order, "awarded"),
    state: "done",
  };
  const paid: Step = {
    title: `${provider} paid your family ${family}`,
    detail: proof(order, "paid"),
    state: "done",
  };
  const refundText =
    order.refund && order.penalty
      ? `You were refunded ${formatUsd(order.refund)}. That includes a ${formatUsd(order.penalty)} penalty paid by ${provider}.`
      : "You were refunded in full, plus a penalty.";

  switch (order.status) {
    case "Open": {
      if (now > order.payoutDeadline + DEADLINE_GRACE_S) {
        return [
          locked,
          {
            title: `${provider} missed the deadline`,
            detail: `Your money never left safekeeping. Take it back below, plus a penalty paid by ${provider}.`,
            state: "failed",
          },
        ];
      }
      return [
        locked,
        {
          title: `${provider} is paying your family`,
          detail: (
            <Countdown
              until={order.payoutDeadline}
              label={`${provider} must pay within`}
              expiredLabel="Deadline reached. Checking…"
            />
          ),
          state: "current",
        },
        { title: "You confirm it arrived", state: "upcoming" },
      ];
    }
    case "Paid":
      return [
        locked,
        paid,
        {
          title: "Did the money arrive?",
          detail:
            now <= order.challengeEnds ? (
              <Countdown
                until={order.challengeEnds}
                label="You can report a problem for"
                expiredLabel="The time to report a problem has passed."
              />
            ) : (
              "The time to report a problem has passed."
            ),
          state: "current",
        },
      ];
    case "Settled":
      return [
        locked,
        paid,
        {
          title: "Done",
          detail: proof(order, "confirmed") ?? proof(order, "released") ?? proof(order, "resolved"),
          state: "done",
        },
      ];
    case "Refunded":
      return [
        locked,
        {
          title: `${provider} missed the deadline`,
          detail: (
            <>
              <p>{refundText}</p>
              {proof(order, "refunded")}
            </>
          ),
          state: "failed",
        },
      ];
    case "Disputed":
      return [
        locked,
        paid,
        {
          title: "Problem reported",
          detail: (
            <>
              <p>{`We are reviewing it. ${provider}'s deposit stays locked until it is resolved.`}</p>
              {proof(order, "disputed")}
            </>
          ),
          state: "current",
        },
      ];
    case "Slashed":
      return [
        locked,
        {
          title: `${provider} did not deliver`,
          detail: (
            <>
              <p>{refundText}</p>
              {proof(order, "resolved")}
            </>
          ),
          state: "failed",
        },
      ];
  }
}

export default function Order() {
  const { id } = useParams();
  const orderId = Number(id);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [problem, setProblem] = useState<"missing" | "offline" | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [busy, setBusy] = useState<OrderAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [startedAt] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${config.indexerUrl}/orders/${orderId}`);
      if (res.status === 404) {
        setProblem(Date.now() - startedAt > FIND_GRACE_MS ? "missing" : null);
        return;
      }
      if (!res.ok) throw new Error();
      setOrder((await res.json()) as OrderView);
      setProblem(null);
    } catch {
      setProblem("offline");
    }
  }, [orderId, startedAt]);

  useEffect(() => {
    void load();
    const poll = setInterval(load, POLL_MS);
    const clock = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [load]);

  async function act(action: OrderAction) {
    setBusy(action);
    setActionError(null);
    try {
      await runOrderAction(action, orderId);
      // The indexer needs a moment to see the new event.
      setTimeout(load, 1500);
      setTimeout(load, 5000);
    } catch (e) {
      setActionError((e as Error).message);
      void load();
    } finally {
      setBusy(null);
    }
  }

  if (!Number.isInteger(orderId) || orderId < 1) {
    return <PageHeader title="Transfer not found" lead="This link doesn't point to a transfer." />;
  }
  if (!order) {
    return (
      <PageHeader
        title="Your transfer"
        lead={
          problem === "offline"
            ? "We can't reach the service right now. This page keeps trying."
            : problem === "missing"
              ? "We can't find this transfer."
              : "Finding your transfer…"
        }
      />
    );
  }

  const provider = PROVIDER_NAMES[order.anchorName] ?? "The provider";
  const mine = order.sender === demoKeypair().publicKey();
  const missedDeadline = order.status === "Open" && now > order.payoutDeadline + DEADLINE_GRACE_S;
  const canReport = order.status === "Paid" && now <= order.challengeEnds;
  const finished = ["Settled", "Refunded", "Slashed"].includes(order.status);

  return (
    <div>
      <PageHeader
        title="Your transfer"
        lead={`${formatUsd(order.sendUsdc)} to your family in Mexico, with ${provider}.`}
      />

      <Card className="mb-3">
        <p className="text-sm text-muted-foreground">Your family receives</p>
        <p className="money mt-1 text-[2.5rem] leading-none font-medium tracking-tight">
          {formatMxn(order.landedLocal)}
        </p>
      </Card>

      <Card>
        <Steps steps={buildSteps(order, provider, now)} />
      </Card>

      {mine && (missedDeadline || order.status === "Paid") && (
        <div className="mt-5 flex flex-col gap-2">
          {missedDeadline && (
            <Button size="lg" disabled={busy !== null} onClick={() => act("refund_expired")}>
              {busy === "refund_expired" ? "Getting your refund…" : "Get my refund"}
            </Button>
          )}
          {order.status === "Paid" && (
            <Button size="lg" disabled={busy !== null} onClick={() => act("confirm")}>
              {busy === "confirm" ? "Confirming…" : "Money arrived"}
            </Button>
          )}
          {canReport && (
            <Button
              size="lg"
              variant="destructive"
              disabled={busy !== null}
              onClick={() => act("dispute")}
            >
              {busy === "dispute" ? "Reporting…" : "Report a problem"}
            </Button>
          )}
        </div>
      )}

      {actionError && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {actionError}
        </p>
      )}

      {problem === "offline" && (
        <p className="mt-3 text-sm text-muted-foreground">
          We lost the connection. This page keeps trying.
        </p>
      )}

      {finished && (
        <Button asChild size="lg" variant="outline" className="mt-5">
          <Link to="/send">Send another transfer</Link>
        </Button>
      )}
    </div>
  );
}
