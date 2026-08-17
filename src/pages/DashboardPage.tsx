import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Product, Party, SaleInvoice, User } from "../types";
import { get } from "../lib/storage";
import { PRODUCTS_KEY, PARTIES_KEY, SALES_KEY, USERS_KEY } from "../lib/initStore";
import { getRecentActivity } from "../lib/activityLog";
import { round2 } from "../lib/gstUtils";

function fmtRs(n: number) { return "₹" + (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 }); }

function fmtTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function actionBadge(action: string) {
  switch (action) {
    case "create":
      return <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-emerald-100 text-emerald-700">Created</span>;
    case "edit":
      return <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-blue-100 text-blue-700">Edited</span>;
    case "delete":
      return <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-red-100 text-red-700">Deleted</span>;
    default:
      return <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-slate-100 text-slate-700">{action}</span>;
  }
}

function entityIcon(entity: string) {
  switch (entity) {
    case "sale":
      return "💰";
    case "purchase":
      return "🛒";
    case "product":
      return "📦";
    case "customer":
      return "👥";
    case "supplier":
      return "🏭";
    case "adjustment":
      return "📋";
    case "user":
      return "👤";
    default:
      return "📝";
  }
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [userFilter, setUserFilter] = useState<string>("all");

  const { products, customers, todaySales, lowStock, users } = useMemo(() => {
    const products  = get<Product[]>(PRODUCTS_KEY) ?? [];
    const parties   = get<Party[]>(PARTIES_KEY)    ?? [];
    const customers = parties.filter(p => p.type === "customer");
    const today     = new Date().toISOString().slice(0, 10);
    const todaySales = (get<SaleInvoice[]>(SALES_KEY) ?? []).filter(s => s.orderDate === today);
    const lowStock   = products.filter(p => p.stockQty < p.reorderLevel).sort((a, b) => a.stockQty - a.reorderLevel - (b.stockQty - b.reorderLevel));
    const users     = get<User[]>(USERS_KEY) ?? [];
    return { products, customers, todaySales, lowStock, users };
  }, []);

  const totalStockValue    = round2(products.reduce((s, p) => s + p.stockQty * p.unitPrice, 0));
  const lowStockCount      = lowStock.length;
  const todaySalesTotal    = round2(todaySales.reduce((s, i) => s + i.total, 0));
  const pendingPayments    = round2(customers.reduce((s, c) => s + c.outstandingBalance, 0));

  const recentLogs = useMemo(() => {
    return getRecentActivity(20, userFilter);
  }, [userFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-slate-800">Dashboard</h2>
        <p className="text-sm text-slate-500 mt-0.5">Live snapshot of your inventory and business</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon="📦"
          label="Total Stock Value"
          value={fmtRs(totalStockValue)}
          sub={`across ${products.length} products`}
          color="blue"
        />
        <MetricCard
          icon="⚠️"
          label="Low Stock"
          value={String(lowStockCount)}
          sub={lowStockCount === 0 ? "All stocked up!" : `product${lowStockCount !== 1 ? "s" : ""} below reorder level`}
          color={lowStockCount > 0 ? "red" : "green"}
        />
        <MetricCard
          icon="💰"
          label="Today's Sales"
          value={fmtRs(todaySalesTotal)}
          sub={`${todaySales.length} invoice${todaySales.length !== 1 ? "s" : ""} today`}
          color="emerald"
        />
        <MetricCard
          icon="⏳"
          label="Pending Payments"
          value={fmtRs(pendingPayments)}
          sub={`from ${customers.filter(c => c.outstandingBalance > 0).length} customer${customers.filter(c => c.outstandingBalance > 0).length !== 1 ? "s" : ""}`}
          color={pendingPayments > 0 ? "amber" : "green"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">Quick Actions</h3>
          <QuickAction icon="💰" label="New Sale" description="Create a sale invoice" color="blue" onClick={() => navigate("/sales?new=1")} />
          <QuickAction icon="🛒" label="New Purchase" description="Record a purchase from supplier" color="purple" onClick={() => navigate("/purchases")} />
          <QuickAction icon="📦" label="Add Product" description="Add a new product to inventory" color="emerald" onClick={() => navigate("/products")} />
          <QuickAction icon="👥" label="Add Customer" description="Register a new customer" color="slate" onClick={() => navigate("/customers")} />
          <QuickAction icon="🏭" label="Add Supplier" description="Register a new supplier" color="slate" onClick={() => navigate("/suppliers")} />
          <QuickAction icon="📋" label="Stock Adjustment" description="Manual stock correction" color="amber" onClick={() => navigate("/stock-register")} />
        </div>

        {/* Low Stock Alert */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block"></span>
              Low Stock Alerts
            </h3>
            <span className="text-xs text-slate-500">
              {lowStockCount} / {products.length} products
            </span>
          </div>

          {lowStockCount === 0 ? (
            <div className="p-10 text-center text-slate-400">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-sm font-medium">All products are stocked above reorder levels</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[300px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-red-50 z-10">
                  <tr className="border-b border-red-100">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-red-700 uppercase tracking-wider">Product</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-red-700 uppercase tracking-wider">Current Stock</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-red-700 uppercase tracking-wider">Reorder At</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-red-700 uppercase tracking-wider">Deficit</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-red-700 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-50">
                  {lowStock.map(p => {
                    const deficit = p.reorderLevel - p.stockQty;
                    const isCritical = p.stockQty === 0;
                    return (
                      <tr key={p.id} className={isCritical ? "bg-red-50" : "hover:bg-red-50/30 transition-colors"}>
                        <td className="px-4 py-2.5 font-medium text-slate-800">{p.name}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-red-600">{p.stockQty} {p.unit}</td>
                        <td className="px-4 py-2.5 text-right text-slate-500">{p.reorderLevel} {p.unit}</td>
                        <td className="px-4 py-2.5 text-right text-red-600 font-semibold">{deficit} {p.unit}</td>
                        <td className="px-4 py-2.5 text-center">
                          {isCritical
                            ? <span className="inline-block px-2 py-0.5 text-xs font-medium bg-red-200 text-red-800 rounded">Out of Stock</span>
                            : <span className="inline-block px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 rounded">Low</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {lowStockCount > 0 && (
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
              <button onClick={() => navigate("/purchases")}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 transition flex items-center gap-1">
                Create purchase order →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Activity Feed ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <span>⚡</span> Recent Activity
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Audit log of recent creates, edits and deletions</p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 font-medium">Filter by User:</label>
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {recentLogs.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            <div className="text-3xl mb-2">📜</div>
            <p className="text-sm">No activity recorded yet</p>
            <p className="text-xs text-slate-400 mt-1">Actions performed by users will appear here live</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto">
            {recentLogs.map((log) => (
              <div key={log.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-lg w-7 text-center">{entityIcon(log.entity)}</span>
                  <div>
                    <p className="text-sm text-slate-800">
                      <span className="font-semibold">{log.userName}</span>{" "}
                      <span className="text-slate-600">{log.action}d</span>{" "}
                      <span className="font-medium text-slate-700 capitalize">{log.entity}</span>
                      {log.entityId && (
                        <span className="text-xs text-slate-400 font-mono ml-1">({log.entityId})</span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{fmtTime(log.timestamp)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {actionBadge(log.action)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
type CardColor = "blue" | "red" | "green" | "emerald" | "amber" | "purple" | "slate";

function MetricCard({ icon, label, value, sub, color }: { icon: string; label: string; value: string; sub: string; color: CardColor }) {
  const base: Record<CardColor, string> = {
    blue:   "from-blue-500 to-blue-600",
    red:    "from-red-500 to-red-600",
    green:  "from-emerald-500 to-emerald-600",
    emerald:"from-emerald-500 to-teal-600",
    amber:  "from-amber-500 to-orange-500",
    purple: "from-purple-500 to-purple-600",
    slate:  "from-slate-500 to-slate-600",
  };
  return (
    <div className={`rounded-xl bg-gradient-to-br ${base[color]} text-white p-5 shadow-md`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xl font-bold leading-tight">{value}</p>
          <p className="text-sm font-semibold mt-1 opacity-90">{label}</p>
          <p className="text-xs mt-1 opacity-70">{sub}</p>
        </div>
        <span className="text-3xl opacity-80">{icon}</span>
      </div>
    </div>
  );
}

function QuickAction({ icon, label, description, color, onClick }: { icon: string; label: string; description: string; color: CardColor; onClick: () => void }) {
  const border: Record<CardColor, string> = {
    blue:   "border-blue-200 hover:border-blue-400 hover:bg-blue-50",
    red:    "border-red-200 hover:border-red-400 hover:bg-red-50",
    green:  "border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50",
    emerald:"border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50",
    amber:  "border-amber-200 hover:border-amber-400 hover:bg-amber-50",
    purple: "border-purple-200 hover:border-purple-400 hover:bg-purple-50",
    slate:  "border-slate-200 hover:border-slate-400 hover:bg-slate-50",
  };
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition ${border[color]} text-left`}>
      <span className="text-xl">{icon}</span>
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
    </button>
  );
}
