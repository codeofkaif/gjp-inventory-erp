import { get, set } from "./storage";
import { SEED_PRODUCTS } from "./seedData";
import type { Product, Party, StockMovement, SaleInvoice, PurchaseInvoice, User, ActivityLogEntry } from "../types";

// ── Storage Keys ──────────────────────────────────────────────────────────────
export const PRODUCTS_KEY       = "im_products";
export const PARTIES_KEY        = "im_parties";
export const STOCK_REGISTER_KEY = "im_stock_register";
export const SALES_KEY          = "im_sales";
export const PURCHASES_KEY      = "im_purchases";
export const USERS_KEY          = "im_users";
export const SESSION_KEY        = "im_session";
export const ACTIVITY_LOG_KEY   = "im_activity_log";

// ── Default admin user ────────────────────────────────────────────────────────
const DEFAULT_ADMIN: User = {
  id: "USR-admin",
  name: "Admin",
  pin: "1234",
  role: "admin",
  createdAt: new Date().toISOString(),
};

// ── Initialise all stores on first load ───────────────────────────────────────
export function initStore(): void {
  const existingProducts = get<Product[]>(PRODUCTS_KEY);
  if (existingProducts === null) {
    set<Product[]>(PRODUCTS_KEY, SEED_PRODUCTS);
  } else {
    // Backfill missing categories from SEED_PRODUCTS if any
    const seedMap = Object.fromEntries(SEED_PRODUCTS.map((p) => [p.id, p.category]));
    let needsUpdate = false;
    const migrated = existingProducts.map((p) => {
      if (!p.category) {
        needsUpdate = true;
        return { ...p, category: seedMap[p.id] || "General" };
      }
      return p;
    });
    if (needsUpdate) {
      set<Product[]>(PRODUCTS_KEY, migrated);
    }
  }
  const existingParties = get<Party[]>(PARTIES_KEY);
  if (existingParties === null) {
    set<Party[]>(PARTIES_KEY, []);
  } else {
    // Migrate customer IDs to GJP001 format if needed
    const idMap: Record<string, string> = {};
    let custCounter = 1;
    let partiesUpdated = false;

    const migratedParties = existingParties.map((p) => {
      if (p.type === "customer") {
        if (!p.id.startsWith("GJP")) {
          const newId = `GJP${String(custCounter).padStart(3, "0")}`;
          custCounter++;
          idMap[p.id] = newId;
          partiesUpdated = true;
          return { ...p, id: newId };
        } else {
          const match = p.id.match(/GJP(\d+)/i);
          if (match) {
            custCounter = Math.max(custCounter, parseInt(match[1], 10) + 1);
          }
        }
      }
      return p;
    });

    if (partiesUpdated) {
      set<Party[]>(PARTIES_KEY, migratedParties);
    }

    if (get<StockMovement[]>(STOCK_REGISTER_KEY) === null) {
      set<StockMovement[]>(STOCK_REGISTER_KEY, []);
    }

    const existingSales = get<SaleInvoice[]>(SALES_KEY);
    if (existingSales === null) {
      set<SaleInvoice[]>(SALES_KEY, []);
    } else {
      let changed = false;
      const cleanedSales = existingSales.map((s) => {
        let updated = s;
        if (idMap[s.customerId]) {
          changed = true;
          updated = { ...updated, customerId: idMap[s.customerId] };
        }
        if (updated.slNo && !String(updated.slNo).startsWith("GJP-")) {
          const match = String(updated.slNo).match(/GJP-?(\d+)/i) || String(updated.slNo).match(/(\d+)/);
          if (match) {
            changed = true;
            updated = { ...updated, slNo: `GJP-${String(parseInt(match[1], 10)).padStart(3, "0")}` };
          }
        }
        if ((updated.paymentMethod === "cash" || updated.paymentMethod === "upi" || updated.paymentMethod === "bank") && updated.balanceDue > 0) {
          changed = true;
          updated = { ...updated, advance: updated.total, balanceDue: 0 };
        }
        return updated;
      });
      if (changed) {
        set<SaleInvoice[]>(SALES_KEY, cleanedSales);
      }
    }
  }
  if (get<PurchaseInvoice[]>(PURCHASES_KEY) === null) {
    set<PurchaseInvoice[]>(PURCHASES_KEY, []);
  }
  if (get<User[]>(USERS_KEY) === null) {
    set<User[]>(USERS_KEY, [DEFAULT_ADMIN]);
  }
  if (get<ActivityLogEntry[]>(ACTIVITY_LOG_KEY) === null) {
    set<ActivityLogEntry[]>(ACTIVITY_LOG_KEY, []);
  }
}

// ── Reset all data (Settings page) ────────────────────────────────────────────
const ALL_IM_KEYS = [
  PRODUCTS_KEY,
  PARTIES_KEY,
  STOCK_REGISTER_KEY,
  SALES_KEY,
  PURCHASES_KEY,
  USERS_KEY,
  SESSION_KEY,
  ACTIVITY_LOG_KEY,
];

export function resetAllData(): void {
  for (const key of ALL_IM_KEYS) {
    localStorage.removeItem(key);
  }
  // Re-seed essentials
  set<Product[]>(PRODUCTS_KEY, SEED_PRODUCTS);
  set<User[]>(USERS_KEY, [{ ...DEFAULT_ADMIN, createdAt: new Date().toISOString() }]);
  set<Party[]>(PARTIES_KEY, []);
  set<StockMovement[]>(STOCK_REGISTER_KEY, []);
  set<SaleInvoice[]>(SALES_KEY, []);
  set<PurchaseInvoice[]>(PURCHASES_KEY, []);
  set<ActivityLogEntry[]>(ACTIVITY_LOG_KEY, []);
}
