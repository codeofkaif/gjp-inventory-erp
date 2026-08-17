import { useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { resetAllData } from "../lib/initStore";
import { BUSINESS_CONFIG } from "../lib/businessConfig";
import DeleteDialog from "../components/DeleteDialog";

export default function SettingsPage() {
  const { role, logout } = useAuth();
  const [showConfirm, setShowConfirm] = useState(false);

  if (role !== "admin") {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-8 text-center max-w-lg mx-auto mt-12">
        <div className="text-4xl mb-3">🔒</div>
        <h3 className="text-lg font-bold">Access Restricted</h3>
        <p className="text-sm mt-1 text-red-600">
          Only administrators have access to Settings and Data management.
        </p>
      </div>
    );
  }

  function handleReset() {
    resetAllData();
    logout();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Settings & Firm Profile</h2>
        <p className="text-sm text-slate-500 mt-0.5">Business identity, system preferences and data maintenance</p>
      </div>

      {/* ── Business & Firm Profile Card ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent px-5 py-4 border-b border-amber-200/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-600 to-amber-700 text-white font-black text-sm flex items-center justify-center shadow-xs">
              GJP
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">{BUSINESS_CONFIG.name}</h3>
              <p className="text-xs text-amber-800 font-semibold">
                Proprietor: {BUSINESS_CONFIG.proprietor}
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 text-[11px] font-bold text-amber-800 bg-amber-100/70 border border-amber-200 rounded-lg">
            Active Firm Profile
          </span>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="text-[10px] font-bold uppercase text-slate-400">Business Name</span>
            <p className="font-bold text-slate-800 text-sm">{BUSINESS_CONFIG.name}</p>
          </div>

          <div className="space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="text-[10px] font-bold uppercase text-slate-400">Proprietor Name</span>
            <p className="font-bold text-slate-800 text-sm">{BUSINESS_CONFIG.proprietor}</p>
          </div>

          <div className="space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="text-[10px] font-bold uppercase text-slate-400">Business Address</span>
            <p className="font-medium text-slate-700">{BUSINESS_CONFIG.addressLine}</p>
            <p className="font-semibold text-slate-800">{BUSINESS_CONFIG.city} - {BUSINESS_CONFIG.pincode}</p>
          </div>

          <div className="space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="text-[10px] font-bold uppercase text-slate-400">Contact Number</span>
            <p className="font-bold text-emerald-700 text-sm">📞 {BUSINESS_CONFIG.formattedMobile}</p>
            <p className="text-slate-500 text-[11px]">Primary Billing & Support Mobile</p>
          </div>
        </div>
      </div>

      {/* Danger Zone: Reset Data */}
      <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
        <div className="bg-red-50/70 px-5 py-4 border-b border-red-100 flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <h3 className="text-sm font-semibold text-red-900">Danger Zone — Reset All Data</h3>
            <p className="text-xs text-red-700 mt-0.5">
              Permanently wipe all operational data and restore factory defaults
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            Resetting the system will completely remove all:
          </p>
          <ul className="text-xs text-slate-600 list-disc list-inside space-y-1 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <li>Customer and Supplier parties & outstanding balances</li>
            <li>Sales and Purchase invoices</li>
            <li>Stock movement register entries</li>
            <li>Custom staff user accounts and activity logs</li>
          </ul>
          <p className="text-xs text-slate-500">
            The 55-product catalog and default Admin account (<code className="text-slate-700 font-mono">PIN: 1234</code>) will be re-seeded. You will be immediately logged out.
          </p>

          <div className="pt-2">
            <button
              id="btn-reset-all-data"
              onClick={() => setShowConfirm(true)}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg shadow transition duration-150"
            >
              Reset All Data to Defaults
            </button>
          </div>
        </div>
      </div>

      {showConfirm && (
        <DeleteDialog
          title="Permanently Reset All Data?"
          message="WARNING: This action is irreversible. All invoices, parties, custom products/prices, and activity logs will be wiped clean. Are you sure you wish to proceed?"
          onConfirm={handleReset}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
