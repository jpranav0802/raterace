import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** The sender's "share with your family" card: a QR code and the private link. */
export function ShareWithFamily({ url }: { url: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: 440, color: { dark: "#0a0a0a", light: "#ffffff" } })
      .then((d) => alive && setQr(d))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [url]);

  async function share() {
    // The native share sheet and the clipboard only exist on https or localhost.
    try {
      if (navigator.share) {
        await navigator.share({ title: "RateRace", text: "Money is on its way to you.", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // cancelled, or not available: the link below can still be copied by hand
    }
  }

  return (
    <Card className="mt-3">
      <p className="font-medium">Share with your family</p>
      <p className="mt-1 text-sm text-muted-foreground">
        They scan this or open the link to follow the money and tell you when it arrives. They don't
        need an account.
      </p>
      {qr && (
        <img
          src={qr}
          alt="QR code for the family link"
          width={220}
          height={220}
          className="mx-auto mt-4 rounded-lg"
        />
      )}
      <p className="mt-4 rounded-lg bg-secondary px-3 py-2 text-xs break-all text-muted-foreground select-all">
        {url}
      </p>
      <Button variant="outline" className="mt-3 w-full" onClick={share}>
        {copied ? "Link copied" : "Send the link"}
      </Button>
    </Card>
  );
}
