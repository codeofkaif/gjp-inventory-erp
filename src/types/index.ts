// ── Products ────────────────────────────────────────────────────────────────
export type Product = {
  id: string;
  name: string;
  category?: string;
  hsnCode: string;
  unit: "kg" | "pcs";
  gstRate: number;
  unitPrice: number;
  stockQty: number;
  reorderLevel: number;
};

// ── Parties ──────────────────────────────────────────────────────────────────
export type Party = {
  id: string;
  name: string;
  phone: string;
  address?: string;
  gstin?: string;
  type: "customer" | "supplier";
  outstandingBalance: number;
};

// ── Stock Movements ───────────────────────────────────────────────────────────
export type MovementType = "sale" | "purchase" | "adjustment" | "return" | "transfer";

export type StockMovement = {
  id: string;
  productId: string;
  type: MovementType;
  qtyChange: number;
  refId: string;
  note: string;
  timestamp: string;
};

// ── Invoice Items (with GST split) ────────────────────────────────────────────
export type InvoiceItem = {
  productId: string;
  qty: number;
  unitPrice: number;
  discount: number;
  amount: number;   // taxable = (qty * unitPrice) - discount
  cgst: number;     // 0 for interstate
  sgst: number;     // 0 for interstate
  igst: number;     // 0 for intrastate
};

// ── State type for GST applicability ─────────────────────────────────────────
export type StateType = "intrastate" | "interstate";

// ── Sale Invoice ──────────────────────────────────────────────────────────────
export type SaleInvoice = {
  id: string;
  slNo?: string | number;
  orderDate: string;
  dueDate?: string;
  creditDays?: number;
  refNo?: string;
  salesman?: string;
  narration?: string;
  customerId: string;
  paymentMethod: "cash" | "upi" | "credit" | "bank";
  stateType: StateType;
  items: InvoiceItem[];
  total: number;    // sum of (amount + cgst + sgst + igst) per line
  advance: number;
  balanceDue: number;
};

// ── Purchase Invoice ──────────────────────────────────────────────────────────
export type PurchaseInvoice = {
  id: string;
  slNo?: string | number;
  orderDate: string;
  dueDate?: string;
  creditDays?: number;
  refNo?: string;
  locationId?: string;
  packingListNo?: string;
  remarks?: string;
  supplierId: string;
  paymentMethod: "cash" | "upi" | "credit" | "bank";
  stateType: StateType;
  items: InvoiceItem[];
  total: number;
  advance: number;
  balanceDue: number;
};

// ── GST bucket (for summary) ──────────────────────────────────────────────────
export type GstBucket = {
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
};

// ── Users & Auth ──────────────────────────────────────────────────────────────
export type UserRole = "admin" | "staff";

export type User = {
  id: string;
  name: string;
  pin: string;       // 4-digit, local device only
  role: UserRole;
  createdAt: string;
};

export type Session = {
  userId: string;
};

// ── Activity Log ──────────────────────────────────────────────────────────────
export type ActivityAction = "create" | "edit" | "delete";

export type ActivityLogEntry = {
  id: string;
  userId: string;
  userName: string;
  action: ActivityAction;
  entity: string;       // e.g. "product", "sale", "purchase"
  entityId: string;
  timestamp: string;
};

// ── Nav helper ────────────────────────────────────────────────────────────────
export type NavItem = {
  label: string;
  path: string;
  icon: string;
  adminOnly?: boolean;
};
