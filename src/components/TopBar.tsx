import { useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { BUSINESS_CONFIG } from "../lib/businessConfig";

const PAGE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/products": "Products Catalog",
  "/customers": "Customers Master",
  "/customer-register": "Customer Sales Register",
  "/suppliers": "Suppliers Master",
  "/sales": "Sales Invoices",
  "/purchases": "Purchase Invoices",
  "/stock-register": "Stock Register",
  "/customer-due": "Customer Due Balances",
  "/supplier-payments": "Supplier Payment Status",
  "/gst-summary": "GST Summary & Filing",
  "/reports": "Business & Profit Reports",
  "/manage-users": "Manage Staff & Users",
  "/settings": "Settings & Preferences",
};

interface TopBarProps {
  onOpenMobileMenu: () => void;
}

export default function TopBar({ onOpenMobileMenu }: TopBarProps) {
  const { pathname } = useLocation();
  const { user, role, logout } = useAuth();
  const label = PAGE_LABELS[pathname] ?? BUSINESS_CONFIG.name;

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center px-3 sm:px-6 gap-2 sm:gap-4 shrink-0 shadow-2xs justify-between">
      <div className="flex items-center gap-2.5 overflow-hidden">
        {/* Hamburger menu button for phones & tablets */}
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer shrink-0"
          title="Open Navigation Menu"
          aria-label="Open Navigation Menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="overflow-hidden">
          <h1 className="text-xs sm:text-sm font-bold text-slate-800 leading-none truncate">
            {label}
          </h1>
          <p className="text-[10px] sm:text-[11px] text-amber-700 font-semibold mt-0.5 truncate">
            {BUSINESS_CONFIG.name} <span className="text-slate-400 font-normal hidden xs:inline">· {BUSINESS_CONFIG.city}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
          Offline ERP
        </span>

        {user && (
          <div className="flex items-center gap-1.5 sm:gap-2.5 pl-2 sm:pl-3 border-l border-slate-200">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-slate-800 leading-tight truncate max-w-[120px]">{user.name}</p>
              <p className="text-[10px] text-slate-400 capitalize font-medium">{role}</p>
            </div>
            <button
              id="btn-switch-user"
              onClick={logout}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1.5 sm:px-2.5 sm:py-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg transition duration-150 flex items-center gap-1 cursor-pointer"
              title="Log out and switch user"
            >
              <span>🔄</span> <span className="hidden xs:inline">Switch</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
