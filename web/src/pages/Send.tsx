// Owner: Abhiraj (issue #17). Built from the components shown on /design.
import { fromUnits, marketLocal, toUnits } from "@raterace/shared";
import { Check, ChevronDown, Clock, Landmark, Lock, Plus, Scale, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { Flag } from "@/components/Flag";
import { Stepper } from "@/components/Stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type Market, type RfqRequestWithMode } from "@/lib/api";
import { chainlog } from "@/lib/chainlog";
import { CORRIDORS, DEFAULT_CORRIDOR, SOURCE, describeAccount, type Corridor } from "@/lib/corridors";
import { SAMPLE_CONTACTS, isSample, recipients as recipientStore, rememberRecipient, type Recipient } from "@/lib/local";
import { narrateRfq } from "@/lib/narrate";
import { recipientHash, savePending, type PendingTransfer } from "@/lib/transfer";
import { bouncy, popIn, stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ensureReady } from "@/lib/wallet";

const MIN_USD = 1;
const MAX_USD = 1000;

function amountError(value: string): string | null {
  const n = Number(value);
  if (!value || !Number.isFinite(n) || n <= 0) return "Enter an amount.";
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return "Use at most 2 decimal places.";
  if (n < MIN_USD) return `The smallest transfer is $${MIN_USD}.`;
  if (n > MAX_USD) return `The largest demo transfer is $${MAX_USD.toLocaleString("en-US")}.`;
  return null;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function CurrencyPicker({ value, onChange }: { value: Corridor; onChange: (c: Corridor) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border bg-secondary/60 py-1.5 pr-2.5 pl-1.5 text-sm font-medium hover:bg-secondary"
      >
        <Flag country={value.country} />
        {value.currency}
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>
      <AnimatePresence>
      {open && (
        <motion.ul
          role="listbox"
          aria-label="Recipient country"
          initial={{ opacity: 0, scale: 0.7, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0, transition: bouncy }}
          exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.12 } }}
          style={{ transformOrigin: "top right" }}
          className="absolute right-0 z-30 mt-2 max-h-80 w-64 overflow-y-auto rounded-xl border bg-popover p-1.5 shadow-2xl"
        >
          {CORRIDORS.map((c) => (
            <li key={c.country}>
              <button
                type="button"
                role="option"
                aria-selected={c.country === value.country}
                disabled={!c.live}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm",
                  c.live ? "hover:bg-secondary" : "cursor-default opacity-55",
                )}
              >
                <Flag country={c.country} />
                <span className="flex-1">
                  <span className="block font-medium">{c.countryName}</span>
                  <span className="block text-xs text-muted-foreground">{c.currency}</span>
                </span>
                {c.country === value.country ? (
                  <Check className="size-4 text-brand" />
                ) : !c.live ? (
                  <span className="rounded-full border px-2 py-0.5 text-[0.65rem] text-muted-foreground">Soon</span>
                ) : null}
              </button>
            </li>
          ))}
        </motion.ul>
      )}
      </AnimatePresence>
    </div>
  );
}

