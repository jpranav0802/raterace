import { useEffect } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { OnStellarPanel, OnStellarSheet } from "@/components/OnStellar";
import { cn } from "@/lib/utils";
import Admin from "./pages/Admin";
import Design from "./pages/Design";
import Leaderboard from "./pages/Leaderboard";
import Order from "./pages/Order";
import Quotes from "./pages/Quotes";
import Send from "./pages/Send";

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-md px-2.5 py-1.5 text-sm transition-colors",
    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
  );

/** Sender screens show the live "On Stellar" view next to the app. */
const LIVE_ROUTES = /^\/(send|quotes|order)(\/|$)/;

export default function App() {
  const { pathname } = useLocation();
  const live = LIVE_ROUTES.test(pathname);
  // Each screen starts at the top (the router keeps the old scroll position otherwise).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="flex min-h-dvh flex-col">
      <header
        className={cn(
          "mx-auto flex w-full max-w-[30rem] items-center justify-between px-5 py-4",
          live && "lg:max-w-[64rem]",
        )}
      >
        <NavLink to="/send" className="text-lg font-semibold tracking-tight">
          RateRace
        </NavLink>
        <nav className="flex gap-1" aria-label="Main">
          <NavLink to="/send" className={navLink}>
            Send
          </NavLink>
          <NavLink to="/leaderboard" className={navLink}>
            Providers
          </NavLink>
        </nav>
      </header>

      <div
        className={cn(
          "mx-auto w-full max-w-[30rem] flex-1 px-5 pt-6 pb-24 lg:pb-16",
          live &&
            "lg:grid lg:max-w-[64rem] lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] lg:items-start lg:gap-12",
        )}
      >
        <main className="min-w-0">
          <Routes>
            <Route path="/" element={<Navigate to="/send" replace />} />
            <Route path="/send" element={<Send />} />
            <Route path="/quotes" element={<Quotes />} />
            <Route path="/order/:id" element={<Order />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/design" element={<Design />} />
            <Route path="*" element={<Navigate to="/send" replace />} />
          </Routes>
        </main>
        {live && <OnStellarPanel />}
      </div>
      {live && <OnStellarSheet />}

      <footer className="px-5 pb-6 text-center text-xs text-muted-foreground">
        Demo on the Stellar test network. No real money moves.
      </footer>
    </div>
  );
}
