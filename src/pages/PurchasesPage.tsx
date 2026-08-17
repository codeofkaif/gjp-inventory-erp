import { useState, useRef, useEffect } from "react";
import type { PurchaseInvoice, InvoiceItem, Party, Product, StateType } from "../types";
import { get, set } from "../lib/storage";
import { PURCHASES_KEY, PARTIES_KEY, PRODUCTS_KEY } from "../lib/initStore";
import { newInvoiceId, newPartyId, nextPurchaseSlNo, applyInvoiceItems, updatePurchaseInvoice, ensureParty } from "../lib/stockOps";
import { computeItemGst, lineTotal, round2 } from "../lib/gstUtils";
import { logActivity } from "../lib/activityLog";
import InvoiceViewModal from "../components/InvoiceViewModal";

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayIso = () => new Date().toISOString().slice(0, 10);

function loadPurchases(): PurchaseInvoice[] { return get<PurchaseInvoice[]>(PURCHASES_KEY) ?? []; }
function loadSuppliers(): Party[]           { return (get<Party[]>(PARTIES_KEY) ?? []).filter(p => p.type === "supplier"); }
function loadProducts():  Product[]         { return get<Product[]>(PRODUCTS_KEY) ?? []; }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtRs(n: number) { return "₹" + (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 }); }

type LineItem = InvoiceItem & { _key: number };

function blankItem(): LineItem {
  return { _key: Date.now() + Math.random(), productId: "", qty: 1, unitPrice: 0, discount: 0, amount: 0, cgst: 0, sgst: 0, igst: 0 };
}

function computeDueDate(baseDate: string, days: number): string {
  try {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + (days || 0));
    return d.toISOString().slice(0, 10);
  } catch {
    return baseDate;
  }
}

