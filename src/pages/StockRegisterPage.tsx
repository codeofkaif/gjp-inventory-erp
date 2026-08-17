import { useState } from "react";
import type { StockMovement, MovementType, Product } from "../types";
import { get } from "../lib/storage";
import { STOCK_REGISTER_KEY, PRODUCTS_KEY } from "../lib/initStore";
import { applyMovements } from "../lib/stockOps";
import { logActivity } from "../lib/activityLog";
import { useAuth } from "../lib/AuthContext";

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadMovements(): StockMovement[] {
  return (get<StockMovement[]>(STOCK_REGISTER_KEY) ?? [])
    .slice()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function loadProducts(): Product[] { return get<Product[]>(PRODUCTS_KEY) ?? []; }

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const TYPE_COLORS: Record<MovementType, string> = {
  sale:       "bg-red-100 text-red-700",
  purchase:   "bg-emerald-100 text-emerald-700",
  adjustment: "bg-blue-100 text-blue-700",
  return:     "bg-purple-100 text-purple-700",
  transfer:   "bg-slate-100 text-slate-600",
};

const MOVEMENT_TYPES: MovementType[] = ["sale", "purchase", "adjustment", "return", "transfer"];

const REASONS = ["damage", "return", "transfer"] as const;
type Reason = typeof REASONS[number];

// ── Component ─────────────────────────────────────────────────────────────────
export default function StockRegisterPage() {
  const { role } = useAuth();
  const [movements, setMovements]  = useState<StockMovement[]>(loadMovements);
  const [products]                 = useState<Product[]>(loadProducts);
  const [filterProduct, setFilterProduct] = useState("");
  const [filterType,    setFilterType]    = useState<MovementType | "">("");

  // ── Manual adjustment form state ────────────────────────────────────────────
  const [adjProductId, setAdjProductId]   = useState("");
  const [adjQtyChange, setAdjQtyChange]   = useState<number>(0);
  const [adjReason,    setAdjReason]      = useState<Reason>("damage");
  const [adjErrors,    setAdjErrors]      = useState<string[]>([]);
  const [adjSuccess,   setAdjSuccess]     = useState(false);

  const productMap = Object.fromEntries(products.map(p => [p.id, p]));

  // ── Derived filtered movements (Recent on TOP) ────────────────────────────
  const filtered = movements
    .filter(m => {
      if (filterProduct && m.productId !== filterProduct) return false;
      if (filterType    && m.type      !== filterType)    return false;
      return true;
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalSaleOut = movements.filter(m => m.type === "sale").reduce((s, m) => s + Math.abs(m.qtyChange), 0);
  const totalPurchIn = movements.filter(m => m.type === "purchase").reduce((s, m) => s + m.qtyChange, 0);
  const totalAdj     = movements.filter(m => m.type === "adjustment").length;

  // ── Manual adjustment submit ────────────────────────────────────────────────
  function handleAdjSubmit() {
    if (role !== "admin") return;
    const errs: string[] = [];
    if (!adjProductId)    errs.push("Select a product.");
    if (adjQtyChange === 0) errs.push("Qty change cannot be zero.");

    const prod = productMap[adjProductId];
    if (prod && prod.stockQty + adjQtyChange < 0) {
      errs.push(`Cannot reduce "${prod.name}" below 0 (current: ${prod.stockQty}).`);
    }

    setAdjErrors(errs);
    if (errs.length > 0) return;

    applyMovements([{
      productId: adjProductId,
      qtyChange: adjQtyChange,
      type:      "adjustment",
      refId:     "MANUAL",
      note:      adjReason,
    }]);

    logActivity("create", "adjustment", adjProductId);

    // Refresh movements list
    setMovements(loadMovements());

    // Reset form
    setAdjProductId("");
    setAdjQtyChange(0);
    setAdjReason("damage");
    setAdjErrors([]);
    setAdjSuccess(true);
    setTimeout(() => setAdjSuccess(false), 3000);
  }

  const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Stock Register</h2>
        <p className="text-sm text-slate-500 mt-0.5">Complete audit log of all stock movements</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-xl border bg-slate-50 border-slate-200 text-slate-700 p-4 flex items-center gap-3">
          <span className="text-2xl">📋</span>
          <div>
            <p className="text-2xl font-bold leading-none">{movements.length}</p>
            <p className="text-xs mt-1 opacity-70 font-medium">Total Movements</p>
          </div>
        </div>
        <div className="rounded-xl border bg-red-50 border-red-200 text-red-700 p-4 flex items-center gap-3">
          <span className="text-2xl">📤</span>
          <div>
            <p className="text-2xl font-bold leading-none">{totalSaleOut.toLocaleString("en-IN")}</p>
            <p className="text-xs mt-1 opacity-70 font-medium">Units Sold (out)</p>
          </div>
        </div>
        <div className="rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-700 p-4 flex items-center gap-3">
          <span className="text-2xl">📥</span>
          <div>
            <p className="text-2xl font-bold leading-none">{totalPurchIn.toLocaleString("en-IN")}</p>
            <p className="text-xs mt-1 opacity-70 font-medium">Units Purchased (in)</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* ── Movement Table ── */}
        <div className="lg:col-span-2 space-y-3">
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All products</option>
              {Array.from(new Set(products.map(p => p.category || "General"))).map(cat => (
                <optgroup key={cat} label={`📁 ${cat}`}>
                  {products.filter(p => (p.category || "General") === cat).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>

            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => setFilterType("")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filterType === "" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                All
              </button>
              {MOVEMENT_TYPES.map(t => (
                <button key={t}
                  onClick={() => setFilterType(t === filterType ? "" : t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition ${filterType === t ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {t}
                </button>
              ))}
            </div>

            <span className="text-xs text-slate-500 ml-auto px-2.5 py-1 bg-slate-100 rounded-full">
              {filtered.length} / {movements.length} entries
            </span>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">Date & Time</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Product</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Type</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">Qty Change</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Ref / Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-12 text-slate-400">
                      <div className="text-3xl mb-2">📭</div>
                      <p className="text-sm">No movements yet</p>
                    </td></tr>
                  ) : filtered.map(m => {
                    const prod = productMap[m.productId];
                    return (
                      <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(m.timestamp)}</td>
                        <td className="px-4 py-3 text-slate-800 font-medium">
                          {prod?.name ?? <span className="text-slate-400 font-mono text-xs">{m.productId}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded capitalize ${TYPE_COLORS[m.type]}`}>
                            {m.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold whitespace-nowrap">
                          <span className={m.qtyChange >= 0 ? "text-emerald-600" : "text-red-600"}>
                            {m.qtyChange >= 0 ? "+" : ""}{m.qtyChange.toLocaleString("en-IN")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          <p className="font-mono">{m.refId}</p>
                          {m.note && <p className="text-slate-400 capitalize">{m.note}</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Manual Adjustment Panel ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Manual Adjustment</h3>
            <p className="text-xs text-slate-400 mt-0.5">Correct stock for damage, returns, or transfers</p>
          </div>

          {role !== "admin" ? (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-center text-slate-500">
              <div className="text-2xl mb-1.5">🔒</div>
              <p className="text-xs font-semibold text-slate-700">Admin Only Feature</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Only administrators have permission to perform manual stock adjustments.
              </p>
            </div>
          ) : (
            <>
              {adjSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700">
                  ✓ Adjustment saved successfully
                </div>
              )}

              {adjErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  {adjErrors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Product *</label>
                <select id="adj-product" value={adjProductId} onChange={e => { setAdjProductId(e.target.value); setAdjErrors([]); }}
                  className={inputCls}>
                  <option value="">— Select product —</option>
                  {Array.from(new Set(products.map(p => p.category || "General"))).map(cat => (
                    <optgroup key={cat} label={`📁 ${cat}`}>
                      {products.filter(p => (p.category || "General") === cat).map(p => (
                        <option key={p.id} value={p.id}>{p.name} (Stock: {p.stockQty})</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Qty Change *
                  <span className="text-slate-400 font-normal ml-1">(negative = reduce)</span>
                </label>
                <input id="adj-qty" type="number" step={0.001}
                  value={adjQtyChange || ""}
                  onFocus={(e) => e.target.select()}
                  placeholder="e.g. -5 or +10"
                  onChange={e => { setAdjQtyChange(parseFloat(e.target.value) || 0); setAdjErrors([]); }}
                  className={inputCls} />
                {adjProductId && productMap[adjProductId] && (
                  <p className="text-xs text-slate-400 mt-1">
                    New stock after adjustment:{" "}
                    <span className={`font-semibold ${productMap[adjProductId].stockQty + adjQtyChange < 0 ? "text-red-500" : "text-slate-700"}`}>
                      {(productMap[adjProductId].stockQty + adjQtyChange).toLocaleString("en-IN")}
                    </span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Reason *</label>
                <select id="adj-reason" value={adjReason}
                  onChange={e => setAdjReason(e.target.value as Reason)}
                  className={inputCls}>
                  {REASONS.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>

              <button id="btn-adj-save" onClick={handleAdjSubmit}
                className="w-full py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition">
                Apply Adjustment
              </button>
            </>
          )}

          {/* Adjustment count */}
          {totalAdj > 0 && (
            <p className="text-xs text-center text-slate-400">{totalAdj} manual adjustment{totalAdj !== 1 ? "s" : ""} recorded</p>
          )}
        </div>
      </div>
    </div>
  );
}
