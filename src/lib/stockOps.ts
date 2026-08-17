/**
 * stockOps.ts
 * Centralised atomic stock mutation helpers.
 * Every page that changes stock calls these — never duplicating the logic.
 */
import { get, set } from "./storage";
import {
  PRODUCTS_KEY,
  PARTIES_KEY,
  STOCK_REGISTER_KEY,
  SALES_KEY,
  PURCHASES_KEY,
} from "./initStore";
import type { SaleInvoice, PurchaseInvoice } from "../types";
import type {
  Product,
  Party,
  StockMovement,
  MovementType,
  InvoiceItem,
} from "../types";

// ── ID helpers ────────────────────────────────────────────────────────────────
function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function newInvoiceId(): string {
  return nextSaleSlNo();
}

export function nextSaleSlNo(): string {
  const sales = get<SaleInvoice[]>(SALES_KEY) ?? [];
  const numbers = sales.map((s) => {
    if (!s.slNo) return 0;
    const match = String(s.slNo).match(/GJP-?(\d+)/i) || String(s.slNo).match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  });
  const max = numbers.length > 0 ? Math.max(...numbers) : 0;
  const nextNum = String(max + 1).padStart(3, "0");
  return `GJP-${nextNum}`;
}

export function nextPurchaseSlNo(): string {
  const purchases = get<PurchaseInvoice[]>(PURCHASES_KEY) ?? [];
  const numbers = purchases.map((p) => {
    if (!p.slNo) return 0;
    const match = String(p.slNo).match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  });
  const max = numbers.length > 0 ? Math.max(...numbers) : 0;
  const nextNum = String(max + 1).padStart(3, "0");
  return `PUR-${nextNum}`;
}

export function newPartyId(type: "customer" | "supplier" = "customer"): string {
  const parties = get<Party[]>(PARTIES_KEY) ?? [];
  if (type === "customer") {
    const custNumbers = parties
      .filter((p) => p.type === "customer")
      .map((p) => {
        const match = p.id.match(/GJP(\d+)/i) || p.id.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      });
    const max = custNumbers.length > 0 ? Math.max(...custNumbers) : 0;
    const nextNum = String(max + 1).padStart(3, "0");
    return `GJP${nextNum}`;
  } else {
    const suppNumbers = parties
      .filter((p) => p.type === "supplier")
      .map((p) => {
        const match = p.id.match(/SUPP-?(\d+)/i) || p.id.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      });
    const max = suppNumbers.length > 0 ? Math.max(...suppNumbers) : 0;
    const nextNum = String(max + 1).padStart(3, "0");
    return `SUPP-${nextNum}`;
  }
}

// ── Low-level readers/writers ────────────────────────────────────────────────
function readProducts(): Product[] {
  return get<Product[]>(PRODUCTS_KEY) ?? [];
}

function writeProducts(products: Product[]): void {
  set<Product[]>(PRODUCTS_KEY, products);
}

function readParties(): Party[] {
  return get<Party[]>(PARTIES_KEY) ?? [];
}

function writeParties(parties: Party[]): void {
  set<Party[]>(PARTIES_KEY, parties);
}

function readMovements(): StockMovement[] {
  return get<StockMovement[]>(STOCK_REGISTER_KEY) ?? [];
}

function writeMovements(movements: StockMovement[]): void {
  set<StockMovement[]>(STOCK_REGISTER_KEY, movements);
}

// ── Core atomic operation ─────────────────────────────────────────────────────
interface MovementSpec {
  productId: string;
  qtyChange: number;   // negative = outgoing, positive = incoming
  type: MovementType;
  refId: string;
  note: string;
}

/**
 * Appends movements to im_stock_register AND updates stockQty in im_products.
 * Pass multiple specs to process an invoice's worth of items in one atomic call.
 */
