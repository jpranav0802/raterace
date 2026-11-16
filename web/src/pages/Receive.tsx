// The recipient's side of the app: /receive. No account, no wallet, no link to pass around.
//
// The phone says who it is once (a sample contact, or a name and account typed in). From
// then on, any transfer sent to that person shows up here by itself: the sender's app put a
// fingerprint of the recipient's details on-chain, and this page computes the same
// fingerprint and asks for the latest transfer that carries it.
//
// In this demo, knowing the exact name and account is the only check. A real service would
// verify the recipient first (for example with a code sent to their phone).
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Flag } from "@/components/Flag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { corridorForCountry, describeAccount } from "@/lib/corridors";
import { fetchReceiveView, sendReceiveAnswer } from "@/lib/family";
import { SAMPLE_CONTACTS } from "@/lib/local";
import { recipientHash } from "@/lib/transfer";
import { RecipientScreen, type Lang } from "./Family";

interface Me {
  name: string;
  account: string;
  country: string;
}

const KEY = "raterace_receive_as";
function loadMe(): Me | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Me) : null;
  } catch {
    return null;
  }
}
function saveMe(me: Me | null) {
  try {
    if (me) localStorage.setItem(KEY, JSON.stringify(me));
    else localStorage.removeItem(KEY);
  } catch {
    // Not remembered next time; this visit still works.
  }
}

const TEXT = {
  en: {
    title: "Receive money",
    lead: "Tell this phone who you are. Money sent to you then shows up here by itself.",
    pick: "Who are you?",
    sample: "Sample",
    other: "Someone else",
    name: "Full name",
    namePh: "Exactly as the sender typed it",
    account: "Account",
    accountPh: "The account the sender is paying into",
    go: "Start receiving",
    hello: (n: string) => `Receiving as ${n}`,
    change: "Change",
    waiting: "Nothing on its way yet",
    waitingBody: "Keep this page open. When someone sends you money, it appears here in a few seconds.",
    listening: "Watching for transfers",
  },
  es: {
    title: "Recibir dinero",
    lead: "Dile a este teléfono quién eres. El dinero que te envíen aparecerá aquí solo.",
    pick: "¿Quién eres?",
    sample: "Ejemplo",
    other: "Otra persona",
    name: "Nombre completo",
    namePh: "Tal como lo escribió quien envía",
    account: "Cuenta",
    accountPh: "La cuenta donde te depositan",
    go: "Empezar a recibir",
    hello: (n: string) => `Recibiendo como ${n}`,
    change: "Cambiar",
    waiting: "Todavía no viene nada en camino",
    waitingBody: "Deja esta página abierta. Cuando alguien te envíe dinero, aparecerá aquí en unos segundos.",
    listening: "Esperando envíos",
  },
} as const;

function Picker({ onPick }: { onPick: (me: Me) => void }) {
  const [lang] = useState<Lang>(() => (navigator.language?.toLowerCase().startsWith("es") ? "es" : "en"));
  const t = TEXT[lang];
  const [other, setOther] = useState(false);
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 3 || !account.trim()) return;
    onPick({ name: name.trim(), account: account.trim(), country: "" });
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-[30rem] items-center justify-between px-5 py-4">
        <a href="/" className="text-lg font-semibold tracking-tight">
          RateRace
        </a>
      </header>
      <main className="mx-auto w-full max-w-[30rem] flex-1 px-5 pt-6 pb-16">
        <h1 className="text-[1.75rem]">{t.title}</h1>
        <p className="mt-2 text-muted-foreground">{t.lead}</p>

        <h2 className="mt-8 text-lg">{t.pick}</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {SAMPLE_CONTACTS.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick({ name: c.name, account: c.clabe, country: c.country })}
                className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:border-brand/60"
              >
                <Flag country={c.country} className="size-7" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="rounded-full border px-1.5 py-px text-[0.6rem] text-muted-foreground">{t.sample}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {describeAccount(corridorForCountry(c.country), c.clabe)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {other ? (
          <form onSubmit={submit} className="mt-3 flex flex-col gap-4 rounded-xl border bg-card p-4">
            <div>
              <Label htmlFor="rname">{t.name}</Label>
              <Input id="rname" autoComplete="off" placeholder={t.namePh} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="racct">{t.account}</Label>
              <Input
                id="racct"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={t.accountPh}
                value={account}
                onChange={(e) => setAccount(e.target.value.trim())}
              />
            </div>
            <Button type="submit" size="lg">
              {t.go}
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setOther(true)}
            className="mt-3 w-full rounded-xl border border-dashed px-4 py-3 text-left font-medium hover:bg-secondary/50"
          >
            {t.other}
          </button>
        )}
      </main>
    </div>
  );
}

export default function Receive() {
  const [me, setMe] = useState<Me | null>(loadMe);
  const [hash, setHash] = useState<string | null>(null);

  useEffect(() => {
    setHash(null);
    if (!me) return;
    let alive = true;
    void recipientHash(me.name, me.account).then((h) => alive && setHash(h));
    return () => {
      alive = false;
    };
  }, [me]);

  const fetchView = useCallback(
    () => (hash ? fetchReceiveView(hash) : Promise.resolve("invalid" as const)),
    [hash],
  );
  const sendAnswer = useCallback(
    async (view: { id: number }, arrived: boolean) => {
      if (hash) await sendReceiveAnswer(hash, view.id, arrived);
    },
    [hash],
  );

  if (!me) {
    return (
      <Picker
        onPick={(m) => {
          saveMe(m);
          setMe(m);
        }}
      />
    );
  }

  return (
    <RecipientScreen
      fetchView={fetchView}
      sendAnswer={sendAnswer}
      header={(lang) => (
        <p className="mb-6 flex items-center justify-between gap-3 rounded-full border px-4 py-2 text-sm text-muted-foreground">
          <span className="flex min-w-0 items-center gap-2">
            {me.country && <Flag country={me.country} className="size-5" />}
            <span className="truncate">{TEXT[lang].hello(me.name)}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              saveMe(null);
              setMe(null);
            }}
            className="shrink-0 underline underline-offset-4 hover:text-foreground"
          >
            {TEXT[lang].change}
          </button>
        </p>
      )}
      empty={(lang) => (
        <>
          <h1 className="text-[1.75rem]">{TEXT[lang].waiting}</h1>
          <p className="mt-2 text-muted-foreground">{TEXT[lang].waitingBody}</p>
          <p className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-70 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-good" />
            </span>
            {TEXT[lang].listening}
          </p>
        </>
      )}
    />
  );
}
