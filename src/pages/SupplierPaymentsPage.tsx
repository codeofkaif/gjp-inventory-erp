import { useState } from "react";
import type { Party, PurchaseInvoice } from "../types";
import { get } from "../lib/storage";
import { PARTIES_KEY, PURCHASES_KEY } from "../lib/initStore";
import { recordPayment } from "../lib/stockOps";
import { useAuth } from "../lib/AuthContext";
import { logActivity } from "../lib/activityLog";

function fmtRs(n: number) { return "₹" + (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 }); }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function loadSuppliers(): Party[] {
  return (get<Party[]>(PARTIES_KEY) ?? [])
    .filter(p => p.type === "supplier" && p.outstandingBalance > 0)
    .sort((a, b) => b.outstandingBalance - a.outstandingBalance);
}

function loadSupplierInvoices(supplierId: string): PurchaseInvoice[] {
  return (get<PurchaseInvoice[]>(PURCHASES_KEY) ?? [])
    .filter(p => p.supplierId === supplierId && p.balanceDue > 0)
    .sort((a, b) => {
      const dateComp = b.orderDate.localeCompare(a.orderDate);
      if (dateComp !== 0) return dateComp;
      return b.id.localeCompare(a.id);
    });
}

export default function SupplierPaymentsPage() {
  const { role } = useAuth();
  const [suppliers, setSuppliers]   = useState<Party[]>(loadSuppliers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [invoices, setInvoices]     = useState<PurchaseInvoice[]>([]);
  const [payAmounts, setPayAmounts] = useState<Record<string, number>>({});
  const [payErrors,  setPayErrors]  = useState<Record<string, string>>({});
  const [successMsg, setSuccessMsg] = useState("");

  if (role !== "admin") {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-8 text-center max-w-lg mx-auto mt-12">
        <div className="text-4xl mb-3">🔒</div>
        <h3 className="text-lg font-bold">Access Restricted</h3>
        <p className="text-sm mt-1 text-red-600">
          Only administrators have permission to view Supplier Payment Status.
        </p>
      </div>
    );
  }

  function openSupplier(id: string) {
    setSelectedId(id);
    setInvoices(loadSupplierInvoices(id));
    setPayAmounts({});
    setPayErrors({});
    setSuccessMsg("");
  }

  function refresh() {
    setSuppliers(loadSuppliers());
    if (selectedId) setInvoices(loadSupplierInvoices(selectedId));
  }

  function handlePayment(invoiceId: string) {
    const amount  = payAmounts[invoiceId] ?? 0;
    const invoice = invoices.find(i => i.id === invoiceId);
    if (!invoice) return;
    if (amount <= 0)              { setPayErrors(p => ({ ...p, [invoiceId]: "Enter an amount > 0" })); return; }
    if (amount > invoice.balanceDue) { setPayErrors(p => ({ ...p, [invoiceId]: `Cannot exceed balance due ${fmtRs(invoice.balanceDue)}` })); return; }

    recordPayment(invoiceId, amount, "purchase");
    logActivity("edit", "purchase", invoiceId);
    setPayAmounts(p => ({ ...p, [invoiceId]: 0 }));
    setPayErrors(p => ({ ...p, [invoiceId]: "" }));
    setSuccessMsg(`Payment of ${fmtRs(amount)} recorded.`);
    setTimeout(() => setSuccessMsg(""), 3000);
    refresh();
  }

  const totalPayable = suppliers.reduce((s, c) => s + c.outstandingBalance, 0);
  const selected = suppliers.find(s => s.id === selectedId) ?? (get<Party[]>(PARTIES_KEY) ?? []).find(p => p.id === selectedId);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Supplier Payment Status</h2>
        <p className="text-sm text-slate-500 mt-0.5">Amounts you owe suppliers — click to record payments</p>
      </div>

      {/* Total payable card */}
      <div className="inline-flex items-center gap-3 bg-purple-50 border border-purple-200 text-purple-700 rounded-xl px-5 py-3">
        <span className="text-2xl">🏭</span>
        <div>
          <p className="text-xl font-bold leading-tight">{fmtRs(totalPayable)}</p>
          <p className="text-xs font-medium opacity-80">Total Payable to {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-3 text-sm font-medium">✓ {successMsg}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
        {/* Supplier list */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-700">Suppliers with Payables</h3>
          </div>
          {suppliers.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm">All supplier accounts are settled!</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {suppliers.map(s => (
                <li key={s.id}>
                  <button
                    onClick={() => openSupplier(s.id)}
                    className={`w-full text-left px-4 py-3.5 flex items-center justify-between transition hover:bg-slate-50 ${selectedId === s.id ? "bg-purple-50 border-l-4 border-purple-500" : "border-l-4 border-transparent"}`}>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{s.name}</p>
                      {s.phone && <p className="text-xs text-slate-400">{s.phone}</p>}
                    </div>
                    <span className="text-sm font-bold text-purple-600">{fmtRs(s.outstandingBalance)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Invoice detail */}
        <div className="lg:col-span-3">
          {!selectedId ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400">
              <div className="text-4xl mb-3">👆</div>
              <p className="text-sm">Select a supplier to view their unpaid invoices</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3.5 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">
                    {selected?.name}
                  </h3>
                  <span className="text-xs text-slate-500 font-mono">{selected?.id}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-200 text-xs text-slate-600">
                  <p><span className="font-semibold text-slate-700">GSTIN:</span> <span className="font-mono">{selected?.gstin || "Unregistered"}</span></p>
                  <p><span className="font-semibold text-slate-700">Phone:</span> {selected?.phone || "—"}</p>
                  <p className="sm:col-span-2"><span className="font-semibold text-slate-700">Address:</span> {selected?.address || "No address on record"}</p>
                </div>
              </div>

              {invoices.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <div className="text-3xl mb-2">✅</div>
                  <p className="text-sm">No outstanding invoices for this supplier</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {invoices.map(inv => (
                    <div key={inv.id} className="px-4 py-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium text-slate-800 font-mono">{inv.id}</p>
                          <p className="text-xs text-slate-500">{fmtDate(inv.orderDate)} · {inv.items.length} item{inv.items.length !== 1 ? "s" : ""} · {inv.paymentMethod.toUpperCase()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-400">Invoice total</p>
                          <p className="text-sm font-semibold text-slate-700">{fmtRs(inv.total)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-3">
                        <div className="flex-1">
                          <p className="text-xs text-slate-500 mb-1">Balance Payable</p>
                          <p className="text-base font-bold text-purple-600">{fmtRs(inv.balanceDue)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number" min={0} step={0.01}
                            placeholder="Amount"
                            value={payAmounts[inv.id] || ""}
                            onChange={e => { setPayAmounts(p => ({ ...p, [inv.id]: parseFloat(e.target.value) || 0 })); setPayErrors(p => ({ ...p, [inv.id]: "" })); }}
                            className="w-32 px-2 py-1.5 rounded border border-slate-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-purple-400"
                          />
                          <button
                            id={`btn-pay-${inv.id}`}
                            onClick={() => handlePayment(inv.id)}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition whitespace-nowrap">
                            Record ₹
                          </button>
                        </div>
                      </div>
                      {payErrors[inv.id] && <p className="text-xs text-red-600 mt-1">{payErrors[inv.id]}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
