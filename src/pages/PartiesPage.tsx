import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Party } from "../types";
import { get, set } from "../lib/storage";
import { PARTIES_KEY } from "../lib/initStore";
import { logActivity } from "../lib/activityLog";
import PartyForm from "../components/PartyForm";
import DeleteDialog from "../components/DeleteDialog";

interface Props {
  type: "customer" | "supplier";
}

type Modal =
  | { kind: "add" }
  | { kind: "edit"; party: Party }
  | { kind: "delete"; party: Party }
  | null;

function loadParties(type: "customer" | "supplier"): Party[] {
  const all = get<Party[]>(PARTIES_KEY) ?? [];
  return all.filter((p) => p.type === type);
}

function saveParty(party: Party): void {
  const all = get<Party[]>(PARTIES_KEY) ?? [];
  const idx = all.findIndex((p) => p.id === party.id);
  if (idx === -1) {
    set<Party[]>(PARTIES_KEY, [party, ...all]);
  } else {
    const next = [...all];
    next[idx] = party;
    set<Party[]>(PARTIES_KEY, next);
  }
}

function deleteParty(id: string): void {
  const all = get<Party[]>(PARTIES_KEY) ?? [];
  set<Party[]>(PARTIES_KEY, all.filter((p) => p.id !== id));
}

