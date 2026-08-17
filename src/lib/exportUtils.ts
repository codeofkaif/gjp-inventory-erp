import * as XLSX from "xlsx";
import type { Party, SaleInvoice, Product } from "../types";
import { round2 } from "./gstUtils";
import { BUSINESS_CONFIG } from "./businessConfig";

/**
 * Export a Single Customer's Sales Invoices Statement to true native Excel (.xlsx) file
 */
export function exportCustomerStatementExcel(
  customer: Party,
  invoices: SaleInvoice[],
  productMap: Record<string, Product>
): void {
  const totalBilled = round2(invoices.reduce((s, inv) => s + (inv.total || 0), 0));
  const totalTaxable = round2(
    invoices.reduce((s, inv) => s + inv.items.reduce((sum, i) => sum + (i.amount || 0), 0), 0)
  );
  const totalAdvance = round2(invoices.reduce((s, inv) => s + (inv.advance || 0), 0));
  const totalDue = round2(invoices.reduce((s, inv) => s + (inv.balanceDue || 0), 0));

  const data: (string | number)[][] = [
    [BUSINESS_CONFIG.name],
    [`Proprietor: ${BUSINESS_CONFIG.proprietor} | ${BUSINESS_CONFIG.fullAddress} | Mob: ${BUSINESS_CONFIG.formattedMobile}`],
    ["CUSTOMER SALES INVOICES STATEMENT & ACCOUNT LEDGER"],
    ["Generated On", new Date().toLocaleString("en-IN")],
    [],
    ["CUSTOMER PROFILE DETAILS"],
    ["Customer ID", customer.id],
    ["Customer Name", customer.name],
    ["Phone", customer.phone || "N/A"],
    ["GSTIN", customer.gstin || "N/A"],
    ["Address", customer.address || "N/A"],
    [],
    ["LEDGER FINANCIAL SUMMARY"],
    ["Total Invoices Count", invoices.length],
    ["Total Taxable Value (₹)", totalTaxable],
    ["Total Invoiced Amount (₹)", totalBilled],
    ["Total Payments Received / Advance (₹)", totalAdvance],
    ["Current Outstanding Balance Due (₹)", customer.outstandingBalance],
    [],
    [
      "Invoice SL No",
      "Invoice ID",
      "Order Date",
      "Due Date",
      "Payment Mode",
      "State Type",
      "Product Name",
      "Category",
      "Qty Sold",
      "Unit Price (₹)",
      "Discount (₹)",
      "Taxable Amount (₹)",
      "CGST (₹)",
      "SGST (₹)",
      "IGST (₹)",
      "Total GST (₹)",
      "Invoice Grand Total (₹)",
      "Paid / Advance (₹)",
      "Balance Due (₹)",
    ],
  ];

  invoices.forEach((inv) => {
    const invTaxable = round2(inv.items.reduce((s, i) => s + (i.amount || 0), 0));
    const invCgst = round2(inv.items.reduce((s, i) => s + (i.cgst || 0) + (i.sgst || 0), 0));
    const invSgst = round2(inv.items.reduce((s, i) => s + (i.sgst || 0), 0));
    const invIgst = round2(inv.items.reduce((s, i) => s + (i.igst || 0), 0));
    const invGst = round2(invCgst + invSgst + invIgst);

    if (inv.items.length === 0) {
      data.push([
        String(inv.slNo || inv.id),
        inv.id,
        inv.orderDate,
        inv.dueDate || "",
        inv.paymentMethod.toUpperCase(),
        inv.stateType === "intrastate" ? "Intra-state" : "Inter-state",
        "—",
        "—",
        0,
        0,
        0,
        invTaxable,
        invCgst,
        invSgst,
        invIgst,
        invGst,
        inv.total,
        inv.advance,
        inv.balanceDue,
      ]);
    } else {
      inv.items.forEach((item, idx) => {
        const prod = productMap[item.productId];
        const itemGst = round2((item.cgst || 0) + (item.sgst || 0) + (item.igst || 0));

        data.push([
          idx === 0 ? String(inv.slNo || inv.id) : "",
          idx === 0 ? inv.id : "",
          idx === 0 ? inv.orderDate : "",
          idx === 0 ? inv.dueDate || "" : "",
          idx === 0 ? inv.paymentMethod.toUpperCase() : "",
          idx === 0 ? (inv.stateType === "intrastate" ? "Intra-state" : "Inter-state") : "",
          prod?.name || item.productId,
          prod?.category || "General",
          `${item.qty} ${prod?.unit || "pcs"}`,
          item.unitPrice || 0,
          item.discount || 0,
          item.amount || 0,
          item.cgst || 0,
          item.sgst || 0,
          item.igst || 0,
          itemGst,
          idx === 0 ? inv.total : "",
          idx === 0 ? inv.advance : "",
          idx === 0 ? inv.balanceDue : "",
        ]);
      });
    }
  });

  // Summary Footer
  data.push([]);
  data.push([
    "TOTALS",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    totalTaxable,
    "",
    "",
    "",
    "",
    totalBilled,
    totalAdvance,
    totalDue,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Set friendly column widths
  ws["!cols"] = [
    { wch: 18 }, // SL No
    { wch: 16 }, // Invoice ID
    { wch: 12 }, // Date
    { wch: 12 }, // Due Date
    { wch: 14 }, // Mode
    { wch: 14 }, // State Type
    { wch: 25 }, // Product Name
    { wch: 18 }, // Category
    { wch: 12 }, // Qty
    { wch: 14 }, // Unit Price
    { wch: 14 }, // Discount
    { wch: 16 }, // Taxable Amount
    { wch: 12 }, // CGST
    { wch: 12 }, // SGST
    { wch: 12 }, // IGST
    { wch: 14 }, // Total GST
    { wch: 18 }, // Grand Total
    { wch: 16 }, // Paid
    { wch: 16 }, // Due
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sales Statement");

  const cleanName = customer.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `Customer_Statement_${customer.id}_${cleanName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Export All Customers Register (Entire Master Ledger) to Native Excel (.xlsx) file
 */
export function exportAllCustomersRegisterExcel(
  customers: Party[],
  sales: SaleInvoice[],
  productMap: Record<string, Product>
): void {
  const data: (string | number)[][] = [
    [BUSINESS_CONFIG.name],
    [`Proprietor: ${BUSINESS_CONFIG.proprietor} | ${BUSINESS_CONFIG.fullAddress} | Mob: ${BUSINESS_CONFIG.formattedMobile}`],
    ["MASTER CUSTOMER REGISTER & ALL SALES INVOICES LEDGER"],
    ["Generated On", new Date().toLocaleString("en-IN")],
    [],
    [
      "Customer ID",
      "Customer Name",
      "Phone",
      "GSTIN",
      "Address",
      "Invoice SL No",
      "Invoice ID",
      "Order Date",
      "Payment Mode",
      "State Type",
      "Items Description",
      "Taxable Total (₹)",
      "GST Total (₹)",
      "Invoice Grand Total (₹)",
      "Paid / Advance (₹)",
      "Invoice Balance Due (₹)",
      "Customer Current Outstanding (₹)",
    ],
  ];

  customers.forEach((cust) => {
    const custSales = sales.filter((s) => s.customerId === cust.id);

    if (custSales.length === 0) {
      data.push([
        cust.id,
        cust.name,
        cust.phone || "",
        cust.gstin || "",
        cust.address || "",
        "—",
        "—",
        "—",
        "—",
        "—",
        "No Sales Recorded",
        0,
        0,
        0,
        0,
        0,
        cust.outstandingBalance,
      ]);
    } else {
      custSales.forEach((inv) => {
        const invTaxable = round2(inv.items.reduce((s, i) => s + (i.amount || 0), 0));
        const invGst = round2(inv.items.reduce((s, i) => s + (i.cgst || 0) + (i.sgst || 0) + (i.igst || 0), 0));
        const itemsSummary = inv.items
          .map((i) => `${productMap[i.productId]?.name || i.productId} (${i.qty})`)
          .join("; ");

        data.push([
          cust.id,
          cust.name,
          cust.phone || "",
          cust.gstin || "",
          cust.address || "",
          String(inv.slNo || inv.id),
          inv.id,
          inv.orderDate,
          inv.paymentMethod.toUpperCase(),
          inv.stateType === "intrastate" ? "Intra-state" : "Inter-state",
          itemsSummary,
          invTaxable,
          invGst,
          inv.total,
          inv.advance,
          inv.balanceDue,
          cust.outstandingBalance,
        ]);
      });
    }
  });

  const ws = XLSX.utils.aoa_to_sheet(data);

  ws["!cols"] = [
    { wch: 14 }, // Customer ID
    { wch: 24 }, // Customer Name
    { wch: 14 }, // Phone
    { wch: 18 }, // GSTIN
    { wch: 28 }, // Address
    { wch: 16 }, // SL No
    { wch: 16 }, // Invoice ID
    { wch: 12 }, // Date
    { wch: 14 }, // Mode
    { wch: 14 }, // State Type
    { wch: 32 }, // Items
    { wch: 16 }, // Taxable
    { wch: 14 }, // GST
    { wch: 18 }, // Total
    { wch: 16 }, // Paid
    { wch: 16 }, // Due
    { wch: 22 }, // Customer Outstanding
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Master Customer Register");

  const filename = `Master_Customer_Register_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}
