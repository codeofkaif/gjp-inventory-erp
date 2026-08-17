import { useState, useMemo } from "react";
import type { SaleInvoice, PurchaseInvoice, Product } from "../types";
import { get } from "../lib/storage";
import { SALES_KEY, PURCHASES_KEY, PRODUCTS_KEY } from "../lib/initStore";
import { buildGstSummary, dateInRange, todayStr, weekStart, monthStart, round2 } from "../lib/gstUtils";
import { useAuth } from "../lib/AuthContext";

function fmtRs(n: number) { return "₹" + (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 }); }

type Preset = "today" | "week" | "month" | "custom";

export default function GstSummaryPage() {
  const { role } = useAuth();
  const [preset, setPreset]   = useState<Preset>("month");
  const [fromDate, setFromDate] = useState(monthStart());
  const [toDate,   setToDate]   = useState(todayStr());

  if (role !== "admin") {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-8 text-center max-w-lg mx-auto mt-12">
        <div className="text-4xl mb-3">🔒</div>
        <h3 className="text-lg font-bold">Access Restricted</h3>
        <p className="text-sm mt-1 text-red-600">
          Only administrators have permission to view the GST Summary.
        </p>
      </div>
    );
  }

  function applyPreset(p: Preset) {
    setPreset(p);
    const t = todayStr();
    if (p === "today") { setFromDate(t); setToDate(t); }
    else if (p === "week")  { setFromDate(weekStart()); setToDate(t); }
    else if (p === "month") { setFromDate(monthStart()); setToDate(t); }
  }

  const { rows, salesTotal, purchasesTotal } = useMemo(() => {
    const allSales     = (get<SaleInvoice[]>(SALES_KEY)       ?? []).filter(s => dateInRange(s.orderDate, fromDate, toDate));
    const allPurchases = (get<PurchaseInvoice[]>(PURCHASES_KEY) ?? []).filter(p => dateInRange(p.orderDate, fromDate, toDate));
    const products     = get<Product[]>(PRODUCTS_KEY) ?? [];
    const productMap   = Object.fromEntries(products.map(p => [p.id, { gstRate: p.gstRate }]));

    const rows = buildGstSummary(allSales, allPurchases, productMap);
    const salesTotal     = allSales.reduce((s, i) => s + i.total, 0);
    const purchasesTotal = allPurchases.reduce((s, i) => s + i.total, 0);
    return { rows, salesTotal, purchasesTotal };
  }, [fromDate, toDate]);

  const netCgst = round2(rows.reduce((s, r) => s + r.netCgst, 0));
  const netSgst = round2(rows.reduce((s, r) => s + r.netSgst, 0));
  const netIgst = round2(rows.reduce((s, r) => s + r.netIgst, 0));
  const netTotal = round2(netCgst + netSgst + netIgst);

  const PRESETS: { key: Preset; label: string }[] = [
    { key: "today", label: "Today" }, { key: "week", label: "This Week" },
    { key: "month", label: "This Month" }, { key: "custom", label: "Custom" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">GST Summary</h2>
        <p className="text-sm text-slate-500 mt-0.5">Output tax (sales) vs Input tax (purchases) — net GST payable</p>
      </div>

      {/* Date range filter */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-4 flex-wrap">
        <div className="flex gap-1.5">
          {PRESETS.map(p => (
            <button key={p.key} onClick={() => applyPreset(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${preset === p.key ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-slate-400">to</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        )}
        <div className="text-xs text-slate-400 ml-auto">
          {fromDate} → {toDate}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard label="Sales (incl. GST)" value={fmtRs(salesTotal)} color="blue" />
        <KpiCard label="Purchases (incl. GST)" value={fmtRs(purchasesTotal)} color="purple" />
        <KpiCard label="Net GST Payable" value={fmtRs(netTotal)} color={netTotal >= 0 ? "amber" : "green"} />
        <KpiCard label="GST Rate Buckets" value={String(rows.length)} color="slate" />
      </div>

      {/* Main GST table */}
      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <div className="text-4xl mb-3">🧾</div>
          <p className="text-sm">No GST transactions in the selected period</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">GST Rate</th>
                  {/* Output */}
                  <th className="text-right px-3 py-3 font-semibold text-emerald-700 text-xs uppercase tracking-wider bg-emerald-50/50">Out Taxable</th>
                  <th className="text-right px-3 py-3 font-semibold text-emerald-700 text-xs uppercase tracking-wider bg-emerald-50/50">Out CGST</th>
                  <th className="text-right px-3 py-3 font-semibold text-emerald-700 text-xs uppercase tracking-wider bg-emerald-50/50">Out SGST</th>
                  <th className="text-right px-3 py-3 font-semibold text-emerald-700 text-xs uppercase tracking-wider bg-emerald-50/50">Out IGST</th>
                  {/* Input */}
                  <th className="text-right px-3 py-3 font-semibold text-blue-700 text-xs uppercase tracking-wider bg-blue-50/50">In Taxable</th>
                  <th className="text-right px-3 py-3 font-semibold text-blue-700 text-xs uppercase tracking-wider bg-blue-50/50">In CGST</th>
                  <th className="text-right px-3 py-3 font-semibold text-blue-700 text-xs uppercase tracking-wider bg-blue-50/50">In SGST</th>
                  <th className="text-right px-3 py-3 font-semibold text-blue-700 text-xs uppercase tracking-wider bg-blue-50/50">In IGST</th>
                  {/* Net */}
                  <th className="text-right px-3 py-3 font-semibold text-amber-700 text-xs uppercase tracking-wider bg-amber-50/50">Net CGST</th>
                  <th className="text-right px-3 py-3 font-semibold text-amber-700 text-xs uppercase tracking-wider bg-amber-50/50">Net SGST</th>
                  <th className="text-right px-3 py-3 font-semibold text-amber-700 text-xs uppercase tracking-wider bg-amber-50/50">Net IGST</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(r => (
                  <tr key={r.rate} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800">{r.rate}%</td>
                    <td className="px-3 py-3 text-right text-slate-600 whitespace-nowrap">{fmtRs(r.outputTaxable)}</td>
                    <td className="px-3 py-3 text-right text-emerald-700 whitespace-nowrap font-medium">{fmtRs(r.outputCgst)}</td>
                    <td className="px-3 py-3 text-right text-emerald-700 whitespace-nowrap font-medium">{fmtRs(r.outputSgst)}</td>
                    <td className="px-3 py-3 text-right text-emerald-700 whitespace-nowrap font-medium">{fmtRs(r.outputIgst)}</td>
                    <td className="px-3 py-3 text-right text-slate-600 whitespace-nowrap">{fmtRs(r.inputTaxable)}</td>
                    <td className="px-3 py-3 text-right text-blue-700 whitespace-nowrap font-medium">{fmtRs(r.inputCgst)}</td>
                    <td className="px-3 py-3 text-right text-blue-700 whitespace-nowrap font-medium">{fmtRs(r.inputSgst)}</td>
                    <td className="px-3 py-3 text-right text-blue-700 whitespace-nowrap font-medium">{fmtRs(r.inputIgst)}</td>
                    <td className={`px-3 py-3 text-right whitespace-nowrap font-semibold ${r.netCgst >= 0 ? "text-amber-600" : "text-emerald-600"}`}>{fmtRs(r.netCgst)}</td>
                    <td className={`px-3 py-3 text-right whitespace-nowrap font-semibold ${r.netSgst >= 0 ? "text-amber-600" : "text-emerald-600"}`}>{fmtRs(r.netSgst)}</td>
                    <td className={`px-3 py-3 text-right whitespace-nowrap font-semibold ${r.netIgst >= 0 ? "text-amber-600" : "text-emerald-600"}`}>{fmtRs(r.netIgst)}</td>
                  </tr>
                ))}
              </tbody>
              {/* Grand total row */}
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-300 font-semibold">
                  <td className="px-4 py-3 text-slate-800">Total</td>
                  <td className="px-3 py-3 text-right text-slate-700 whitespace-nowrap">{fmtRs(rows.reduce((s,r) => s+r.outputTaxable,0))}</td>
                  <td className="px-3 py-3 text-right text-emerald-700 whitespace-nowrap">{fmtRs(rows.reduce((s,r) => s+r.outputCgst,0))}</td>
                  <td className="px-3 py-3 text-right text-emerald-700 whitespace-nowrap">{fmtRs(rows.reduce((s,r) => s+r.outputSgst,0))}</td>
                  <td className="px-3 py-3 text-right text-emerald-700 whitespace-nowrap">{fmtRs(rows.reduce((s,r) => s+r.outputIgst,0))}</td>
                  <td className="px-3 py-3 text-right text-slate-700 whitespace-nowrap">{fmtRs(rows.reduce((s,r) => s+r.inputTaxable,0))}</td>
                  <td className="px-3 py-3 text-right text-blue-700 whitespace-nowrap">{fmtRs(rows.reduce((s,r) => s+r.inputCgst,0))}</td>
                  <td className="px-3 py-3 text-right text-blue-700 whitespace-nowrap">{fmtRs(rows.reduce((s,r) => s+r.inputSgst,0))}</td>
                  <td className="px-3 py-3 text-right text-blue-700 whitespace-nowrap">{fmtRs(rows.reduce((s,r) => s+r.inputIgst,0))}</td>
                  <td className={`px-3 py-3 text-right whitespace-nowrap ${netCgst >= 0 ? "text-amber-600" : "text-emerald-600"}`}>{fmtRs(netCgst)}</td>
                  <td className={`px-3 py-3 text-right whitespace-nowrap ${netSgst >= 0 ? "text-amber-600" : "text-emerald-600"}`}>{fmtRs(netSgst)}</td>
                  <td className={`px-3 py-3 text-right whitespace-nowrap ${netIgst >= 0 ? "text-amber-600" : "text-emerald-600"}`}>{fmtRs(netIgst)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Net payable summary box */}
      {rows.length > 0 && (
        <div className={`rounded-xl border p-5 flex items-center justify-between ${netTotal >= 0 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
          <div>
            <p className="text-sm font-medium text-slate-700">Net GST Payable to Government</p>
            <p className="text-xs text-slate-500 mt-0.5">Output tax − Input tax = {fmtRs(netTotal)}</p>
            {netTotal < 0 && <p className="text-xs text-emerald-600 mt-1 font-medium">Eligible for ITC refund / carry-forward</p>}
          </div>
          <span className={`text-2xl font-bold ${netTotal >= 0 ? "text-amber-600" : "text-emerald-600"}`}>{fmtRs(netTotal)}</span>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string; color: "blue" | "purple" | "amber" | "green" | "slate" }) {
  const cls = { blue: "bg-blue-50 border-blue-200 text-blue-700", purple: "bg-purple-50 border-purple-200 text-purple-700", amber: "bg-amber-50 border-amber-200 text-amber-700", green: "bg-emerald-50 border-emerald-200 text-emerald-700", slate: "bg-slate-50 border-slate-200 text-slate-700" }[color];
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <p className="text-lg font-bold leading-tight">{value}</p>
      <p className="text-xs mt-1 opacity-80 font-medium">{label}</p>
    </div>
  );
}
