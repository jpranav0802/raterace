import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import Admin from "./pages/Admin";
import Leaderboard from "./pages/Leaderboard";
import Order from "./pages/Order";
import Quotes from "./pages/Quotes";
import Send from "./pages/Send";

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/send" className="logo">
          Rate<span>Race</span>
        </NavLink>
        <nav>
          <NavLink to="/send">Send</NavLink>
          <NavLink to="/leaderboard">Providers</NavLink>
        </nav>
      </header>

      <main className="page">
        <Routes>
          <Route path="/" element={<Navigate to="/send" replace />} />
          <Route path="/send" element={<Send />} />
          <Route path="/quotes" element={<Quotes />} />
          <Route path="/order/:id" element={<Order />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/send" replace />} />
        </Routes>
      </main>

      <footer className="footer">Demo on Stellar testnet. No real money moves.</footer>
    </div>
  );
}
