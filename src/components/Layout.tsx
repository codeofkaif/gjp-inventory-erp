import { useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

export default function Layout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans">
      {/* Sidebar (Desktop static & Mobile slide-out drawer) */}
      <Sidebar
        mobileOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar onOpenMobileMenu={() => setMobileNavOpen(true)} />

        <main className="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6 pb-20 sm:pb-6">
          <Outlet />
        </main>

        {/* ── Mobile Bottom Quick Bar (< 640px) ── */}
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 flex items-center justify-around py-1.5 px-2 text-white shadow-lg">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-[10px] font-semibold transition ${
                isActive ? "text-amber-400 font-bold" : "text-slate-400 hover:text-white"
              }`
            }
          >
            <span className="text-base leading-none">📊</span>
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="/sales"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-[10px] font-semibold transition ${
                isActive ? "text-amber-400 font-bold" : "text-slate-400 hover:text-white"
              }`
            }
          >
            <span className="text-base leading-none">💰</span>
            <span>Sales</span>
          </NavLink>

          <NavLink
            to="/purchases"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-[10px] font-semibold transition ${
                isActive ? "text-amber-400 font-bold" : "text-slate-400 hover:text-white"
              }`
            }
          >
            <span className="text-base leading-none">🛒</span>
            <span>Purchases</span>
          </NavLink>

          <NavLink
            to="/customers"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-[10px] font-semibold transition ${
                isActive ? "text-amber-400 font-bold" : "text-slate-400 hover:text-white"
              }`
            }
          >
            <span className="text-base leading-none">👥</span>
            <span>Parties</span>
          </NavLink>

          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-[10px] font-semibold text-slate-400 hover:text-white transition cursor-pointer"
          >
            <span className="text-base leading-none">☰</span>
            <span>All Menu</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
