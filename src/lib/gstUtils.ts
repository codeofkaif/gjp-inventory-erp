/**
 * gstUtils.ts
 * Pure GST computation helpers — no localStorage side-effects.
 * All functions are deterministic and easily testable.
 */
import type { StateType, InvoiceItem, GstBucket, SaleInvoice, PurchaseInvoice } from "../types";

// ── Per-item GST split ────────────────────────────────────────────────────────
export function computeItemGst(
  taxableAmount: number,
  gstRate: number,
  stateType: StateType
): { cgst: number; sgst: number; igst: number } {
  if (taxableAmount <= 0 || gstRate <= 0) return { cgst: 0, sgst: 0, igst: 0 };
  if (stateType === "intrastate") {
    const half = round2(taxableAmount * (gstRate / 2) / 100);
    return { cgst: half, sgst: half, igst: 0 };
  } else {
    return { cgst: 0, sgst: 0, igst: round2(taxableAmount * gstRate / 100) };
  }
}

/** Line total = taxable + cgst + sgst + igst */
export function lineTotal(item: InvoiceItem): number {
  return (item.amount ?? 0) + (item.cgst ?? 0) + (item.sgst ?? 0) + (item.igst ?? 0);
}

/** Round to 2 decimal places */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Date range helpers ────────────────────────────────────────────────────────
export function dateInRange(dateStr: string, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (from && dateStr < from) return false;
  if (to   && dateStr > to)   return false;
  return true;
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function weekStart(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// ── GST Summary bucketing ─────────────────────────────────────────────────────
type ProductMap = Record<string, { gstRate: number }>;

function bucketKey(rate: number): number { return rate; }

function addToBucket(
  buckets: Map<number, GstBucket>,
  rate: number,
  item: InvoiceItem
): void {
  const key = bucketKey(rate);
  const existing = buckets.get(key) ?? { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
  buckets.set(key, {
    rate,
    taxable: round2(existing.taxable + (item.amount ?? 0)),
    cgst:    round2(existing.cgst    + (item.cgst   ?? 0)),
    sgst:    round2(existing.sgst    + (item.sgst   ?? 0)),
    igst:    round2(existing.igst    + (item.igst   ?? 0)),
  });
}

export interface GstSummaryRow extends GstBucket {
  outputTaxable: number; outputCgst: number; outputSgst: number; outputIgst: number;
  inputTaxable:  number; inputCgst:  number; inputSgst:  number; inputIgst:  number;
  netCgst: number; netSgst: number; netIgst: number;
}

export function buildGstSummary(
  sales:     SaleInvoice[],
  purchases: PurchaseInvoice[],
  productMap: ProductMap
): GstSummaryRow[] {
  const outBuckets = new Map<number, GstBucket>();
  const inBuckets  = new Map<number, GstBucket>();

  for (const inv of sales) {
    for (const item of inv.items) {
      const rate = productMap[item.productId]?.gstRate ?? 0;
      if (rate > 0) addToBucket(outBuckets, rate, item);
    }
  }
  for (const inv of purchases) {
    for (const item of inv.items) {
      const rate = productMap[item.productId]?.gstRate ?? 0;
      if (rate > 0) addToBucket(inBuckets, rate, item);
    }
  }

  // Merge all distinct rates
  const rates = new Set([...outBuckets.keys(), ...inBuckets.keys()]);
  const rows: GstSummaryRow[] = [];

  for (const rate of [...rates].sort((a, b) => a - b)) {
    const out = outBuckets.get(rate) ?? { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    const inp = inBuckets.get(rate)  ?? { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    rows.push({
      rate,
      taxable:       round2(out.taxable + inp.taxable),
      cgst:          round2(out.cgst    + inp.cgst),
      sgst:          round2(out.sgst    + inp.sgst),
      igst:          round2(out.igst    + inp.igst),
      outputTaxable: out.taxable, outputCgst: out.cgst, outputSgst: out.sgst, outputIgst: out.igst,
      inputTaxable:  inp.taxable, inputCgst:  inp.cgst, inputSgst:  inp.sgst, inputIgst:  inp.igst,
      netCgst:       round2(out.cgst - inp.cgst),
      netSgst:       round2(out.sgst - inp.sgst),
      netIgst:       round2(out.igst - inp.igst),
    });
  }

  return rows;
}
