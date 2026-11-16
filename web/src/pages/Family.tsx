// The recipient's page, opened from the link the sender shares. No account, no wallet.
// Shown in Spanish or English (the phone's language decides; there is a switch).
import { corridorById, currencyOf, formatLocal, type FamilyView } from "@raterace/shared";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchFamilyView, sendFamilyAnswer } from "@/lib/family";

const POLL_MS = 3000;
const PROVIDER_NAMES: Record<string, string> = { alpha: "Alpha", beta: "Beta", gamma: "Gamma" };

export type Lang = "es" | "en";

const TEXT = {
  en: {
    switchTo: "Español",
    loading: "Opening your link…",
    invalid: "This link is not valid",
    invalidBody: "Ask the person who sent it to share it again.",
    offline: "We lost the connection. This page keeps trying.",
    onItsWay: "Money is on its way to you",
    youReceive: "You receive",
    paying: (p: string) => `${p} is sending it to your bank account. This usually takes under a minute.`,
    late: "This is taking longer than promised",
    lateBody: (p: string) =>
      `${p} missed its deadline. The sender gets all the money back, plus a penalty, and can send again.`,
    arrivedQ: "Did the money arrive?",
    paidBody: (p: string, a: string) => `${p} says it paid ${a} into your bank account.`,
    bankLabel: "Demo bank alert",
    bankNote: "In real use this is the alert from your own bank.",
    bankLine: (a: string, rail: string) => `Deposit received: ${a} by ${rail}`,
    yes: "Yes, it arrived",
    no: "No, it hasn't arrived",
    sending: "Sending…",
    thanks: "Thank you",
    thanksBody: "We told the sender it arrived.",
    done: "All done",
    doneBody: (a: string) => `You received ${a}.`,
    reported: "We told the sender",
    reportedBody: (p: string) => `${p}'s deposit is locked while this is checked. You don't need to do anything else.`,
    cancelled: "This transfer was cancelled",
    cancelledBody: "The sender got all the money back and can send again.",
    tryAgain: "That didn't go through. Please try again.",
    confirmTitle: "Report that the money hasn't arrived?",
    confirmCheck: "First check your bank app. SPEI deposits usually show up within minutes.",
    confirmWhat: "If you report it, this is what happens:",
    confirmSteps: (p: string) => [
      "We tell the sender, and a dispute is raised on this transfer.",
      `The money and ${p}'s deposit stay frozen while the dispute is reviewed.`,
      `${p} is asked for its bank receipt. If it shows the money reached your account, the dispute is closed and ${p} keeps the payment.`,
      `If ${p} can't prove it paid, the sender gets all the money back plus a penalty.`,
    ],
    confirmWarn: "Only report this if the money really hasn't arrived. Reporting a payment you received is fraud.",
    confirmCancel: "Go back",
    confirmGo: "Yes, report a problem",
    footer: "Demo on the Stellar test network. No real money moves.",
  },
  es: {
    switchTo: "English",
    loading: "Abriendo tu enlace…",
    invalid: "Este enlace no es válido",
    invalidBody: "Pide a quien te lo envió que lo comparta de nuevo.",
    offline: "Se perdió la conexión. Esta página sigue intentando.",
    onItsWay: "Tu dinero viene en camino",
    youReceive: "Recibes",
    paying: (p: string) => `${p} lo está enviando a tu cuenta bancaria. Normalmente tarda menos de un minuto.`,
    late: "Está tardando más de lo prometido",
    lateBody: (p: string) =>
      `${p} no cumplió el plazo. Quien envía recupera todo el dinero, más una penalización, y puede enviarlo de nuevo.`,
    arrivedQ: "¿Llegó el dinero?",
    paidBody: (p: string, a: string) => `${p} dice que depositó ${a} en tu cuenta bancaria.`,
    bankLabel: "Aviso de banco de demostración",
    bankNote: "En el uso real, este es el aviso de tu propio banco.",
    bankLine: (a: string, rail: string) => `Depósito recibido: ${a} por ${rail}`,
    yes: "Sí, ya llegó",
    no: "No, no ha llegado",
    sending: "Enviando…",
    thanks: "Gracias",
    thanksBody: "Avisamos a quien envió que ya llegó.",
    done: "Listo",
    doneBody: (a: string) => `Recibiste ${a}.`,
    reported: "Ya avisamos a quien envió",
    reportedBody: (p: string) =>
      `El depósito de ${p} queda bloqueado mientras se revisa. No necesitas hacer nada más.`,
    cancelled: "Este envío se canceló",
    cancelledBody: "Quien envía recuperó todo el dinero y puede enviarlo de nuevo.",
    tryAgain: "No se pudo enviar. Inténtalo de nuevo.",
    confirmTitle: "¿Reportar que el dinero no ha llegado?",
    confirmCheck: "Primero revisa la app de tu banco. Los depósitos por SPEI suelen aparecer en unos minutos.",
    confirmWhat: "Si lo reportas, esto es lo que pasa:",
    confirmSteps: (p: string) => [
      "Avisamos a quien envió y se abre una disputa sobre este envío.",
      `El dinero y el depósito de ${p} quedan congelados mientras se revisa la disputa.`,
      `Se le pide a ${p} su comprobante bancario. Si muestra que el dinero llegó a tu cuenta, la disputa se cierra y ${p} conserva el pago.`,
      `Si ${p} no puede demostrar que pagó, quien envía recupera todo el dinero más una penalización.`,
    ],
    confirmWarn: "Repórtalo solo si el dinero de verdad no ha llegado. Reportar un pago que sí recibiste es fraude.",
    confirmCancel: "Regresar",
    confirmGo: "Sí, reportar un problema",
    footer: "Demostración en la red de pruebas de Stellar. No se mueve dinero real.",
  },
} as const;

