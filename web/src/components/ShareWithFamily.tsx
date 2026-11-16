import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** The message the family receives: Spanish for Spanish-speaking countries, English otherwise. */
const MESSAGES = {
  es: "Te envié dinero con RateRace. Abre este enlace para seguirlo y avisarme cuando llegue:",
  en: "I sent you money with RateRace. Open this link to follow it and tell me when it arrives:",
};

/**
 * The sender's "share with your family" card.
 * The family normally follows on their own phone (the Receive page). A private link, sent
 * by WhatsApp or any other app, is the fallback and stays folded away.
 */
export function ShareWithFamily({ url, spanish = true }: { url: string; spanish?: boolean }) {
  const MESSAGE = spanish ? MESSAGES.es : MESSAGES.en;
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

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
      <p className="font-medium">Your family can follow this</p>
      <p className="mt-1 text-sm text-muted-foreground">
        On their phone they open RateRace and tap Receive. This transfer shows up there by itself, and they tell you
        when the money arrives.
      </p>
      {open ? (
        <>
          <Button className="mt-4 w-full" onClick={sendOnWhatsApp}>
            Send on WhatsApp
          </Button>
          <Button variant="outline" className="mt-2 w-full" onClick={sendAnotherWay}>
            {copied ? "Link copied" : "Send another way"}
          </Button>
          <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs break-all text-muted-foreground select-all">
            {url}
          </p>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Or send them a private link
        </button>
      )}
    </Card>
  );
}
