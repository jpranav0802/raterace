// The moment the offer is locked: money is in escrow, the provider's bond is at stake,
// and the sender paid nothing in fees. Every number comes from the order read back on-chain.
import { formatMxn, fromUnits } from "@raterace/shared";
import { motion, useReducedMotion } from "motion/react";
import { Link } from "react-router-dom";
import { Countdown } from "@/components/Countdown";
import { ProofLink } from "@/components/ProofLink";
import { Button } from "@/components/ui/button";

export interface LockedInfo {
  orderId: string;
  hash: string;
  provider: string;
  /** Market mode: the test provider that signed and backs the real provider's price. */
  standIn?: string;
  recipientName: string;
  landedLocal: string;
  sendUsdc: string;
  /** From the on-chain order, when it could be read back. */
  reservedBond?: string;
  payoutDeadline?: number;
}

function usdc(units: string) {
  return Number(fromUnits(units)).toLocaleString("en-US", { minimumFractionDigits: 2 });
}

function Tile({ label, value, tone, delay }: { label: string; value: string; tone?: "good"; delay: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
      className="rounded-xl border bg-card px-4 py-3"
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`money mt-0.5 text-lg font-semibold tracking-tight ${tone === "good" ? "text-good" : ""}`}>{value}</p>
    </motion.div>
  );
}

export function LockedCelebration({ info }: { info: LockedInfo }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Offer locked"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/90 px-5 py-10 backdrop-blur-md"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="w-full max-w-[28rem] text-center">
        <motion.div
          className="mx-auto flex size-20 items-center justify-center rounded-full bg-good/15"
          initial={reduce ? false : { scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
        >
          <motion.span
            aria-hidden="true"
            className="absolute size-20 rounded-full border border-good/50"
            initial={reduce ? false : { scale: 1, opacity: 0.8 }}
            animate={reduce ? undefined : { scale: 1.9, opacity: 0 }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
          />
          <svg viewBox="0 0 24 24" className="size-10 text-good" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.25, duration: 0.5, ease: "easeOut" }}
            />
          </svg>
        </motion.div>

        <motion.p
          className="mt-6 text-sm text-muted-foreground"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          {info.standIn ? `Locked at ${info.provider}'s price` : `Offer locked with ${info.provider}`} · Order #
          {info.orderId}
        </motion.p>
        <motion.h2
          className="money mt-2 text-[2.6rem] leading-none font-semibold tracking-tight text-good"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          {formatMxn(info.landedLocal)}
        </motion.h2>
        <motion.p
          className="mt-2 text-lg"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          is on its way to {info.recipientName}
        </motion.p>

        <div className="mt-8 grid grid-cols-2 gap-2.5 text-left">
          <Tile label="Network fees you paid" value="$0.00" tone="good" delay={0.75} />
          <Tile label="Held safely in escrow" value={`${usdc(info.sendUsdc)} USDC`} delay={0.85} />
          <Tile
            label={`${info.standIn ?? info.provider}'s bond at stake`}
            value={info.reservedBond ? `${usdc(info.reservedBond)} USDC` : "Reserved"}
            delay={0.95}
          />
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.05, duration: 0.4 }}
            className="rounded-xl border bg-card px-4 py-3"
          >
            <p className="text-xs text-muted-foreground">Must pay out within</p>
            {info.payoutDeadline ? (
              <div className="mt-0.5 [&_p]:text-lg [&_p]:font-semibold [&_span]:text-lg">
                <Countdown until={info.payoutDeadline} label="" expiredLabel="Deadline passed" />
              </div>
            ) : (
              <p className="money mt-0.5 text-lg font-semibold">2:00</p>
            )}
          </motion.div>
        </div>

        <motion.p
          className="mt-5 text-sm text-muted-foreground"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          {info.standIn
            ? `Test anchor ${info.standIn} stands in to deliver it. If it misses the deadline, you get everything back plus a penalty from its bond.`
            : `If ${info.provider} misses the deadline, you get everything back plus a penalty from its bond.`}
        </motion.p>

        <motion.div
          className="mt-7 flex flex-col items-center gap-3"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.3 }}
        >
          <Button asChild size="lg" className="w-full">
            <Link to={`/order/${info.orderId}`} state={{ hash: info.hash }}>
              Track the transfer
            </Link>
          </Button>
          <ProofLink hash={info.hash} />
        </motion.div>
      </div>
    </motion.div>
  );
}
