// The front door. Explains RateRace in one scroll and sends people into the app.
// Every number here is either read live from the chain (market rates), a contract setting,
// or a sourced figure with its source shown. The race at the top is an illustration and says so.
import { CORRIDORS, corridorByCurrency, explorerContract, fallbackOraclePrice, localPerUsd } from "@raterace/shared";
import { ArrowRight, ArrowUpRight, Check, FileSignature, Fuel, Lock, Scale, ShieldCheck, Trophy, Undo2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Flag } from "@/components/Flag";
import { LogoMark, Wordmark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { config } from "@/lib/config";
import { bouncy, popIn, stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";

const SEND_USD = 200;
/** The rule the contract enforces: no offer more than 3% below the market rate. */
const CAP_BPS = 300;

// ---------- live market rates, from the on-chain oracle ----------

type Rates = Record<string, number>;

/** Local currency per 1 USD for every corridor, read from the oracle through the router. */
function useRates(): { rates: Rates; live: boolean } {
  const [rates, setRates] = useState<Rates>({});
  useEffect(() => {
    let alive = true;
    for (const c of CORRIDORS) {
      api
        .market(c.currency)
        .then((m) => alive && setRates((r) => ({ ...r, [c.currency]: m.mxnPerUsd })))
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, []);
  return { rates, live: Object.keys(rates).length > 0 };
}

function money(n: number, currency: string) {
  const symbol = corridorByCurrency(currency)?.symbol ?? `${currency} `;
  return `${symbol}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---------- the hero race (an illustration) ----------

/** Made-up bidders for the picture: how far below the market rate each one lands. */
const RUNNERS = [
  { name: "Provider A", bps: 140 },
  { name: "Provider B", bps: 55 },
  { name: "Provider C", bps: 95 },
  { name: "Provider D", bps: 410 },
];
const BEST = Math.min(...RUNNERS.map((r) => r.bps));
/** The track shows the last 5% before the market rate, like the real quote board. */
const trackPos = (bps: number) => Math.min(1, Math.max(0.06, 1 - bps / 500));
const ROUND_MS = 6500;

function HeroRace({ rates }: { rates: Rates }) {
  const reduce = useReducedMotion();
  const [round, setRound] = useState(0);
  const [finished, setFinished] = useState(!!reduce);
  const corridor = CORRIDORS[round % CORRIDORS.length];
  // The oracle's live rate when we have it; otherwise the recorded fallback rate.
  const perUsd = rates[corridor.currency] ?? localPerUsd(fallbackOraclePrice(corridor.currency)!);
  const market = SEND_USD * perUsd;

  useEffect(() => {
    if (reduce) return;
    setFinished(false);
    const done = setTimeout(() => setFinished(true), 2100);
    const next = setTimeout(() => setRound((r) => r + 1), ROUND_MS);
    return () => {
      clearTimeout(done);
      clearTimeout(next);
    };
  }, [round, reduce]);

  return (
    <Card className="relative overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={corridor.id}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: bouncy }}
            exit={reduce ? undefined : { opacity: 0, y: -6, transition: { duration: 0.12 } }}
            className="flex min-w-0 items-center gap-2.5"
          >
            <Flag country={corridor.country} />
            <span className="truncate text-sm">
              <span className="money font-medium">${SEND_USD}</span> to {corridor.countryName}
            </span>
          </motion.div>
        </AnimatePresence>
        <span className="shrink-0 rounded-full border px-2 py-0.5 text-[0.7rem] text-muted-foreground">Illustration</span>
      </div>

      <div className="relative px-5 pt-7 pb-5">
        {/* The finish line: the market rate. The red line: the contract's 3% limit. */}
        <div className="pointer-events-none absolute top-2 right-5 bottom-5 left-5" aria-hidden="true">
          <div className="absolute inset-y-0 right-0 border-r-2 border-dashed border-foreground/50">
            <span className="absolute -top-0.5 right-1.5 text-[0.65rem] whitespace-nowrap text-foreground/70">market rate</span>
          </div>
          <div className="absolute inset-y-0 border-l-2 border-dashed border-bad/70" style={{ left: `${trackPos(CAP_BPS) * 100}%` }}>
            <span className="absolute -top-0.5 right-1.5 text-[0.65rem] whitespace-nowrap text-bad">3% limit</span>
          </div>
        </div>

        <ol className="relative flex flex-col gap-2.5 pt-4">
          {RUNNERS.map((r, i) => {
            const refused = r.bps > CAP_BPS;
            const winner = finished && r.bps === BEST;
            const landed = market * (1 - r.bps / 10_000);
            return (
              <li key={r.name} className="relative h-12">
                <motion.div
                  key={`${round}-${r.name}`}
                  initial={reduce ? false : { width: "6%" }}
                  animate={{ width: `${trackPos(r.bps) * 100}%` }}
                  transition={reduce ? { duration: 0 } : { duration: 1.5, delay: 0.25 + i * 0.12, ease: [0.2, 0.8, 0.2, 1] }}
                  className={cn(
                    "absolute inset-y-0 left-0 flex items-center justify-between gap-2 overflow-hidden rounded-lg border px-3 transition-colors duration-300",
                    winner
                      ? "border-good/60 bg-good/15"
                      : refused && finished
                        ? "border-bad/40 bg-bad/10"
                        : "bg-secondary/70",
                  )}
                >
                  {!refused && (
                    <>
                      <span className="flex min-w-0 items-center gap-1.5 text-sm">
                        {winner && <Trophy className="size-3.5 shrink-0 text-good" />}
                        <span className={cn("truncate", winner && "font-semibold text-good")}>{r.name}</span>
                      </span>
                      <motion.span
                        initial={false}
                        animate={{ opacity: finished ? 1 : 0, scale: winner ? [1, 1.18, 1] : 1 }}
                        transition={{ duration: 0.35 }}
                        className={cn("money shrink-0 text-sm", winner ? "font-semibold text-good" : "text-muted-foreground")}
                      >
                        {money(landed, corridor.currency)}
                      </motion.span>
                    </>
                  )}
                </motion.div>
                {/* A refused bidder stops short of the 3% line; its label sits beside the short bar. */}
                {refused && (
                  <span
                    className="absolute inset-y-0 flex items-center gap-1.5 pl-2.5 text-sm"
                    style={{ left: `${trackPos(r.bps) * 100}%` }}
                  >
                    <span className="text-muted-foreground">{r.name}</span>
                    <motion.span
                      initial={false}
                      animate={{ opacity: finished ? 1 : 0 }}
                      className="inline-flex items-center gap-1 text-bad"
                    >
                      <X className="size-3.5" /> refused
                    </motion.span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="border-t bg-secondary/30 px-5 py-3 text-xs text-muted-foreground">
        <span className="money text-foreground">
          1 USD = {perUsd.toLocaleString("en-US", { maximumFractionDigits: 4 })} {corridor.currency}
        </span>{" "}
        {rates[corridor.currency] ? "· live mid-market rate from the on-chain oracle" : "· recorded rate (live rate loading)"}. The
        providers and their bids in this picture are made up.
      </div>
    </Card>
  );
}

// ---------- page sections ----------

function Section({ id, title, lead, children }: { id?: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t py-16 sm:py-20">
      <div className="mx-auto w-full max-w-[64rem] px-5">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} variants={stagger(0.08)}>
          <motion.h2 variants={popIn} className="max-w-[22ch] origin-left text-[1.9rem] sm:text-[2.4rem]">
            {title}
          </motion.h2>
          {lead && (
            <motion.p variants={popIn} className="mt-3 max-w-[60ch] origin-left text-muted-foreground">
              {lead}
            </motion.p>
          )}
        </motion.div>
        <div className="mt-9">{children}</div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    title: "You say how much",
    body: "Enter the amount and who it's for. Their name and account stay on your phone; only a fingerprint is recorded.",
  },
  {
    title: "Providers bid",
    body: "Each provider signs an offer for the exact amount your family receives, after every fee. Offers are held for two minutes.",
  },
  {
    title: "The contract checks and locks",
    body: "A Stellar smart contract verifies the signature, compares the offer with the live market rate, and holds your money.",
  },
  {
    title: "Paid, or you get it back",
    body: "The provider has a deadline to pay your family. If it misses, you get a full refund plus a penalty from its deposit.",
  },
];

const PROMISES = [
  {
    icon: Scale,
    title: "No offer worse than 3% below market",
    body: "Every offer is measured against the live rate on-chain. You can tighten the limit to 2% or 1%, and the contract enforces your choice.",
  },
  {
    icon: Lock,
    title: "Held by code, not by a company",
    body: "Your dollars sit in the contract's escrow as USDC until the transfer finishes. RateRace never holds them.",
  },
  {
    icon: ShieldCheck,
    title: "Providers put money down first",
    body: "Before an offer can be locked, 105% of your transfer is reserved from the provider's own deposit.",
  },
  {
    icon: Undo2,
    title: "Miss the deadline, pay a penalty",
    body: "A late provider loses 5% of the transfer from its deposit. It goes to you, on top of your full refund.",
  },
];

const ON_STELLAR = [
  {
    icon: FileSignature,
    title: "Soroban smart contract",
    body: "Verifies each provider's ed25519 signature, runs the escrow, reserves and slashes deposits.",
  },
  {
    icon: Scale,
    title: "On-chain price oracle",
    body: "Offers are checked against an oracle with the Reflector (SEP-40) interface. On testnet it is our own oracle, updated with live mid-market rates.",
  },
  {
    icon: Fuel,
    title: "You pay no network fees",
    body: "You sign on your own device. RateRace wraps the transaction in a fee bump and pays the fee.",
  },
  {
    icon: Check,
    title: "Quotes in the anchor format",
    body: "Providers answer with SEP-38-shaped quotes, so a licensed Stellar anchor can plug in by serving the same endpoint.",
  },
];

export default function Landing() {
  const reduce = useReducedMotion();
  const { rates } = useRates();
  // Coming back from the app: start at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[64rem] items-center justify-between gap-4 px-5">
          <Link to="/" className="flex items-center gap-2.5" aria-label="RateRace home">
            <LogoMark />
            <Wordmark className="text-[1.15rem]" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex" aria-label="On this page">
            <a href="#how" className="hover:text-foreground">
              How it works
            </a>
            <a href="#protection" className="hover:text-foreground">
              Protection
            </a>
            <a href="#countries" className="hover:text-foreground">
              Countries
            </a>
            <a href="#stellar" className="hover:text-foreground">
              On Stellar
            </a>
          </nav>
          <Button asChild size="sm" variant="brand">
            <Link to="/send">Send money</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {/* ---- hero ---- */}
        <section className="mx-auto grid w-full max-w-[64rem] gap-10 px-5 pt-12 pb-16 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-center lg:gap-14 lg:pb-24">
          <motion.div initial={reduce ? false : "hidden"} animate="show" variants={stagger(0.09, 0.05)}>
            <motion.h1 variants={popIn} className="origin-left text-[2.6rem] leading-[1.02] sm:text-[3.6rem]">
              Make them race for your family's money.
            </motion.h1>
            <motion.p variants={popIn} className="mt-5 max-w-[46ch] origin-left text-lg text-muted-foreground">
              Every transfer becomes a live auction. Providers bid to deliver the most money to your family, and the best
              offer wins.
            </motion.p>
            <motion.div variants={popIn} className="mt-8 flex origin-left flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" variant="brand" className="sm:w-auto">
                <Link to="/send">
                  Send money <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="sm:w-auto">
                <a href="#how">See how it works</a>
              </Button>
            </motion.div>
            <motion.p variants={popIn} className="mt-5 origin-left text-xs text-muted-foreground">
              A working demo on the Stellar test network. No real money moves.
            </motion.p>
          </motion.div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24, scale: 0.94, rotate: 1.5 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.25 }}
          >
            <HeroRace rates={rates} />
          </motion.div>
        </section>

        {/* ---- the problem ---- */}
        <Section
          title="$200 sent. About $13 never arrives."
          lead="The fee on the screen is small. The real cost hides in an exchange rate you never get to compare."
        >
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            variants={stagger(0.08)}
            className="grid gap-3 sm:grid-cols-3"
          >
            {[
              {
                figure: "6.49%",
                body: "Global average cost of sending $200 (Q1 2025).",
                source: "World Bank, Remittance Prices Worldwide",
                href: "https://remittanceprices.worldbank.org",
              },
              {
                figure: "$685B",
                body: "Sent home to low- and middle-income countries in 2024.",
                source: "World Bank / KNOMAD",
              },
              {
                figure: "1 provider",
                body: "On most apps a single provider sets your rate in private. You never see a competing offer.",
              },
            ].map((s) => (
              <motion.div key={s.figure} variants={popIn}>
                <Card className="h-full">
                  <p className="money text-[2.2rem] leading-none font-medium tracking-tight text-bad">{s.figure}</p>
                  <p className="mt-3 text-sm">{s.body}</p>
                  {s.source &&
                    (s.href ? (
                      <a
                        href={s.href}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        {s.source} <ArrowUpRight className="size-3" />
                      </a>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">{s.source}</p>
                    ))}
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </Section>

        {/* ---- how it works ---- */}
        <Section id="how" title="How a transfer runs" lead="Four steps. The middle two take a few seconds.">
          <motion.ol
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            variants={stagger(0.1)}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            {STEPS.map((s, i) => (
              <motion.li key={s.title} variants={popIn} whileHover={reduce ? undefined : { y: -4, rotate: i % 2 ? 0.6 : -0.6 }}>
                <Card className="h-full">
                  <span className="money flex size-8 items-center justify-center rounded-full bg-brand/15 text-sm font-semibold text-brand">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-lg">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
                </Card>
              </motion.li>
            ))}
          </motion.ol>
          <p className="mt-5 max-w-[60ch] text-sm text-muted-foreground">
            Your family follows along on a private link you send them, with no app or account, and tells you when the money
            arrives.
          </p>
        </Section>

        {/* ---- protection ---- */}
        <Section
          id="protection"
          title="Rules a provider can't talk its way around"
          lead="These are enforced by the contract on every transfer, not by a support team afterwards."
        >
          <motion.ul
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            variants={stagger(0.08)}
            className="grid gap-3 sm:grid-cols-2"
          >
            {PROMISES.map(({ icon: Icon, title, body }) => (
              <motion.li key={title} variants={popIn}>
                <Card className="flex h-full gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-good/10">
                    <Icon className="size-5 text-good" />
                  </span>
                  <div>
                    <h3 className="text-lg">{title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
                  </div>
                </Card>
              </motion.li>
            ))}
          </motion.ul>
        </Section>

        {/* ---- countries ---- */}
        <Section
          id="countries"
          title="Nine countries, one market rate each"
          lead="The rate next to each country is the live mid-market rate our oracle publishes on-chain. Every offer is judged against it."
        >
          <motion.ul
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            variants={stagger(0.05)}
            className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
          >
            {CORRIDORS.map((c) => (
              <motion.li key={c.id} variants={popIn} whileHover={reduce ? undefined : { y: -3 }}>
                <Link
                  to="/send"
                  className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3.5 transition-colors hover:border-brand/60"
                >
                  <Flag country={c.country} className="size-8" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.countryName}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.methodLabel}</span>
                  </span>
                  <span className="money shrink-0 text-right text-sm">
                    {rates[c.currency] ? (
                      <>
                        {rates[c.currency].toLocaleString("en-US", { maximumFractionDigits: 2 })}
                        <span className="block text-xs text-muted-foreground">{c.currency} per USD</span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">{c.currency}</span>
                    )}
                  </span>
                </Link>
              </motion.li>
            ))}
          </motion.ul>
          <p className="mt-5 max-w-[64ch] text-sm text-muted-foreground">
            In this demo the providers are test accounts with simulated prices, and no bank payout happens in any country.
            The contract, the escrow, the deposits and the market-rate check are real and run on the Stellar test network.
          </p>
        </Section>

        {/* ---- on Stellar ---- */}
        <Section
          id="stellar"
          title="What runs on Stellar"
          lead="Stellar already moves money in seconds for a fraction of a cent. RateRace adds the missing part: an open price."
        >
          <motion.ul
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            variants={stagger(0.08)}
            className="grid gap-3 sm:grid-cols-2"
          >
            {ON_STELLAR.map(({ icon: Icon, title, body }) => (
              <motion.li key={title} variants={popIn}>
                <Card className="h-full">
                  <Icon className="size-5 text-brand" />
                  <h3 className="mt-3 text-lg">{title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
                </Card>
              </motion.li>
            ))}
          </motion.ul>
          {config.rateraceContractId && (
            <a
              href={explorerContract(config.rateraceContractId, config.explorerUrl)}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex max-w-full items-center gap-2 rounded-full border px-4 py-2 text-sm hover:border-brand/60"
            >
              <span className="shrink-0 text-muted-foreground">Contract</span>
              <span className="money truncate">
                {config.rateraceContractId.slice(0, 8)}…{config.rateraceContractId.slice(-8)}
              </span>
              <span className="inline-flex shrink-0 items-center gap-0.5 text-brand">
                Stellar Expert <ArrowUpRight className="size-3.5" />
              </span>
            </a>
          )}
        </Section>

        {/* ---- closing ---- */}
        <section className="border-t py-20">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            variants={stagger(0.09)}
            className="mx-auto flex w-full max-w-[64rem] flex-col items-start gap-6 px-5"
          >
            <motion.h2 variants={popIn} className="max-w-[18ch] origin-left text-[2.2rem] sm:text-[3rem]">
              See what your $200 is worth when providers compete.
            </motion.h2>
            <motion.div variants={popIn} className="origin-left">
              <Button asChild size="lg" variant="brand" className="sm:w-auto">
                <Link to="/send">
                  Start a transfer <ArrowRight />
                </Link>
              </Button>
            </motion.div>
          </motion.div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-[64rem] flex-wrap items-center justify-between gap-2 px-5 py-5 text-xs text-muted-foreground">
          <span>RateRace · built for the Blockchain Innovation Challenge powered by Stellar</span>
          <span>Demo on the Stellar test network. No real money moves.</span>
        </div>
      </footer>
    </div>
  );
}