function fmtRs(n: number) {
  return "₹" + (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

export default function PartiesPage({ type }: Props) {
  const navigate = useNavigate();
  const [parties, setParties] = useState<Party[]>(() => loadParties(type));
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"stack" | "table">("stack");
  const [balanceFilter, setBalanceFilter] = useState<"all" | "due" | "settled">("all");
  const [modal, setModal] = useState<Modal>(null);

  const label = type === "customer" ? "Customer" : "Supplier";
  const labelPlural = type === "customer" ? "Customers" : "Suppliers";

  function refresh() {
    setParties(loadParties(type));
  }

  function handleSave(party: Party) {
    const isEdit = modal?.kind === "edit";
    saveParty(party);
    logActivity(isEdit ? "edit" : "create", type, party.id);
    refresh();
    setModal(null);
  }

  function handleDelete() {
    if (modal?.kind !== "delete") return;
    deleteParty(modal.party.id);
    logActivity("delete", type, modal.party.id);
    refresh();
    setModal(null);
  }

  // Filter & Search
  const filtered = parties.filter((p) => {
    if (balanceFilter === "due" && p.outstandingBalance <= 0) return false;
    if (balanceFilter === "settled" && p.outstandingBalance > 0) return false;

    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      (p.phone && p.phone.includes(q)) ||
      (p.gstin && p.gstin.toLowerCase().includes(q)) ||
      (p.address && p.address.toLowerCase().includes(q))
    );
  });

  // Strict LIFO Stack Sorting: Newest added party (highest numeric ID or creation) at the TOP
  const stackSorted = [...filtered].sort((a, b) => {
    const numA = parseInt(a.id.replace(/\D/g, ""), 10) || 0;
    const numB = parseInt(b.id.replace(/\D/g, ""), 10) || 0;
    if (numA !== numB) return numB - numA;
    return b.id.localeCompare(a.id);
  });

  const totalOutstanding = parties.reduce((s, p) => s + p.outstandingBalance, 0);
  const dueCount = parties.filter((p) => p.outstandingBalance > 0).length;
  const settledCount = parties.filter((p) => p.outstandingBalance <= 0).length;

  return (
    <div className="space-y-5">
      {/* Header & View Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-800">{labelPlural} Stack (LIFO)</h2>
            <span className="bg-blue-100 text-blue-800 text-[11px] font-bold px-2 py-0.5 rounded-full border border-blue-200">
              Stack Depth: {parties.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {type === "customer"
              ? "Customer accounts sorted with recently added at the TOP of the stack"
              : "Supplier accounts sorted with recently added at the TOP of the stack"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            <button
              id="btn-view-stack"
              onClick={() => setViewMode("stack")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition ${
                viewMode === "stack"
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              📑 Stack Deck
            </button>
            <button
              id="btn-view-table"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition ${
                viewMode === "table"
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              📋 Table View
            </button>
          </div>

          {type === "customer" && (
            <button
              onClick={() => navigate("/customer-register")}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-2xs transition"
            >
              <span>📖</span> Sales Register
            </button>
          )}

          <button
            id="btn-add-party"
            onClick={() => setModal({ kind: "add" })}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
          >
            <span className="text-sm leading-none">+</span> Push New {label}
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-blue-50 border-blue-200 text-blue-800 p-4 flex items-center gap-3">
          <span className="text-2xl">{type === "customer" ? "👥" : "🏭"}</span>
          <div>
            <p className="text-2xl font-bold leading-none">{parties.length}</p>
            <p className="text-xs mt-1 text-blue-600 font-medium">Total {labelPlural} in Stack</p>
          </div>
        </div>

        <div
          className={`rounded-xl border p-4 flex items-center gap-3 ${
            totalOutstanding > 0
              ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}
        >
          <span className="text-2xl">💰</span>
          <div>
            <p className="text-xl font-bold leading-none">{fmtRs(totalOutstanding)}</p>
            <p className="text-xs mt-1 opacity-80 font-medium">
              {type === "customer" ? "Total Outstanding Receivable" : "Total Outstanding Payable"}
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-slate-50 border-slate-200 text-slate-700 p-4 flex items-center gap-3">
          <span className="text-2xl">⚡</span>
          <div>
            <p className="text-sm font-bold text-slate-800">
              {stackSorted.length > 0 ? stackSorted[0].name : "None"}
            </p>
            <p className="text-xs mt-1 text-slate-500 font-medium">Top of Stack (Most Recent)</p>
          </div>
        </div>
      </div>

      {/* Search & Quick Filter Pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div className="relative flex-1 max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">
            🔍
          </span>
          <input
            id="party-search"
            type="text"
            placeholder={`Search ${labelPlural.toLowerCase()} stack by ID, name, phone, GSTIN or address…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
          {search && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              onClick={() => setSearch("")}
            >
              ✕
            </button>
          )}
        </div>

        {/* Balance filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setBalanceFilter("all")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
              balanceFilter === "all"
                ? "bg-slate-800 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            All Stack ({parties.length})
          </button>
          <button
            onClick={() => setBalanceFilter("due")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
              balanceFilter === "due"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-white text-amber-700 border border-amber-200 hover:bg-amber-50"
            }`}
          >
            ⏳ With Balance ({dueCount})
          </button>
          <button
            onClick={() => setBalanceFilter("settled")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
              balanceFilter === "settled"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50"
            }`}
          >
            ✓ Settled ({settledCount})
          </button>
        </div>
      </div>

      {/* ── STACK DECK VIEW MODE ── */}
      {viewMode === "stack" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1 text-xs text-slate-500 font-medium">
            <span>
              Showing {stackSorted.length} of {parties.length} {labelPlural} (Recently Added at Top)
            </span>
          </div>

          {stackSorted.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 shadow-xs">
              <div className="text-4xl mb-2">{type === "customer" ? "👥" : "🏭"}</div>
              <p className="text-sm font-semibold text-slate-600">The {label} Stack is Empty</p>
              <p className="text-xs text-slate-400 mt-1">
                {search ? "No matching accounts found" : `Click "+ Push New ${label}" to register one`}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {stackSorted.map((p, idx) => {
                const isTop = idx === 0;

                return (
                  <div
                    key={p.id}
                    className={`bg-white rounded-xl border transition-all duration-150 shadow-xs hover:shadow-md overflow-hidden ${
                      isTop
                        ? "border-blue-300 ring-2 ring-blue-100 bg-gradient-to-r from-blue-50/20 via-white to-white"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      {/* Left info */}
                      <div className="flex items-start gap-3">
                        <span
                          className={`px-2 py-1 rounded-md text-[10px] font-black uppercase font-mono shadow-2xs shrink-0 ${
                            isTop
                              ? "bg-blue-600 text-white animate-pulse"
                              : "bg-slate-100 text-slate-700 border border-slate-200"
                          }`}
                        >
                          {isTop ? "⚡ TOP #1" : `#${idx + 1}`}
                        </span>

                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-bold text-slate-900 text-sm">{p.name}</h3>
                            <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                              {p.id}
                            </span>
                            {p.gstin && (
                              <span className="text-[10px] font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                GSTIN: {p.gstin}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                            {p.phone ? (
                              <span>📞 {p.phone}</span>
                            ) : (
                              <span className="text-slate-400">📞 No Phone</span>
                            )}
                            {p.address ? (
                              <span className="truncate max-w-md text-slate-600">
                                📍 {p.address}
                              </span>
                            ) : (
                              <span className="text-slate-400">📍 No Address</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right balance & actions */}
                      <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <div className="text-right">
                          <span className="block text-[10px] uppercase font-bold text-slate-400">
                            {type === "customer" ? "Receivable Due" : "Payable Due"}
                          </span>
                          <span
                            className={`text-sm font-bold ${
                              p.outstandingBalance > 0 ? "text-amber-600" : "text-emerald-600"
                            }`}
                          >
                            {p.outstandingBalance > 0 ? fmtRs(p.outstandingBalance) : "✓ Clear"}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            id={`btn-edit-party-${p.id}`}
                            onClick={() => setModal({ kind: "edit", party: p })}
                            className="px-2.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            id={`btn-delete-party-${p.id}`}
                            onClick={() => setModal({ kind: "delete", party: p })}
                            className="px-2.5 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition"
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── COMPACT TABLE VIEW MODE ── */}
      {viewMode === "table" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-center px-2 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                    Stack #
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                    {label} ID
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                    Address
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                    GSTIN
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">
                    Outstanding Balance
                  </th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stackSorted.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400">
                      <div className="text-3xl mb-2">{type === "customer" ? "👤" : "🏭"}</div>
                      <p className="text-sm font-semibold text-slate-600">No {labelPlural} found</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {search ? "Try adjusting your search" : `Click "+ Push New ${label}" to create one`}
                      </p>
                    </td>
                  </tr>
                ) : (
                  stackSorted.map((p, idx) => {
                    const isTop = idx === 0;

                    return (
                      <tr
                        key={p.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          isTop ? "bg-blue-50/20" : ""
                        }`}
                      >
                        <td className="px-2 py-3 text-center font-mono text-[11px] font-bold">
                          {isTop ? (
                            <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[10px]">
                              TOP
                            </span>
                          ) : (
                            <span className="text-slate-400">#{idx + 1}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-700 whitespace-nowrap">
                          {p.id}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{p.name}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {p.phone || <span className="text-slate-300">—</span>}
                        </td>
                        <td
                          className="px-4 py-3 text-slate-600 text-xs max-w-xs truncate"
                          title={p.address || ""}
                        >
                          {p.address || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                          {p.gstin ? (
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded font-medium border border-slate-200">
                              {p.gstin}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span
                            className={`font-semibold ${
                              p.outstandingBalance > 0 ? "text-amber-600" : "text-emerald-600"
                            }`}
                          >
                            {fmtRs(p.outstandingBalance)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              id={`btn-edit-party-${p.id}`}
                              onClick={() => setModal({ kind: "edit", party: p })}
                              className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                            >
                              Edit
                            </button>
                            <button
                              id={`btn-delete-party-${p.id}`}
                              onClick={() => setModal({ kind: "delete", party: p })}
                              className="px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {(modal?.kind === "add" || modal?.kind === "edit") && (
        <PartyForm
          initial={modal.kind === "edit" ? modal.party : null}
          partyType={type}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "delete" && (
        <DeleteDialog
          productName={modal.party.name}
          title={`Delete ${label} "${modal.party.name}"?`}
          onConfirm={handleDelete}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}
