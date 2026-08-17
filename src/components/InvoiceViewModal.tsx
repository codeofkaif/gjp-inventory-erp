import { useState, useEffect } from "react";
import type { SaleInvoice, PurchaseInvoice, Party, Product } from "../types";
import { lineTotal, round2 } from "../lib/gstUtils";
import { BUSINESS_CONFIG } from "../lib/businessConfig";

interface Props {
  invoice: SaleInvoice | PurchaseInvoice;
  type: "sale" | "purchase";
  parties: Party[];
  products: Product[];
  onClose: () => void;
  isEstimate?: boolean;
  autoPrint?: boolean;
}

function fmtRs(n: number) {
  return "₹" + (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

function fmtDate(iso?: string) {
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

// Convert numbers to Indian Rupees Words
function numberToWords(num: number): string {
  const n = Math.round(num);
  if (n === 0) return "Zero Rupees Only";
  const a = [
    "", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ", "Ten ",
    "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ", "Seventeen ", "Eighteen ", "Nineteen ",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function inWords(val: number): string {
    const strNum = val.toString();
    if (strNum.length > 9) return strNum;
    const match = ("000000000" + strNum).slice(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!match) return "";
    let str = "";
    str += Number(match[1]) !== 0 ? (a[Number(match[1])] || b[Number(match[1][0])] + " " + a[Number(match[1][1])]) + "Crore " : "";
    str += Number(match[2]) !== 0 ? (a[Number(match[2])] || b[Number(match[2][0])] + " " + a[Number(match[2][1])]) + "Lakh " : "";
    str += Number(match[3]) !== 0 ? (a[Number(match[3])] || b[Number(match[3][0])] + " " + a[Number(match[3][1])]) + "Thousand " : "";
    str += Number(match[4]) !== 0 ? (a[Number(match[4])] || b[Number(match[4][0])] + " " + a[Number(match[4][1])]) + "Hundred " : "";
    str += Number(match[5]) !== 0 ? (str !== "" ? "and " : "") + (a[Number(match[5])] || b[Number(match[5][0])] + " " + a[Number(match[5][1])]) : "";
    return str.trim();
  }

  return inWords(n) + " Rupees Only";
}

export default function InvoiceViewModal({
  invoice,
  type,
  parties,
  products,
  onClose,
  isEstimate = false,
  autoPrint = false,
}: Props) {
  const [viewMode, setViewMode] = useState<"bw" | "erp">("bw");

  const isSale = type === "sale";
  const saleInv = isSale ? (invoice as SaleInvoice) : null;
  const purchInv = !isSale ? (invoice as PurchaseInvoice) : null;

  const partyId = isSale ? saleInv?.customerId : purchInv?.supplierId;
  const party = parties.find((p) => p.id === partyId);
  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  const slNo = invoice.slNo || invoice.id;
  const dateStr = fmtDate(invoice.orderDate);
  const dueDateStr = fmtDate(invoice.dueDate || invoice.orderDate);
  const stateType = invoice.stateType ?? "intrastate";

  const isEst = isEstimate || invoice.id.startsWith("EST-") || invoice.refNo === "ESTIMATE";

  const taxableTotal = round2(invoice.items.reduce((s, i) => s + (i.amount ?? 0), 0));
  const cgstTotal = round2(invoice.items.reduce((s, i) => s + (i.cgst ?? 0), 0));
  const sgstTotal = round2(invoice.items.reduce((s, i) => s + (i.sgst ?? 0), 0));
  const igstTotal = round2(invoice.items.reduce((s, i) => s + (i.igst ?? 0), 0));
  const grandTotal = round2(invoice.total ?? 0);

  function handlePrint() {
    window.print();
  }

  // Keyboard shortcut listener: Enter or Ctrl+P to Print, Esc to Close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "p" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        window.print();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Optional auto-print on open
  useEffect(() => {
    if (autoPrint) {
      const timer = setTimeout(() => {
        window.print();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [autoPrint]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-300 font-sans my-auto animate-fadeIn flex flex-col max-h-[96vh]">
        {/* ── Top Bar Controls (Hidden in Print) ── */}
        <div className="bg-slate-900 text-white px-3 sm:px-4 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2 select-none shadow-md shrink-0 no-print">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0"></span>
            <span className="text-xs sm:text-sm font-bold tracking-wide truncate">
              {isEst
                ? "ESTIMATE / QUOTATION"
                : isSale
                ? `TAX INVOICE (${slNo})`
                : `PURCHASE VOUCHER (${slNo})`}
            </span>
            {isEst && (
              <span className="bg-amber-500/20 text-amber-300 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.2 rounded border border-amber-500/40 shrink-0">
                Estimate
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* View Mode Toggle */}
            <div className="hidden sm:flex bg-slate-800 p-0.5 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode("bw")}
                className={`px-2.5 py-1 rounded transition ${
                  viewMode === "bw" ? "bg-white text-slate-900 shadow-xs" : "text-slate-300 hover:text-white"
                }`}
              >
                🖤 B&W PDF
              </button>
              <button
                type="button"
                onClick={() => setViewMode("erp")}
                className={`px-2.5 py-1 rounded transition ${
                  viewMode === "erp" ? "bg-white text-slate-900 shadow-xs" : "text-slate-300 hover:text-white"
                }`}
              >
                📋 Screen View
              </button>
            </div>

            {/* Print Button */}
            <button
              id="btn-print-invoice"
              onClick={handlePrint}
              autoFocus
              className="flex items-center gap-1 px-3 sm:px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
            >
              <span>🖨️</span> <span className="hidden xs:inline">Print / PDF</span>
            </button>

            <button
              onClick={onClose}
              className="w-7 h-7 bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white rounded-lg flex items-center justify-center text-sm font-bold transition cursor-pointer"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Scrollable Document Container ── */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-6 bg-slate-100/50">
          <div className="overflow-x-auto pb-4">
          {/* ═══════════════════════════════════════════════════════════════════════
              PRISTINE BLACK & WHITE PRINTABLE A4 INVOICE DOCUMENT
          ═════════════════════════════════════════════════════════════════════════ */}
          <div
            id="printable-invoice"
            className="bg-white text-black max-w-[800px] mx-auto p-6 sm:p-8 border border-black shadow-sm font-sans text-xs leading-normal"
            style={{ minHeight: "1050px", boxSizing: "border-box" }}
          >
            {/* 1. Header Firm Details */}
            <div className="text-center border-b-2 border-black pb-3">
              <h1 className="text-2xl font-black tracking-tight text-black uppercase font-serif">
                {BUSINESS_CONFIG.name}
              </h1>
              <p className="text-[11px] font-bold text-black uppercase tracking-wider mt-0.5">
                Proprietor: {BUSINESS_CONFIG.proprietor}
              </p>
              <p className="text-[11px] text-black mt-0.5">
                {BUSINESS_CONFIG.fullAddress}
              </p>
              <p className="text-[11px] font-semibold text-black mt-0.5">
                Mobile: {BUSINESS_CONFIG.formattedMobile}
              </p>
            </div>

            {/* 2. Document Title Banner */}
            <div className="text-center my-2.5 py-1 border-y border-black bg-gray-50/50">
              <h2 className="text-sm font-black uppercase tracking-widest text-black">
                {isEst
                  ? "ESTIMATE / QUOTATION (ESTIMATE BILL - NON TAXABLE)"
                  : isSale
                  ? invoice.paymentMethod === "cash"
                    ? "CASH SALE MEMO / TAX INVOICE"
                    : "TAX INVOICE"
                  : "PURCHASE INVOICE / VOUCHER"}
              </h2>
            </div>

            {/* 3. Invoice & Customer Metadata Box */}
            <div className="grid grid-cols-2 border border-black divide-x divide-black mb-3">
              {/* Left Column: Customer Details */}
              <div className="p-2.5 space-y-1">
                <p className="font-bold uppercase text-[10px] text-gray-700 tracking-wider">
                  {isSale ? "Bill To (Customer Details):" : "Supplier Details:"}
                </p>
                <p className="font-black text-sm text-black">
                  {party?.name || "Walk-in Customer"}
                </p>
                <p className="font-mono font-semibold text-[11px]">
                  ID: <span className="font-bold">{party?.id || partyId || "—"}</span>
                </p>
                {party?.address && (
                  <p className="text-[11px] text-gray-800 leading-tight">
                    {party.address}
                  </p>
                )}
                <p className="text-[11px] text-gray-800">
                  Phone: <span className="font-semibold">{party?.phone || "—"}</span>
                </p>
                {party?.gstin && (
                  <p className="text-[11px] font-mono font-bold">
                    GSTIN: {party.gstin}
                  </p>
                )}
              </div>

              {/* Right Column: Invoice Details */}
              <div className="p-2.5 space-y-1">
                <div className="flex justify-between">
                  <span className="font-bold">Invoice / SL No:</span>
                  <span className="font-mono font-black text-sm">{slNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">Invoice Date:</span>
                  <span className="font-mono">{dateStr}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">Payment Mode:</span>
                  <span className="font-bold uppercase">{invoice.paymentMethod}</span>
                </div>
                {invoice.dueDate && (
                  <div className="flex justify-between">
                    <span className="font-bold">Due Date:</span>
                    <span className="font-mono">{dueDateStr}</span>
                  </div>
                )}
                {invoice.refNo && (
                  <div className="flex justify-between">
                    <span className="font-bold">Ref / Bill No:</span>
                    <span className="font-mono">{invoice.refNo}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="font-bold">Supply State:</span>
                  <span className="capitalize">{stateType}</span>
                </div>
              </div>
            </div>

            {/* 4. Line Items Table */}
            <div className="border border-black mb-3">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-black bg-gray-100/70 font-bold text-[11px] text-black">
                    <th className="p-1.5 border-r border-black text-center w-8">#</th>
                    <th className="p-1.5 border-r border-black">Item Description</th>
                    <th className="p-1.5 border-r border-black text-center w-16">HSN</th>
                    <th className="p-1.5 border-r border-black text-right w-16">Qty</th>
                    <th className="p-1.5 border-r border-black text-right w-16">Rate (₹)</th>
                    <th className="p-1.5 border-r border-black text-right w-14">Disc (₹)</th>
                    <th className="p-1.5 border-r border-black text-right w-20">Taxable (₹)</th>
                    <th className="p-1.5 border-r border-black text-right w-16">GST (₹)</th>
                    <th className="p-1.5 text-right w-24">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-300">
                  {invoice.items.map((item, idx) => {
                    const prod = productMap[item.productId];
                    const itemGst = (item.cgst || 0) + (item.sgst || 0) + (item.igst || 0);
                    const itemTotal = lineTotal(item);

                    return (
                      <tr key={idx} className="text-[11px] leading-tight">
                        <td className="p-1.5 border-r border-black text-center font-mono">{idx + 1}</td>
                        <td className="p-1.5 border-r border-black font-semibold text-black">
                          {prod?.name || item.productId}
                        </td>
                        <td className="p-1.5 border-r border-black text-center font-mono">{prod?.hsnCode || "—"}</td>
                        <td className="p-1.5 border-r border-black text-right font-bold font-mono">
                          {item.qty} {prod?.unit || "pcs"}
                        </td>
                        <td className="p-1.5 border-r border-black text-right font-mono">
                          {(item.unitPrice || 0).toFixed(2)}
                        </td>
                        <td className="p-1.5 border-r border-black text-right font-mono">
                          {item.discount > 0 ? (item.discount || 0).toFixed(2) : "—"}
                        </td>
                        <td className="p-1.5 border-r border-black text-right font-mono font-medium">
                          {(item.amount || 0).toFixed(2)}
                        </td>
                        <td className="p-1.5 border-r border-black text-right font-mono text-[10px]">
                          {itemGst > 0 ? itemGst.toFixed(2) : "—"}
                        </td>
                        <td className="p-1.5 text-right font-mono font-bold text-black">
                          {itemTotal.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-black bg-gray-100/70 font-bold text-[11px]">
                    <td colSpan={3} className="p-1.5 border-r border-black text-right uppercase">
                      Total Items ({invoice.items.length}):
                    </td>
                    <td className="p-1.5 border-r border-black text-right font-mono font-black">
                      {invoice.items.reduce((s, i) => s + (i.qty || 0), 0)}
                    </td>
                    <td colSpan={2} className="p-1.5 border-r border-black"></td>
                    <td className="p-1.5 border-r border-black text-right font-mono font-bold">
                      {taxableTotal.toFixed(2)}
                    </td>
                    <td className="p-1.5 border-r border-black text-right font-mono font-bold">
                      {(cgstTotal + sgstTotal + igstTotal).toFixed(2)}
                    </td>
                    <td className="p-1.5 text-right font-mono font-black text-sm">
                      {grandTotal.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* 5. Summary, Words & Payment Breakdown */}
            <div className="grid grid-cols-12 border border-black mb-3 divide-x divide-black">
              {/* Left Side: Amount in words & Bank / Terms */}
              <div className="col-span-7 p-2.5 space-y-2 flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase text-gray-700">Amount in Words:</p>
                  <p className="font-bold text-[11px] text-black italic">
                    {numberToWords(grandTotal)}
                  </p>
                </div>

                {((isSale ? saleInv?.narration : purchInv?.remarks) || "") && (
                  <div className="text-[10px] border-t border-gray-300 pt-1">
                    <span className="font-bold">Narration / Note:</span> {isSale ? saleInv?.narration : purchInv?.remarks}
                  </div>
                )}

                <div className="text-[9px] text-gray-700 border-t border-gray-300 pt-1 leading-tight space-y-0.5">
                  <p className="font-bold uppercase">Terms & Conditions:</p>
                  <p>1. Goods once sold will not be returned or exchanged without valid voucher.</p>
                  <p>2. Payment due within agreed credit days.</p>
                  <p>3. Subject to Maharajganj jurisdiction only.</p>
                </div>
              </div>

              {/* Right Side: Financial Calculation Breakdown */}
              <div className="col-span-5 p-2.5 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>Taxable Amount:</span>
                  <span className="font-mono font-semibold">{fmtRs(taxableTotal)}</span>
                </div>
                {cgstTotal > 0 && (
                  <div className="flex justify-between text-gray-700">
                    <span>CGST:</span>
                    <span className="font-mono">{fmtRs(cgstTotal)}</span>
                  </div>
                )}
                {sgstTotal > 0 && (
                  <div className="flex justify-between text-gray-700">
                    <span>SGST:</span>
                    <span className="font-mono">{fmtRs(sgstTotal)}</span>
                  </div>
                )}
                {igstTotal > 0 && (
                  <div className="flex justify-between text-gray-700">
                    <span>IGST:</span>
                    <span className="font-mono">{fmtRs(igstTotal)}</span>
                  </div>
                )}
                <div className="border-t border-black pt-1 flex justify-between font-black text-sm">
                  <span>Grand Total:</span>
                  <span className="font-mono">{fmtRs(grandTotal)}</span>
                </div>
                <div className="flex justify-between text-gray-800">
                  <span>Advance / Received:</span>
                  <span className="font-mono font-bold">{fmtRs(invoice.advance)}</span>
                </div>
                <div className="border-t border-black pt-1 flex justify-between font-bold text-xs">
                  <span>Balance Due:</span>
                  <span className="font-mono font-bold">
                    {fmtRs(invoice.balanceDue)}
                  </span>
                </div>
              </div>
            </div>

            {/* 6. Signatures */}
            <div className="grid grid-cols-2 pt-6 pb-2 text-center text-[11px] font-bold">
              <div className="flex flex-col justify-end items-center h-16">
                <div className="w-40 border-t border-black pt-1">
                  Customer Signature
                </div>
              </div>

              <div className="flex flex-col justify-end items-center h-16">
                <p className="text-[10px] text-gray-600 mb-6 font-bold uppercase">
                  For {BUSINESS_CONFIG.name}
                </p>
                <div className="w-48 border-t border-black pt-1 font-bold">
                  Authorised Signatory
                </div>
              </div>
            </div>

            {/* Footer Notice */}
            <div className="text-center border-t border-gray-300 pt-1 text-[9px] text-gray-500">
              This is a Computer Generated {isEst ? "Estimate Quotation" : "Tax Invoice"} · {BUSINESS_CONFIG.name}
            </div>
          </div>
          </div>
        </div>

        {/* ── Footer Bar (Hidden in Print) ── */}
        <div className="bg-slate-100 px-4 py-2.5 border-t border-slate-300 flex items-center justify-between text-xs no-print shrink-0">
          <div className="flex items-center gap-2 text-slate-600">
            <span>💡 <strong>Tip:</strong> Press <strong>Ctrl + P</strong> to print instantly. Press <strong>Esc</strong> to close.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-1.5 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow-sm transition cursor-pointer"
            >
              🖨️ Print / Save as PDF
            </button>
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
