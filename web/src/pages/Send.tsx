// Owner: Abhiraj (issue #17). Built from the components shown on /design.
import { ASSET_MXN, formatMxn, fromUnits, marketLocal, toUnits } from "@raterace/shared";
import { Check, ChevronDown, Clock, Landmark, Lock, Plus, Scale, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Flag } from "@/components/Flag";
import { Stepper } from "@/components/Stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type Market, type RfqRequestWithMode } from "@/lib/api";
import { chainlog } from "@/lib/chainlog";
import { bankName, clabeError, maskClabe } from "@/lib/clabe";
import { CORRIDORS, DEFAULT_CORRIDOR, SOURCE, type Corridor } from "@/lib/corridors";
import { SAMPLE_CONTACTS, isSample, recipients as recipientStore, rememberRecipient, type Recipient } from "@/lib/local";
import { narrateRfq } from "@/lib/narrate";
import { recipientHash, savePending, type PendingTransfer } from "@/lib/transfer";
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
      {open && (
        <ul
          role="listbox"
          aria-label="Recipient country"
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
        </ul>
      )}
    </div>
  );
}

export default function Send() {
  const navigate = useNavigate();
  const savedOnly = recipientStore.use();
  // The contact book: people you've sent to, then sample contacts you haven't used yet.
  const saved = [
    ...savedOnly,
    ...SAMPLE_CONTACTS.filter((c) => !savedOnly.some((r) => r.clabe === c.clabe)),
  ];
  const [corridor, setCorridor] = useState<Corridor>(DEFAULT_CORRIDOR);
  const [amount, setAmount] = useState("200");
  const [pickedId, setPickedId] = useState<string | "new">(() => saved[0]?.id ?? "new");
  const [name, setName] = useState("");
  const [clabe, setClabe] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [market, setMarket] = useState<Market | null>(null);

  // The live market rate, straight from the on-chain oracle (refreshed every 30 s).
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .market()
        .then((m) => alive && setMarket(m))
        .catch(() => alive && setMarket(null));
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const picked: Recipient | undefined = pickedId === "new" ? undefined : saved.find((r) => r.id === pickedId);
  const recipientName = picked?.name ?? name.trim();
  const recipientClabe = picked?.clabe ?? clabe;

  const errors = {
    amount: amountError(amount),
    name: picked ? null : recipientName.length < 3 ? "Enter the recipient's full name." : null,
    clabe: picked ? null : clabeError(recipientClabe),
  };
  const valid = !errors.amount && !errors.name && !errors.clabe;
  const show = (field: keyof typeof errors) => touched && errors[field];
  const detectedBank = bankName(clabe);
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
        // Real Stellar anchors bid with simulated prices (signed and bonded by test anchors).
        mode: "anchors",
        corridor: corridor.corridor,
        assetCode: ASSET_MXN,
        sendUsdc: units.toString(),
        sender: kp.publicKey(),
        recipientCountry: corridor.country.toUpperCase(),
        method: corridor.method,
      };
      const hash = await recipientHash(recipientName, recipientClabe);
      chainlog.add({
        title: "Recipient fingerprinted on this device",
        detail: `sha256 ${hash.slice(0, 10)}…${hash.slice(-6)} · name and CLABE never leave the browser`,
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
        recipientBank: `${bankName(recipientClabe) ?? "Bank"} ${maskClabe(recipientClabe)}`,
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
            <span className="money min-w-0 flex-1 truncate text-[2.4rem] leading-none font-medium tracking-tight">
              {atMarket !== null ? Number(fromUnits(atMarket)).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "—"}
            </span>
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
      <div role="radiogroup" aria-label="Recipient" className="mt-3 flex flex-col gap-2">
        {saved.map((r) => (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={pickedId === r.id}
            onClick={() => setPickedId(r.id)}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
              pickedId === r.id ? "border-brand/70 bg-brand/10" : "hover:bg-secondary/50",
            )}
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
              {initials(r.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate font-medium">{r.name}</span>
                {isSample(r) && (
                  <span className="rounded-full border px-1.5 py-px text-[0.6rem] text-muted-foreground">Sample</span>
                )}
              </span>
              <span className="block text-xs text-muted-foreground">
                {bankName(r.clabe) ?? "Bank"} {maskClabe(r.clabe)}
              </span>
            </span>
            <Flag country={r.country} className="size-5" />
          </button>
        ))}
        <button
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
        </button>
      </div>

      {pickedId === "new" && (
        <div className="mt-2 flex flex-col gap-4 rounded-xl border bg-card p-4">
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
            <Label htmlFor="clabe">CLABE</Label>
            <Input
              id="clabe"
              inputMode="numeric"
              autoComplete="off"
              maxLength={18}
              placeholder="18-digit bank account number"
              value={clabe}
              onChange={(e) => setClabe(e.target.value.replace(/\D/g, ""))}
              aria-invalid={show("clabe") ? "true" : undefined}
              className="money tracking-wide"
            />
            {!clabe && (
              <button
                type="button"
                onClick={() => setClabe("012180015412378003")}
                className="mt-1.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Use a sample account number
              </button>
            )}
            {clabe.length === 18 && !clabeError(clabe) ? (
              <p className="mt-1.5 inline-flex items-center gap-1 text-sm text-good">
                <Check className="size-4" /> {detectedBank ?? "Valid account"}
              </p>
            ) : show("clabe") ? (
              <p className="mt-1.5 text-sm text-bad">{errors.clabe}</p>
            ) : detectedBank ? (
              <p className="mt-1.5 text-sm text-muted-foreground">{detectedBank}</p>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Their details stay on this device. Only a fingerprint of them is recorded with the transfer.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-5 text-sm text-bad">
          {error}
        </p>
      )}

      <Button size="lg" variant="brand" type="submit" disabled={!!busy} aria-busy={!!busy} className="mt-7 w-full">
        {busy ?? "Compare live offers"}
      </Button>

      <ul className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
        {[
          { icon: Scale, title: "Checked against the market", body: "Every offer is measured against the live rate." },
          { icon: Lock, title: "Held until delivered", body: "Your money sits in escrow, not with a company." },
          { icon: ShieldCheck, title: "Backed by deposits", body: "Providers lose money if they fail you." },
        ].map(({ icon: Icon, title, body }) => (
          <li key={title} className="rounded-xl border p-3.5">
            <Icon className="size-4 text-good" />
            <p className="mt-2 font-medium">{title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
          </li>
        ))}
      </ul>
    </form>
  );
}
