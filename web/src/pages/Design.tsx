// Design reference. Owner: Pranav. Every screen is composed from what is on this page.
// All names and numbers here are SAMPLE DATA for layout only.
import { toUnits } from "@raterace/shared";
import { useState, type ReactNode } from "react";
import { AmountField } from "@/components/AmountField";
import { Countdown } from "@/components/Countdown";
import { PageHeader } from "@/components/PageHeader";
import { ProofLink } from "@/components/ProofLink";
import { RaceBoard, type RaceOffer } from "@/components/RaceBoard";
import { Receipt } from "@/components/Receipt";
import { Steps } from "@/components/Steps";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SAMPLE_OFFERS: RaceOffer[] = [
  { id: "alpha", name: "Alpha", landedLocal: toUnits("3937").toString(), markupBps: 158, delivered: 12, penalties: 0 },
  { id: "gamma", name: "Gamma", landedLocal: toUnits("3966").toString(), markupBps: 85, delivered: 3, penalties: 0 },
  { id: "beta", name: "Beta", landedLocal: toUnits("3923").toString(), markupBps: 193, delivered: 9, penalties: 0 },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-sm text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default function Design() {
  const [amount, setAmount] = useState("200");
  const [picked, setPicked] = useState("gamma");
  const [until] = useState(() => Math.floor(Date.now() / 1000) + 107);

  return (
    <div>
      <PageHeader
        title="Design reference"
        lead="Sample data. Build every screen from these parts so the app looks like one product."
      />

      <Section title="Amounts">
        <Card className="flex flex-col gap-6">
          <AmountField label="You send" symbol="$" currency="USD" value={amount} onChange={setAmount} />
          <div className="border-t" />
          <AmountField
            label="Your family receives"
            symbol="MX$"
            currency="MXN"
            value="3,966.00"
            readOnly
            hint="Providers compete on this number."
          />
        </Card>
      </Section>

      <Section title="Fields and buttons">
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="d-name">Recipient's full name</Label>
            <Input id="d-name" placeholder="As it appears on their bank account" />
          </div>
          <div>
            <Label htmlFor="d-clabe">CLABE (18 digits)</Label>
            <Input id="d-clabe" inputMode="numeric" aria-invalid="true" defaultValue="0021800" />
            <p className="mt-1.5 text-sm text-bad">A CLABE has 18 digits. This one has 7.</p>
          </div>
          <Button size="lg">See offers</Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline">Money arrived</Button>
            <Button variant="destructive">Report a problem</Button>
            <Button variant="ghost">Cancel</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="good">Best</Badge>
            <Badge>Active</Badge>
            <Badge variant="bad">Suspended</Badge>
          </div>
        </div>
      </Section>

      <Section title="Offers">
        <div className="mb-3">
          <Countdown until={until} label="Offers held for" expiredLabel="These offers expired. Get new offers." />
        </div>
        <RaceBoard
          offers={SAMPLE_OFFERS}
          marketLocal={toUnits("4000").toString()}
          selectedId={picked}
          onSelect={setPicked}
        />
      </Section>

      <Section title="Receipt">
        <Receipt
          lines={[
            { label: "You send", amount: "$200.00" },
            { label: "At the market rate", amount: "MX$4,000.00" },
            { label: "Gamma's rate margin", amount: "− MX$24.00", kind: "minus" },
            { label: "Bank payout fee", amount: "− MX$10.00", kind: "minus" },
          ]}
          totalLabel="Your family receives"
          total="MX$3,966.00"
          note="Your money is held until Gamma pays your family. If Gamma misses the deadline, you get it all back plus a penalty."
        />
      </Section>

      <Section title="Transfer progress">
        <Card>
          <Steps
            steps={[
              { title: "Offer locked, money held safely", detail: <ProofLink hash="sample" />, state: "done" },
              { title: "Alpha is paying your family", detail: "Usually under a minute. Deadline in 1:42.", state: "current" },
              { title: "You confirm it arrived", state: "upcoming" },
            ]}
          />
        </Card>
        <Card className="mt-3">
          <Steps
            steps={[
              { title: "Offer locked, money held safely", state: "done" },
              {
                title: "Gamma missed the deadline",
                detail: "You were refunded $210.00. That includes a $10.00 penalty paid by Gamma.",
                state: "failed",
              },
            ]}
          />
        </Card>
      </Section>
    </div>
  );
}
