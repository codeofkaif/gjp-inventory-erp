import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import type { SaleInvoice, InvoiceItem, Party, Product, StateType } from "../types";
import { get, set } from "../lib/storage";
import { SALES_KEY, PARTIES_KEY, PRODUCTS_KEY } from "../lib/initStore";
import { newPartyId, nextSaleSlNo, applyInvoiceItems, updateSaleInvoice, ensureParty } from "../lib/stockOps";
import { computeItemGst, lineTotal, round2 } from "../lib/gstUtils";
import { logActivity } from "../lib/activityLog";
import { useAuth } from "../lib/AuthContext";
import InvoiceViewModal from "../components/InvoiceViewModal";

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayIso = () => new Date().toISOString().slice(0, 10);

function loadSales():     SaleInvoice[] { return get<SaleInvoice[]>(SALES_KEY)     ?? []; }
function loadCustomers(): Party[]       { return (get<Party[]>(PARTIES_KEY) ?? []).filter(p => p.type === "customer"); }
function loadProducts():  Product[]     { return get<Product[]>(PRODUCTS_KEY)      ?? []; }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtRs(n: number) { return "₹" + (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 }); }

type LineItem = InvoiceItem & { _key: number };

function blankItem(): LineItem {
  return { _key: Date.now() + Math.random(), productId: "", qty: 1, unitPrice: 0, discount: 0, amount: 0, cgst: 0, sgst: 0, igst: 0 };
}

function computeDueDate(baseDate: string, days: number): string {
  try {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + (days || 0));
    return d.toISOString().slice(0, 10);
  } catch {
    return baseDate;
  }
}

