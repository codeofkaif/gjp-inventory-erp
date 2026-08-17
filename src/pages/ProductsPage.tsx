import { useState, useEffect } from "react";
import type { Product } from "../types";
import { get, set } from "../lib/storage";
import { PRODUCTS_KEY } from "../lib/initStore";
import { logActivity } from "../lib/activityLog";
import { useAuth } from "../lib/AuthContext";
import ProductTable from "../components/ProductTable";
import ProductForm from "../components/ProductForm";
import DeleteDialog from "../components/DeleteDialog";

type Modal =
  | { type: "add" }
  | { type: "edit"; product: Product }
  | { type: "delete"; product: Product }
  | null;

function loadProducts(): Product[] {
  return get<Product[]>(PRODUCTS_KEY) ?? [];
}

function saveProducts(products: Product[]): void {
  set<Product[]>(PRODUCTS_KEY, products);
}

export default function ProductsPage() {
  const { role } = useAuth();
  const [products, setProducts] = useState<Product[]>(loadProducts);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<Modal>(null);

  // Re-read stock from localStorage on every mount so values are always live
  // (Sales / Purchases / StockRegister write to localStorage between navigations)
  useEffect(() => {
    setProducts(loadProducts());
  }, []);

  const existingIds = products.map((p) => p.id);
  const existingCategories = Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[];

  function handleSave(updated: Product) {
    let next: Product[];
    const isEdit = modal?.type === "edit";
    if (isEdit) {
      next = products.map((p) => (p.id === updated.id ? updated : p));
      logActivity("edit", "product", updated.id);
    } else {
      next = [updated, ...products];
      logActivity("create", "product", updated.id);
    }
    saveProducts(next);
    setProducts(next);
    setModal(null);
  }

  function handleDelete() {
    if (modal?.type !== "delete" || role !== "admin") return;
    const next = products.filter((p) => p.id !== modal.product.id);
    logActivity("delete", "product", modal.product.id);
    saveProducts(next);
    setProducts(next);
    setModal(null);
  }

  // Summary stats for the header cards
  const outOfStock = products.filter((p) => p.stockQty === 0).length;
  const lowStock = products.filter(
    (p) => p.stockQty > 0 && p.stockQty < p.reorderLevel
  ).length;
  const nearReorder = products.filter(
    (p) => p.stockQty >= p.reorderLevel && p.stockQty < p.reorderLevel * 1.2
  ).length;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Products</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage your product catalogue and stock levels category-wise
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total Products"
          value={products.length}
          color="blue"
          icon="📦"
        />
        <StatCard
          label="Out of Stock"
          value={outOfStock}
          color="red"
          icon="⚠"
        />
        <StatCard
          label="Low Stock"
          value={lowStock}
          color="amber"
          icon="↓"
        />
        <StatCard
          label="Near Reorder"
          value={nearReorder}
          color="orange"
          icon="🔔"
        />
      </div>

      {/* Table */}
      <ProductTable
        products={products}
        search={search}
        onSearch={setSearch}
        onAdd={() => setModal({ type: "add" })}
        onEdit={(p) => setModal({ type: "edit", product: p })}
        onDelete={(p) => setModal({ type: "delete", product: p })}
        canDelete={role === "admin"}
      />

      {/* Modals */}
      {(modal?.type === "add" || modal?.type === "edit") && (
        <ProductForm
          initial={modal.type === "edit" ? modal.product : null}
          existingIds={existingIds}
          existingCategories={existingCategories}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === "delete" && (
        <DeleteDialog
          productName={modal.product.name}
          onConfirm={handleDelete}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  color: "blue" | "red" | "amber" | "orange";
  icon: string;
}

const colorMap = {
  blue: "bg-blue-50 border-blue-200 text-blue-700",
  red: "bg-red-50 border-red-200 text-red-700",
  amber: "bg-amber-50 border-amber-200 text-amber-700",
  orange: "bg-orange-50 border-orange-200 text-orange-700",
};

function StatCard({ label, value, color, icon }: StatCardProps) {
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 ${colorMap[color]}`}>
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="text-xs mt-1 opacity-80 font-medium">{label}</p>
      </div>
    </div>
  );
}
