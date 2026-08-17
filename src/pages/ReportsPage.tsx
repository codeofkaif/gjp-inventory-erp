import { useState, useMemo, Fragment } from "react";
import type { SaleInvoice, PurchaseInvoice, Product, Party } from "../types";
import { get } from "../lib/storage";
import { SALES_KEY, PURCHASES_KEY, PRODUCTS_KEY, PARTIES_KEY } from "../lib/initStore";
import { dateInRange, todayStr, weekStart, monthStart, round2 } from "../lib/gstUtils";
import { useAuth } from "../lib/AuthContext";
import { BUSINESS_CONFIG } from "../lib/businessConfig";

function fmtRs(n: number) { return "₹" + (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 }); }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

type TabKey = "sales" | "purchases" | "stock" | "pl";
type Preset  = "today" | "week" | "month" | "custom";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "sales",     label: "Sales Report",    icon: "💰" },
  { key: "purchases", label: "Purchase Report",  icon: "🛒" },
  { key: "stock",     label: "Stock Report",     icon: "📦" },
  { key: "pl",        label: "Profit / Loss",    icon: "📈" },
];

export default function ReportsPage() {
  const { role } = useAuth();
  const [tab, setTab]       = useState<TabKey>("sales");
  const [preset, setPreset] = useState<Preset>("month");
  const [fromDate, setFromDate] = useState(monthStart());
  const [toDate,   setToDate]   = useState(todayStr());

  if (role !== "admin") {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-8 text-center max-w-lg mx-auto mt-12">
        <div className="text-4xl mb-3">🔒</div>
        <h3 className="text-lg font-bold">Access Restricted</h3>
        <p className="text-sm mt-1 text-red-600">
          Only administrators have permission to view Reports.
        </p>
      </div>
    );
  }

  function applyPreset(p: Preset) {
    setPreset(p);
    const t = todayStr();
    if      (p === "today") { setFromDate(t); setToDate(t); }
    else if (p === "week")  { setFromDate(weekStart()); setToDate(t); }
    else if (p === "month") { setFromDate(monthStart()); setToDate(t); }
  }

  const PRESETS: { key: Preset; label: string }[] = [
    { key: "today", label: "Today" }, { key: "week", label: "This Week" },
    { key: "month", label: "This Month" }, { key: "custom", label: "Custom" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Business Reports & Analytics</h2>
        <p className="text-xs text-amber-800 font-semibold mt-0.5">
          {BUSINESS_CONFIG.name} · Prop. {BUSINESS_CONFIG.proprietor} · {BUSINESS_CONFIG.city}
        </p>
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
          <div className="flex items-center gap-2">
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-slate-400 text-sm">to</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        )}
        <span className="text-xs text-slate-400 ml-auto">{fromDate} → {toDate}</span>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl max-w-full overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap shrink-0 ${tab === t.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "sales"     && <SalesReport     from={fromDate} to={toDate} />}
      {tab === "purchases" && <PurchaseReport  from={fromDate} to={toDate} />}
      {tab === "stock"     && <StockReport />}
      {tab === "pl"        && <ProfitLoss      from={fromDate} to={toDate} />}
    </div>
  );
}

// ── Sales Report (LIFO Stack) ────────────────────────────────────────────────
function SalesReport({ from, to }: { from: string; to: string }) {
  const data = useMemo(() => {
    const customers = Object.fromEntries((get<Party[]>(PARTIES_KEY) ?? []).map(p => [p.id, p.name]));
    return (get<SaleInvoice[]>(SALES_KEY) ?? [])
      .filter(s => dateInRange(s.orderDate, from, to))
      .sort((a, b) => {
        const dateComp = b.orderDate.localeCompare(a.orderDate);
        if (dateComp !== 0) return dateComp;
        return b.id.localeCompare(a.id);
      })
      .map(s => ({ ...s, customerName: customers[s.customerId] ?? s.customerId }));
  }, [from, to]);

  const totals = useMemo(() => ({
    taxable:    round2(data.reduce((s, i) => s + i.items.reduce((a, li) => a + (li.amount ?? 0), 0), 0)),
    gst:        round2(data.reduce((s, i) => s + i.items.reduce((a, li) => a + (li.cgst ?? 0) + (li.sgst ?? 0) + (li.igst ?? 0), 0), 0)),
    total:      round2(data.reduce((s, i) => s + i.total, 0)),
    collected:  round2(data.reduce((s, i) => s + i.advance, 0)),
    due:        round2(data.reduce((s, i) => s + i.balanceDue, 0)),
  }), [data]);

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Stack Invoices", value: String(data.length), col: "slate" },
          { label: "Taxable", value: fmtRs(totals.taxable), col: "blue" },
          { label: "GST", value: fmtRs(totals.gst), col: "purple" },
          { label: "Revenue", value: fmtRs(totals.total), col: "green" },
          { label: "Due", value: fmtRs(totals.due), col: "amber" },
        ].map(c => <MiniCard key={c.label} label={c.label} value={c.value} color={c.col as never} />)}
      </div>
      <InvoiceTable
        rows={data.map(s => ({ id: s.id, date: s.orderDate, party: s.customerName, stateType: s.stateType ?? "intrastate", total: s.total, advance: s.advance, due: s.balanceDue, items: s.items }))}
        emptyMsg="No sales in this period"
        emptyIcon="💰"
      />
    </div>
  );
}

