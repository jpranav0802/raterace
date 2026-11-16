import { formatUsd } from "@raterace/shared";
import { Radio } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { LogoMark, Wordmark } from "@/components/Logo";
import { OnStellarPanel, OnStellarSheet } from "@/components/OnStellar";
import { networkView } from "@/lib/local";
import { cn } from "@/lib/utils";
import { usdcBalanceUnits } from "@/lib/wallet";
import Activity from "./pages/Activity";
import Admin from "./pages/Admin";
import Design from "./pages/Design";
import Leaderboard from "./pages/Leaderboard";
import Order from "./pages/Order";
import Quotes from "./pages/Quotes";
import Send from "./pages/Send";

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-full px-3 py-1.5 text-sm transition-colors",
    isActive ? "bg-brand/15 text-brand" : "text-muted-foreground hover:text-foreground",
  );

/** Sender screens can show the live "On Stellar" view next to the app. */
const LIVE_ROUTES = /^\/(send|quotes|order|activity)(\/|$)/;

function Logo() {
  return (
    <NavLink to="/send" className="flex items-center gap-2.5" aria-label="RateRace home">
      <LogoMark />
      <Wordmark className="text-[1.15rem]" />
    </NavLink>
  );
}

function Balance({ pathname }: { pathname: string }) {
  const [units, setUnits] = useState<bigint | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      usdcBalanceUnits()
        .then((u) => alive && setUnits(u))
        .catch(() => undefined);
    load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pathname]);
  if (units === null) return null;
  return (
    <span className="hidden items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground sm:inline-flex">
      Balance <span className="money font-medium text-foreground">{formatUsd(units)}</span>
    </span>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const showNetwork = networkView.use();
  const live = LIVE_ROUTES.test(pathname) && showNetwork;
  // Each screen starts at the top (the router keeps the old scroll position otherwise).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[64rem] items-center gap-4 px-5">
          <Logo />
          <nav className="flex flex-1 gap-1 sm:ml-4" aria-label="Main">
            <NavLink to="/send" className={navLink}>
              Send
            </NavLink>
            <NavLink to="/activity" className={navLink}>
              Activity
            </NavLink>
            <NavLink to="/leaderboard" className={(state) => cn(navLink(state), "hidden sm:inline-flex")}>
              Providers
            </NavLink>
          </nav>
          <Balance pathname={pathname} />
          <button
            type="button"
            onClick={() => networkView.set(!showNetwork)}
            aria-pressed={showNetwork}
            title={showNetwork ? "Hide the on-chain record" : "Show the on-chain record"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
              showNetwork ? "border-brand/50 text-brand" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Radio className="size-3.5" />
            <span className="hidden sm:inline">On-chain record</span>
          </button>
        </div>
      </header>

      <div
        className={cn(
          "mx-auto w-full flex-1 px-5 pt-8 pb-24 lg:pb-16",
          live
            ? "max-w-[32rem] lg:grid lg:max-w-[64rem] lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)] lg:items-start lg:gap-10"
            : "max-w-[32rem]",
        )}
      >
        <main className="min-w-0">
          <Routes>
            <Route path="/" element={<Navigate to="/send" replace />} />
            <Route path="/send" element={<Send />} />
            <Route path="/quotes" element={<Quotes />} />
            <Route path="/order/:id" element={<Order />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/design" element={<Design />} />
            <Route path="*" element={<Navigate to="/send" replace />} />
          </Routes>
        </main>
        {live && <OnStellarPanel />}
      </div>
      {live && <OnStellarSheet />}

      <footer className="border-t">
        <div className="mx-auto flex max-w-[64rem] flex-wrap items-center justify-between gap-2 px-5 py-5 text-xs text-muted-foreground">
          <span>RateRace · licensed providers compete on every transfer</span>
          <span>Demo on the Stellar test network. No real money moves.</span>
        </div>
      </footer>
    </div>
  );
}
