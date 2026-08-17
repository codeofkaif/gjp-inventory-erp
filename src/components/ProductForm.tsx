import { useEffect, useRef, useState } from "react";
import type { Product } from "../types";

type Errors = Partial<Record<keyof Product, string>>;

interface Props {
  initial?: Product | null;
  existingIds: string[];
  existingCategories?: string[];
  onSave: (p: Product) => void;
  onClose: () => void;
}

const DEFAULT_CATEGORIES = [
  "Dates",
  "Dry Fruits & Nuts",
  "Spices & Masalas",
  "Seeds",
  "Flours & Grains",
  "Desserts & Mixes",
  "Beverages",
  "Oil & Ghee",
  "General",
];

function nextId(existingIds: string[]): string {
  const nums = existingIds
    .filter((id) => /^P\d+$/.test(id))
    .map((id) => parseInt(id.slice(1), 10));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `P${String(max + 1).padStart(3, "0")}`;
}

export default function ProductForm({
  initial,
  existingIds,
  existingCategories = [],
  onSave,
  onClose,
}: Props) {
  const isEdit = !!initial;

  // Initialize completely clean and empty when adding
  const [form, setForm] = useState<Product>(() =>
    initial
      ? { ...initial, category: initial.category || "General" }
      : {
          id: nextId(existingIds),
          name: "",
          category: "Dates",
          hsnCode: "",
          unit: "pcs",
          gstRate: 5,
          unitPrice: 0,
          stockQty: 0,
          reorderLevel: 20,
        }
  );

  const [rawValues, setRawValues] = useState({
    unitPrice: initial && initial.unitPrice > 0 ? String(initial.unitPrice) : "",
    stockQty: initial && initial.stockQty > 0 ? String(initial.stockQty) : "",
    reorderLevel: initial && initial.reorderLevel > 0 ? String(initial.reorderLevel) : "",
    gstRate: initial ? String(initial.gstRate) : "5",
  });

  const [errors, setErrors] = useState<Errors>({});
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const allCategories = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...existingCategories.filter(Boolean)])
  );

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function field<K extends keyof Product>(key: K, value: Product[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const e: Errors = {};
    if (!form.id.trim()) e.id = "ID is required";
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.hsnCode.trim()) e.hsnCode = "HSN Code is required";
    if (form.gstRate < 0) e.gstRate = "GST rate must be ≥ 0";
    if (form.unitPrice < 0) e.unitPrice = "Unit price must be ≥ 0";
    if (form.stockQty < 0) e.stockQty = "Stock qty must be ≥ 0";
    if (form.reorderLevel < 0) e.reorderLevel = "Reorder level must be ≥ 0";
    if (!isEdit && existingIds.includes(form.id.trim())) {
      e.id = `ID "${form.id.trim()}" already exists`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validate()) {
      onSave({
        ...form,
        id: form.id.trim(),
        name: form.name.trim(),
        hsnCode: form.hsnCode.trim(),
        category: form.category?.trim() || "General",
      });
    }
  }

  const inputCls = (key: keyof Product) =>
    `w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
      errors[key]
        ? "border-red-400 bg-red-50 focus:ring-red-400"
        : "border-slate-200 bg-white"
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-6 animate-in fade-in slide-in-from-bottom-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              {isEdit ? "Edit Product" : "Add Product (Category-Wise)"}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter product details — all fields are fresh and empty for easy typing
            </p>
          </div>
          <button
            id="product-form-close"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* ID & Unit row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Product ID *</label>
              <input
                id="field-id"
                type="text"
                className={inputCls("id")}
                value={form.id}
                onFocus={(e) => e.target.select()}
                onChange={(e) => field("id", e.target.value.toUpperCase())}
                disabled={isEdit}
                placeholder="P056"
              />
              {errors.id && <p className="text-xs text-red-500 mt-1">{errors.id}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Unit *</label>
              <select
                id="field-unit"
                className={inputCls("unit")}
                value={form.unit}
                onChange={(e) => field("unit", e.target.value as "kg" | "pcs")}
              >
                <option value="pcs">pcs (Pieces / Packets)</option>
                <option value="kg">kg (Kilograms)</option>
              </select>
            </div>
          </div>

          {/* Category Selection */}
          <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-blue-900">
                Product Category *
              </label>
              <button
                type="button"
                onClick={() => setIsCustomCategory(!isCustomCategory)}
                className="text-[11px] text-blue-700 hover:text-blue-900 font-medium underline"
              >
                {isCustomCategory ? "Choose from presets" : "+ Custom Category"}
              </button>
            </div>

            {isCustomCategory ? (
              <input
                type="text"
                placeholder="Type new category name (e.g. Organic Syrups)"
                value={form.category || ""}
                onFocus={(e) => e.target.select()}
                onChange={(e) => field("category", e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            ) : (
              <select
                id="field-category"
                value={form.category || "General"}
                onChange={(e) => field("category", e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-blue-200 rounded-lg font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {allCategories.map((c) => (
                  <option key={c} value={c}>
                    📁 {c}
                  </option>
                ))}
              </select>
            )}

            {/* Quick selection pills */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {DEFAULT_CATEGORIES.slice(0, 6).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    field("category", cat);
                    setIsCustomCategory(false);
                  }}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition ${
                    form.category === cat
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-blue-100 hover:text-blue-800"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Product Name *</label>
            <input
              id="field-name"
              ref={nameRef}
              type="text"
              className={inputCls("name")}
              value={form.name}
              onFocus={(e) => e.target.select()}
              onChange={(e) => field("name", e.target.value)}
              placeholder="e.g. Premium Ajwa Dates"
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          {/* HSN Code */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">HSN Code *</label>
            <input
              id="field-hsn"
              type="text"
              className={inputCls("hsnCode")}
              value={form.hsnCode}
              onFocus={(e) => e.target.select()}
              onChange={(e) => field("hsnCode", e.target.value)}
              placeholder="e.g. 08041010"
            />
            {errors.hsnCode && <p className="text-xs text-red-500 mt-1">{errors.hsnCode}</p>}
          </div>

          {/* GST & Unit Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">GST Rate (%) *</label>
              <input
                id="field-gst"
                type="number"
                min={0}
                step={0.01}
                className={inputCls("gstRate")}
                value={rawValues.gstRate}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  setRawValues((prev) => ({ ...prev, gstRate: e.target.value }));
                  field("gstRate", parseFloat(e.target.value) || 0);
                }}
                placeholder="5"
              />
              {errors.gstRate && <p className="text-xs text-red-500 mt-1">{errors.gstRate}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Unit Price (₹)</label>
              <input
                id="field-price"
                type="number"
                min={0}
                step={0.01}
                className={inputCls("unitPrice")}
                value={rawValues.unitPrice}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  setRawValues((prev) => ({ ...prev, unitPrice: e.target.value }));
                  field("unitPrice", parseFloat(e.target.value) || 0);
                }}
                placeholder="0.00"
              />
              {errors.unitPrice && <p className="text-xs text-red-500 mt-1">{errors.unitPrice}</p>}
            </div>
          </div>

          {/* Stock Qty & Reorder Level */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Stock Qty *</label>
              <input
                id="field-stock"
                type="number"
                min={0}
                step={0.001}
                className={inputCls("stockQty")}
                value={rawValues.stockQty}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  setRawValues((prev) => ({ ...prev, stockQty: e.target.value }));
                  field("stockQty", parseFloat(e.target.value) || 0);
                }}
                placeholder="0"
              />
              {errors.stockQty && <p className="text-xs text-red-500 mt-1">{errors.stockQty}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Reorder Level *</label>
              <input
                id="field-reorder"
                type="number"
                min={0}
                step={0.001}
                className={inputCls("reorderLevel")}
                value={rawValues.reorderLevel}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  setRawValues((prev) => ({ ...prev, reorderLevel: e.target.value }));
                  field("reorderLevel", parseFloat(e.target.value) || 0);
                }}
                placeholder="20"
              />
              {errors.reorderLevel && <p className="text-xs text-red-500 mt-1">{errors.reorderLevel}</p>}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button
            id="product-form-cancel"
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition"
          >
            Cancel
          </button>
          <button
            id="product-form-save"
            type="submit"
            onClick={handleSubmit}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm transition"
          >
            {isEdit ? "Save Changes" : "Add Product"}
          </button>
        </div>
      </div>
    </div>
  );
}