/** The family link: /f/<order id>#<secret>. */
export default function Family() {
  const { id } = useParams();
  const orderId = Number(id);
  const [token] = useState(() => window.location.hash.replace(/^#/, ""));
  const valid = Number.isInteger(orderId) && /^[0-9a-f]{32}$/.test(token);
  const fetchView = useCallback(
    () => (valid ? fetchFamilyView(orderId, token) : Promise.resolve("invalid" as const)),
    [valid, orderId, token],
  );
  const sendAnswer = useCallback(
    (_view: FamilyView, arrived: boolean) => sendFamilyAnswer(orderId, token, arrived),
    [orderId, token],
  );
  return <RecipientScreen fetchView={fetchView} sendAnswer={sendAnswer} />;
}

interface RecipientScreenProps {
  /** The transfer to show, or "invalid" when there is none. Polled every few seconds. */
  fetchView: () => Promise<FamilyView | "invalid">;
  sendAnswer: (view: FamilyView, arrived: boolean) => Promise<void>;
  /** Shown instead of "this link is not valid" when there is no transfer (the Receive page waits). */
  empty?: (lang: Lang) => ReactNode;
  /** A line above the transfer, e.g. who this phone is receiving as. */
  header?: (lang: Lang) => ReactNode;
}

/** What the recipient sees: progress, the demo bank alert, and "did it arrive?". No account, no wallet. */
export function RecipientScreen({ fetchView, sendAnswer, empty, header }: RecipientScreenProps) {
  const [lang, setLang] = useState<Lang>(() => (navigator.language?.toLowerCase().startsWith("es") ? "es" : "en"));
  const [view, setView] = useState<FamilyView | null>(null);
  const [state, setState] = useState<"loading" | "invalid" | "offline" | "ok">("loading");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmNo, setConfirmNo] = useState(false);
  const t = TEXT[lang];

  const load = useCallback(async () => {
    try {
      const v = await fetchView();
      if (v === "invalid") {
        setView(null);
        setState("invalid");
        return;
      }
      setView(v);
      setState("ok");
    } catch {
      setState((s) => (s === "loading" ? "loading" : "offline"));
    }
  }, [fetchView]);

  useEffect(() => {
    void load();
    const poll = setInterval(load, POLL_MS);
    const clock = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [load]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  async function answer(arrived: boolean) {
    setBusy(true);
    setFailed(false);
    try {
      if (view) await sendAnswer(view, arrived);
      await load();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const langButton = (
    <button
      type="button"
      onClick={() => setLang(lang === "es" ? "en" : "es")}
      className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
    >
      {t.switchTo}
    </button>
  );

  let body;
  if (state === "loading" && !view) {
    body = <h1 className="text-[1.75rem]">{t.loading}</h1>;
  } else if ((state === "invalid" || !view) && empty) {
    body = empty(lang);
  } else if (state === "invalid" || !view) {
    body = (
      <>
        <h1 className="text-[1.75rem]">{t.invalid}</h1>
        <p className="mt-2 text-muted-foreground">{t.invalidBody}</p>
      </>
    );
  } else {
    const amount = formatLocal(view.landedLocal, currencyOf(view.corridor));
    const rail = corridorById(view.corridor)?.method ?? "SPEI";
    const provider = PROVIDER_NAMES[view.anchorName] ?? "The provider";
    const late = view.status === "Open" && now > view.payoutDeadline;

    const amountCard = (
      <Card className="mt-6">
        <p className="text-sm text-muted-foreground">{t.youReceive}</p>
        <p className="money mt-1 text-[2.5rem] leading-none font-medium tracking-tight">{amount}</p>
      </Card>
    );

    if (view.status === "Open") {
      body = (
        <>
          <h1 className="text-[1.75rem]">{late ? t.late : t.onItsWay}</h1>
          <p className="mt-2 text-muted-foreground">{late ? t.lateBody(provider) : t.paying(provider)}</p>
          {amountCard}
        </>
      );
    } else if (view.status === "Paid" && !view.answer) {
      body = (
        <>
          <h1 className="text-[1.75rem]">{t.arrivedQ}</h1>
          <p className="mt-2 text-muted-foreground">{t.paidBody(provider, amount)}</p>
          <Card className="mt-6 border-good/40">
            <p className="text-xs text-muted-foreground">{t.bankLabel}</p>
            <p className="money mt-1 text-lg font-medium text-good">{t.bankLine(amount, rail)}</p>
            <p className="mt-2 text-xs text-muted-foreground">{t.bankNote}</p>
          </Card>
          <div className="mt-5 flex flex-col gap-2">
            <Button size="lg" disabled={busy} onClick={() => answer(true)}>
              {busy ? t.sending : t.yes}
            </Button>
            <Button size="lg" variant="destructive" disabled={busy} onClick={() => setConfirmNo(true)}>
              {t.no}
            </Button>
          </div>
          <Dialog open={confirmNo} onOpenChange={setConfirmNo}>
            <DialogContent className="max-w-[26rem]">
              <DialogHeader>
                <DialogTitle>{t.confirmTitle}</DialogTitle>
                <DialogDescription>{t.confirmCheck}</DialogDescription>
              </DialogHeader>
              <div className="text-sm">
                <p className="font-medium">{t.confirmWhat}</p>
                <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-muted-foreground">
                  {t.confirmSteps(provider).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p className="mt-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-bad">{t.confirmWarn}</p>
              </div>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" onClick={() => setConfirmNo(false)}>
                  {t.confirmCancel}
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    setConfirmNo(false);
                    void answer(false);
                  }}
                >
                  {t.confirmGo}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {failed && (
            <p role="alert" className="mt-3 text-sm text-bad">
              {t.tryAgain}
            </p>
          )}
        </>
      );
    } else if (view.status === "Refunded" || view.status === "Slashed") {
      body = (
        <>
          <h1 className="text-[1.75rem]">{t.cancelled}</h1>
          <p className="mt-2 text-muted-foreground">{t.cancelledBody}</p>
        </>
      );
    } else if (view.status === "Disputed" || view.answer?.arrived === false) {
      body = (
        <>
          <h1 className="text-[1.75rem]">{t.reported}</h1>
          <p className="mt-2 text-muted-foreground">{t.reportedBody(provider)}</p>
        </>
      );
    } else if (view.status === "Settled") {
      body = (
        <>
          <h1 className="text-[1.75rem]">{t.done}</h1>
          <p className="mt-2 text-muted-foreground">{t.doneBody(amount)}</p>
          {amountCard}
        </>
      );
    } else {
      // Paid and the recipient said yes; the sender's app is confirming.
      body = (
        <>
          <h1 className="text-[1.75rem]">{t.thanks}</h1>
          <p className="mt-2 text-muted-foreground">{t.thanksBody}</p>
          {amountCard}
        </>
      );
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-[30rem] items-center justify-between px-5 py-4">
        <span className="text-lg font-semibold tracking-tight">RateRace</span>
        {langButton}
      </header>
      <main className="mx-auto w-full max-w-[30rem] flex-1 px-5 pt-6 pb-16">
        {header?.(lang)}
        {body}
        {state === "offline" && <p className="mt-4 text-sm text-muted-foreground">{t.offline}</p>}
      </main>
      <footer className="px-5 pb-6 text-center text-xs text-muted-foreground">{t.footer}</footer>
    </div>
  );
}
