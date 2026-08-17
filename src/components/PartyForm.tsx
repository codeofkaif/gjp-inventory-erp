import { useEffect, useRef, useState } from "react";
import type { Party } from "../types";
import { newPartyId } from "../lib/stockOps";

type Errors = Partial<Record<keyof Party, string>>;

interface Props {
  initial?: Party | null;
  partyType: "customer" | "supplier";
  onSave: (p: Party) => void;
  onClose: () => void;
}

export default function PartyForm({ initial, partyType, onSave, onClose }: Props) {
  const isEdit = !!initial;
  const [form, setForm] = useState<Party>(() =>
    initial
      ? { ...initial }
      : {
          id: newPartyId(partyType),
          name: "",
          phone: "",
          address: "",
          gstin: "",
          type: partyType,
          outstandingBalance: 0,
        }
  );

  const [rawBalance, setRawBalance] = useState(() =>
    initial && initial.outstandingBalance > 0 ? String(initial.outstandingBalance) : ""
  );

  const [errors, setErrors] = useState<Errors>({});
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  function field<K extends keyof Party>(key: K, value: Party[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const e: Errors = {};
    if (!form.id.trim()) e.id = "ID is required";
    if (!form.name.trim()) e.name = "Name is required";
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
        address: form.address?.trim() || "",
        gstin: form.gstin?.trim().toUpperCase() || "",
        outstandingBalance: parseFloat(rawBalance) || 0,
      });
    }
  }

  const inputCls = (key: keyof Party) =>
    `w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
      errors[key]
        ? "border-red-400 bg-red-50 focus:ring-red-400"
        : "border-slate-200 bg-white"
    }`;

  const label = partyType === "customer" ? "Customer" : "Supplier";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-8 animate-in fade-in slide-in-from-bottom-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              {isEdit ? `Edit ${label}` : `Add New ${label}`}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter {label.toLowerCase()} details — clean fields ready for entry
            </p>
          </div>
          <button
            id="party-form-close"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Party ID and Name */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-600">
                  {label} ID *
                </label>
                <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded font-bold">
                  ⚡ Auto
                </span>
              </div>
              <input
                id="field-party-id"
                type="text"
                className={`${inputCls("id")} font-mono font-bold text-blue-800 bg-slate-50`}
                value={form.id}
                onFocus={(e) => e.target.select()}
                onChange={(e) => field("id", e.target.value.toUpperCase())}
                placeholder={`e.g. ${partyType === "customer" ? "GJP001" : "SUPP-001"}`}
              />
              {errors.id && <p className="text-xs text-red-500 mt-1">{errors.id}</p>}
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {label} Name *
              </label>
              <input
                id="field-party-name"
                ref={nameRef}
                type="text"
                className={inputCls("name")}
                value={form.name}
                onFocus={(e) => e.target.select()}
                onChange={(e) => field("name", e.target.value)}
                placeholder={`e.g. ${partyType === "customer" ? "Ahmed General Trading" : "Global Dates Import LLC"}`}
              />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>
          </div>

          {/* Phone & GSTIN */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Phone / Mobile</label>
              <input
                id="field-party-phone"
                type="tel"
                className={inputCls("phone")}
                value={form.phone}
                onFocus={(e) => e.target.select()}
                onChange={(e) => field("phone", e.target.value)}
                placeholder="e.g. +91 98765 43210"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">GST Number (GSTIN)</label>
              <input
                id="field-party-gstin"
                type="text"
                className={`${inputCls("gstin")} uppercase font-mono`}
                value={form.gstin || ""}
                onFocus={(e) => e.target.select()}
                onChange={(e) => field("gstin", e.target.value.toUpperCase())}
                placeholder="e.g. 27AAPFU0939F1ZV"
                maxLength={15}
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Full Address
            </label>
            <textarea
              id="field-party-address"
              rows={2}
              className={`${inputCls("address")} resize-none`}
              value={form.address || ""}
              onFocus={(e) => e.target.select()}
              onChange={(e) => field("address", e.target.value)}
              placeholder="Shop No., Market / Building name, City, State, Pincode"
            />
          </div>

          {/* Outstanding Balance */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Initial Outstanding Balance (₹)
            </label>
            <input
              id="field-party-balance"
              type="number"
              min={0}
              step={0.01}
              className={inputCls("outstandingBalance")}
              value={rawBalance}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                setRawBalance(e.target.value);
                field("outstandingBalance", parseFloat(e.target.value) || 0);
              }}
              placeholder="0.00"
            />
            <p className="text-xs text-slate-400 mt-1">
              {partyType === "customer"
                ? "Amount this customer currently owes you (leave blank if zero)"
                : "Amount you currently owe this supplier (leave blank if zero)"}
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button
            id="party-form-cancel"
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition"
          >
            Cancel
          </button>
          <button
            id="party-form-save"
            type="submit"
            onClick={handleSubmit}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm transition"
          >
            {isEdit ? "Save Changes" : `Add ${label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
