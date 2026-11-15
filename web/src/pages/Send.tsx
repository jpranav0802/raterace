// Owner: Abhiraj (issue #17). Built from the components shown on /design.
import { ASSET_MXN, CORRIDOR_MX_SPEI, toUnits, type RfqRequest } from "@raterace/shared";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AmountField } from "@/components/AmountField";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { recipientHash, savePending, type PendingTransfer } from "@/lib/transfer";
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

function clabeError(value: string): string | null {
  if (!value) return "Enter the 18-digit CLABE.";
  if (!/^\d+$/.test(value)) return "A CLABE has only digits.";
  if (value.length !== 18) return `A CLABE has 18 digits. This one has ${value.length}.`;
  return null;
}

export default function Send() {
  const navigate = useNavigate();
  const [amount, setAmount] = useState("200");
  const [name, setName] = useState("");
  const [clabe, setClabe] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const errors = {
    amount: amountError(amount),
    name: name.trim().length < 3 ? "Enter the recipient's full name." : null,
    clabe: clabeError(clabe),
  };
  const valid = !errors.amount && !errors.name && !errors.clabe;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!valid || busy) return;

    try {
      const units = toUnits(amount);
      setBusy("Getting ready…");
      const kp = await ensureReady(units, setBusy);
      setBusy("Asking providers for offers…");
      const request: RfqRequest = {
        corridor: CORRIDOR_MX_SPEI,
        assetCode: ASSET_MXN,
        sendUsdc: units.toString(),
        sender: kp.publicKey(),
        recipientCountry: "MX",
        method: "SPEI",
      };
      const [rfq, hash] = await Promise.all([api.rfq(request), recipientHash(name.trim(), clabe)]);
      if (rfq.quotes.length === 0) {
        setError("No provider can take this transfer right now. Try a different amount.");
        return;
      }
      const pending: PendingTransfer = { request, rfq, recipientHash: hash, recipientName: name.trim() };
      savePending(pending);
      navigate("/quotes", { state: pending });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const show = (field: keyof typeof errors) => touched && errors[field];

  return (
    <form onSubmit={onSubmit} noValidate>
      <PageHeader
        title="Send money home"
        lead="Providers compete to give your family the most pesos. You pick the best offer."
      />

      <Card className="flex flex-col gap-6">
        <AmountField label="You send" symbol="$" currency="USD" value={amount} onChange={setAmount} />
        {show("amount") && <p className="-mt-3 text-sm text-bad">{errors.amount}</p>}
        <div className="border-t" />
        <div>
          <p className="text-sm text-muted-foreground">They receive in</p>
          <p className="mt-1.5 text-lg font-medium">Mexico, by bank transfer (SPEI)</p>
        </div>
      </Card>

      <div className="mt-8 flex flex-col gap-4">
        <div>
          <Label htmlFor="name">Recipient's full name</Label>
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
          <Label htmlFor="clabe">CLABE (18 digits)</Label>
          <Input
            id="clabe"
            inputMode="numeric"
            autoComplete="off"
            maxLength={18}
            placeholder="Their bank account number"
            value={clabe}
            onChange={(e) => setClabe(e.target.value.replace(/\D/g, ""))}
            aria-invalid={show("clabe") ? "true" : undefined}
          />
          {show("clabe") && <p className="mt-1.5 text-sm text-bad">{errors.clabe}</p>}
          <p className="mt-1.5 text-sm text-muted-foreground">
            Their details stay on this device. Providers only see a fingerprint of them.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}

        <Button size="lg" type="submit" disabled={!!busy} aria-busy={!!busy}>
          {busy ?? "See offers"}
        </Button>
      </div>
    </form>
  );
}
