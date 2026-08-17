import { useState } from "react";
import type { Product } from "../types";

interface Props {
  products: Product[];
  search: string;
  onSearch: (q: string) => void;
  onAdd: () => void;
  onEdit: (p: Product) => void;
  onDelete: (p: Product) => void;
  canDelete?: boolean;
}

function rowClass(p: Product): string {
  if (p.stockQty < p.reorderLevel) {
    return "bg-red-50 border-l-4 border-red-400";
  }
  if (p.stockQty < p.reorderLevel * 1.2) {
    return "bg-amber-50 border-l-4 border-amber-400";
  }
  return "border-l-4 border-transparent";
}

function stockBadge(p: Product) {
  if (p.stockQty < p.reorderLevel) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
        ⚠ Low
      </span>
    );
  }
  if (p.stockQty < p.reorderLevel * 1.2) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
        ↓ Near
      </span>
    );
  }
  return null;
}

function categoryBadge(category?: string) {
  const cat = category || "General";
  const colors: Record<string, string> = {
    "Dates": "bg-amber-100 text-amber-800 border-amber-200",
    "Dry Fruits & Nuts": "bg-orange-100 text-orange-800 border-orange-200",
    "Spices & Masalas": "bg-red-100 text-red-800 border-red-200",
    "Seeds": "bg-emerald-100 text-emerald-800 border-emerald-200",
    "Flours & Grains": "bg-yellow-100 text-yellow-800 border-yellow-200",
    "Desserts & Mixes": "bg-purple-100 text-purple-800 border-purple-200",
    "Beverages": "bg-blue-100 text-blue-800 border-blue-200",
    "General": "bg-slate-100 text-slate-700 border-slate-200",
  };
  const cls = colors[cat] || "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <span className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded-md border ${cls}`}>
      {cat}
    </span>
  );
}

export default function ProductTable({
  products,
  search,
  onSearch,
  onAdd,
  onEdit,
  onDelete,
  canDelete = true,
}: Props) {
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const allCategories = ["All", ...Array.from(new Set(products.map((p) => p.category || "General")))];

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.hsnCode.toLowerCase().includes(q) ||
      (p.category && p.category.toLowerCase().includes(q));

    const matchesCategory =
      selectedCategory === "All" || (p.category || "General") === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  // Sort products so recently added items (highest ID) appear at the TOP
  const sortedFiltered = [...filtered].sort((a, b) => {
    const numA = parseInt(a.id.replace(/\D/g, ""), 10) || 0;
    const numB = parseInt(b.id.replace(/\D/g, ""), 10) || 0;
    if (numA !== numB) return numB - numA;
    return b.id.localeCompare(a.id);
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Category Pills Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1 shrink-0">
          <span>📁</span> Categories:
        </span>
        {allCategories.map((cat) => {
          const count = cat === "All" ? products.length : products.filter((p) => (p.category || "General") === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === cat
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span>{cat}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  selectedCategory === cat ? "bg-blue-800 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">
            🔍
          </span>
          <input
            id="product-search"
            type="text"
            placeholder="Search by name, category, code or HSN…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition shadow-sm"
          />
          {search && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              onClick={() => onSearch("")}
            >
              ✕
            </button>
          )}
        </div>

        {/* Count badge */}
        <span className="text-xs text-slate-500 font-medium bg-slate-100 px-3 py-2 rounded-lg">
          {sortedFiltered.length} of {products.length} products
        </span>

        {/* Add Product Button */}
        <button
          id="btn-add-product"
          onClick={onAdd}
          className="ml-auto flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-sm transition duration-150"
        >
          <span className="text-base leading-none">+</span>
          Add Product
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                  Product
                </th>
                <th className="text-left px-3 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                  Category
                </th>
                <th className="text-left px-3 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                  Code
                </th>
                <th className="text-left px-3 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                  HSN
                </th>
                <th className="text-center px-3 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                  Unit
                </th>
                <th className="text-right px-3 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                  GST Rate
                </th>
                <th className="text-right px-3 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                  Unit Price
                </th>
                <th className="text-right px-3 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                  Stock Qty
                </th>
                <th className="text-right px-3 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                  Reorder Level
                </th>
                <th className="text-center px-3 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                  Status
                </th>
                <th className="text-center px-4 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedFiltered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-slate-400">
                    <div className="text-3xl mb-2">📦</div>
                    <p className="text-sm font-medium">No products found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {search ? "Try adjusting your search query" : "Click \"Add Product\" to create one"}
                    </p>
                  </td>
                </tr>
              ) : (
                sortedFiltered.map((p) => (
                  <tr
                    key={p.id}
                    className={`transition-colors duration-100 hover:bg-slate-50/80 ${rowClass(p)}`}
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">
                      <div className="flex items-center gap-2">
                        <span>{p.name}</span>
                        {stockBadge(p)}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {categoryBadge(p.category)}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs font-semibold text-blue-700">{p.id}</td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-500">{p.hsnCode}</td>
                    <td className="px-3 py-3">
                      <span className="inline-block px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 rounded">
                        {p.unit}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-slate-700">{p.gstRate}%</td>
                    <td className="px-3 py-3 text-right text-slate-700 font-medium">
                      {p.unitPrice > 0 ? `₹${p.unitPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-800">
                      {p.stockQty.toLocaleString("en-IN")}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-500">{p.reorderLevel.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          id={`btn-edit-${p.id}`}
                          onClick={() => onEdit(p)}
                          className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                        >
                          Edit
                        </button>
                        {canDelete && (
                          <button
                            id={`btn-delete-${p.id}`}
                            onClick={() => onDelete(p)}
                            className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
