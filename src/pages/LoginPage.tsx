import { useState, type FormEvent } from "react";
import type { User } from "../types";
import { get } from "../lib/storage";
import { USERS_KEY } from "../lib/initStore";
import { useAuth } from "../lib/AuthContext";
import { BUSINESS_CONFIG } from "../lib/businessConfig";

export default function LoginPage() {
  const { login } = useAuth();
  const users = get<User[]>(USERS_KEY) ?? [];

  const [selectedUserId, setSelectedUserId] = useState<string>(users[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!selectedUserId) {
      setError("Please select a user.");
      return;
    }

    const matchedUser = users.find((u) => u.id === selectedUserId);
    if (!matchedUser) {
      setError("Selected user not found.");
      return;
    }

    if (matchedUser.pin !== pin) {
      setError("Invalid 4-digit PIN. Please try again.");
      return;
    }

    const ok = login(matchedUser.id);
    if (!ok) {
      setError("Failed to start session.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      {/* Background glowing gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-amber-600/20 blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-blue-600/20 blur-3xl"></div>
      </div>

      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-8 relative z-10">
        {/* Header / Logo */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 via-orange-600 to-amber-700 mx-auto flex items-center justify-center text-white font-black text-2xl shadow-lg mb-3 tracking-wider">
            GJP
          </div>
          <h1 className="text-xl font-black text-amber-400 tracking-wide uppercase">
            {BUSINESS_CONFIG.name}
          </h1>
          <p className="text-xs text-slate-300 font-medium mt-1">
            Prop. {BUSINESS_CONFIG.proprietor} · {BUSINESS_CONFIG.city}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            📞 {BUSINESS_CONFIG.formattedMobile}
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3.5 text-xs font-medium flex items-center gap-2.5 animate-shake">
            <span className="text-base">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Select User Profile
            </label>
            <div className="relative">
              <select
                id="login-user-select"
                value={selectedUserId}
                onChange={(e) => {
                  setSelectedUserId(e.target.value);
                  setError("");
                }}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition appearance-none cursor-pointer"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role === "admin" ? "Admin" : "Staff"})
                  </option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                ▼
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              4-Digit PIN
            </label>
            <input
              id="login-pin-input"
              type="password"
              maxLength={4}
              placeholder="••••"
              value={pin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "");
                setPin(val);
                setError("");
              }}
              autoFocus
              className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3 text-center text-2xl tracking-[0.6em] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition placeholder:tracking-normal placeholder:text-slate-600 placeholder:text-base"
            />
            <p className="text-[11px] text-slate-500 mt-1.5 text-center">
              Default Admin PIN is <code className="text-slate-400 bg-slate-700/50 px-1 py-0.5 rounded">1234</code>
            </p>
          </div>

          <button
            id="login-submit-btn"
            type="submit"
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold py-3 rounded-xl shadow-lg transition duration-150 active:scale-[0.98] text-sm mt-2"
          >
            Unlock & Continue →
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-700/60 text-center">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            Offline-First Local Storage Security
          </span>
        </div>
      </div>
    </div>
  );
}
