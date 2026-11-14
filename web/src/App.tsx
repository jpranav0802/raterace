import { NavLink, Navigate, Route, Routes } from "react-router-dom";
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

export default function App() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-[30rem] items-center justify-between px-5 py-4">
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

      <main className="mx-auto w-full max-w-[30rem] flex-1 px-5 pt-6 pb-16">
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

      <footer className="px-5 pb-6 text-center text-xs text-muted-foreground">
        Demo on the Stellar test network. No real money moves.
      </footer>
    </div>
  );
}
