import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** The message the family receives: Spanish for Spanish-speaking countries, English otherwise. */
const MESSAGES = {
  es: "Te envié dinero con RateRace. Abre este enlace para seguirlo y avisarme cuando llegue:",
  en: "I sent you money with RateRace. Open this link to follow it and tell me when it arrives:",
};

/**
 * The sender's "share with your family" card.
 * The link travels by WhatsApp (or any other app); the QR code is only for
 * when the other person is standing next to you.
 */
export function ShareWithFamily({ url, spanish = true }: { url: string; spanish?: boolean }) {
  const MESSAGE = spanish ? MESSAGES.es : MESSAGES.en;
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!showQr) return;
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: 440, color: { dark: "#0a0a0a", light: "#ffffff" } })
      .then((d) => alive && setQr(d))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [url, showQr]);

  function sendOnWhatsApp() {
    const text = encodeURIComponent(`${MESSAGE} ${url}`);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener");
  }

  async function sendAnotherWay() {
    // The native share sheet and the clipboard only exist on https or localhost.
    try {
      if (navigator.share) {
        await navigator.share({ title: "RateRace", text: MESSAGE, url });
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
        Send them this private link. They open it to follow the money and tell you when it arrives.
        They don't need an account or an app.
      </p>
      <Button className="mt-4 w-full" onClick={sendOnWhatsApp}>
        Send on WhatsApp
      </Button>
      <Button variant="outline" className="mt-2 w-full" onClick={sendAnotherWay}>
        {copied ? "Link copied" : "Send another way"}
      </Button>
      <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs break-all text-muted-foreground select-all">
        {url}
      </p>
      <button
        type="button"
        className="mt-3 w-full text-center text-sm text-muted-foreground underline underline-offset-4"
        aria-expanded={showQr}
        onClick={() => setShowQr((v) => !v)}
      >
        {showQr ? "Hide QR code" : "They're next to you? Show QR code"}
      </button>
      {showQr && qr && (
        <img
          src={qr}
          alt="QR code for the family link"
          width={220}
          height={220}
          className="mx-auto mt-3 rounded-lg"
        />
      )}
    </Card>
  );
}