export function applyMovements(specs: MovementSpec[]): void {
  const products  = readProducts();
  const movements = readMovements();
  const now       = new Date().toISOString();

  for (const s of specs) {
    // 1. Prepend movement
    movements.unshift({
      id:        uid("MOV"),
      productId: s.productId,
      type:      s.type,
      qtyChange: s.qtyChange,
      refId:     s.refId,
      note:      s.note,
      timestamp: now,
    });

    // 2. Update product stockQty in place
    const idx = products.findIndex((p) => p.id === s.productId);
    if (idx !== -1) {
      products[idx] = {
        ...products[idx],
        stockQty: products[idx].stockQty + s.qtyChange,
      };
    }
  }

  writeMovements(movements);
  writeProducts(products);
}

/**
 * Adjusts a party's outstandingBalance by `delta`.
 * delta > 0 means the balance grows (customer owes more / we owe supplier more).
 */
export function adjustPartyBalance(partyId: string, delta: number): void {
  const parties = readParties();
  const idx = parties.findIndex((p) => p.id === partyId);
  if (idx !== -1) {
    parties[idx] = {
      ...parties[idx],
      outstandingBalance: parties[idx].outstandingBalance + delta,
    };
    writeParties(parties);
  }
}

/**
 * Ensures a party exists in storage. If not, creates it automatically.
 * If already exists, updates any optional fields provided.
 */
export function ensureParty(party: {
  id?: string;
  name: string;
  phone?: string;
  address?: string;
  gstin?: string;
  type: "customer" | "supplier";
}): Party {
  const parties = readParties();
  const trimmedName = party.name.trim();
  const trimmedId = party.id?.trim();

  // Find by ID first, or by name (case-insensitive)
  const existingIndex = parties.findIndex(
    (p) =>
      p.type === party.type &&
      ((trimmedId && p.id.toLowerCase() === trimmedId.toLowerCase()) ||
        p.name.toLowerCase() === trimmedName.toLowerCase())
  );

  if (existingIndex !== -1) {
    const existing = parties[existingIndex];
    const updated: Party = {
      ...existing,
      phone: party.phone !== undefined && party.phone.trim() !== "" ? party.phone : existing.phone,
      address: party.address !== undefined && party.address.trim() !== "" ? party.address : existing.address,
      gstin: party.gstin !== undefined && party.gstin.trim() !== "" ? party.gstin : existing.gstin,
    };
    parties[existingIndex] = updated;
    writeParties(parties);
    return updated;
  }

  // Create new party
  const newId = trimmedId || newPartyId(party.type);
  const created: Party = {
    id: newId,
    name: trimmedName,
    phone: party.phone || "",
    address: party.address || "",
    gstin: party.gstin || "",
    type: party.type,
    outstandingBalance: 0,
  };
  parties.unshift(created);
  writeParties(parties);
  return created;
}

/**
 * Convenience: process a whole invoice worth of items.
 * sign = -1 for sales (stock out), +1 for purchases (stock in).
 */
export function applyInvoiceItems(
  items: InvoiceItem[],
  sign: 1 | -1,
  movementType: MovementType,
  refId: string,
  partyId: string,
  balanceDue: number
): void {
  applyMovements(
    items.map((item) => ({
      productId: item.productId,
      qtyChange: sign * item.qty,
      type:      movementType,
      refId,
      note:      movementType === "sale" ? "Sale invoice" : "Purchase invoice",
    }))
  );
  if (balanceDue !== 0) {
    adjustPartyBalance(partyId, balanceDue);
  }
}

/**
 * Atomically edits an existing sale invoice:
 * 1. Reverts previous items' stock deduction & previous balance due
 * 2. Deducts new items' stock & applies new balance due
 * 3. Updates the invoice in storage
 */
