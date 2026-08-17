import { useRef } from "react";
import type { Party, SaleInvoice, Product } from "../types";
import { round2 } from "../lib/gstUtils";
import { exportCustomerStatementExcel } from "../lib/exportUtils";
import { BUSINESS_CONFIG } from "../lib/businessConfig";

interface Props {
  customer: Party;
  invoices: SaleInvoice[];
  productMap: Record<string, Product>;
  onClose: () => void;
}

function fmtRs(n: number): string {
  return "₹" + (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

function fmtDate(iso?: string): string {
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

export default function CustomerStatementModal({
  customer,
  invoices,
  productMap,
  onClose,
}: Props) {
  const statementRef = useRef<HTMLDivElement>(null);

  const totalBilled = round2(invoices.reduce((s, inv) => s + (inv.total || 0), 0));
  const totalTaxable = round2(
    invoices.reduce((s, inv) => s + inv.items.reduce((sum, i) => sum + (i.amount || 0), 0), 0)
  );
  const totalAdvance = round2(invoices.reduce((s, inv) => s + (inv.advance || 0), 0));
  const totalDue = round2(invoices.reduce((s, inv) => s + (inv.balanceDue || 0), 0));

  function handlePrint() {
    window.print();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      {/* Modal Container */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* ── Modal Top Action Toolbar ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">📄</span>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                Customer Sales Statement — {customer.name}
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">
                Customer ID: {customer.id} · {invoices.length} Invoices
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => exportCustomerStatementExcel(customer, invoices, productMap)}
              className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg shadow-2xs transition flex items-center gap-1.5"
              title="Download Excel (.xlsx) file"
            >
              <span>📊</span> Export Excel (.xlsx)
            </button>
            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition flex items-center gap-1.5"
            >
              <span>🖨️</span> Print / Save as PDF
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Statement Document Body (Printable Area) ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100/50">
          <div
            ref={statementRef}
            id="printable-customer-statement"
            className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-xs max-w-3xl mx-auto space-y-5 print:p-0 print:border-none print:shadow-none"
          >
            {/* Header: Company & Statement Title */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b-2 border-amber-600 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-amber-500 via-orange-600 to-amber-700 text-white font-black text-sm flex items-center justify-center shadow-xs">
                    GJP
                  </div>
                  <div>
                    <h1 className="text-lg font-black text-slate-900 tracking-tight">
                      {BUSINESS_CONFIG.name}
                    </h1>
                    <p className="text-xs font-semibold text-amber-800">
                      Proprietor: {BUSINESS_CONFIG.proprietor}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  📍 {BUSINESS_CONFIG.fullAddress}
                </p>
                <p className="text-xs text-slate-600">
                  📞 Mobile: <strong>{BUSINESS_CONFIG.formattedMobile}</strong>
                </p>
              </div>

              <div className="text-left sm:text-right">
                <span className="inline-block px-2.5 py-1 text-xs font-black tracking-wider uppercase text-amber-900 bg-amber-50 border border-amber-300 rounded">
                  Customer Sales Statement
                </span>
                <p className="text-[11px] text-slate-400 font-mono mt-1">
                  Date:{" "}
                  {new Date().toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>

            {/* Customer Profile Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Billed To / Customer Account
                </span>
                <h2 className="text-base font-bold text-slate-900">{customer.name}</h2>
                <div className="space-y-0.5 text-xs text-slate-600">
                  <p>
                    <strong>Customer ID:</strong>{" "}
                    <span className="font-mono font-bold text-blue-700">{customer.id}</span>
                  </p>
                  <p>
                    <strong>GSTIN:</strong> {customer.gstin || "Unregistered / Consumer"}
                  </p>
                  <p>
                    <strong>Phone:</strong> {customer.phone || "N/A"}
                  </p>
                  <p>
                    <strong>Address:</strong> {customer.address || "N/A"}
                  </p>
                </div>
              </div>

              <div className="text-left sm:text-right space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Account Status
                </span>
                <div>
                  <span
                    className={`inline-block px-3 py-1 text-xs font-bold rounded-lg border ${
                      customer.outstandingBalance > 0
                        ? "bg-amber-50 text-amber-800 border-amber-200"
                        : "bg-emerald-50 text-emerald-800 border-emerald-200"
                    }`}
                  >
                    {customer.outstandingBalance > 0
                      ? `Outstanding Due: ${fmtRs(customer.outstandingBalance)}`
                      : "✓ Balance Settled (Zero Due)"}
                  </span>
                </div>
              </div>
            </div>

            {/* Key KPI Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="border border-slate-200 rounded-lg p-2.5 bg-slate-50/50">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Total Invoices</span>
                <span className="text-base font-bold text-slate-800 font-mono">{invoices.length}</span>
              </div>
              <div className="border border-slate-200 rounded-lg p-2.5 bg-slate-50/50">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Total Billed</span>
                <span className="text-base font-bold text-slate-900 font-mono">{fmtRs(totalBilled)}</span>
              </div>
              <div className="border border-slate-200 rounded-lg p-2.5 bg-emerald-50/40 border-emerald-100">
                <span className="block text-[10px] font-bold uppercase text-emerald-700">Total Received</span>
                <span className="text-base font-bold text-emerald-700 font-mono">{fmtRs(totalAdvance)}</span>
              </div>
              <div
                className={`border rounded-lg p-2.5 ${
                  customer.outstandingBalance > 0
                    ? "bg-amber-50/40 border-amber-200 text-amber-800"
                    : "bg-emerald-50/40 border-emerald-200 text-emerald-800"
                }`}
              >
                <span className="block text-[10px] font-bold uppercase opacity-80">Current Due</span>
                <span className="text-base font-bold font-mono">
                  {customer.outstandingBalance > 0 ? fmtRs(customer.outstandingBalance) : "₹0.00"}
                </span>
              </div>
            </div>

            {/* Itemized Sales Invoices Statement Table */}
            <div className="overflow-hidden border border-slate-200 rounded-xl">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 uppercase font-bold text-[10px]">
                    <th className="text-left px-3 py-2">Invoice SL No</th>
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-center px-2 py-2">Mode</th>
                    <th className="text-left px-3 py-2">Purchased Items</th>
                    <th className="text-right px-3 py-2">Taxable</th>
                    <th className="text-right px-3 py-2">GST</th>
                    <th className="text-right px-3 py-2">Total</th>
                    <th className="text-right px-3 py-2">Received</th>
                    <th className="text-right px-3 py-2">Balance Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-slate-400">
                        No sales invoices recorded for this customer
                      </td>
                    </tr>
                  ) : (
                    invoices.map((inv) => {
                      const invTaxable = round2(
                        inv.items.reduce((s, i) => s + (i.amount || 0), 0)
                      );
                      const invGst = round2(
                        inv.items.reduce((s, i) => s + (i.cgst || 0) + (i.sgst || 0) + (i.igst || 0), 0)
                      );
                      const isCredit = inv.paymentMethod === "credit";

                      return (
                        <tr key={inv.id} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2.5 font-mono font-bold text-blue-800 whitespace-nowrap">
                            {inv.slNo || inv.id}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                            {fmtDate(inv.orderDate)}
                          </td>
                          <td className="px-2 py-2.5 text-center whitespace-nowrap">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                isCredit
                                  ? "bg-purple-100 text-purple-800"
                                  : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {inv.paymentMethod}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="space-y-0.5">
                              {inv.items.map((item, liIdx) => {
                                const prod = productMap[item.productId];
                                return (
                                  <div key={liIdx} className="text-[11px] text-slate-600">
                                    • <span className="font-semibold text-slate-800">{prod?.name || item.productId}</span>{" "}
                                    ({item.qty} {prod?.unit || "pcs"} @ {fmtRs(item.unitPrice)})
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium text-slate-700 font-mono">
                            {fmtRs(invTaxable)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium text-slate-600 font-mono">
                            {fmtRs(invGst)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900 font-mono">
                            {fmtRs(inv.total)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium text-emerald-700 font-mono">
                            {fmtRs(inv.advance)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold font-mono whitespace-nowrap">
                            <span className={inv.balanceDue > 0 ? "text-amber-600" : "text-emerald-600"}>
                              {inv.balanceDue > 0 ? fmtRs(inv.balanceDue) : "✓ Paid"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-800">
                    <td colSpan={4} className="px-3 py-2.5 text-left">
                      Total Statement Value ({invoices.length} Invoices)
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmtRs(totalTaxable)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {fmtRs(round2(totalBilled - totalTaxable))}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-sm text-slate-950">
                      {fmtRs(totalBilled)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-700 text-sm">
                      {fmtRs(totalAdvance)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-mono text-sm ${
                        totalDue > 0 ? "text-amber-700" : "text-emerald-700"
                      }`}
                    >
                      {fmtRs(totalDue)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Footer Terms & Signatory */}
            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 text-xs text-slate-500">
              <div className="space-y-0.5 text-[10px]">
                <p>• Goods once sold will not be taken back without valid bill.</p>
                <p>• Computer-generated sales ledger and account statement.</p>
                <p>• Queries / Order support: <strong>{BUSINESS_CONFIG.formattedMobile}</strong></p>
              </div>
              <div className="text-center sm:text-right">
                <p className="text-[11px] font-bold text-slate-800">For {BUSINESS_CONFIG.name}</p>
                <div className="h-9"></div>
                <p className="border-t border-slate-400 pt-1 font-bold text-slate-700 min-w-[170px] text-center text-[11px]">
                  Proprietor / Auth Signatory
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
