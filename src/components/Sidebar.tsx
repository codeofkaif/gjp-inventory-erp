import { NavLink } from "react-router-dom";
import type { NavItem } from "../types";
import { useAuth } from "../lib/AuthContext";
import { BUSINESS_CONFIG } from "../lib/businessConfig";

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/", icon: "📊" },
  { label: "Products", path: "/products", icon: "📦" },
  { label: "Customers", path: "/customers", icon: "👥" },
  { label: "Customer Register", path: "/customer-register", icon: "📖" },
  { label: "Suppliers", path: "/suppliers", icon: "🏭" },
  { label: "Sales", path: "/sales", icon: "💰" },
  { label: "Purchases", path: "/purchases", icon: "🛒" },
  { label: "Stock Register", path: "/stock-register", icon: "📋", adminOnly: true },
  { label: "Customer Due", path: "/customer-due", icon: "⏳", adminOnly: true },
  { label: "Supplier Payments", path: "/supplier-payments", icon: "💳", adminOnly: true },
  { label: "GST Summary", path: "/gst-summary", icon: "🧾", adminOnly: true },
  { label: "Reports", path: "/reports", icon: "📈", adminOnly: true },
  { label: "Manage Users", path: "/manage-users", icon: "👥", adminOnly: true },
  { label: "Settings", path: "/settings", icon: "⚙️", adminOnly: true },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const { role } = useAuth();

  const visibleItems = navItems.filter((item) => {
    if (item.adminOnly && role !== "admin") return false;
    return true;
  });

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-900 text-white select-none">
      {/* Logo Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-600 to-amber-700 flex items-center justify-center text-white font-black text-xs tracking-wider shadow-md shrink-0">
            GJP
          </div>
          <div className="overflow-hidden">
            <p className="font-bold text-xs leading-tight tracking-wide text-amber-400 truncate">
              {BUSINESS_CONFIG.name}
            </p>
            <p className="text-[10px] text-slate-400 leading-tight truncate">
              Prop. {BUSINESS_CONFIG.proprietor}
            </p>
          </div>
        </div>

        {/* Mobile Close Button */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center text-sm transition"
            title="Close menu"
          >
            ✕
          </button>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 py-3 overflow-y-auto px-2 space-y-1">
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            onClick={onClose}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all duration-150 active:scale-98",
                isActive
                  ? "bg-blue-600 text-white shadow-md font-bold"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white",
              ].join(" ")
            }
          >
            <span className="text-base w-5 text-center shrink-0">{item.icon}</span>
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Firm Profile Footer */}
      <div className="px-4 py-3 border-t border-slate-800 text-[11px] text-slate-400 space-y-1 bg-slate-950/60 shrink-0">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-300">📍 Maharajganj</span>
          <span className="capitalize px-1.5 py-0.5 bg-slate-800 text-amber-300 rounded text-[10px] font-mono font-bold border border-slate-700">
            {role}
          </span>
        </div>
        <p className="text-[10px] text-slate-400 truncate">📞 {BUSINESS_CONFIG.formattedMobile}</p>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop Static Sidebar (Visible on lg screens >= 1024px) ── */}
      <aside className="hidden lg:flex flex-col w-64 min-h-screen shrink-0 border-r border-slate-800 z-20">
        {sidebarContent}
      </aside>

      {/* ── Mobile Slide-out Drawer (Visible on screens < 1024px) ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop Blur Overlay */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity duration-300 animate-fadeIn"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <aside className="relative flex flex-col w-72 max-w-[85vw] h-full shadow-2xl z-10 animate-slideRight">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