// ── Root component ────────────────────────────────────────────────────────────
export default function PurchasesPage() {
  const [view, setView]               = useState<"list" | "form">("list");
  const [editingInvoice, setEditingInvoice] = useState<PurchaseInvoice | null>(null);
  const [purchases, setPurchases]     = useState<PurchaseInvoice[]>(loadPurchases);
  const [search, setSearch]           = useState("");
  const [viewInvoice, setViewInvoice] = useState<PurchaseInvoice | null>(null);

  const suppliers = loadSuppliers();
  const products = loadProducts();

  function handleNew() {
    setEditingInvoice(null);
    setView("form");
  }

  function handleEdit(inv: PurchaseInvoice) {
    setEditingInvoice(inv);
    setView("form");
  }

  function handleSaved(_savedInv: PurchaseInvoice) {
    setPurchases(loadPurchases());
    setView("list");
    setEditingInvoice(null);
  }

  return (
    <>
      {view === "list" ? (
        <PurchaseList
          purchases={purchases}
          search={search}
          onSearch={setSearch}
          onNew={handleNew}
          onEdit={handleEdit}
          onViewInvoice={(inv) => setViewInvoice(inv)}
        />
      ) : (
        <PurchaseForm
          initialInvoice={editingInvoice}
          onSaved={handleSaved}
          onCancel={() => {
            setView("list");
            setEditingInvoice(null);
          }}
        />
      )}

      {viewInvoice && (
        <InvoiceViewModal
          invoice={viewInvoice}
          type="purchase"
          parties={suppliers}
          products={products}
          onClose={() => setViewInvoice(null)}
        />
      )}
    </>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────
function PurchaseList({
  purchases,
  search,
  onSearch,
  onNew,
  onEdit,
  onViewInvoice,
}: {
  purchases: PurchaseInvoice[];
  search: string;
  onSearch: (s: string) => void;
  onNew: () => void;
  onEdit: (inv: PurchaseInvoice) => void;
  onViewInvoice: (inv: PurchaseInvoice) => void;
}) {
  const suppliers = loadSuppliers();
  const supplierMap = Object.fromEntries(suppliers.map((s) => [s.id, s]));

  const filtered = purchases
    .filter((p) => {
      const q = search.toLowerCase();
      const s = supplierMap[p.supplierId];
      return (
        p.id.toLowerCase().includes(q) ||
        (p.slNo && String(p.slNo).toLowerCase().includes(q)) ||
        (p.refNo && p.refNo.toLowerCase().includes(q)) ||
        (s?.name && s.name.toLowerCase().includes(q)) ||
        (s?.id && s.id.toLowerCase().includes(q)) ||
        (s?.gstin && s.gstin.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      const dateComp = b.orderDate.localeCompare(a.orderDate);
      if (dateComp !== 0) return dateComp;
      const numA = parseInt(String(a.slNo || a.id).replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(String(b.slNo || b.id).replace(/\D/g, ""), 10) || 0;
      if (numA !== numB) return numB - numA;
      return String(b.slNo || b.id).localeCompare(String(a.slNo || a.id));
    });

  const totalCgst = purchases.reduce((s, inv) => s + inv.items.reduce((a, i) => a + (i.cgst ?? 0), 0), 0);
  const totalSgst = purchases.reduce((s, inv) => s + inv.items.reduce((a, i) => a + (i.sgst ?? 0), 0), 0);
  const totalIgst = purchases.reduce((s, inv) => s + inv.items.reduce((a, i) => a + (i.igst ?? 0), 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Purchase Invoices</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage incoming purchases with supplier auto-suggestions & invoice editing</p>
        </div>
        <button id="btn-new-purchase" onClick={onNew}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition">
          <span className="text-base leading-none">+</span> New Purchase Voucher
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon="🛒" label="Invoices" value={String(purchases.length)} color="blue" />
        <StatCard icon="💸" label="Spent (incl. GST)" value={fmtRs(purchases.reduce((s, i) => s + i.total, 0))} color="purple" />
        <StatCard icon="🏛️" label="Input GST Total" value={fmtRs(totalCgst + totalSgst + totalIgst)} color="green" />
        <StatCard icon="⏳" label="Balance Payable" value={fmtRs(purchases.reduce((s, i) => s + i.balanceDue, 0))} color="amber" />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
        <input id="purchases-search" type="text" placeholder="Search invoice ID, supplier, GSTIN or ref…" value={search} onChange={e => onSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">Invoice / SL No</th>
                <th className="text-left px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">Date</th>
                <th className="text-left px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Supplier Details</th>
                <th className="text-center px-2 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Mode</th>
                <th className="text-right px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">Taxable</th>
                <th className="text-right px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">GST Split</th>
                <th className="text-right px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">Total</th>
                <th className="text-right px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">Advance</th>
                <th className="text-right px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">Payable</th>
                <th className="text-center px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-slate-400">
                  <div className="text-3xl mb-2">🛒</div>
                  <p className="text-sm">{search ? "No matches found" : "No purchases recorded yet"}</p>
                </td></tr>
              ) : filtered.map(p => {
                const supplier = supplierMap[p.supplierId];
                const taxable = p.items.reduce((a, i) => a + (i.amount ?? 0), 0);
                const gstSum = p.items.reduce((a, i) => a + (i.cgst ?? 0) + (i.sgst ?? 0) + (i.igst ?? 0), 0);

                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-blue-700">
                      {p.slNo || p.id}
                      {p.refNo && <span className="block text-[10px] text-slate-400 font-normal">Ref: {p.refNo}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap text-xs">
                      {fmtDate(p.orderDate)}
                      {p.dueDate && <span className="block text-[10px] text-slate-400">Due: {fmtDate(p.dueDate)}</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-slate-800 text-xs">{supplier?.name || p.supplierId}</p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        ID: {supplier?.id || p.supplierId} {supplier?.gstin ? `· GSTIN: ${supplier.gstin}` : ""}
                      </p>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <span className={`inline-block px-1.5 py-0.5 text-[10px] font-bold rounded uppercase ${
                        p.paymentMethod === "credit" ? "bg-purple-100 text-purple-800 border border-purple-200" : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                      }`}>
                        {p.paymentMethod}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-700 whitespace-nowrap text-xs">{fmtRs(taxable)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600 whitespace-nowrap text-xs">
                      {fmtRs(gstSum)}
                      <span className="block text-[9px] text-slate-400">{(p.stateType ?? "intrastate") === "intrastate" ? "Intra" : "Inter"}</span>
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-slate-900 text-right whitespace-nowrap text-xs">{fmtRs(p.total)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500 whitespace-nowrap text-xs">{fmtRs(p.advance)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap text-xs">
                      <span className={p.balanceDue > 0 ? "text-amber-600 font-bold" : "text-emerald-600"}>{fmtRs(p.balanceDue)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          id={`btn-edit-purchase-${p.id}`}
                          onClick={() => onEdit(p)}
                          className="px-2 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded border border-indigo-200 transition"
                          title="Edit Voucher"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          id={`btn-view-purchase-${p.id}`}
                          onClick={() => onViewInvoice(p)}
                          className="px-2 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition"
                          title="View ERP Mode"
                        >
                          👁️ View
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Purchase Form (Create & Edit Mode with Supplier Auto-Suggestion) ───────────
function PurchaseForm({
  initialInvoice,
  onSaved,
  onCancel,
}: {
  initialInvoice?: PurchaseInvoice | null;
  onSaved: (inv: PurchaseInvoice) => void;
  onCancel: () => void;
}) {
  const suppliers = loadSuppliers();
  const products  = loadProducts();

  const isEdit = !!initialInvoice;

  // Header State
  const [slNo,          setSlNo]          = useState(() => initialInvoice?.slNo || nextPurchaseSlNo());
  const [refNo,         setRefNo]         = useState(() => initialInvoice?.refNo || "");
  const [locationId,    setLocationId]    = useState(() => initialInvoice?.locationId || "MAIN-WH");
  const [orderDate,     setOrderDate]     = useState(() => initialInvoice?.orderDate || todayIso());
  const [creditDays,    setCreditDays]    = useState<number>(() => initialInvoice?.creditDays ?? 0);
  const [dueDate,       setDueDate]       = useState(() => initialInvoice?.dueDate || todayIso());
  const [paymentMethod, setPaymentMethod] = useState<PurchaseInvoice["paymentMethod"]>(() => initialInvoice?.paymentMethod || "bank");
  const [stateType,     setStateType]     = useState<StateType>(() => initialInvoice?.stateType || "intrastate");
  const [remarks,       setRemarks]       = useState(() => initialInvoice?.remarks || "");

  // Supplier State with Auto-Suggestion
  const initialSupp = initialInvoice ? suppliers.find(s => s.id === initialInvoice.supplierId) : null;
  const [suppSearch,      setSuppSearch]      = useState(() => initialSupp?.name || "");
  const [supplierId,      setSupplierId]      = useState(() => initialSupp?.id || initialInvoice?.supplierId || newPartyId("supplier"));
  const [supplierPhone,   setSupplierPhone]   = useState(() => initialSupp?.phone || "");
  const [supplierAddress, setSupplierAddress] = useState(() => initialSupp?.address || "");
  const [supplierGstin,   setSupplierGstin]   = useState(() => initialSupp?.gstin || "");
  const [suppBalance,     setSuppBalance]     = useState<number>(() => initialSupp?.outstandingBalance || 0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isExistingSupp,  setIsExistingSupp]  = useState<boolean>(() => !!initialSupp);

  // Line items state
  const [items, setItems] = useState<LineItem[]>(() => {
    if (initialInvoice && initialInvoice.items.length > 0) {
      return initialInvoice.items.map(i => ({ ...i, _key: Math.random() }));
    }
    return [blankItem()];
  });
  const [advance, setAdvance] = useState<number>(() => initialInvoice?.advance ?? 0);
  const [errors, setErrors] = useState<string[]>([]);
  const [lineErrors, setLineErrors] = useState<Record<number, string>>({});

  const dropdownRef = useRef<HTMLDivElement>(null);
  const productMap = Object.fromEntries(products.map(p => [p.id, p]));

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredSuggestions = suppliers.filter(s => {
    if (!suppSearch.trim()) return true;
    const q = suppSearch.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      (s.phone && s.phone.includes(q)) ||
      (s.gstin && s.gstin.toLowerCase().includes(q))
    );
  });

  function selectSupplierSuggestion(s: Party) {
    setSuppSearch(s.name);
    setSupplierId(s.id);
    setSupplierPhone(s.phone || "");
    setSupplierAddress(s.address || "");
    setSupplierGstin(s.gstin || "");
    setSuppBalance(s.outstandingBalance || 0);
    setIsExistingSupp(true);
    setShowSuggestions(false);
  }

  function handleSuppSearchChange(val: string) {
    setSuppSearch(val);
    setShowSuggestions(true);
    const exact = suppliers.find(s => s.name.toLowerCase() === val.trim().toLowerCase());
    if (exact) {
      setSupplierId(exact.id);
      setSupplierPhone(exact.phone || "");
      setSupplierAddress(exact.address || "");
      setSupplierGstin(exact.gstin || "");
      setSuppBalance(exact.outstandingBalance || 0);
      setIsExistingSupp(true);
    } else {
      setIsExistingSupp(false);
      if (!supplierId || isExistingSupp) {
        setSupplierId(newPartyId("supplier"));
        setSuppBalance(0);
      }
    }
  }

  function handleDateOrCreditDaysChange(newDate: string, newDays: number) {
    setOrderDate(newDate);
    setCreditDays(newDays);
    setDueDate(computeDueDate(newDate, newDays));
  }

  function recomputeItem(item: LineItem, st: StateType): LineItem {
    const prod = productMap[item.productId];
    const gstRate = prod?.gstRate ?? 0;
    const taxable = round2(Math.max(0, item.qty * item.unitPrice - item.discount));
    const { cgst, sgst, igst } = computeItemGst(taxable, gstRate, st);
    return { ...item, amount: taxable, cgst, sgst, igst };
  }

  function updateItem(idx: number, patch: Partial<LineItem>) {
    setItems(prev => {
      const next = [...prev];
      next[idx] = recomputeItem({ ...next[idx], ...patch }, stateType);
      return next;
    });
    if (lineErrors[idx]) setLineErrors(prev => ({ ...prev, [idx]: "" }));
  }

  function setProduct(idx: number, productId: string) {
    const p = productMap[productId];
    updateItem(idx, { productId, unitPrice: p?.unitPrice ?? 0 });
  }

  function handleStateTypeChange(st: StateType) {
    setStateType(st);
    setItems(prev => prev.map(item => recomputeItem(item, st)));
  }

  function addRow()             { setItems(prev => [...prev, blankItem()]); }
  function removeRow(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)); }

  const taxableTotal = round2(items.reduce((s, i) => s + i.amount, 0));
  const cgstTotal    = round2(items.reduce((s, i) => s + i.cgst,   0));
  const sgstTotal    = round2(items.reduce((s, i) => s + i.sgst,   0));
  const igstTotal    = round2(items.reduce((s, i) => s + i.igst,   0));
  const grandTotal   = round2(taxableTotal + cgstTotal + sgstTotal + igstTotal);

  // Cash / Bank / UPI purchases are paid immediately -> Due amount is strictly ZERO
  const isCashPurchase = paymentMethod !== "credit";
  const effectiveAdvance = isCashPurchase ? grandTotal : advance;
  const balanceDue = isCashPurchase ? 0 : round2(Math.max(0, grandTotal - advance));

  function validate(): boolean {
    const errs: string[] = [];
    const le: Record<number, string> = {};
    if (!suppSearch.trim()) errs.push("Supplier name is required.");
    if (items.length === 0) errs.push("Add at least one line item.");
    items.forEach((item, idx) => {
      if (!item.productId) { le[idx] = "Select a product"; return; }
      if (item.qty <= 0)   { le[idx] = "Qty must be > 0";  return; }
    });
    setErrors(errs);
    setLineErrors(le);
    return errs.length === 0 && Object.keys(le).length === 0;
  }

  function handleSave() {
    if (!validate()) return;

    // 1. Ensure supplier is persisted or updated in `im_parties`
    const savedSupplier = ensureParty({
      id: supplierId,
      name: suppSearch.trim(),
      phone: supplierPhone.trim(),
      address: supplierAddress.trim(),
      gstin: supplierGstin.trim().toUpperCase(),
      type: "supplier",
    });

    const id = initialInvoice ? initialInvoice.id : newInvoiceId();
    const invoice: PurchaseInvoice = {
      id,
      slNo,
      refNo,
      locationId,
      orderDate,
      dueDate,
      creditDays,
      remarks,
      supplierId: savedSupplier.id,
      paymentMethod,
      stateType,
      items: items.map(({ _key: _k, ...i }) => i),
      total: grandTotal,
      advance: effectiveAdvance,
      balanceDue,
    };

    if (isEdit && initialInvoice) {
      updatePurchaseInvoice(initialInvoice, invoice);
      logActivity("edit", "purchase", id);
    } else {
      const all = get<PurchaseInvoice[]>(PURCHASES_KEY) ?? [];
      set<PurchaseInvoice[]>(PURCHASES_KEY, [invoice, ...all]);
      applyInvoiceItems(invoice.items, 1, "purchase", id, savedSupplier.id, balanceDue);
      logActivity("create", "purchase", id);
    }

    onSaved(invoice);
  }

  const inputCls = "w-full px-2.5 py-1.5 rounded border border-[#bcaaa4] bg-[#fff9c4] text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition";

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="text-slate-500 hover:text-slate-700 text-sm flex items-center gap-1 transition">
            ← Back to List
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {isEdit ? `Edit Purchase Voucher (${slNo || initialInvoice?.id})` : "Purchase Local - Data Entry Mode"}
            </h2>
            <p className="text-xs text-slate-500">
              {isEdit ? "Update voucher items, supplier details and recalculate stock & payables" : "Record incoming supplier inventory with auto-suggestions or new supplier on the fly"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">Payment:</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PurchaseInvoice["paymentMethod"])}
            className="px-2.5 py-1 text-xs font-bold border border-slate-300 bg-white rounded shadow-xs uppercase text-purple-700"
          >
            <option value="bank">Bank Transfer</option>
            <option value="credit">Credit / Payable</option>
            <option value="cash">Cash Purchase</option>
            <option value="upi">UPI</option>
          </select>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          {errors.map((e, i) => <p key={i} className="text-xs text-red-600 font-medium">⚠️ {e}</p>)}
        </div>
      )}

      {/* ── ERP Form Header ── */}
      <div className="bg-[#fffde7] border border-[#d7ccc8] rounded-xl p-5 shadow-xs space-y-4">
        {/* Row 1: SL No, Date, Credit Days, Due Date, Location ID, Ref No, State Type */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5 items-end">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">SL No :</label>
            <input
              type="text"
              value={slNo}
              onChange={(e) => setSlNo(e.target.value)}
              className={inputCls}
              placeholder="SL No"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Date :</label>
            <input
              type="date"
              value={orderDate}
              onChange={(e) => handleDateOrCreditDaysChange(e.target.value, creditDays)}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Credit Days :</label>
            <input
              type="number"
              min={0}
              value={creditDays}
              onChange={(e) => handleDateOrCreditDaysChange(orderDate, parseInt(e.target.value) || 0)}
              className={`${inputCls} text-center font-bold`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Due Date :</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">State Type :</label>
            <select
              value={stateType}
              onChange={(e) => handleStateTypeChange(e.target.value as StateType)}
              className={inputCls}
            >
              <option value="intrastate">Intrastate (CGST+SGST)</option>
              <option value="interstate">Interstate (IGST)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Location ID :</label>
            <input
              type="text"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className={inputCls}
              placeholder="e.g. MAIN-WH"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Ref No / Bill :</label>
            <input
              type="text"
              value={refNo}
              onChange={(e) => setRefNo(e.target.value)}
              className={inputCls}
              placeholder="Bill #"
            />
          </div>
        </div>

        {/* Row 2: Supplier Auto-Search & Details */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-[#e0d6cb]">
          <div className="sm:col-span-2 relative" ref={dropdownRef}>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold text-slate-700">
                Supplier Name / Auto-Search *
              </label>
              {isExistingSupp ? (
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                  ✓ Existing Supplier
                </span>
              ) : suppSearch.trim() ? (
                <span className="text-[10px] font-semibold text-purple-700 bg-purple-100 px-1.5 py-0.2 rounded animate-pulse">
                  ✨ New Supplier (Auto-save)
                </span>
              ) : null}
            </div>

            <div className="relative">
              <input
                id="purchase-supplier-search"
                type="text"
                value={suppSearch}
                onFocus={() => setShowSuggestions(true)}
                onChange={(e) => handleSuppSearchChange(e.target.value)}
                placeholder="Type supplier name or phone to auto-suggest / add new…"
                className={`${inputCls} pr-8`}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowSuggestions(!showSuggestions)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ▼
              </button>
            </div>

            {/* Auto-Suggestion Dropdown */}
            {showSuggestions && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-slate-300 max-h-56 overflow-y-auto z-50">
                <div className="p-1.5 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex justify-between">
                  <span>Matching Suppliers ({filteredSuggestions.length})</span>
                  <span className="text-slate-400">Click to auto-fill</span>
                </div>
                {filteredSuggestions.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-500">
                    <p className="font-semibold text-purple-800">"{suppSearch}" not in directory.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Fill address & phone below to save as a new supplier automatically.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {filteredSuggestions.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => selectSupplierSuggestion(s)}
                          className="w-full text-left px-3 py-2 hover:bg-purple-50 transition flex items-center justify-between text-xs"
                        >
                          <div>
                            <p className="font-bold text-slate-800">{s.name}</p>
                            <p className="text-[10px] text-slate-500 font-mono">
                              {s.id} {s.phone ? `· 📞 ${s.phone}` : ""} {s.gstin ? `· GSTIN: ${s.gstin}` : ""}
                            </p>
                            {s.address && (
                              <p className="text-[10px] text-slate-400 truncate max-w-xs">{s.address}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                              Payable: {fmtRs(s.outstandingBalance)}
                            </span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Supplier ID :
            </label>
            <input
              type="text"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value.toUpperCase())}
              className={`${inputCls} font-mono`}
              placeholder="SUPP-001"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Supplier Phone :
            </label>
            <input
              type="tel"
              value={supplierPhone}
              onChange={(e) => setSupplierPhone(e.target.value)}
              className={inputCls}
              placeholder="e.g. +91 98765 43210"
            />
          </div>
        </div>

        {/* Row 3: Address & GSTIN & State Type & Current Balance */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Supplier Address :
            </label>
            <input
              type="text"
              value={supplierAddress}
              onChange={(e) => setSupplierAddress(e.target.value)}
              className={inputCls}
              placeholder="Shop / Building, Street, City, State, Pincode"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Supplier GSTIN :
            </label>
            <input
              type="text"
              value={supplierGstin}
              onChange={(e) => setSupplierGstin(e.target.value.toUpperCase())}
              className={`${inputCls} font-mono`}
              placeholder="e.g. 27AAPFU0939F1ZV"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Current Ledger Payable :
            </label>
            <div className="bg-[#fff9c4] border border-[#bcaaa4] px-2.5 py-1.5 text-xs font-bold text-purple-700 rounded-xs min-h-[30px] flex items-center">
              {fmtRs(suppBalance)}
            </div>
          </div>
        </div>

        {/* Row 4: Remarks */}
        <div className="pt-2 border-t border-[#e0d6cb]">
          <label className="block text-[11px] font-bold text-slate-700 mb-1">
            Remarks / Delivery Notes :
          </label>
          <input
            type="text"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className={inputCls}
            placeholder="Add delivery terms, vehicle number, or remarks…"
          />
        </div>
      </div>

      {/* ── Line Items Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Item Details & Input GST</h3>
          <button onClick={addRow} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition">
            + Add Row
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-semibold text-xs">
                <th className="text-left px-3 py-2.5">Product</th>
                <th className="text-right px-2 py-2.5">Stock</th>
                <th className="text-right px-2 py-2.5">Qty</th>
                <th className="text-right px-2 py-2.5">Price</th>
                <th className="text-right px-2 py-2.5">Disc.</th>
                <th className="text-right px-2 py-2.5">Taxable</th>
                <th className="text-right px-2 py-2.5">CGST</th>
                <th className="text-right px-2 py-2.5">SGST</th>
                <th className="text-right px-2 py-2.5">IGST</th>
                <th className="text-right px-2 py-2.5">Line Total</th>
                <th className="w-7"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {items.map((item, idx) => {
                const prod = productMap[item.productId];
                const err  = lineErrors[idx];
                return (
                  <tr key={item._key} className={err ? "bg-red-50" : ""}>
                    <td className="px-3 py-2">
                      <select value={item.productId} onChange={e => setProduct(idx, e.target.value)}
                        className={`w-full px-2 py-1.5 rounded border text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 ${err ? "border-red-400" : "border-slate-200"}`}>
                        <option value="">— Select Product —</option>
                        {Array.from(new Set(products.map(p => p.category || "General"))).map(cat => (
                          <optgroup key={cat} label={`📁 ${cat}`}>
                            {products.filter(p => (p.category || "General") === cat).map(p => (
                              <option key={p.id} value={p.id}>{p.id} · {p.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      {err && <p className="text-[10px] text-red-600 mt-0.5">{err}</p>}
                    </td>
                    <td className="px-2 py-2 text-right text-slate-500 whitespace-nowrap">
                      {prod ? `${prod.stockQty} ${prod.unit}` : "—"}
                    </td>
                    <td className="px-2 py-2"><input type="number" min={0} step={0.001} value={item.qty || ""} onFocus={(e) => e.target.select()} onChange={e => updateItem(idx, { qty: parseFloat(e.target.value) || 0 })} placeholder="1" className="w-full px-2 py-1 rounded border border-slate-200 text-xs text-right" /></td>
                    <td className="px-2 py-2"><input type="number" min={0} step={0.01} value={item.unitPrice || ""} onFocus={(e) => e.target.select()} onChange={e => updateItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })} placeholder="0.00" className="w-full px-2 py-1 rounded border border-slate-200 text-xs text-right" /></td>
                    <td className="px-2 py-2"><input type="number" min={0} step={0.01} value={item.discount || ""} onFocus={(e) => e.target.select()} onChange={e => updateItem(idx, { discount: parseFloat(e.target.value) || 0 })} placeholder="0.00" className="w-full px-2 py-1 rounded border border-slate-200 text-xs text-right" /></td>
                    <td className="px-2 py-2 text-right text-slate-800 font-semibold">{fmtRs(item.amount)}</td>
                    <td className="px-2 py-2 text-right text-slate-600 text-[11px]">{item.cgst > 0 ? fmtRs(item.cgst) : "—"}</td>
                    <td className="px-2 py-2 text-right text-slate-600 text-[11px]">{item.sgst > 0 ? fmtRs(item.sgst) : "—"}</td>
                    <td className="px-2 py-2 text-right text-slate-600 text-[11px]">{item.igst > 0 ? fmtRs(item.igst) : "—"}</td>
                    <td className="px-2 py-2 text-right font-bold text-slate-900">{fmtRs(lineTotal(item))}</td>
                    <td className="px-1 py-2 text-center">
                      {items.length > 1 && (
                        <button onClick={() => removeRow(idx)} className="w-5 h-5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center text-xs transition">✕</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* GST Summary totals */}
        <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50">
          <div className="flex justify-end">
            <div className="w-72 space-y-1.5 text-xs">
              <TotalRow label="Taxable Amount" value={fmtRs(taxableTotal)} />
              {stateType === "intrastate" ? (
                <><TotalRow label="CGST" value={fmtRs(cgstTotal)} muted /><TotalRow label="SGST" value={fmtRs(sgstTotal)} muted /></>
              ) : (
                <TotalRow label="IGST" value={fmtRs(igstTotal)} muted />
              )}
              <div className="border-t border-slate-200 pt-1.5"><TotalRow label="Invoice Total" value={fmtRs(grandTotal)} bold /></div>
              {isCashPurchase ? (
                <>
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1 text-slate-700 font-medium">
                      <span>💵</span>
                      <span>Payment Settled:</span>
                    </div>
                    <span className="font-bold text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {fmtRs(grandTotal)} (Paid in Full)
                    </span>
                  </div>
                  <div className="border-t border-slate-200 pt-1.5">
                    <div className="flex items-center justify-between font-bold text-sm">
                      <span className="text-slate-800">Balance Payable:</span>
                      <div className="text-right">
                        <span className="text-base text-emerald-600 font-bold">₹0.00</span>
                        <span className="block text-[10px] font-semibold text-emerald-700">✓ Settled (Zero Due)</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between pt-1">
                    <label htmlFor="purchase-advance" className="text-slate-600 font-medium">Advance Paid</label>
                    <input id="purchase-advance" type="number" min={0} step={0.01} value={advance || ""}
                      onFocus={(e) => e.target.select()}
                      onChange={e => setAdvance(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-28 px-2 py-1 rounded border border-slate-200 text-xs text-right font-semibold text-purple-700" />
                  </div>
                  <div className="border-t border-slate-200 pt-1.5">
                    <div className="flex items-center justify-between font-bold text-sm">
                      <span className="text-slate-800">Balance Payable:</span>
                      <span className={`text-base ${balanceDue > 0 ? "text-amber-600 font-bold" : "text-emerald-600"}`}>{fmtRs(balanceDue)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition">Cancel</button>
        <button id="btn-save-purchase" onClick={handleSave} className="px-6 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition">
          {isEdit ? "Update Voucher & Recalculate" : "Save Purchase Voucher"}
        </button>
      </div>
    </div>
  );
}

function TotalRow({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "font-bold text-slate-900 text-sm" : ""} ${muted ? "text-slate-500" : "text-slate-700"}`}>
      <span>{label}</span><span className="tabular-nums font-mono">{value}</span>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: "blue" | "purple" | "amber" | "green" }) {
  const cls = { blue: "bg-blue-50 border-blue-200 text-blue-700", purple: "bg-purple-50 border-purple-200 text-purple-700", amber: "bg-amber-50 border-amber-200 text-amber-700", green: "bg-emerald-50 border-emerald-200 text-emerald-700" }[color];
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 ${cls}`}>
      <span className="text-xl">{icon}</span>
      <div><p className="text-base font-bold leading-tight">{value}</p><p className="text-xs mt-0.5 opacity-80 font-medium">{label}</p></div>
    </div>
  );
}