export default function Send() {
  const navigate = useNavigate();
  const savedOnly = recipientStore.use();
  // The contact book: people you've sent to, then sample contacts you haven't used yet.
  const contacts = [
    ...savedOnly,
    ...SAMPLE_CONTACTS.filter((c) => !savedOnly.some((r) => r.clabe === c.clabe)),
  ];
  const [corridor, setCorridorState] = useState<Corridor>(DEFAULT_CORRIDOR);
  // Only the contacts in the country being sent to.
  const saved = contacts.filter((r) => r.country === corridor.country);
  const account = corridor.account;
  const [amount, setAmount] = useState("200");
  const [pickedId, setPickedId] = useState<string | "new">(
    () => contacts.find((r) => r.country === DEFAULT_CORRIDOR.country)?.id ?? "new",
  );
  const [name, setName] = useState("");
  const [clabe, setClabe] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [market, setMarket] = useState<Market | null>(null);

  /** Switching country: its own contacts, an empty account field, its own market rate. */
  function setCorridor(c: Corridor) {
    if (c.country === corridor.country) return;
    setCorridorState(c);
    setPickedId(contacts.find((r) => r.country === c.country)?.id ?? "new");
    setClabe("");
    setTouched(false);
    setError(null);
    setMarket(null);
  }

  // The live market rate, straight from the on-chain oracle (refreshed every 30 s).
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .market(corridor.currency)
        .then((m) => alive && setMarket(m))
        .catch(() => alive && setMarket(null));
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [corridor.currency]);

  const picked: Recipient | undefined = pickedId === "new" ? undefined : saved.find((r) => r.id === pickedId);
  const recipientName = picked?.name ?? name.trim();
  const recipientClabe = picked?.clabe ?? clabe;

  const errors = {
    amount: amountError(amount),
    name: picked ? null : recipientName.length < 3 ? "Enter the recipient's full name." : null,
    clabe: picked ? null : account.error(recipientClabe),
  };
  const valid = !errors.amount && !errors.name && !errors.clabe;
  const show = (field: keyof typeof errors) => touched && errors[field];
  const detectedBank = account.detect?.(clabe) ?? null;
  const atMarket = market && !errors.amount ? marketLocal(toUnits(amount), BigInt(market.price)) : null;
  const ageMin = market ? Math.round(market.ageS / 60) : 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!valid || busy || !corridor.live || !corridor.corridor || !corridor.method) return;

    try {
      const units = toUnits(amount);
      setBusy("Getting ready…");
      const kp = await ensureReady(units, setBusy);
      setBusy("Collecting live offers…");
      const request: RfqRequestWithMode = {
        // Mexico: real Stellar anchors' names with simulated prices. Other countries: labelled
        // test providers. Either way each price is signed and bonded by a test anchor.
        mode: "anchors",
        corridor: corridor.corridor,
        assetCode: corridor.currency,
        sendUsdc: units.toString(),
        sender: kp.publicKey(),
        recipientCountry: corridor.country.toUpperCase(),
        method: corridor.method,
      };
      const hash = await recipientHash(recipientName, recipientClabe);
      chainlog.add({
        title: "Recipient fingerprinted on this device",
        detail: `sha256 ${hash.slice(0, 10)}…${hash.slice(-6)} · name and ${account.label} never leave the browser`,
      });
      const rfq = await api.rfq(request);
      narrateRfq(rfq);
      if (rfq.quotes.length === 0) {
        setError("No provider can take this transfer right now. Try a different amount.");
        return;
      }
      rememberRecipient(recipientName, recipientClabe, corridor.country);
      const pending: PendingTransfer = {
        request,
        rfq,
        recipientHash: hash,
        recipientName,
        recipientBank: describeAccount(corridor, recipientClabe),
        country: corridor.country,
        countryName: corridor.countryName,
        currency: corridor.currency,
      };
      savePending(pending);
      navigate("/quotes", { state: pending });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stepper current={0} />
      <h1 className="mt-6 text-[1.9rem]">Send money to {corridor.countryName}</h1>
      <p className="mt-2 text-muted-foreground">
        Licensed providers compete on every transfer. You see their live offers before anything is sent.
      </p>

      {/* ---- the calculator ---- */}
      <div className="mt-7 rounded-2xl border bg-card">
        <div className="px-5 pt-4 pb-5">
          <label htmlFor="amount" className="text-sm text-muted-foreground">
            You send
          </label>
          <div className="mt-1 flex items-center gap-3">
            <span className="money text-[2.4rem] leading-none font-medium text-muted-foreground">$</span>
            <input
              id="amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              aria-invalid={show("amount") ? "true" : undefined}
              className="money min-w-0 flex-1 bg-transparent text-[2.4rem] leading-none font-medium tracking-tight outline-none"
            />
            <span className="flex items-center gap-2 rounded-full border bg-secondary/60 py-1.5 pr-3 pl-1.5 text-sm font-medium">
              <Flag country={SOURCE.country} />
              {SOURCE.currency}
            </span>
          </div>
          {show("amount") && <p className="mt-2 text-sm text-bad">{errors.amount}</p>}
        </div>

        <div className="flex items-center gap-2 border-y bg-secondary/30 px-5 py-2.5 text-xs text-muted-foreground">
          {market ? (
            <span>
              <span className="money text-foreground">
                1 {SOURCE.currency} = {market.mxnPerUsd.toFixed(4)} {corridor.currency}
              </span>{" "}
              · live mid-market rate · {ageMin < 1 ? "updated just now" : `updated ${ageMin} min ago`}
            </span>
          ) : (
            <span>Loading the live market rate…</span>
          )}
        </div>

        <div className="px-5 pt-4 pb-5">
          <p className="text-sm text-muted-foreground">Worth at today's market rate</p>
          <div className="mt-1 flex items-center gap-3">
            <motion.span
              key={atMarket?.toString() ?? "none"}
              initial={{ y: -10, scale: 1.08, opacity: 0.5 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              transition={bouncy}
              className="money min-w-0 flex-1 origin-left truncate text-[2.4rem] leading-none font-medium tracking-tight"
            >
              {atMarket !== null ? Number(fromUnits(atMarket)).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "—"}
            </motion.span>
            <CurrencyPicker value={corridor} onChange={setCorridor} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Providers compete to deliver as close to this as they can.</p>
        </div>

        <div className="flex items-center gap-3 border-t px-5 py-3 text-sm">
          <Landmark className="size-4 text-muted-foreground" />
          <span className="flex-1">{corridor.methodLabel}</span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3.5" /> usually minutes
          </span>
        </div>
      </div>

      {/* ---- recipient ---- */}
      <div className="mt-9 flex items-baseline justify-between">
        <h2 className="text-lg">Recipient</h2>
        <span className="text-xs text-muted-foreground">Contacts</span>
      </div>
      <motion.div
        role="radiogroup"
        aria-label="Recipient"
        className="mt-3 flex flex-col gap-2"
      >
        {saved.map((r, i) => (
          <motion.button
            key={r.id}
            initial={{ opacity: 0, y: 12, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: pickedId === r.id ? [1, 1.04, 0.99, 1] : 1 }}
            transition={{
              opacity: { duration: 0.2, delay: 0.08 + i * 0.07 },
              y: { ...bouncy, delay: 0.08 + i * 0.07 },
              scale: pickedId === r.id ? { duration: 0.4 } : { ...bouncy, delay: 0.08 + i * 0.07 },
            }}
            whileTap={{ scale: 0.96 }}
            whileHover={{ y: -2 }}
            type="button"
            role="radio"
            aria-checked={pickedId === r.id}
            onClick={() => setPickedId(r.id)}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
              pickedId === r.id ? "border-brand/70 bg-brand/10" : "hover:bg-secondary/50",
            )}
          >
            <motion.span
              animate={pickedId === r.id ? { rotate: [0, -14, 12, -6, 0], scale: [1, 1.15, 1] } : { rotate: 0, scale: 1 }}
              transition={{ duration: 0.5 }}
              className={cn(
                "flex size-9 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                pickedId === r.id ? "bg-brand text-brand-foreground" : "bg-secondary",
              )}
            >
              {initials(r.name)}
            </motion.span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate font-medium">{r.name}</span>
                {isSample(r) && (
                  <span className="rounded-full border px-1.5 py-px text-[0.6rem] text-muted-foreground">Sample</span>
                )}
              </span>
              <span className="block text-xs text-muted-foreground">
                {describeAccount(corridor, r.clabe)}
              </span>
            </span>
            <Flag country={r.country} className="size-5" />
          </motion.button>
        ))}
        <motion.button
          initial={{ opacity: 0, y: 12, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...bouncy, delay: 0.08 + saved.length * 0.07 }}
          whileTap={{ scale: 0.96 }}
          whileHover={{ y: -2 }}
          type="button"
          role="radio"
          aria-checked={pickedId === "new"}
          onClick={() => setPickedId("new")}
          className={cn(
            "flex items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-left transition-colors",
            pickedId === "new" ? "border-brand/70 bg-brand/10" : "hover:bg-secondary/50",
          )}
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-secondary">
            <Plus className="size-4" />
          </span>
          <span className="flex-1 font-medium">New recipient</span>
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", pickedId === "new" && "rotate-180")} />
        </motion.button>
      </motion.div>

      <AnimatePresence initial={false}>
      {pickedId === "new" && (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: bouncy }}
          exit={{ opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.12 } }}
          className="mt-2 flex flex-col gap-4 rounded-xl border bg-card p-4"
        >
          <div>
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              autoComplete="off"
              placeholder="As it appears on their bank account"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={show("name") ? "true" : undefined}
            />
            {show("name") && <p className="mt-1.5 text-sm text-bad">{errors.name}</p>}
          </div>
          <div>
            <Label htmlFor="clabe">{account.label}</Label>
            <Input
              id="clabe"
              inputMode={account.digitsOnly ? "numeric" : "text"}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={account.maxLength}
              placeholder={account.placeholder}
              value={clabe}
              onChange={(e) => setClabe(account.digitsOnly ? e.target.value.replace(/\D/g, "") : e.target.value.trim())}
              aria-invalid={show("clabe") ? "true" : undefined}
              className="money tracking-wide"
            />
            {!clabe && (
              <button
                type="button"
                onClick={() => setClabe(account.sample)}
                className="mt-1.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Use a sample {account.label}
              </button>
            )}
            {clabe && !account.error(clabe) ? (
              <motion.p
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={bouncy}
                className="mt-1.5 inline-flex origin-left items-center gap-1 text-sm text-good"
              >
                <Check className="size-4" /> {detectedBank ?? "Looks right"}
              </motion.p>
            ) : show("clabe") ? (
              <p className="mt-1.5 text-sm text-bad">{errors.clabe}</p>
            ) : detectedBank ? (
              <p className="mt-1.5 text-sm text-muted-foreground">{detectedBank}</p>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Their details stay on this device. Only a fingerprint of them is recorded with the transfer.
          </p>
        </motion.div>
      )}
      </AnimatePresence>

      {error && (
        <p role="alert" className="mt-5 text-sm text-bad">
          {error}
        </p>
      )}

      <Button size="lg" variant="brand" type="submit" disabled={!!busy} aria-busy={!!busy} className="mt-7 w-full">
        {busy ?? "Compare live offers"}
      </Button>

      <motion.ul
        className="mt-8 grid gap-3 text-sm sm:grid-cols-3"
        variants={stagger(0.08, 0.35)}
        initial="hidden"
        animate="show"
      >
        {[
          { icon: Scale, title: "Checked against the market", body: "Every offer is measured against the live rate." },
          { icon: Lock, title: "Held until delivered", body: "Your money sits in escrow, not with a company." },
          { icon: ShieldCheck, title: "Backed by deposits", body: "Providers lose money if they fail you." },
        ].map(({ icon: Icon, title, body }) => (
          <motion.li key={title} variants={popIn} whileHover={{ y: -3, rotate: -1 }} className="rounded-xl border p-3.5">
            <Icon className="size-4 text-good" />
            <p className="mt-2 font-medium">{title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
          </motion.li>
        ))}
      </motion.ul>
    </form>
  );
}
