import { useState, useMemo, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import type { Party, SaleInvoice, Product } from "../types";
import { get } from "../lib/storage";
import { PARTIES_KEY, SALES_KEY, PRODUCTS_KEY } from "../lib/initStore";
import { dateInRange, todayStr, monthStart, round2 } from "../lib/gstUtils";
import {
  exportCustomerStatementExcel,
  exportAllCustomersRegisterExcel,
} from "../lib/exportUtils";
import InvoiceViewModal from "../components/InvoiceViewModal";
import CustomerStatementModal from "../components/CustomerStatementModal";

function fmtRs(n: number) {
  return "₹" + (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function CustomerRegisterPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [balanceFilter, setBalanceFilter] = useState<"all" | "due" | "settled">("all");
  const [fromDate, setFromDate] = useState(monthStart());
  const [toDate, setToDate] = useState(todayStr());
  const [useDateFilter, setUseDateFilter] = useState(false);
  const [expandedCustomerIds, setExpandedCustomerIds] = useState<Set<string>>(new Set());
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<string>>(new Set());
  const [viewInvoice, setViewInvoice] = useState<SaleInvoice | null>(null);
  const [statementModalData, setStatementModalData] = useState<{ customer: Party; invoices: SaleInvoice[] } | null>(null);

  // Load baseline data from localStorage
  const { customers, sales, products, productMap } = useMemo(() => {
    const allParties = get<Party[]>(PARTIES_KEY) ?? [];
    const allSales = get<SaleInvoice[]>(SALES_KEY) ?? [];
    const allProducts = get<Product[]>(PRODUCTS_KEY) ?? [];

    const custList = allParties.filter((p) => p.type === "customer");
    const prodMap = Object.fromEntries(allProducts.map((p) => [p.id, p]));

    return {
      customers: custList,
      sales: allSales,
      products: allProducts,
      productMap: prodMap,
    };
  }, []);

  // Compute customer ledger metrics
  const customerLedgerList = useMemo(() => {
    return customers
      .map((cust) => {
        // Find all sales invoices for this customer (optionally filtered by date)
        const customerSales = sales
          .filter((s) => s.customerId === cust.id)
          .filter((s) => (!useDateFilter ? true : dateInRange(s.orderDate, fromDate, toDate)))
          .sort((a, b) => {
            const dateComp = b.orderDate.localeCompare(a.orderDate);
            if (dateComp !== 0) return dateComp;
            return b.id.localeCompare(a.id);
          });

        const totalInvoices = customerSales.length;
        const totalBilled = round2(customerSales.reduce((s, inv) => s + (inv.total || 0), 0));
        const totalTaxable = round2(
          customerSales.reduce((s, inv) => s + inv.items.reduce((sum, i) => sum + (i.amount || 0), 0), 0)
        );
        const totalAdvance = round2(customerSales.reduce((s, inv) => s + (inv.advance || 0), 0));
        const totalDue = round2(customerSales.reduce((s, inv) => s + (inv.balanceDue || 0), 0));

        return {
          customer: cust,
          invoices: customerSales,
          totalInvoices,
          totalBilled,
          totalTaxable,
          totalAdvance,
          totalDue,
        };
      })
      .sort((a, b) => {
        // LIFO order: recently registered customer (highest numeric ID) at TOP
        const numA = parseInt(a.customer.id.replace(/\D/g, ""), 10) || 0;
        const numB = parseInt(b.customer.id.replace(/\D/g, ""), 10) || 0;
        if (numA !== numB) return numB - numA;
        return b.customer.id.localeCompare(a.customer.id);
      });
  }, [customers, sales, useDateFilter, fromDate, toDate]);

  // Filtered customer register list
  const filteredLedger = customerLedgerList.filter(({ customer, invoices }) => {
    if (balanceFilter === "due" && customer.outstandingBalance <= 0) return false;
    if (balanceFilter === "settled" && customer.outstandingBalance > 0) return false;

    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const matchesCustomer =
      customer.name.toLowerCase().includes(q) ||
      customer.id.toLowerCase().includes(q) ||
      (customer.phone && customer.phone.includes(q)) ||
      (customer.gstin && customer.gstin.toLowerCase().includes(q)) ||
      (customer.address && customer.address.toLowerCase().includes(q));

    const matchesInvoice = invoices.some(
      (inv) =>
        (inv.slNo && String(inv.slNo).toLowerCase().includes(q)) ||
        inv.id.toLowerCase().includes(q) ||
        (inv.refNo && inv.refNo.toLowerCase().includes(q))
    );

    return matchesCustomer || matchesInvoice;
  });

  // Overall register totals
  const overallTotals = useMemo(() => {
    const totalCustomers = customers.length;
    const totalInvoices = customerLedgerList.reduce((s, c) => s + c.totalInvoices, 0);
    const totalRevenue = round2(customerLedgerList.reduce((s, c) => s + c.totalBilled, 0));
    const totalReceived = round2(customerLedgerList.reduce((s, c) => s + c.totalAdvance, 0));
    const totalReceivable = round2(customers.reduce((s, c) => s + (c.outstandingBalance || 0), 0));

    return {
      totalCustomers,
      totalInvoices,
      totalRevenue,
      totalReceived,
      totalReceivable,
    };
  }, [customers, customerLedgerList]);

  // Toggle Customer Ledger expand/collapse
  function toggleCustomerExpand(id: string) {
    setExpandedCustomerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Toggle Invoice Line-Items expand/collapse
  function toggleInvoiceExpand(id: string) {
    setExpandedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Expand all / Collapse all
  function expandAll() {
    setExpandedCustomerIds(new Set(customerLedgerList.map((c) => c.customer.id)));
  }

  function collapseAll() {
    setExpandedCustomerIds(new Set());
  }

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-800">Customer Register & Sales Invoices Ledger</h2>
            <span className="bg-blue-100 text-blue-800 text-[11px] font-bold px-2 py-0.5 rounded-full border border-blue-200">
              {customers.length} Registered
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Complete customer master profiles with itemized sales invoices history, GST breakdowns, and balances
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => exportAllCustomersRegisterExcel(customers, sales, productMap)}
            className="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg shadow-2xs transition flex items-center gap-1.5"
            title="Export all customers sales ledger to Excel / CSV"
          >
            <span>📊</span> Export All (Excel)
          </button>
          <button
            onClick={() => navigate("/customers")}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-2xs transition flex items-center gap-1.5"
          >
            <span>👥</span> Customer Master
          </button>
          <button
            onClick={() => navigate("/sales")}
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition flex items-center gap-1.5"
          >
            <span>+</span> Create Sale
          </button>
        </div>
      </div>

      {/* ── Executive Stat Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
        <div className="rounded-xl border bg-blue-50 border-blue-200 text-blue-800 p-3.5">
          <p className="text-xl font-bold leading-none">{overallTotals.totalCustomers}</p>
          <p className="text-xs mt-1 font-medium text-blue-600">Registered Customers</p>
        </div>
        <div className="rounded-xl border bg-slate-50 border-slate-200 text-slate-800 p-3.5">
          <p className="text-xl font-bold leading-none">{overallTotals.totalInvoices}</p>
          <p className="text-xs mt-1 font-medium text-slate-500">Total Sales Invoices</p>
        </div>
        <div className="rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-800 p-3.5">
          <p className="text-xl font-bold leading-none">{fmtRs(overallTotals.totalRevenue)}</p>
          <p className="text-xs mt-1 font-medium text-emerald-600">Total Invoiced Volume</p>
        </div>
        <div className="rounded-xl border bg-teal-50 border-teal-200 text-teal-800 p-3.5">
          <p className="text-xl font-bold leading-none">{fmtRs(overallTotals.totalReceived)}</p>
          <p className="text-xs mt-1 font-medium text-teal-600">Total Payments Received</p>
        </div>
        <div
          className={`rounded-xl border p-3.5 ${
            overallTotals.totalReceivable > 0
              ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}
        >
          <p className="text-xl font-bold leading-none">{fmtRs(overallTotals.totalReceivable)}</p>
          <p className="text-xs mt-1 font-medium opacity-80">Outstanding Balance Due</p>
        </div>
      </div>

      {/* ── Filter Toolbar ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">
            🔍
          </span>
          <input
            type="text"
            placeholder="Search register by Customer Name, ID, Phone, GSTIN, Address, Invoice SL No…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Balance status filter */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <button
            onClick={() => setBalanceFilter("all")}
            className={`px-2.5 py-1 rounded-lg font-semibold transition ${
              balanceFilter === "all"
                ? "bg-slate-800 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All Customers ({customers.length})
          </button>
          <button
            onClick={() => setBalanceFilter("due")}
            className={`px-2.5 py-1 rounded-lg font-semibold transition ${
              balanceFilter === "due"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
            }`}
          >
            ⏳ With Balance ({customers.filter((c) => c.outstandingBalance > 0).length})
          </button>
          <button
            onClick={() => setBalanceFilter("settled")}
            className={`px-2.5 py-1 rounded-lg font-semibold transition ${
              balanceFilter === "settled"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
            }`}
          >
            ✓ Settled ({customers.filter((c) => c.outstandingBalance <= 0).length})
          </button>
        </div>

        {/* Expand / Collapse buttons & Date toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setUseDateFilter((prev) => !prev)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition ${
              useDateFilter
                ? "bg-blue-50 border-blue-300 text-blue-700"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            📅 {useDateFilter ? "Date Filter Active" : "Filter Invoices by Date"}
          </button>
          <button
            onClick={expandedCustomerIds.size === filteredLedger.length ? collapseAll : expandAll}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
          >
            {expandedCustomerIds.size === filteredLedger.length ? "▲ Collapse All" : "▼ Expand All"}
          </button>
        </div>
      </div>

      {/* Date Range strip if active */}
      {useDateFilter && (
        <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-3 flex items-center gap-3 text-xs flex-wrap">
          <span className="font-bold text-blue-900">Invoice Date Filter:</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-2.5 py-1 border border-blue-200 rounded bg-white font-mono"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-2.5 py-1 border border-blue-200 rounded bg-white font-mono"
          />
          <span className="text-slate-500 ml-auto font-mono text-[11px]">
            {fromDate} → {toDate}
          </span>
        </div>
      )}

      {/* ── CUSTOMER REGISTER CARDS & SALES INVOICES LIST ── */}
      <div className="space-y-4">
        {filteredLedger.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 shadow-xs">
            <div className="text-4xl mb-2">👥</div>
            <p className="text-sm font-semibold text-slate-700">No Customers Found in Register</p>
            <p className="text-xs text-slate-400 mt-1">
              {search ? "Try adjusting your search criteria" : "Click 'Create Sale' to register sales & customers"}
            </p>
          </div>
        ) : (
          filteredLedger.map(({ customer, invoices, totalInvoices, totalBilled, totalTaxable, totalAdvance }, idx) => {
            const isTop = idx === 0;
            const isExpanded = expandedCustomerIds.has(customer.id);
            const hasDue = customer.outstandingBalance > 0;

            return (
              <div
                key={customer.id}
                className={`bg-white rounded-xl border transition-all duration-150 shadow-xs overflow-hidden ${
                  isTop ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-200"
                }`}
              >
                {/* ── Customer Register Header Summary Card ── */}
                <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-50/50 via-white to-white">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Customer Profile Info */}
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase font-mono shadow-2xs ${
                            isTop ? "bg-blue-600 text-white animate-pulse" : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {isTop ? "⚡ TOP #1" : `#${idx + 1}`}
                        </span>
                        <h3 className="font-bold text-slate-900 text-base">{customer.name}</h3>
                        <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                          {customer.id}
                        </span>
                        {customer.gstin && (
                          <span className="font-mono text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            GSTIN: {customer.gstin}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
                        <span>📞 {customer.phone || "No Phone Registered"}</span>
                        <span>📍 {customer.address || "No Address Registered"}</span>
                      </div>
                    </div>

                    {/* Middle: Financial Metrics Chips */}
                    <div className="flex items-center gap-3 flex-wrap bg-slate-50/80 p-2.5 rounded-lg border border-slate-200">
                      <div className="text-right px-2">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">Total Billed</span>
                        <span className="font-bold text-xs text-slate-800">{fmtRs(totalBilled)}</span>
                      </div>
                      <div className="w-px h-6 bg-slate-200"></div>
                      <div className="text-right px-2">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">Total Received</span>
                        <span className="font-bold text-xs text-emerald-700">{fmtRs(totalAdvance)}</span>
                      </div>
                      <div className="w-px h-6 bg-slate-200"></div>
                      <div className="text-right px-2">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">Current Due</span>
                        <span className={`font-bold text-xs ${hasDue ? "text-amber-600" : "text-emerald-600"}`}>
                          {hasDue ? fmtRs(customer.outstandingBalance) : "✓ Clear"}
                        </span>
                      </div>
                    </div>

                    {/* Right: Export & Expand / Drilldown Button */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => exportCustomerStatementExcel(customer, invoices, productMap)}
                        className="px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg shadow-2xs transition flex items-center gap-1"
                        title={`Export ${customer.name}'s Sales Invoices Statement to Excel (.xlsx)`}
                      >
                        <span>📊</span> Excel (.xlsx)
                      </button>
                      <button
                        onClick={() => setStatementModalData({ customer, invoices })}
                        className="px-2.5 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg shadow-2xs transition flex items-center gap-1"
                        title={`Open ${customer.name}'s Sales Statement PDF & Print Preview Popup`}
                      >
                        <span>🖨️</span> PDF
                      </button>
                      <button
                        onClick={() => toggleCustomerExpand(customer.id)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition flex items-center gap-1.5 ${
                          isExpanded
                            ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                            : "bg-white text-blue-700 border-blue-200 hover:bg-blue-50"
                        }`}
                      >
                        <span>🧾</span>
                        <span>{isExpanded ? "▲ Hide Invoices" : `▼ Invoices (${totalInvoices})`}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── EXPANDED SALES INVOICES REGISTER FOR THIS CUSTOMER ── */}
                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50/40 p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <span>📑</span> Sales Invoices Statement for {customer.name} ({invoices.length} Invoices)
                      </h4>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500">
                          Taxable: {fmtRs(totalTaxable)} · Gross: {fmtRs(totalBilled)}
                        </span>
                        <button
                          onClick={() => exportCustomerStatementExcel(customer, invoices, productMap)}
                          className="px-2 py-1 text-[11px] font-bold text-emerald-700 bg-white border border-emerald-200 hover:bg-emerald-50 rounded transition flex items-center gap-1"
                        >
                          <span>📊</span> Export Excel (.xlsx)
                        </button>
                        <button
                          onClick={() => setStatementModalData({ customer, invoices })}
                          className="px-2 py-1 text-[11px] font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded transition flex items-center gap-1"
                        >
                          <span>🖨️</span> Export PDF (Popup)
                        </button>
                      </div>
                    </div>

                    {invoices.length === 0 ? (
                      <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-slate-400">
                        <p className="text-xs font-medium">No sales invoices recorded for this customer yet</p>
                      </div>
                    ) : (
                      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-2xs">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 uppercase font-semibold">
                                <th className="text-left px-3 py-2.5">Invoice SL No</th>
                                <th className="text-left px-3 py-2.5">Date</th>
                                <th className="text-center px-2 py-2.5">Mode</th>
                                <th className="text-center px-2 py-2.5">State Type</th>
                                <th className="text-center px-2 py-2.5">Items</th>
                                <th className="text-right px-3 py-2.5">Taxable</th>
                                <th className="text-right px-3 py-2.5">GST</th>
                                <th className="text-right px-3 py-2.5">Grand Total</th>
                                <th className="text-right px-3 py-2.5">Paid / Received</th>
                                <th className="text-right px-3 py-2.5">Balance Due</th>
                                <th className="text-center px-3 py-2.5">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {invoices.map((inv) => {
                                const isInvoiceExpanded = expandedInvoiceIds.has(inv.id);
                                const invTaxable = round2(
                                  inv.items.reduce((s, i) => s + (i.amount || 0), 0)
                                );
                                const invGst = round2(
                                  inv.items.reduce((s, i) => s + (i.cgst || 0) + (i.sgst || 0) + (i.igst || 0), 0)
                                );
                                const isCredit = inv.paymentMethod === "credit";

                                return (
                                  <Fragment key={inv.id}>
                                    <tr className="hover:bg-slate-50/80 transition-colors">
                                      <td className="px-3 py-2.5 font-mono font-bold text-blue-800 whitespace-nowrap">
                                        {inv.slNo || inv.id}
                                        {inv.refNo && (
                                          <span className="block text-[10px] text-slate-400 font-normal">
                                            Ref: {inv.refNo}
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                                        {fmtDate(inv.orderDate)}
                                        {inv.dueDate && (
                                          <span className="block text-[10px] text-amber-700">
                                            Due: {fmtDate(inv.dueDate)}
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-2 py-2.5 text-center whitespace-nowrap">
                                        <span
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                            isCredit
                                              ? "bg-purple-100 text-purple-800 border border-purple-200"
                                              : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                          }`}
                                        >
                                          {inv.paymentMethod}
                                        </span>
                                      </td>
                                      <td className="px-2 py-2.5 text-center whitespace-nowrap">
                                        <span
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                            inv.stateType === "intrastate"
                                              ? "bg-blue-50 text-blue-700"
                                              : "bg-purple-50 text-purple-700"
                                          }`}
                                        >
                                          {inv.stateType === "intrastate" ? "Intra (CGST+SGST)" : "Inter (IGST)"}
                                        </span>
                                      </td>
                                      <td className="px-2 py-2.5 text-center text-slate-600 font-mono">
                                        {inv.items.length}
                                      </td>
                                      <td className="px-3 py-2.5 text-right text-slate-600 font-medium">
                                        {fmtRs(invTaxable)}
                                      </td>
                                      <td className="px-3 py-2.5 text-right text-slate-600 font-medium">
                                        {fmtRs(invGst)}
                                      </td>
                                      <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                                        {fmtRs(inv.total)}
                                      </td>
                                      <td className="px-3 py-2.5 text-right font-medium text-emerald-700">
                                        {fmtRs(inv.advance)}
                                      </td>
                                      <td className="px-3 py-2.5 text-right font-bold whitespace-nowrap">
                                        <span
                                          className={inv.balanceDue > 0 ? "text-amber-600" : "text-emerald-600"}
                                        >
                                          {inv.balanceDue > 0 ? fmtRs(inv.balanceDue) : "✓ Paid"}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                        <div className="flex items-center justify-center gap-1.5">
                                          <button
                                            onClick={() => toggleInvoiceExpand(inv.id)}
                                            className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition"
                                          >
                                            {isInvoiceExpanded ? "▲ Items" : "▼ Items"}
                                          </button>
                                          <button
                                            onClick={() => setViewInvoice(inv)}
                                            className="px-2 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition"
                                          >
                                            🔍 View
                                          </button>
                                        </div>
                                      </td>
                                    </tr>

                                    {/* Line Items Expansion for this Invoice */}
                                    {isInvoiceExpanded && (
                                      <tr className="bg-slate-50/90">
                                        <td colSpan={11} className="p-3">
                                          <div className="bg-white rounded-lg border border-slate-200 p-2.5 shadow-2xs space-y-1.5">
                                            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                                              Line Items Sold in {inv.slNo || inv.id}:
                                            </p>
                                            <table className="w-full text-[11px]">
                                              <thead>
                                                <tr className="bg-slate-100 text-slate-600 uppercase font-semibold border-b border-slate-200">
                                                  <th className="text-left px-2 py-1">Product</th>
                                                  <th className="text-left px-2 py-1">Category</th>
                                                  <th className="text-right px-2 py-1">Qty</th>
                                                  <th className="text-right px-2 py-1">Unit Price</th>
                                                  <th className="text-right px-2 py-1">Discount</th>
                                                  <th className="text-right px-2 py-1">Taxable</th>
                                                  <th className="text-right px-2 py-1">GST Split</th>
                                                  <th className="text-right px-2 py-1">Total</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-slate-100">
                                                {inv.items.map((item, liIdx) => {
                                                  const prod = productMap[item.productId];
                                                  const gstSum = (item.cgst || 0) + (item.sgst || 0) + (item.igst || 0);
                                                  return (
                                                    <tr key={liIdx}>
                                                      <td className="px-2 py-1 font-medium text-slate-800">
                                                        {prod?.name || item.productId}
                                                      </td>
                                                      <td className="px-2 py-1 text-slate-500">
                                                        {prod?.category || "General"}
                                                      </td>
                                                      <td className="px-2 py-1 text-right font-semibold text-slate-700">
                                                        {item.qty} {prod?.unit || "pcs"}
                                                      </td>
                                                      <td className="px-2 py-1 text-right text-slate-600">
                                                        {fmtRs(item.unitPrice)}
                                                      </td>
                                                      <td className="px-2 py-1 text-right text-slate-500">
                                                        {fmtRs(item.discount)}
                                                      </td>
                                                      <td className="px-2 py-1 text-right text-slate-700 font-medium">
                                                        {fmtRs(item.amount)}
                                                      </td>
                                                      <td className="px-2 py-1 text-right text-slate-500 font-mono">
                                                        {fmtRs(gstSum)}
                                                      </td>
                                                      <td className="px-2 py-1 text-right font-bold text-slate-900">
                                                        {fmtRs(item.amount + gstSum)}
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── View Invoice Modal ── */}
      {viewInvoice && (
        <InvoiceViewModal
          invoice={viewInvoice}
          type="sale"
          parties={customers}
          products={products}
          onClose={() => setViewInvoice(null)}
        />
      )}

      {/* ── Customer Statement PDF & Print Preview Modal Popup ── */}
      {statementModalData && (
        <CustomerStatementModal
          customer={statementModalData.customer}
          invoices={statementModalData.invoices}
          productMap={productMap}
          onClose={() => setStatementModalData(null)}
        />
      )}
    </div>
  );
}