// ── Root component ────────────────────────────────────────────────────────────
export default function SalesPage() {
  const [searchParams] = useSearchParams();
  const [view, setView]   = useState<"list" | "form">(() => searchParams.get("new") === "1" ? "form" : "list");
  const [editingInvoice, setEditingInvoice] = useState<SaleInvoice | null>(null);
  const [sales, setSales] = useState<SaleInvoice[]>(loadSales);
  const [search, setSearch] = useState("");
  const [viewInvoiceModal, setViewInvoiceModal] = useState<{
    invoice: SaleInvoice;
    isEstimate: boolean;
    autoPrint: boolean;
  } | null>(null);

  const customers = loadCustomers();
  const products = loadProducts();

  function handleNew() {
    setEditingInvoice(null);
    setView("form");
  }

  function handleEdit(inv: SaleInvoice) {
    setEditingInvoice(inv);
    setView("form");
  }

  function handleSaved(savedInv: SaleInvoice, shouldPrint = true) {
    setSales(loadSales());
    setView("list");
    setEditingInvoice(null);
    if (shouldPrint) {
      setViewInvoiceModal({ invoice: savedInv, isEstimate: false, autoPrint: true });
    }
  }

  function handleGenerateEstimate(estInv: SaleInvoice) {
    setViewInvoiceModal({ invoice: estInv, isEstimate: true, autoPrint: false });
  }

  return (
    <>
      {view === "list" ? (
        <SalesList
          sales={sales}
          search={search}
          onSearch={setSearch}
          onNew={handleNew}
          onEdit={handleEdit}
          onViewInvoice={(inv) => setViewInvoiceModal({ invoice: inv, isEstimate: false, autoPrint: false })}
        />
      ) : (
        <SaleForm
          initialInvoice={editingInvoice}
          onSaved={handleSaved}
          onGenerateEstimate={handleGenerateEstimate}
          onCancel={() => {
            setView("list");
            setEditingInvoice(null);
          }}
        />
      )}

      {viewInvoiceModal && (
        <InvoiceViewModal
          invoice={viewInvoiceModal.invoice}
          type="sale"
          parties={customers}
          products={products}
          onClose={() => setViewInvoiceModal(null)}
          isEstimate={viewInvoiceModal.isEstimate}
          autoPrint={viewInvoiceModal.autoPrint}
        />
      )}
    </>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────
// ── List view (LIFO Stack & Table Implementation) ─────────────────────────────
function SalesList({
  sales,
  search,
  onSearch,
  onNew,
  onEdit,
  onViewInvoice,
}: {
  sales: SaleInvoice[];
  search: string;
  onSearch: (s: string) => void;
  onNew: () => void;
  onEdit: (inv: SaleInvoice) => void;
  onViewInvoice: (inv: SaleInvoice) => void;
}) {
  const [viewMode, setViewMode] = useState<"stack" | "table">("stack");
  const [stackFilter, setStackFilter] = useState<"all" | "due" | "settled" | "credit" | "cash">("all");
  const [expandedStackIds, setExpandedStackIds] = useState<Set<string>>(new Set());

  const customers = loadCustomers();
  const customerMap = Object.fromEntries(customers.map((c) => [c.id, c]));

  const products = loadProducts();
  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  // LIFO Stack sorting: Most recent invoice at the TOP of the stack
  const stackSorted = [...sales].sort((a, b) => {
    // Primary: orderDate descending
    const dateComp = b.orderDate.localeCompare(a.orderDate);
    if (dateComp !== 0) return dateComp;
    // Secondary: numeric ID/SL descending (newest on top)
    const numA = parseInt(String(a.slNo || a.id).replace(/\D/g, ""), 10) || 0;
    const numB = parseInt(String(b.slNo || b.id).replace(/\D/g, ""), 10) || 0;
    if (numA !== numB) return numB - numA;
    return String(b.slNo || b.id).localeCompare(String(a.slNo || a.id));
  });

  const filtered = stackSorted
    .filter((s) => {
      if (stackFilter === "due" && s.balanceDue <= 0) return false;
      if (stackFilter === "settled" && s.balanceDue > 0) return false;
      if (stackFilter === "credit" && s.paymentMethod !== "credit") return false;
      if (stackFilter === "cash" && s.paymentMethod !== "cash") return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const c = customerMap[s.customerId];
      return (
        s.id.toLowerCase().includes(q) ||
        (s.slNo && String(s.slNo).toLowerCase().includes(q)) ||
        (s.refNo && s.refNo.toLowerCase().includes(q)) ||
        (c?.name && c.name.toLowerCase().includes(q)) ||
        (c?.id && c.id.toLowerCase().includes(q)) ||
        (c?.gstin && c.gstin.toLowerCase().includes(q))
      );
    });

  const totalCgst = sales.reduce((s, inv) => s + inv.items.reduce((a, i) => a + (i.cgst ?? 0), 0), 0);
  const totalSgst = sales.reduce((s, inv) => s + inv.items.reduce((a, i) => a + (i.sgst ?? 0), 0), 0);
  const totalIgst = sales.reduce((s, inv) => s + inv.items.reduce((a, i) => a + (i.igst ?? 0), 0), 0);
  const totalRevenue = sales.reduce((s, i) => s + i.total, 0);
  const totalDue = sales.reduce((s, i) => s + i.balanceDue, 0);
  const dueCount = sales.filter((s) => s.balanceDue > 0).length;
  const settledCount = sales.filter((s) => s.balanceDue <= 0).length;
  const creditCount = sales.filter((s) => s.paymentMethod === "credit").length;
  const cashCount = sales.filter((s) => s.paymentMethod === "cash").length;

  function toggleExpandStack(id: string) {
    setExpandedStackIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpandedStackIds(new Set(filtered.map((s) => s.id)));
  }

  function collapseAll() {
    setExpandedStackIds(new Set());
  }

  return (
    <div className="space-y-5">
      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-800">Sales Invoice </h2>
            {/* <span className="bg-blue-100 text-blue-800 text-[11px] font-bold px-2 py-0.5 rounded-full border border-blue-200">
              Stack Depth
            </span> */}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Invoices 
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

          {/* Push to Stack button */}
          <button
            id="btn-new-sale"
            onClick={onNew}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
          >
            <span className="text-sm leading-none">+</span> Push New Invoice
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="📚" label="Total " value={String(sales.length)} color="blue" />
        <StatCard icon="💰" label="Stack Revenue" value={fmtRs(totalRevenue)} color="green" />
        <StatCard icon="🏛️" label="Total GST Split" value={fmtRs(totalCgst + totalSgst + totalIgst)} color="purple" />
        <StatCard icon="⏳" label="Stack Balance Due" value={fmtRs(totalDue)} color="amber" />
      </div>

      {/* Stack Filters & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        {/* Search */}
        <div className="relative max-w-md w-full">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
          <input
            id="sales-search"
            type="text"
            placeholder="Search stack by Invoice / SL, Customer, GSTIN, Phone…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
        </div>

        {/* Stack Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setStackFilter("all")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
              stackFilter === "all"
                ? "bg-slate-800 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            All Stack ({sales.length})
          </button>
          <button
            onClick={() => setStackFilter("due")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
              stackFilter === "due"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-white text-amber-700 border border-amber-200 hover:bg-amber-50"
            }`}
          >
            ⏳ Due ({dueCount})
          </button>
          <button
            onClick={() => setStackFilter("settled")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
              stackFilter === "settled"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50"
            }`}
          >
            ✓ Settled ({settledCount})
          </button>
          <button
            onClick={() => setStackFilter("credit")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
              stackFilter === "credit"
                ? "bg-purple-600 text-white shadow-xs"
                : "bg-white text-purple-700 border border-purple-200 hover:bg-purple-50"
            }`}
          >
            💳 Credit ({creditCount})
          </button>
          <button
            onClick={() => setStackFilter("cash")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
              stackFilter === "cash"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white text-blue-700 border border-blue-200 hover:bg-blue-50"
            }`}
          >
            💵 Cash ({cashCount})
          </button>
        </div>
      </div>

      {/* ── STACK DECK VIEW MODE ── */}
      {viewMode === "stack" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1 text-xs text-slate-500 font-medium">
            <span>
              Showing {filtered.length} of {sales.length}  Invoices 
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={expandAll}
                className="text-blue-600 hover:text-blue-800 font-semibold underline"
              >
                Expand All Items
              </button>
              <span>·</span>
              <button
                onClick={collapseAll}
                className="text-slate-500 hover:text-slate-700 underline"
              >
                Collapse All
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 shadow-xs">
              <div className="text-4xl mb-2">📚</div>
              <p className="text-sm font-semibold text-slate-600">The Invoice Stack is Empty</p>
              <p className="text-xs text-slate-400 mt-1">
                {search ? "No matching invoices found in stack" : "Push your first invoice onto the stack above"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((s, idx) => {
                const customer = customerMap[s.customerId];
                const taxable = s.items.reduce((a, i) => a + (i.amount ?? 0), 0);
                const gstSum = s.items.reduce((a, i) => a + (i.cgst ?? 0) + (i.sgst ?? 0) + (i.igst ?? 0), 0);
                const isExpanded = expandedStackIds.has(s.id);
                const isTop = idx === 0;

                return (
                  <div
                    key={s.id}
                    className={`bg-white rounded-xl border transition-all duration-200 shadow-xs hover:shadow-md overflow-hidden ${
                      isTop
                        ? "border-blue-300 ring-2 ring-blue-100 bg-gradient-to-r from-blue-50/20 via-white to-white"
                        : "border-slate-200"
                    }`}
                  >
                    {/* Stack Card Header */}
                    <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100">
                      {/* Left: Stack Position & Invoice ID & Customer */}
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          <span
                            className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider font-mono shadow-2xs ${
                              isTop
                                ? "bg-blue-600 text-white animate-pulse"
                                : "bg-slate-100 text-slate-700 border border-slate-200"
                            }`}
                          >
                            {isTop ? "⚡ TOP #1" : `#${idx + 1}`}
                          </span>
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-bold text-blue-900">
                              {s.slNo || s.id}
                            </span>
                            {s.refNo && (
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                                Ref: {s.refNo}
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                                s.paymentMethod === "credit"
                                  ? "bg-purple-100 text-purple-800 border border-purple-200"
                                  : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              }`}
                            >
                              {s.paymentMethod}
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium">
                              📅 {fmtDate(s.orderDate)}
                            </span>
                            {s.dueDate && (
                              <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-medium">
                                ⏳ Due: {fmtDate(s.dueDate)}
                              </span>
                            )}
                          </div>

                          {/* Customer Info Snippet */}
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                            <span className="font-bold text-slate-800 text-sm">
                              👤 {customer?.name || s.customerId}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500">
                              [{customer?.id || s.customerId}]
                            </span>
                            {customer?.gstin && (
                              <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                GSTIN: {customer.gstin}
                              </span>
                            )}
                            {customer?.phone && (
                              <span className="text-[11px] text-slate-500">
                                📞 {customer.phone}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Financial Figures & Quick Action Buttons */}
                      <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                        {/* Financial Chips */}
                        <div className="flex items-center gap-3 text-right">
                          <div>
                            <span className="block text-[10px] uppercase font-bold text-slate-400">
                              Taxable + GST
                            </span>
                            <span className="text-xs font-semibold text-slate-700">
                              {fmtRs(taxable)} + {fmtRs(gstSum)}
                            </span>
                          </div>

                          <div className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                            <span className="block text-[10px] uppercase font-bold text-slate-500">
                              Total Invoice
                            </span>
                            <span className="text-sm font-bold text-slate-900">
                              {fmtRs(s.total)}
                            </span>
                          </div>

                          <div>
                            <span className="block text-[10px] uppercase font-bold text-slate-400">
                              Balance Due
                            </span>
                            <span
                              className={`text-xs font-bold ${
                                s.balanceDue > 0 ? "text-amber-600" : "text-emerald-600"
                              }`}
                            >
                              {s.balanceDue > 0 ? fmtRs(s.balanceDue) : "✓ Settled"}
                            </span>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => toggleExpandStack(s.id)}
                            className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition flex items-center gap-1"
                          >
                            <span>{isExpanded ? "▲ Hide" : "▼ Items"}</span>
                            <span className="bg-white px-1.5 py-0.2 rounded-full text-[10px] text-slate-600 font-mono">
                              {s.items.length}
                            </span>
                          </button>

                          <button
                            id={`btn-edit-sale-${s.id}`}
                            onClick={() => onEdit(s)}
                            className="px-2.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition"
                          >
                            ✏️ Edit
                          </button>

                          <button
                            id={`btn-view-sale-${s.id}`}
                            onClick={() => onViewInvoice(s)}
                            className="px-2.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition"
                          >
                            👁️ View ERP
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expandable Line Items Table */}
                    {isExpanded && (
                      <div className="bg-[#f8fafc] p-4 border-t border-slate-100 animate-in fade-in duration-150">
                        <div className="rounded-lg border border-slate-200 overflow-hidden bg-white shadow-2xs">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 uppercase font-semibold">
                                <th className="text-left px-3 py-2">Item / Product</th>
                                <th className="text-right px-2 py-2">Qty</th>
                                <th className="text-right px-2 py-2">Unit Price</th>
                                <th className="text-right px-2 py-2">Discount</th>
                                <th className="text-right px-2 py-2">Taxable</th>
                                <th className="text-right px-2 py-2">CGST</th>
                                <th className="text-right px-2 py-2">SGST</th>
                                <th className="text-right px-2 py-2">IGST</th>
                                <th className="text-right px-3 py-2">Line Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {s.items.map((it, itemIdx) => {
                                const prod = productMap[it.productId];
                                const lineTaxable = it.amount;
                                const lineTotalAmount =
                                  lineTaxable + (it.cgst || 0) + (it.sgst || 0) + (it.igst || 0);

                                return (
                                  <tr key={itemIdx} className="hover:bg-slate-50/50">
                                    <td className="px-3 py-2">
                                      <span className="font-semibold text-slate-800">
                                        {prod?.name || it.productId}
                                      </span>
                                      <span className="block text-[10px] text-slate-400 font-mono">
                                        Code: {it.productId} {prod?.hsnCode ? `· HSN: ${prod.hsnCode}` : ""}
                                      </span>
                                    </td>
                                    <td className="px-2 py-2 text-right font-medium text-slate-800">
                                      {it.qty} {prod?.unit || "pcs"}
                                    </td>
                                    <td className="px-2 py-2 text-right text-slate-600">
                                      {fmtRs(it.unitPrice)}
                                    </td>
                                    <td className="px-2 py-2 text-right text-slate-500">
                                      {it.discount > 0 ? fmtRs(it.discount) : "—"}
                                    </td>
                                    <td className="px-2 py-2 text-right font-semibold text-slate-700">
                                      {fmtRs(lineTaxable)}
                                    </td>
                                    <td className="px-2 py-2 text-right text-slate-600 text-[11px]">
                                      {it.cgst > 0 ? fmtRs(it.cgst) : "—"}
                                    </td>
                                    <td className="px-2 py-2 text-right text-slate-600 text-[11px]">
                                      {it.sgst > 0 ? fmtRs(it.sgst) : "—"}
                                    </td>
                                    <td className="px-2 py-2 text-right text-slate-600 text-[11px]">
                                      {it.igst > 0 ? fmtRs(it.igst) : "—"}
                                    </td>
                                    <td className="px-3 py-2 text-right font-bold text-slate-900">
                                      {fmtRs(lineTotalAmount)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {s.narration && (
                          <div className="mt-2 text-[11px] text-slate-500 italic bg-amber-50/60 p-2 rounded border border-amber-100 flex items-center gap-2">
                            <span>📝 Narration:</span> {s.narration}
                          </div>
                        )}
                      </div>
                    )}
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
                  <th className="text-center px-2 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Stack #</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">Invoice / SL No</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">Date</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Customer Details</th>
                  <th className="text-center px-2 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Mode</th>
                  <th className="text-right px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">Taxable</th>
                  <th className="text-right px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">GST Split</th>
                  <th className="text-right px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">Total</th>
                  <th className="text-right px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">Advance</th>
                  <th className="text-right px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">Due</th>
                  <th className="text-center px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-12 text-slate-400">
                      <div className="text-3xl mb-2">🧾</div>
                      <p className="text-sm">{search ? "No matching invoices in stack" : "No sales recorded yet"}</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((s, idx) => {
                    const customer = customerMap[s.customerId];
                    const taxable = s.items.reduce((a, i) => a + (i.amount ?? 0), 0);
                    const gstSum = s.items.reduce((a, i) => a + (i.cgst ?? 0) + (i.sgst ?? 0) + (i.igst ?? 0), 0);
                    const isTop = idx === 0;

                    return (
                      <tr key={s.id} className={`hover:bg-slate-50 transition-colors ${isTop ? "bg-blue-50/20" : ""}`}>
                        <td className="px-2 py-2.5 text-center font-mono text-[11px] font-bold">
                          {isTop ? (
                            <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">
                              TOP
                            </span>
                          ) : (
                            <span className="text-slate-400">#{idx + 1}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-blue-700 font-semibold">
                          {s.slNo || s.id}
                          {s.refNo && <span className="block text-[10px] text-slate-400 font-normal">Ref: {s.refNo}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap text-xs">
                          {fmtDate(s.orderDate)}
                          {s.dueDate && <span className="block text-[10px] text-slate-400">Due: {fmtDate(s.dueDate)}</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-slate-800 text-xs">{customer?.name || s.customerId}</p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            ID: {customer?.id || s.customerId} {customer?.gstin ? `· GSTIN: ${customer.gstin}` : ""}
                          </p>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span className={`inline-block px-1.5 py-0.5 text-[10px] font-bold rounded uppercase ${
                            s.paymentMethod === "credit" ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          }`}>
                            {s.paymentMethod}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-700 whitespace-nowrap text-xs">{fmtRs(taxable)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600 whitespace-nowrap text-xs">
                          {fmtRs(gstSum)}
                          <span className="block text-[9px] text-slate-400">{(s.stateType ?? "intrastate") === "intrastate" ? "Intra" : "Inter"}</span>
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-slate-900 text-right whitespace-nowrap text-xs">{fmtRs(s.total)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-500 whitespace-nowrap text-xs">{fmtRs(s.advance)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap text-xs">
                          <span className={s.balanceDue > 0 ? "text-amber-600 font-bold" : "text-emerald-600"}>{fmtRs(s.balanceDue)}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              id={`btn-edit-sale-${s.id}`}
                              onClick={() => onEdit(s)}
                              className="px-2 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded border border-indigo-200 transition"
                              title="Edit Invoice"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              id={`btn-view-sale-${s.id}`}
                              onClick={() => onViewInvoice(s)}
                              className="px-2 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition"
                              title="View ERP Mode"
                            >
                              👁️ View
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
    </div>
  );
}

// ── Sale Form (Create & Edit Mode with Fast Keyboard Billing & Estimate Support) ──
function SaleForm({
  initialInvoice,
  onSaved,
  onCancel,
  onGenerateEstimate,
}: {
  initialInvoice?: SaleInvoice | null;
  onSaved: (inv: SaleInvoice, shouldPrint?: boolean) => void;
  onCancel: () => void;
  onGenerateEstimate: (inv: SaleInvoice) => void;
}) {
  const { user } = useAuth();
  const customers = loadCustomers();
  const products  = loadProducts();

  const isEdit = !!initialInvoice;

  // Header State
  const [slNo,          setSlNo]          = useState(() => initialInvoice?.slNo || nextSaleSlNo());
  const [refNo,         setRefNo]         = useState(() => initialInvoice?.refNo || "");
  const [orderDate,     setOrderDate]     = useState(() => initialInvoice?.orderDate || todayIso());
  const [creditDays,    setCreditDays]    = useState<number>(() => initialInvoice?.creditDays ?? 0);
  const [dueDate,       setDueDate]       = useState(() => initialInvoice?.dueDate || todayIso());
  const [salesman,      setSalesman]      = useState(() => initialInvoice?.salesman || user?.name || "Admin");
  const [paymentMethod, setPaymentMethod] = useState<SaleInvoice["paymentMethod"]>(() => initialInvoice?.paymentMethod || "credit");
  const [stateType,     setStateType]     = useState<StateType>(() => initialInvoice?.stateType || "intrastate");
  const [narration,     setNarration]     = useState(() => initialInvoice?.narration || "");

  // Customer State with Auto-Suggestion
  const initialCust = initialInvoice ? customers.find(c => c.id === initialInvoice.customerId) : null;
  const [custSearch,      setCustSearch]      = useState(() => initialCust?.name || "");
  const [customerId,      setCustomerId]      = useState(() => initialCust?.id || initialInvoice?.customerId || newPartyId("customer"));
  const [customerPhone,   setCustomerPhone]   = useState(() => initialCust?.phone || "");
  const [customerAddress, setCustomerAddress] = useState(() => initialCust?.address || "");
  const [customerGstin,   setCustomerGstin]   = useState(() => initialCust?.gstin || "");
  const [custBalance,     setCustBalance]     = useState<number>(() => initialCust?.outstandingBalance || 0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isExistingCust,  setIsExistingCust]  = useState<boolean>(() => !!initialCust);

  // Line items state
  const [items, setItems] = useState<LineItem[]>(() => {
    if (initialInvoice && initialInvoice.items.length > 0) {
      return initialInvoice.items.map(i => ({ ...i, _key: Math.random() }));
    }
    return [blankItem()];
  });
  const [advance, setAdvance] = useState<number>(() => initialInvoice?.advance ?? 0);
  const [errors, setErrors] = useState<string[]>([]);
  const [lineErrors, setLineErrors] = useState<Record<number, string>>({});

  // ── Keyboard Navigation Refs ──
  const productSelectRefs = useRef<(HTMLSelectElement | null)[]>([]);
  const qtyRefs           = useRef<(HTMLInputElement | null)[]>([]);
  const priceRefs         = useRef<(HTMLInputElement | null)[]>([]);
  const discountRefs      = useRef<(HTMLInputElement | null)[]>([]);
  const advanceRef        = useRef<HTMLInputElement | null>(null);
  const saveBtnRef        = useRef<HTMLButtonElement | null>(null);
  const dropdownRef       = useRef<HTMLDivElement>(null);
  const productMap        = Object.fromEntries(products.map(p => [p.id, p]));

  // In-stock products on TOP (sorted by available qty descending)
  const inStockProducts = products
    .filter((p) => {
      const oldQty = initialInvoice?.items.find(i => i.productId === p.id)?.qty ?? 0;
      return (p.stockQty + (isEdit ? oldQty : 0)) > 0;
    })
    .sort((a, b) => b.stockQty - a.stockQty);

  // Out-of-stock products at the BOTTOM
  const outOfStockProducts = products
    .filter((p) => {
      const oldQty = initialInvoice?.items.find(i => i.productId === p.id)?.qty ?? 0;
      return (p.stockQty + (isEdit ? oldQty : 0)) <= 0;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Auto-close suggestion dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter auto-suggestions
  const filteredSuggestions = customers.filter(c => {
    if (!custSearch.trim()) return true;
    const q = custSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.gstin && c.gstin.toLowerCase().includes(q))
    );
  });

  function selectCustomerSuggestion(c: Party) {
    setCustSearch(c.name);
    setCustomerId(c.id);
    setCustomerPhone(c.phone || "");
    setCustomerAddress(c.address || "");
    setCustomerGstin(c.gstin || "");
    setCustBalance(c.outstandingBalance || 0);
    setIsExistingCust(true);
    setShowSuggestions(false);
    // Focus first product select
    setTimeout(() => {
      productSelectRefs.current[0]?.focus();
    }, 50);
  }

  function handleCustSearchChange(val: string) {
    setCustSearch(val);
    setShowSuggestions(true);
    const exact = customers.find(c => c.name.toLowerCase() === val.trim().toLowerCase());
    if (exact) {
      setCustomerId(exact.id);
      setCustomerPhone(exact.phone || "");
      setCustomerAddress(exact.address || "");
      setCustomerGstin(exact.gstin || "");
      setCustBalance(exact.outstandingBalance || 0);
      setIsExistingCust(true);
    } else {
      setIsExistingCust(false);
      if (!customerId || isExistingCust) {
        setCustomerId(newPartyId("customer"));
        setCustBalance(0);
      }
    }
  }

  function handleDateOrCreditDaysChange(newDate: string, newDays: number) {
    setOrderDate(newDate);
    setCreditDays(newDays);
    setDueDate(computeDueDate(newDate, newDays));
  }

  function recomputeItem(item: LineItem, st: StateType): LineItem {
    const prod = productMap[item.productId];
    const gstRate = prod?.gstRate ?? 0;
    const taxable = round2(Math.max(0, item.qty * item.unitPrice - item.discount));
    const { cgst, sgst, igst } = computeItemGst(taxable, gstRate, st);
    return { ...item, amount: taxable, cgst, sgst, igst };
  }

  function updateItem(idx: number, patch: Partial<LineItem>) {
    setItems(prev => {
      const next = [...prev];
      next[idx] = recomputeItem({ ...next[idx], ...patch }, stateType);
      return next;
    });
    if (lineErrors[idx]) setLineErrors(prev => ({ ...prev, [idx]: "" }));
  }

  function setProduct(idx: number, productId: string) {
    const p = productMap[productId];
    updateItem(idx, { productId, unitPrice: p?.unitPrice ?? 0 });
  }

  function handleStateTypeChange(st: StateType) {
    setStateType(st);
    setItems(prev => prev.map(item => recomputeItem(item, st)));
  }

  function addRowAndFocus() {
    setItems(prev => [...prev, blankItem()]);
    setTimeout(() => {
      productSelectRefs.current[items.length]?.focus();
    }, 60);
  }

  function removeRow(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Keyboard-First Row Enter Handling ──
  function handleLineItemKeyDown(
    e: React.KeyboardEvent,
    idx: number,
    field: "product" | "qty" | "price" | "discount"
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
      const currentItem = items[idx];

      if (field === "product") {
        if (currentItem.productId) {
          qtyRefs.current[idx]?.focus();
          qtyRefs.current[idx]?.select();
        } else {
          // If empty and hit enter, jump to payment / save
          if (isCashSale) {
            saveBtnRef.current?.focus();
          } else {
            advanceRef.current?.focus();
            advanceRef.current?.select();
          }
        }
        return;
      }

      if (field === "qty") {
        priceRefs.current[idx]?.focus();
        priceRefs.current[idx]?.select();
        return;
      }

      if (field === "price") {
        discountRefs.current[idx]?.focus();
        discountRefs.current[idx]?.select();
        return;
      }

      if (field === "discount") {
        if (currentItem.productId) {
          // If at the last row, automatically append a new row and focus it!
          if (idx === items.length - 1) {
            setItems(prev => [...prev, blankItem()]);
            setTimeout(() => {
              productSelectRefs.current[idx + 1]?.focus();
            }, 60);
          } else {
            productSelectRefs.current[idx + 1]?.focus();
          }
        } else {
          if (isCashSale) {
            saveBtnRef.current?.focus();
          } else {
            advanceRef.current?.focus();
            advanceRef.current?.select();
          }
        }
      }
    }
  }

  const taxableTotal = round2(items.reduce((s, i) => s + i.amount, 0));
  const cgstTotal    = round2(items.reduce((s, i) => s + i.cgst,   0));
  const sgstTotal    = round2(items.reduce((s, i) => s + i.sgst,   0));
  const igstTotal    = round2(items.reduce((s, i) => s + i.igst,   0));
  const grandTotal   = round2(taxableTotal + cgstTotal + sgstTotal + igstTotal);

  const isCashSale = paymentMethod !== "credit";
  const effectiveAdvance = isCashSale ? grandTotal : advance;
  const balanceDue = isCashSale ? 0 : round2(Math.max(0, grandTotal - advance));

  function validate(): boolean {
    const errs: string[] = [];
    const le: Record<number, string> = {};
    if (!custSearch.trim()) errs.push("Customer name is required.");
    if (items.length === 0) errs.push("Add at least one line item.");
    items.forEach((item, idx) => {
      if (!item.productId) { le[idx] = "Select a product"; return; }
      if (item.qty <= 0)   { le[idx] = "Qty must be > 0";  return; }
      const prod = productMap[item.productId];
      const oldQty = initialInvoice?.items.find(i => i.productId === item.productId)?.qty ?? 0;
      const effectiveStock = (prod?.stockQty ?? 0) + (isEdit ? oldQty : 0);
      if (prod && item.qty > effectiveStock) {
        le[idx] = `Insufficient stock for "${prod.name}" (available: ${effectiveStock})`;
      }
    });
    setErrors(errs);
    setLineErrors(le);
    return errs.length === 0 && Object.keys(le).length === 0;
  }

  function handleSave() {
    if (!validate()) return;

    const savedCustomer = ensureParty({
      id: customerId,
      name: custSearch.trim(),
      phone: customerPhone.trim(),
      address: customerAddress.trim(),
      gstin: customerGstin.trim().toUpperCase(),
      type: "customer",
    });

    const finalSlNo = String(slNo || "").trim() || nextSaleSlNo();
    const id = initialInvoice ? initialInvoice.id : finalSlNo;
    const invoice: SaleInvoice = {
      id,
      slNo: finalSlNo,
      refNo,
      orderDate,
      dueDate,
      creditDays,
      salesman,
      narration,
      customerId: savedCustomer.id,
      paymentMethod,
      stateType,
      items: items.map(({ _key: _k, ...i }) => i),
      total: grandTotal,
      advance: effectiveAdvance,
      balanceDue,
    };

    if (isEdit && initialInvoice) {
      updateSaleInvoice(initialInvoice, invoice);
      logActivity("edit", "sale", id);
    } else {
      const all = get<SaleInvoice[]>(SALES_KEY) ?? [];
      set<SaleInvoice[]>(SALES_KEY, [invoice, ...all]);
      applyInvoiceItems(invoice.items, -1, "sale", id, savedCustomer.id, balanceDue);
      logActivity("create", "sale", id);
    }

    onSaved(invoice, true);
  }

  // ── Generate Estimate Invoice (No Database Save, No Stock Deduction) ──
  function handleGenerateEstimate() {
    if (!validate()) return;
    const estSlNo = "EST-" + String(slNo || "").replace(/GJP-?/i, "").padStart(3, "0");
    const estInvoice: SaleInvoice = {
      id: "EST-" + Date.now().toString(36).toUpperCase(),
      slNo: estSlNo,
      refNo: refNo ? `EST / ${refNo}` : "ESTIMATE",
      orderDate,
      dueDate,
      creditDays,
      salesman,
      narration: narration ? `[ESTIMATE] ${narration}` : "ESTIMATE / QUOTATION - NON-TAXABLE (NO DB SAVE)",
      customerId: customerId || "GJP001",
      paymentMethod,
      stateType,
      items: items.map(({ _key: _k, ...i }) => i),
      total: grandTotal,
      advance: effectiveAdvance,
      balanceDue,
    };
    onGenerateEstimate(estInvoice);
  }

  // Global form hotkeys (Ctrl+S, Alt+E, Alt+N)
  useEffect(() => {
    function handleGlobalKeys(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      } else if (e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      } else if (e.altKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        handleGenerateEstimate();
      } else if (e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        addRowAndFocus();
      }
    }
    window.addEventListener("keydown", handleGlobalKeys);
    return () => window.removeEventListener("keydown", handleGlobalKeys);
  });

  const inputCls = "w-full px-2.5 py-1.5 rounded border border-[#bcaaa4] bg-[#fff9c4] text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="text-slate-500 hover:text-slate-700 text-sm flex items-center gap-1 transition cursor-pointer">
            ← Back to List
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              {isEdit ? `Edit Sale Invoice (${slNo || initialInvoice?.id})` : (paymentMethod === "credit" ? "Credit Sales Invoice" : "Cash Sales Invoice")} - Data Entry
            </h2>
            <p className="text-xs text-slate-500">
              {isEdit ? "Update invoice items, customer details and recalculate stock & balance" : "Type customer name for auto-suggestions · Press Enter on items to auto-add new rows"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Estimate Button */}
          <button
            type="button"
            onClick={handleGenerateEstimate}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition shadow-2xs active:scale-95 cursor-pointer"
            title="Generate Quotation / Estimate without saving to database (Alt + E)"
          >
            <span>📄</span> Estimate Invoice <span className="text-[10px] bg-amber-200 px-1 py-0.2 rounded font-mono">Alt+E</span>
          </button>

          <label className="text-xs font-semibold text-slate-600 ml-1">Mode:</label>
          <div className="flex bg-slate-200 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setPaymentMethod("credit")}
              className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${paymentMethod === "credit" ? "bg-purple-600 text-white shadow-xs" : "text-slate-700 hover:text-slate-900"}`}
            >
              Credit
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("cash")}
              className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${paymentMethod === "cash" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-700 hover:text-slate-900"}`}
            >
              Cash
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("upi")}
              className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${paymentMethod === "upi" ? "bg-blue-600 text-white shadow-xs" : "text-slate-700 hover:text-slate-900"}`}
            >
              UPI
            </button>
          </div>
        </div>
      </div>

      {/* Error alert banner */}
      {errors.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-800 p-3.5 rounded-r-lg text-xs space-y-1">
          <p className="font-bold">Please correct the following errors:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {errors.map((e, idx) => <li key={idx}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* ── ERP Form Header ── */}
      <div className="bg-[#fffde7] border border-[#d7ccc8] rounded-xl p-5 shadow-xs space-y-4">
        {/* Row 1: SL No, Date, Credit Days, Due Date, Ref No, State Type */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold text-slate-700">SL No / Sales ID :</label>
              <span className="text-[10px] text-blue-700 bg-blue-50 px-1 py-0.2 rounded font-bold border border-blue-200">
                ⚡ Auto
              </span>
            </div>
            <input
              type="text"
              value={slNo}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setSlNo(e.target.value)}
              className={`${inputCls} font-mono font-bold text-blue-900`}
              placeholder="GJP-001"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Date :</label>
            <input
              type="date"
              value={orderDate}
              onChange={(e) => handleDateOrCreditDaysChange(e.target.value, creditDays)}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Credit Days :</label>
            <input
              type="number"
              min={0}
              value={creditDays}
              onChange={(e) => handleDateOrCreditDaysChange(orderDate, parseInt(e.target.value) || 0)}
              className={`${inputCls} text-center font-bold`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Due Date :</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Ref No :</label>
            <input
              type="text"
              value={refNo}
              onChange={(e) => setRefNo(e.target.value)}
              className={inputCls}
              placeholder="PO / Ref No"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">State Type :</label>
            <select
              value={stateType}
              onChange={(e) => handleStateTypeChange(e.target.value as StateType)}
              className={inputCls}
            >
              <option value="intrastate">Intrastate (CGST+SGST)</option>
              <option value="interstate">Interstate (IGST)</option>
            </select>
          </div>
        </div>

        {/* Row 2: Customer Name with Live Auto-Suggestions + Customer ID + GSTIN */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-[#e0d6cb]">
          <div className="sm:col-span-2 relative" ref={dropdownRef}>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold text-slate-700">
                Customer Name / Auto-Search *
              </label>
              {isExistingCust ? (
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                  ✓ Existing Customer
                </span>
              ) : custSearch.trim() ? (
                <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded animate-pulse">
                  ✨ New Customer (Auto-save)
                </span>
              ) : null}
            </div>

            <div className="relative">
              <input
                id="sale-cust-search"
                type="text"
                value={custSearch}
                onFocus={() => setShowSuggestions(true)}
                onChange={(e) => handleCustSearchChange(e.target.value)}
                placeholder="Type customer name or phone to auto-suggest / add new…"
                className={`${inputCls} pr-8`}
                autoComplete="off"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">
                👥
              </span>
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-300 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-slate-100">
                {filteredSuggestions.length > 0 ? (
                  filteredSuggestions.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => selectCustomerSuggestion(c)}
                      className="p-2.5 hover:bg-blue-50 cursor-pointer transition flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                          <span>{c.name}</span>
                          <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1 rounded">
                            {c.id}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                          {c.phone && <span>📞 {c.phone}</span>}
                          {c.gstin && <span className="font-mono">GST: {c.gstin}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] font-semibold text-amber-700">
                          Due: {fmtRs(c.outstandingBalance || 0)}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-xs text-slate-500 text-center">
                    <p className="font-medium text-slate-700">"{custSearch}" not in records.</p>
                    <p className="text-[11px] text-blue-600 mt-0.5">Will be automatically saved as a new customer with ID: <strong>{customerId}</strong></p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold text-slate-700">
                Customer ID :
              </label>
              <span className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded font-bold border border-blue-200">
                ⚡ Auto
              </span>
            </div>
            <input
              type="text"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value.toUpperCase())}
              className={`${inputCls} font-mono font-bold text-blue-800 bg-slate-50/80`}
              placeholder="GJP001"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Customer Phone / Mobile :
            </label>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className={inputCls}
              placeholder="e.g. +91 98765 43210"
            />
          </div>
        </div>

        {/* Row 3: Address & GSTIN & Current Balance */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Customer Address :
            </label>
            <input
              type="text"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              className={inputCls}
              placeholder="Shop / Building, Street, City, State, Pincode"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Customer GSTIN :
            </label>
            <input
              type="text"
              value={customerGstin}
              onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
              className={`${inputCls} font-mono`}
              placeholder="e.g. 27AAPFU0939F1ZV"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Current Ledger Balance :
            </label>
            <div className="bg-[#fff9c4] border border-[#bcaaa4] px-2.5 py-1.5 text-xs font-bold text-amber-700 rounded-xs min-h-[30px] flex items-center">
              {fmtRs(custBalance)}
            </div>
          </div>
        </div>

        {/* Row 4: Salesman & Narration */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-[#e0d6cb]">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Salesman / Handled By :
            </label>
            <input
              type="text"
              value={salesman}
              onChange={(e) => setSalesman(e.target.value)}
              className={inputCls}
              placeholder="Salesman"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Narration / Notes :
            </label>
            <input
              type="text"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              className={inputCls}
              placeholder="Add payment terms, delivery address note, or remarks…"
            />
          </div>
        </div>
      </div>

      {/* ── Line Items Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Item Details & GST Breakdown</h3>
            <span className="text-[11px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-medium">
              ⌨️ Hit <strong>Enter</strong> to auto-add next row
            </span>
          </div>
          <button
            type="button"
            onClick={addRowAndFocus}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition cursor-pointer"
          >
            + Add Row (Alt+N)
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[900px]">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-semibold">
                <th className="text-left px-3 py-2.5">Product</th>
                <th className="text-right px-2 py-2.5">Avail.</th>
                <th className="text-right px-2 py-2.5">Qty</th>
                <th className="text-right px-2 py-2.5">Price</th>
                <th className="text-right px-2 py-2.5">Disc.</th>
                <th className="text-right px-2 py-2.5">Taxable</th>
                <th className="text-right px-2 py-2.5">CGST</th>
                <th className="text-right px-2 py-2.5">SGST</th>
                <th className="text-right px-2 py-2.5">IGST</th>
                <th className="text-right px-2 py-2.5">Line Total</th>
                <th className="w-7"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, idx) => {
                const prod = productMap[item.productId];
                const err  = lineErrors[idx];
                return (
                  <tr key={item._key} className={err ? "bg-red-50" : "hover:bg-slate-50/50"}>
                    <td className="px-3 py-2">
                      <select
                        ref={el => { productSelectRefs.current[idx] = el; }}
                        value={item.productId}
                        onChange={e => {
                          setProduct(idx, e.target.value);
                          if (e.target.value) {
                            setTimeout(() => {
                              qtyRefs.current[idx]?.focus();
                              qtyRefs.current[idx]?.select();
                            }, 50);
                          }
                        }}
                        onKeyDown={e => handleLineItemKeyDown(e, idx, "product")}
                        className={`w-full px-2 py-1.5 rounded border text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 ${err ? "border-red-400" : "border-slate-200"}`}
                      >
                        <option value="">— Select Product —</option>

                        {/* Available in-stock products on TOP */}
                        {inStockProducts.length > 0 && (
                          <optgroup label="⚡ In-Stock Products (Available on Top)">
                            {inStockProducts.map(p => {
                              const oldQty = initialInvoice?.items.find(i => i.productId === p.id)?.qty ?? 0;
                              const effectiveStock = p.stockQty + (isEdit ? oldQty : 0);
                              return (
                                <option key={p.id} value={p.id} className="font-semibold text-slate-900">
                                  🟢 {p.name} ({p.id}) — Avail: {effectiveStock} {p.unit}
                                </option>
                              );
                            })}
                          </optgroup>
                        )}

                        {/* Out-of-stock products at the BOTTOM */}
                        {outOfStockProducts.length > 0 && (
                          <optgroup label="⚠️ Out of Stock (0 Qty Available)">
                            {outOfStockProducts.map(p => (
                              <option
                                key={p.id}
                                value={p.id}
                                className="text-slate-400 italic bg-slate-50 opacity-60"
                                style={{ color: "#94a3b8", backgroundColor: "#f8fafc" }}
                              >
                                ⚪ {p.name} ({p.id}) — 0 {p.unit} (Out of Stock)
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      {err && <p className="text-[10px] text-red-600 mt-0.5">{err}</p>}
                    </td>
                    <td className="px-2 py-2 text-right text-slate-500 whitespace-nowrap">
                      {prod ? <span className={prod.stockQty < prod.reorderLevel ? "text-red-600 font-bold" : ""}>{prod.stockQty} {prod.unit}</span> : "—"}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        ref={el => { qtyRefs.current[idx] = el; }}
                        type="number"
                        min={0}
                        step={0.001}
                        value={item.qty || ""}
                        onFocus={(e) => e.target.select()}
                        onChange={e => updateItem(idx, { qty: parseFloat(e.target.value) || 0 })}
                        onKeyDown={e => handleLineItemKeyDown(e, idx, "qty")}
                        placeholder="1"
                        className="w-full px-2 py-1 rounded border border-slate-200 text-xs text-right font-bold focus:ring-2 focus:ring-blue-400 focus:outline-none"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        ref={el => { priceRefs.current[idx] = el; }}
                        type="number"
                        min={0}
                        step={0.01}
                        value={item.unitPrice || ""}
                        onFocus={(e) => e.target.select()}
                        onChange={e => updateItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
                        onKeyDown={e => handleLineItemKeyDown(e, idx, "price")}
                        placeholder="0.00"
                        className="w-full px-2 py-1 rounded border border-slate-200 text-xs text-right font-medium focus:ring-2 focus:ring-blue-400 focus:outline-none"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        ref={el => { discountRefs.current[idx] = el; }}
                        type="number"
                        min={0}
                        step={0.01}
                        value={item.discount || ""}
                        onFocus={(e) => e.target.select()}
                        onChange={e => updateItem(idx, { discount: parseFloat(e.target.value) || 0 })}
                        onKeyDown={e => handleLineItemKeyDown(e, idx, "discount")}
                        placeholder="0.00"
                        className="w-full px-2 py-1 rounded border border-slate-200 text-xs text-right font-medium focus:ring-2 focus:ring-blue-400 focus:outline-none"
                      />
                    </td>
                    <td className="px-2 py-2 text-right text-slate-800 font-semibold">{fmtRs(item.amount)}</td>
                    <td className="px-2 py-2 text-right text-slate-600 text-[11px]">{item.cgst > 0 ? fmtRs(item.cgst) : "—"}</td>
                    <td className="px-2 py-2 text-right text-slate-600 text-[11px]">{item.sgst > 0 ? fmtRs(item.sgst) : "—"}</td>
                    <td className="px-2 py-2 text-right text-slate-600 text-[11px]">{item.igst > 0 ? fmtRs(item.igst) : "—"}</td>
                    <td className="px-2 py-2 text-right font-bold text-slate-900">{fmtRs(lineTotal(item))}</td>
                    <td className="px-1 py-2 text-center">
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="w-5 h-5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center text-xs transition cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* GST Summary totals */}
        <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50">
          <div className="flex justify-end">
            <div className="w-72 space-y-1.5 text-xs">
              <TotalRow label="Taxable Amount" value={fmtRs(taxableTotal)} />
              {stateType === "intrastate" ? (
                <>
                  <TotalRow label="CGST" value={fmtRs(cgstTotal)} muted />
                  <TotalRow label="SGST" value={fmtRs(sgstTotal)} muted />
                </>
              ) : (
                <TotalRow label="IGST" value={fmtRs(igstTotal)} muted />
              )}
              <div className="border-t border-slate-200 pt-1.5">
                <TotalRow label="Invoice Total" value={fmtRs(grandTotal)} bold />
              </div>
              {isCashSale ? (
                <>
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1 text-slate-700 font-medium">
                      <span>💵</span>
                      <span>Cash Received:</span>
                    </div>
                    <span className="font-bold text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {fmtRs(grandTotal)} (Paid in Full)
                    </span>
                  </div>
                  <div className="border-t border-slate-200 pt-1.5">
                    <div className="flex items-center justify-between font-bold text-sm">
                      <span className="text-slate-800">Balance Due:</span>
                      <div className="text-right">
                        <span className="text-base text-emerald-600 font-bold">₹0.00</span>
                        <span className="block text-[10px] font-semibold text-emerald-700">✓ Received Cash (Zero Due)</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between pt-1">
                    <label htmlFor="sale-advance" className="text-slate-600 font-medium">Advance / Partial Paid</label>
                    <input
                      ref={advanceRef}
                      id="sale-advance"
                      type="number"
                      min={0}
                      step={0.01}
                      value={advance || ""}
                      onFocus={(e) => e.target.select()}
                      onChange={e => setAdvance(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-28 px-2 py-1 rounded border border-slate-200 text-xs text-right font-semibold text-emerald-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="border-t border-slate-200 pt-1.5">
                    <div className="flex items-center justify-between font-bold text-sm">
                      <span className="text-slate-800">Balance Due:</span>
                      <span className={`text-base ${balanceDue > 0 ? "text-amber-600 font-bold" : "text-emerald-600"}`}>
                        {fmtRs(balanceDue)}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleGenerateEstimate}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg shadow-2xs transition active:scale-95 cursor-pointer"
            title="Generate Estimate / Quotation without saving to database (Alt + E)"
          >
            <span>📄</span> Estimate Invoice (No DB Save) <span className="text-[10px] bg-amber-200 px-1.5 py-0.2 rounded font-mono">Alt+E</span>
          </button>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            ⚡ <strong>Enter:</strong> Add Row · <strong>Tab:</strong> Navigate · <strong>Ctrl+S:</strong> Save & Print
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            ref={saveBtnRef}
            id="btn-save-sale"
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 px-6 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition active:scale-95 cursor-pointer focus:ring-2 focus:ring-blue-400 focus:outline-none"
          >
            <span>💾</span> {isEdit ? "Update Invoice & Print" : "Save & Print Invoice"} <span className="text-[10px] bg-blue-700 px-1.5 py-0.2 rounded font-mono">Ctrl+S</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────
function TotalRow({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "font-bold text-slate-900 text-sm" : ""} ${muted ? "text-slate-500" : "text-slate-700"}`}>
      <span>{label}</span>
      <span className="tabular-nums font-mono">{value}</span>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: "blue" | "green" | "amber" | "purple" }) {
  const cls = { blue: "bg-blue-50 border-blue-200 text-blue-700", green: "bg-emerald-50 border-emerald-200 text-emerald-700", amber: "bg-amber-50 border-amber-200 text-amber-700", purple: "bg-purple-50 border-purple-200 text-purple-700" }[color];
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 ${cls}`}>
      <span className="text-xl">{icon}</span>
      <div><p className="text-base font-bold leading-tight">{value}</p><p className="text-xs mt-0.5 opacity-80 font-medium">{label}</p></div>
    </div>
  );
}