// ── Purchase Report (LIFO Stack) ─────────────────────────────────────────────
function PurchaseReport({ from, to }: { from: string; to: string }) {
  const data = useMemo(() => {
    const suppliers = Object.fromEntries((get<Party[]>(PARTIES_KEY) ?? []).map(p => [p.id, p.name]));
    return (get<PurchaseInvoice[]>(PURCHASES_KEY) ?? [])
      .filter(p => dateInRange(p.orderDate, from, to))
      .sort((a, b) => {
        const dateComp = b.orderDate.localeCompare(a.orderDate);
        if (dateComp !== 0) return dateComp;
        return b.id.localeCompare(a.id);
      })
      .map(p => ({ ...p, supplierName: suppliers[p.supplierId] ?? p.supplierId }));
  }, [from, to]);

  const totals = useMemo(() => ({
    taxable: round2(data.reduce((s, i) => s + i.items.reduce((a, li) => a + (li.amount ?? 0), 0), 0)),
    gst:     round2(data.reduce((s, i) => s + i.items.reduce((a, li) => a + (li.cgst ?? 0) + (li.sgst ?? 0) + (li.igst ?? 0), 0), 0)),
    total:   round2(data.reduce((s, i) => s + i.total, 0)),
    paid:    round2(data.reduce((s, i) => s + i.advance, 0)),
    due:     round2(data.reduce((s, i) => s + i.balanceDue, 0)),
  }), [data]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Stack Invoices", value: String(data.length), col: "slate" },
          { label: "Taxable", value: fmtRs(totals.taxable), col: "blue" },
          { label: "GST (Input)", value: fmtRs(totals.gst), col: "purple" },
          { label: "Total Spent", value: fmtRs(totals.total), col: "red" },
          { label: "Payable", value: fmtRs(totals.due), col: "amber" },
        ].map(c => <MiniCard key={c.label} label={c.label} value={c.value} color={c.col as never} />)}
      </div>
      <InvoiceTable
        rows={data.map(p => ({ id: p.id, date: p.orderDate, party: p.supplierName, stateType: p.stateType ?? "intrastate", total: p.total, advance: p.advance, due: p.balanceDue, items: p.items }))}
        emptyMsg="No purchases in this period"
        emptyIcon="🛒"
      />
    </div>
  );
}