export function updateSaleInvoice(oldInv: SaleInvoice, newInv: SaleInvoice): void {
  // 1. Revert old stock deduction (add back old items)
  applyMovements(
    oldInv.items.map((item) => ({
      productId: item.productId,
      qtyChange: item.qty, // positive = put back
      type: "adjustment" as MovementType,
      refId: newInv.id,
      note: `Invoice Edit: Revert ${oldInv.slNo || oldInv.id}`,
    }))
  );
  if (oldInv.balanceDue !== 0) {
    adjustPartyBalance(oldInv.customerId, -oldInv.balanceDue);
  }

  // 2. Apply new stock deduction (deduct new items)
  applyMovements(
    newInv.items.map((item) => ({
      productId: item.productId,
      qtyChange: -item.qty, // negative = deduct
      type: "sale" as MovementType,
      refId: newInv.id,
      note: `Invoice Edit: Applied ${newInv.slNo || newInv.id}`,
    }))
  );
  if (newInv.balanceDue !== 0) {
    adjustPartyBalance(newInv.customerId, newInv.balanceDue);
  }

  // 3. Update invoice in storage
  const all = get<SaleInvoice[]>(SALES_KEY) ?? [];
  const idx = all.findIndex((i) => i.id === newInv.id);
  if (idx !== -1) {
    all[idx] = newInv;
  } else {
    all.push(newInv);
  }
  set<SaleInvoice[]>(SALES_KEY, all);
}

/**
 * Atomically edits an existing purchase invoice
 */
export function updatePurchaseInvoice(oldInv: PurchaseInvoice, newInv: PurchaseInvoice): void {
  // 1. Revert old stock addition (deduct old items)
  applyMovements(
    oldInv.items.map((item) => ({
      productId: item.productId,
      qtyChange: -item.qty,
      type: "adjustment" as MovementType,
      refId: newInv.id,
      note: `Purchase Edit: Revert ${oldInv.slNo || oldInv.id}`,
    }))
  );
  if (oldInv.balanceDue !== 0) {
    adjustPartyBalance(oldInv.supplierId, -oldInv.balanceDue);
  }

  // 2. Apply new stock addition (add new items)
  applyMovements(
    newInv.items.map((item) => ({
      productId: item.productId,
      qtyChange: item.qty,
      type: "purchase" as MovementType,
      refId: newInv.id,
      note: `Purchase Edit: Applied ${newInv.slNo || newInv.id}`,
    }))
  );
  if (newInv.balanceDue !== 0) {
    adjustPartyBalance(newInv.supplierId, newInv.balanceDue);
  }

  // 3. Update invoice in storage
  const all = get<PurchaseInvoice[]>(PURCHASES_KEY) ?? [];
  const idx = all.findIndex((i) => i.id === newInv.id);
  if (idx !== -1) {
    all[idx] = newInv;
  } else {
    all.push(newInv);
  }
  set<PurchaseInvoice[]>(PURCHASES_KEY, all);
}

/**
 * Atomically reduce an invoice's balanceDue and the party's outstandingBalance.
 * Clamped to never go below zero. Returns the actual amount applied.
 */
export function recordPayment(
  invoiceId: string,
  amount: number,
  type: "sale" | "purchase"
): number {
  if (amount <= 0) return 0;

  if (type === "sale") {
    const all = get<SaleInvoice[]>(SALES_KEY) ?? [];
    const idx = all.findIndex((i) => i.id === invoiceId);
    if (idx === -1) return 0;
    const invoice = all[idx];
    const applied = Math.min(amount, invoice.balanceDue);
    if (applied <= 0) return 0;
    all[idx] = { ...invoice, balanceDue: Math.round((invoice.balanceDue - applied) * 100) / 100 };
    set<SaleInvoice[]>(SALES_KEY, all);
    adjustPartyBalance(invoice.customerId, -applied);
    return applied;
  } else {
    const all = get<PurchaseInvoice[]>(PURCHASES_KEY) ?? [];
    const idx = all.findIndex((i) => i.id === invoiceId);
    if (idx === -1) return 0;
    const invoice = all[idx];
    const applied = Math.min(amount, invoice.balanceDue);
    if (applied <= 0) return 0;
    all[idx] = { ...invoice, balanceDue: Math.round((invoice.balanceDue - applied) * 100) / 100 };
    set<PurchaseInvoice[]>(PURCHASES_KEY, all);
    adjustPartyBalance(invoice.supplierId, -applied);
    return applied;
  }
}