// ── Stock Report (Recent Added on TOP) ───────────────────────────────────────
function StockReport() {
  const [selectedCat, setSelectedCat] = useState<string>("All");
  const [sortBy, setSortBy] = useState<"recent" | "valuation">("recent");
  const products = useMemo(() => get<Product[]>(PRODUCTS_KEY) ?? [], []);
  const allCategories = ["All", ...Array.from(new Set(products.map(p => p.category || "General")))];

  const rows = useMemo(() => {
    return products
      .filter(p => selectedCat === "All" || (p.category || "General") === selectedCat)
      .map(p => ({ ...p, category: p.category || "General", stockValue: round2(p.stockQty * p.unitPrice) }))
      .sort((a, b) => {
        if (sortBy === "recent") {
          const numA = parseInt(a.id.replace(/\D/g, ""), 10) || 0;
          const numB = parseInt(b.id.replace(/\D/g, ""), 10) || 0;
          if (numA !== numB) return numB - numA;
          return b.id.localeCompare(a.id);
        }
        return b.stockValue - a.stockValue;
      });
  }, [products, selectedCat, sortBy]);

  const grandTotal = round2(rows.reduce((s, r) => s + r.stockValue, 0));
  const lowStock   = rows.filter(r => r.stockQty < r.reorderLevel);

  return (
    <div className="space-y-4">
      {/* Category filter & Sort switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <span className="text-xs font-bold text-slate-500 mr-1 shrink-0">📁 Category:</span>
          {allCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCat(cat)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
                selectedCat === cat
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Sort Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs shrink-0">
          <button
            onClick={() => setSortBy("recent")}
            className={`px-2.5 py-1 rounded font-semibold transition ${
              sortBy === "recent" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ⚡ Recent Added at TOP
          </button>
          <button
            onClick={() => setSortBy("valuation")}
            className={`px-2.5 py-1 rounded font-semibold transition ${
              sortBy === "valuation" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            💰 Valuation High→Low
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MiniCard label="Stack Products" value={String(rows.length)} color="slate" />
        <MiniCard label="Stock Valuation" value={fmtRs(grandTotal)} color="green" />
        <MiniCard label="Low Stock Items" value={String(lowStock.length)} color={lowStock.length > 0 ? "red" : "slate"} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Product","Category","HSN","Unit","Stock Qty","Reorder","Unit Price","Stock Value","Status"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(r => {
                const isLow      = r.stockQty < r.reorderLevel;
                const isNearLow  = !isLow && r.stockQty < r.reorderLevel * 1.2;
                const rowCls     = isLow ? "bg-red-50" : isNearLow ? "bg-amber-50" : "";
                return (
                  <tr key={r.id} className={`${rowCls} hover:opacity-90 transition`}>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded bg-blue-50 text-blue-700 border border-blue-200">
                        {r.category}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{r.hsnCode}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.unit}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{r.stockQty.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.reorderLevel}</td>
                    <td className="px-4 py-2.5 text-slate-600">{fmtRs(r.unitPrice)}</td>
                    <td className="px-4 py-2.5 font-semibold text-emerald-700">{fmtRs(r.stockValue)}</td>
                    <td className="px-4 py-2.5">
                      {isLow
                        ? <span className="inline-block px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded">Low Stock</span>
                        : isNearLow
                        ? <span className="inline-block px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded">Near Low</span>
                        : <span className="inline-block px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded">OK</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-300 font-semibold">
                <td colSpan={7} className="px-4 py-3 text-slate-700">Total Stock Value</td>
                <td colSpan={2} className="px-4 py-3 text-emerald-700 text-base">{fmtRs(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Profit / Loss (Calculated on Each Sale, Each Item, and Each Category) ──────
type PLView = "invoices" | "items" | "categories" | "overview";

function ProfitLoss({ from, to }: { from: string; to: string }) {
  const [plView, setPlView] = useState<PLView>("invoices");
  const [search, setSearch] = useState("");
  const [profitFilter, setProfitFilter] = useState<"all" | "profit" | "loss">("all");
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<string>>(new Set());

  // Load baseline data
  const { sales, productMap, costPriceMap, customerMap } = useMemo(() => {
    const allSales     = (get<SaleInvoice[]>(SALES_KEY)         ?? []).filter(s => dateInRange(s.orderDate, from, to));
    const allPurchases = get<PurchaseInvoice[]>(PURCHASES_KEY) ?? [];
    const allProducts  = get<Product[]>(PRODUCTS_KEY)          ?? [];
    const allParties   = get<Party[]>(PARTIES_KEY)             ?? [];

    const prodMap = Object.fromEntries(allProducts.map(p => [p.id, p]));
    const custMap = Object.fromEntries(allParties.filter(p => p.type === "customer").map(c => [c.id, c]));

    // Compute cost price per product: weighted avg or latest purchase price, fallback to baseline 70% of unitPrice
    const costMap: Record<string, number> = {};
    allProducts.forEach(p => {
      // Find purchases containing this product
      const matchingPurchItems = allPurchases.flatMap(pur => pur.items.filter(i => i.productId === p.id));
      if (matchingPurchItems.length > 0) {
        const totalPurchQty = matchingPurchItems.reduce((s, i) => s + (i.qty || 0), 0);
        const totalPurchCost = matchingPurchItems.reduce((s, i) => s + ((i.qty || 0) * (i.unitPrice || 0)), 0);
        costMap[p.id] = totalPurchQty > 0 ? round2(totalPurchCost / totalPurchQty) : p.unitPrice;
      } else {
        // Fallback standard cost estimation (70% of catalog selling price)
        costMap[p.id] = round2(p.unitPrice * 0.70);
      }
    });

    return {
      sales: allSales,
      products: allProducts,
      productMap: prodMap,
      costPriceMap: costMap,
      customerMap: custMap,
    };
  }, [from, to]);

  // 1. Calculate P&L for Each Sale Invoice (LIFO - Recent on TOP)
  const invoicePLList = useMemo(() => {
    return sales
      .map(s => {
        const customer = customerMap[s.customerId];
        const lineItemDetails = s.items.map(i => {
          const prod = productMap[i.productId];
          const unitCost = costPriceMap[i.productId] ?? round2((prod?.unitPrice ?? 0) * 0.7);
          const revenue = round2(i.amount ?? 0); // taxable revenue after discount
          const cost = round2((i.qty || 0) * unitCost);
          const profit = round2(revenue - cost);
          const margin = revenue > 0 ? round2((profit / revenue) * 100) : 0;
          return {
            productId: i.productId,
            productName: prod?.name || i.productId,
            category: prod?.category || "General",
            qty: i.qty,
            unit: prod?.unit || "pcs",
            sellingPrice: i.unitPrice,
            discount: i.discount,
            unitCost,
            revenue,
            cost,
            profit,
            margin,
          };
        });

        const totalRevenue = round2(lineItemDetails.reduce((sum, li) => sum + li.revenue, 0));
        const totalCost    = round2(lineItemDetails.reduce((sum, li) => sum + li.cost, 0));
        const grossProfit  = round2(totalRevenue - totalCost);
        const marginPct    = totalRevenue > 0 ? round2((grossProfit / totalRevenue) * 100) : 0;

        return {
          id: s.id,
          slNo: s.slNo || s.id,
          orderDate: s.orderDate,
          customerId: s.customerId,
          customerName: customer?.name || s.customerId,
          itemsCount: s.items.length,
          totalRevenue,
          totalCost,
          grossProfit,
          marginPct,
          items: lineItemDetails,
        };
      })
      .sort((a, b) => {
        const dateComp = b.orderDate.localeCompare(a.orderDate);
        if (dateComp !== 0) return dateComp;
        return b.id.localeCompare(a.id);
      });
  }, [sales, customerMap, productMap, costPriceMap]);

  // 2. Calculate P&L for Each Item / Product
  const itemPLList = useMemo(() => {
    const itemAccumulator: Record<string, {
      productId: string;
      productName: string;
      category: string;
      unit: string;
      hsnCode: string;
      qtySold: number;
      revenue: number;
      cost: number;
      salesCount: number;
      unitCost: number;
    }> = {};

    sales.forEach(s => {
      s.items.forEach(i => {
        const prod = productMap[i.productId];
        const pid = i.productId || "unknown";
        if (!itemAccumulator[pid]) {
          const unitCost = costPriceMap[pid] ?? round2((prod?.unitPrice ?? 0) * 0.7);
          itemAccumulator[pid] = {
            productId: pid,
            productName: prod?.name || pid,
            category: prod?.category || "General",
            unit: prod?.unit || "pcs",
            hsnCode: prod?.hsnCode || "—",
            qtySold: 0,
            revenue: 0,
            cost: 0,
            salesCount: 0,
            unitCost,
          };
        }
        const unitCost = itemAccumulator[pid].unitCost;
        const lineRev  = round2(i.amount ?? 0);
        const lineCost = round2((i.qty || 0) * unitCost);

        itemAccumulator[pid].qtySold += i.qty || 0;
        itemAccumulator[pid].revenue = round2(itemAccumulator[pid].revenue + lineRev);
        itemAccumulator[pid].cost    = round2(itemAccumulator[pid].cost + lineCost);
        itemAccumulator[pid].salesCount += 1;
      });
    });

    return Object.values(itemAccumulator)
      .map(item => {
        const profit = round2(item.revenue - item.cost);
        const margin = item.revenue > 0 ? round2((profit / item.revenue) * 100) : 0;
        const avgSellingPrice = item.qtySold > 0 ? round2(item.revenue / item.qtySold) : 0;
        return {
          ...item,
          profit,
          margin,
          avgSellingPrice,
        };
      })
      .sort((a, b) => b.profit - a.profit);
  }, [sales, productMap, costPriceMap]);

  // 3. Calculate P&L for Each Category
  const categoryPLList = useMemo(() => {
    const catAccumulator: Record<string, {
      category: string;
      itemsCount: Set<string>;
      qtySold: number;
      revenue: number;
      cost: number;
      invoicesCount: Set<string>;
    }> = {};

    sales.forEach(s => {
      s.items.forEach(i => {
        const prod = productMap[i.productId];
        const cat = prod?.category || "General";
        if (!catAccumulator[cat]) {
          catAccumulator[cat] = {
            category: cat,
            itemsCount: new Set(),
            qtySold: 0,
            revenue: 0,
            cost: 0,
            invoicesCount: new Set(),
          };
        }
        const unitCost = costPriceMap[i.productId] ?? round2((prod?.unitPrice ?? 0) * 0.7);
        const lineRev  = round2(i.amount ?? 0);
        const lineCost = round2((i.qty || 0) * unitCost);

        catAccumulator[cat].itemsCount.add(i.productId);
        catAccumulator[cat].invoicesCount.add(s.id);
        catAccumulator[cat].qtySold += i.qty || 0;
        catAccumulator[cat].revenue = round2(catAccumulator[cat].revenue + lineRev);
        catAccumulator[cat].cost    = round2(catAccumulator[cat].cost + lineCost);
      });
    });

    return Object.values(catAccumulator)
      .map(c => {
        const profit = round2(c.revenue - c.cost);
        const margin = c.revenue > 0 ? round2((profit / c.revenue) * 100) : 0;
        return {
          category: c.category,
          uniqueProductsCount: c.itemsCount.size,
          invoicesCount: c.invoicesCount.size,
          qtySold: c.qtySold,
          revenue: c.revenue,
          cost: c.cost,
          profit,
          margin,
        };
      })
      .sort((a, b) => b.profit - a.profit);
  }, [sales, productMap, costPriceMap]);

  // Overall Totals
  const overall = useMemo(() => {
    const totalRevenue = round2(invoicePLList.reduce((s, i) => s + i.totalRevenue, 0));
    const totalCost    = round2(invoicePLList.reduce((s, i) => s + i.totalCost, 0));
    const grossProfit  = round2(totalRevenue - totalCost);
    const overallMargin = totalRevenue > 0 ? round2((grossProfit / totalRevenue) * 100) : 0;
    const profitableInvoices = invoicePLList.filter(i => i.grossProfit >= 0).length;
    const lossInvoices = invoicePLList.filter(i => i.grossProfit < 0).length;

    return {
      totalRevenue,
      totalCost,
      grossProfit,
      overallMargin,
      profitableInvoices,
      lossInvoices,
      totalInvoices: invoicePLList.length,
      totalItemsSold: itemPLList.reduce((s, i) => s + i.qtySold, 0),
    };
  }, [invoicePLList, itemPLList]);

  // Toggle invoice expander
  function toggleInvoiceExpand(id: string) {
    setExpandedInvoiceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Filtered views
  const filteredInvoices = invoicePLList.filter(inv => {
    if (profitFilter === "profit" && inv.grossProfit < 0) return false;
    if (profitFilter === "loss" && inv.grossProfit >= 0) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      String(inv.slNo).toLowerCase().includes(q) ||
      inv.id.toLowerCase().includes(q) ||
      inv.customerName.toLowerCase().includes(q)
    );
  });

  const filteredItems = itemPLList.filter(item => {
    if (profitFilter === "profit" && item.profit < 0) return false;
    if (profitFilter === "loss" && item.profit >= 0) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.productName.toLowerCase().includes(q) ||
      item.productId.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.hsnCode.toLowerCase().includes(q)
    );
  });

  const filteredCategories = categoryPLList.filter(cat => {
    if (profitFilter === "profit" && cat.profit < 0) return false;
    if (profitFilter === "loss" && cat.profit >= 0) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return cat.category.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
      {/* ── Executive Stat Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniCard label="Total Sales Revenue" value={fmtRs(overall.totalRevenue)} color="blue" />
        <MiniCard label="Cost of Goods Sold (COGS)" value={fmtRs(overall.totalCost)} color="purple" />
        <div className={`rounded-xl border p-3 ${overall.grossProfit >= 0 ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
          <div className="flex items-center justify-between">
            <p className="text-base font-bold leading-tight tabular-nums">{fmtRs(overall.grossProfit)}</p>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${overall.grossProfit >= 0 ? "bg-emerald-200 text-emerald-900" : "bg-red-200 text-red-900"}`}>
              {overall.overallMargin}% Margin
            </span>
          </div>
          <p className="text-xs mt-0.5 opacity-80 font-medium">Net Gross {overall.grossProfit >= 0 ? "Profit" : "Loss"}</p>
        </div>
        <MiniCard label="Total Units Sold" value={`${overall.totalItemsSold.toLocaleString("en-IN")} units (${overall.totalInvoices} Invoices)`} color="slate" />
      </div>

      {/* ── View Switcher & Filters ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setPlView("invoices")}
            className={`px-3 py-1.5 rounded-md transition whitespace-nowrap flex items-center gap-1.5 ${
              plView === "invoices" ? "bg-white text-blue-700 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>🧾</span>
            <span>By Sale Invoice ({invoicePLList.length})</span>
          </button>
          <button
            onClick={() => setPlView("items")}
            className={`px-3 py-1.5 rounded-md transition whitespace-nowrap flex items-center gap-1.5 ${
              plView === "items" ? "bg-white text-blue-700 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>📦</span>
            <span>By Item / Product ({itemPLList.length})</span>
          </button>
          <button
            onClick={() => setPlView("categories")}
            className={`px-3 py-1.5 rounded-md transition whitespace-nowrap flex items-center gap-1.5 ${
              plView === "categories" ? "bg-white text-blue-700 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>📁</span>
            <span>By Category ({categoryPLList.length})</span>
          </button>
          <button
            onClick={() => setPlView("overview")}
            className={`px-3 py-1.5 rounded-md transition whitespace-nowrap flex items-center gap-1.5 ${
              plView === "overview" ? "bg-white text-blue-700 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>📊</span>
            <span>Overview</span>
          </button>
        </div>

        {/* Filter & Search */}
        {plView !== "overview" && (
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Search */}
            <div className="relative flex-1 sm:w-56">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">🔍</span>
              <input
                type="text"
                placeholder="Search report…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Profit / Loss filter pills */}
            <div className="flex items-center gap-1 text-xs">
              <button
                onClick={() => setProfitFilter("all")}
                className={`px-2.5 py-1 rounded-lg font-medium transition ${
                  profitFilter === "all" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setProfitFilter("profit")}
                className={`px-2.5 py-1 rounded-lg font-medium transition ${
                  profitFilter === "profit" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                }`}
              >
                🟢 Profit
              </button>
              <button
                onClick={() => setProfitFilter("loss")}
                className={`px-2.5 py-1 rounded-lg font-medium transition ${
                  profitFilter === "loss" ? "bg-red-600 text-white" : "bg-red-50 text-red-700 hover:bg-red-100"
                }`}
              >
                🔴 Loss
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 1. BY EACH SALE INVOICE VIEW ── */}
      {plView === "invoices" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-semibold">
                  <th className="text-center px-2 py-3">Stack #</th>
                  <th className="text-left px-3 py-3">Invoice SL No</th>
                  <th className="text-left px-3 py-3">Date</th>
                  <th className="text-left px-3 py-3">Customer</th>
                  <th className="text-center px-2 py-3">Items</th>
                  <th className="text-right px-3 py-3">Revenue (Taxable)</th>
                  <th className="text-right px-3 py-3">Cost (COGS)</th>
                  <th className="text-right px-3 py-3">Gross Profit</th>
                  <th className="text-center px-3 py-3">Margin %</th>
                  <th className="text-center px-2 py-3">Breakdown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-slate-400">
                      <div className="text-3xl mb-2">🧾</div>
                      <p className="text-sm font-semibold">No sales invoices found for this period</p>
                      <p className="text-xs text-slate-400 mt-0.5">Change date range or filter</p>
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv, idx) => {
                    const isTop = idx === 0;
                    const isProfitable = inv.grossProfit >= 0;
                    const isExpanded = expandedInvoiceIds.has(inv.id);

                    return (
                      <Fragment key={inv.id}>
                        <tr className={`hover:bg-slate-50 transition-colors ${isTop ? "bg-blue-50/20" : ""}`}>
                          <td className="px-2 py-2.5 text-center font-mono text-[11px] font-bold">
                            {isTop ? (
                              <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[10px]">TOP</span>
                            ) : (
                              <span className="text-slate-400">#{idx + 1}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-mono font-bold text-blue-800 whitespace-nowrap">
                            {inv.slNo}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(inv.orderDate)}</td>
                          <td className="px-3 py-2.5 font-semibold text-slate-800">{inv.customerName}</td>
                          <td className="px-2 py-2.5 text-center text-slate-500 font-mono">{inv.itemsCount}</td>
                          <td className="px-3 py-2.5 text-right font-medium text-slate-800">{fmtRs(inv.totalRevenue)}</td>
                          <td className="px-3 py-2.5 text-right text-slate-600">{fmtRs(inv.totalCost)}</td>
                          <td className="px-3 py-2.5 text-right font-bold whitespace-nowrap">
                            <span className={isProfitable ? "text-emerald-600" : "text-red-600"}>
                              {isProfitable ? `+${fmtRs(inv.grossProfit)}` : `−${fmtRs(Math.abs(inv.grossProfit))}`}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isProfitable ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                            }`}>
                              {isProfitable ? `+${inv.marginPct}%` : `${inv.marginPct}%`}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <button
                              onClick={() => toggleInvoiceExpand(inv.id)}
                              className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 bg-blue-50 hover:bg-blue-100 rounded transition flex items-center gap-1 mx-auto"
                            >
                              <span>{isExpanded ? "▲ Hide" : "▼ Items"}</span>
                            </button>
                          </td>
                        </tr>

                        {/* Expandable Line Item Details for this Invoice */}
                        {isExpanded && (
                          <tr className="bg-slate-50/80">
                            <td colSpan={10} className="p-3">
                              <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-2xs space-y-2">
                                <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                                  <span>📦</span> Line Item Profit & Loss Breakdown — {inv.slNo}
                                </p>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-[11px]">
                                    <thead>
                                      <tr className="bg-slate-100 text-slate-600 uppercase font-semibold border-b border-slate-200">
                                        <th className="text-left px-2.5 py-1.5">Product</th>
                                        <th className="text-left px-2.5 py-1.5">Category</th>
                                        <th className="text-right px-2.5 py-1.5">Qty Sold</th>
                                        <th className="text-right px-2.5 py-1.5">Sell Price</th>
                                        <th className="text-right px-2.5 py-1.5">Est. Cost</th>
                                        <th className="text-right px-2.5 py-1.5">Revenue</th>
                                        <th className="text-right px-2.5 py-1.5">Cost</th>
                                        <th className="text-right px-2.5 py-1.5">Item Profit</th>
                                        <th className="text-center px-2.5 py-1.5">Margin %</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {inv.items.map((item, liIdx) => {
                                        const liProfit = item.profit >= 0;
                                        return (
                                          <tr key={liIdx} className="hover:bg-slate-50/50">
                                            <td className="px-2.5 py-1.5 font-medium text-slate-800">{item.productName}</td>
                                            <td className="px-2.5 py-1.5 text-slate-500">{item.category}</td>
                                            <td className="px-2.5 py-1.5 text-right font-semibold text-slate-700">{item.qty} {item.unit}</td>
                                            <td className="px-2.5 py-1.5 text-right text-slate-600">{fmtRs(item.sellingPrice)}</td>
                                            <td className="px-2.5 py-1.5 text-right text-slate-500 font-mono">{fmtRs(item.unitCost)}</td>
                                            <td className="px-2.5 py-1.5 text-right font-medium text-slate-800">{fmtRs(item.revenue)}</td>
                                            <td className="px-2.5 py-1.5 text-right text-slate-600">{fmtRs(item.cost)}</td>
                                            <td className={`px-2.5 py-1.5 text-right font-bold ${liProfit ? "text-emerald-600" : "text-red-600"}`}>
                                              {liProfit ? `+${fmtRs(item.profit)}` : `−${fmtRs(Math.abs(item.profit))}`}
                                            </td>
                                            <td className="px-2.5 py-1.5 text-center">
                                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${liProfit ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                                                {item.margin}%
                                              </span>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
              {filteredInvoices.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-800">
                    <td colSpan={5} className="px-4 py-3">Total ({filteredInvoices.length} Invoices)</td>
                    <td className="px-3 py-3 text-right">{fmtRs(filteredInvoices.reduce((s, i) => s + i.totalRevenue, 0))}</td>
                    <td className="px-3 py-3 text-right">{fmtRs(filteredInvoices.reduce((s, i) => s + i.totalCost, 0))}</td>
                    <td className="px-3 py-3 text-right text-emerald-700 text-sm">
                      {fmtRs(filteredInvoices.reduce((s, i) => s + i.grossProfit, 0))}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── 2. BY EACH ITEM / PRODUCT VIEW ── */}
      {plView === "items" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-semibold">
                  <th className="text-left px-4 py-3">Product</th>
                  <th className="text-left px-3 py-3">Category</th>
                  <th className="text-left px-3 py-3">HSN Code</th>
                  <th className="text-right px-3 py-3">Total Qty Sold</th>
                  <th className="text-right px-3 py-3">Avg Sell Price</th>
                  <th className="text-right px-3 py-3">Unit Cost</th>
                  <th className="text-right px-3 py-3">Total Revenue</th>
                  <th className="text-right px-3 py-3">Total Cost</th>
                  <th className="text-right px-3 py-3">Net Profit</th>
                  <th className="text-center px-3 py-3">Profit Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-slate-400">
                      <div className="text-3xl mb-2">📦</div>
                      <p className="text-sm font-semibold">No product sales in this period</p>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map(item => {
                    const isProfit = item.profit >= 0;
                    return (
                      <tr key={item.productId} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-slate-800">
                          <div>
                            <p className="font-semibold text-slate-900">{item.productName}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{item.productId}</p>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium text-[10px] border border-blue-100">
                            {item.category}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 font-mono text-[11px]">{item.hsnCode}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-slate-800">
                          {item.qtySold.toLocaleString("en-IN")} {item.unit}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{fmtRs(item.avgSellingPrice)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-500 font-mono">{fmtRs(item.unitCost)}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-slate-800">{fmtRs(item.revenue)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{fmtRs(item.cost)}</td>
                        <td className="px-3 py-2.5 text-right font-bold whitespace-nowrap">
                          <span className={isProfit ? "text-emerald-600" : "text-red-600"}>
                            {isProfit ? `+${fmtRs(item.profit)}` : `−${fmtRs(Math.abs(item.profit))}`}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isProfit ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                          }`}>
                            {isProfit ? `+${item.margin}%` : `${item.margin}%`}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredItems.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-800">
                    <td colSpan={6} className="px-4 py-3">Total Items Sold ({filteredItems.length} products)</td>
                    <td className="px-3 py-3 text-right">{fmtRs(filteredItems.reduce((s, i) => s + i.revenue, 0))}</td>
                    <td className="px-3 py-3 text-right">{fmtRs(filteredItems.reduce((s, i) => s + i.cost, 0))}</td>
                    <td className="px-3 py-3 text-right text-emerald-700 text-sm">
                      {fmtRs(filteredItems.reduce((s, i) => s + i.profit, 0))}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── 3. BY EACH CATEGORY VIEW ── */}
      {plView === "categories" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-semibold">
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-center px-3 py-3">Products</th>
                  <th className="text-center px-3 py-3">Invoices</th>
                  <th className="text-right px-3 py-3">Units Sold</th>
                  <th className="text-right px-3 py-3">Category Revenue</th>
                  <th className="text-right px-3 py-3">Category Cost</th>
                  <th className="text-right px-3 py-3">Category Net Profit</th>
                  <th className="text-center px-3 py-3">Profit Margin</th>
                  <th className="text-left px-3 py-3 min-w-[120px]">Contribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCategories.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-slate-400">
                      <div className="text-3xl mb-2">📁</div>
                      <p className="text-sm font-semibold">No category sales in this period</p>
                    </td>
                  </tr>
                ) : (
                  filteredCategories.map(cat => {
                    const isProfit = cat.profit >= 0;
                    const revenueShare = overall.totalRevenue > 0 ? round2((cat.revenue / overall.totalRevenue) * 100) : 0;

                    return (
                      <tr key={cat.category} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-800 text-sm flex items-center gap-1.5">
                          <span>📁</span> {cat.category}
                        </td>
                        <td className="px-3 py-3 text-center text-slate-600 font-semibold">{cat.uniqueProductsCount}</td>
                        <td className="px-3 py-3 text-center text-slate-600 font-semibold">{cat.invoicesCount}</td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-800">{cat.qtySold.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-3 text-right font-medium text-slate-800">{fmtRs(cat.revenue)}</td>
                        <td className="px-3 py-3 text-right text-slate-600">{fmtRs(cat.cost)}</td>
                        <td className="px-3 py-3 text-right font-bold whitespace-nowrap">
                          <span className={isProfit ? "text-emerald-600" : "text-red-600"}>
                            {isProfit ? `+${fmtRs(cat.profit)}` : `−${fmtRs(Math.abs(cat.profit))}`}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            isProfit ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                          }`}>
                            {isProfit ? `+${cat.margin}%` : `${cat.margin}%`}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                              <span>Share</span>
                              <span>{revenueShare}%</span>
                            </div>
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div className="bg-blue-600 h-full rounded-full" style={{ width: `${Math.min(100, revenueShare)}%` }}></div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredCategories.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-800">
                    <td colSpan={4} className="px-4 py-3">Total Categories ({filteredCategories.length})</td>
                    <td className="px-3 py-3 text-right">{fmtRs(filteredCategories.reduce((s, i) => s + i.revenue, 0))}</td>
                    <td className="px-3 py-3 text-right">{fmtRs(filteredCategories.reduce((s, i) => s + i.cost, 0))}</td>
                    <td className="px-3 py-3 text-right text-emerald-700 text-sm">
                      {fmtRs(filteredCategories.reduce((s, i) => s + i.profit, 0))}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── 4. OVERVIEW COMPARISON VIEW ── */}
      {plView === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span>🏆</span> Top 5 Most Profitable Products
            </h3>
            <div className="divide-y divide-slate-100 text-xs">
              {itemPLList.slice(0, 5).map((item, idx) => (
                <div key={item.productId} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-[10px]">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-slate-800">{item.productName}</p>
                      <p className="text-[10px] text-slate-400">{item.qtySold} {item.unit} sold · {item.category}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-emerald-600">+{fmtRs(item.profit)}</span>
                    <span className="block text-[10px] text-slate-400">{item.margin}% margin</span>
                  </div>
                </div>
              ))}
              {itemPLList.length === 0 && <p className="text-center py-6 text-slate-400">No sales recorded</p>}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span>📁</span> Category Profitability Share
            </h3>
            <div className="divide-y divide-slate-100 text-xs">
              {categoryPLList.map(cat => {
                const profitShare = overall.grossProfit > 0 ? round2((cat.profit / overall.grossProfit) * 100) : 0;
                return (
                  <div key={cat.category} className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <span>📁</span> {cat.category}
                      </p>
                      <p className="text-[10px] text-slate-400">{cat.qtySold} units sold</p>
                    </div>
                    <div className="text-right">
                      <span className={`font-bold ${cat.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {cat.profit >= 0 ? `+${fmtRs(cat.profit)}` : `−${fmtRs(Math.abs(cat.profit))}`}
                      </span>
                      <span className="block text-[10px] text-slate-400">{profitShare}% of total profit</span>
                    </div>
                  </div>
                );
              })}
              {categoryPLList.length === 0 && <p className="text-center py-6 text-slate-400">No category sales</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────
type InvoiceRow = { id: string; date: string; party: string; stateType: string; total: number; advance: number; due: number; items: { amount?: number; cgst?: number; sgst?: number; igst?: number }[] };

function InvoiceTable({ rows, emptyMsg, emptyIcon }: { rows: InvoiceRow[]; emptyMsg: string; emptyIcon: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-center px-2 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Stack #</th>
              {["Invoice ID","Date","Party","Type","Taxable","GST","Total","Advance","Due"].map(h => (
                <th key={h} className="text-right first:text-left px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-10 text-slate-400">
                <div className="text-3xl mb-2">{emptyIcon}</div>
                <p className="text-sm">{emptyMsg}</p>
              </td></tr>
            ) : rows.map((r, idx) => {
              const taxable = round2(r.items.reduce((s, i) => s + (i.amount ?? 0), 0));
              const gst     = round2(r.items.reduce((s, i) => s + (i.cgst ?? 0) + (i.sgst ?? 0) + (i.igst ?? 0), 0));
              const isTop = idx === 0;

              return (
                <tr key={r.id} className={`hover:bg-slate-50 transition-colors ${isTop ? "bg-blue-50/20" : ""}`}>
                  <td className="px-2 py-2.5 text-center font-mono text-[11px] font-bold">
                    {isTop ? (
                      <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[10px]">
                        TOP
                      </span>
                    ) : (
                      <span className="text-slate-400">#{idx + 1}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold text-blue-700">{r.id}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600 whitespace-nowrap text-xs">{fmtDate(r.date)}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-slate-800 text-xs">{r.party}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`inline-block px-1.5 py-0.5 text-xs font-medium rounded ${r.stateType === "intrastate" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>
                      {r.stateType === "intrastate" ? "Intra" : "Inter"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600 whitespace-nowrap text-xs">{fmtRs(taxable)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600 whitespace-nowrap text-xs">{fmtRs(gst)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-800 whitespace-nowrap text-xs">{fmtRs(r.total)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-500 whitespace-nowrap text-xs">{fmtRs(r.advance)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap text-xs">
                    <span className={r.due > 0 ? "text-amber-600 font-bold" : "text-emerald-600"}>{fmtRs(r.due)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type MiniColor = "slate" | "blue" | "green" | "purple" | "amber" | "red";
function MiniCard({ label, value, color }: { label: string; value: string; color: MiniColor }) {
  const cls: Record<MiniColor, string> = {
    slate:  "bg-slate-50 border-slate-200 text-slate-700",
    blue:   "bg-blue-50 border-blue-200 text-blue-700",
    green:  "bg-emerald-50 border-emerald-200 text-emerald-700",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
    amber:  "bg-amber-50 border-amber-200 text-amber-700",
    red:    "bg-red-50 border-red-200 text-red-700",
  };
  return (
    <div className={`rounded-xl border p-3 ${cls[color]}`}>
      <p className="text-base font-bold leading-tight tabular-nums">{value}</p>
      <p className="text-xs mt-0.5 opacity-80 font-medium">{label}</p>
    </div>
  );
}
