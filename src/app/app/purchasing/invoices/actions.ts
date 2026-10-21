"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { InvoiceError, updateInvoiceDraft, uploadInvoice } from "@/lib/invoices";
import { confirmDeliveryAndUpdateStock } from "@/lib/invoice-receiving";

export type InvoiceActionResult = {
  error: string | null;
  message?: string;
  invoiceId?: string;
  duplicates?: boolean;
  stockChanged?: boolean;
};

const OK: InvoiceActionResult = { error: null };

function fail(error: unknown): InvoiceActionResult {
  if (error instanceof InvoiceError) {
    return {
      error: error.message,
      duplicates: error.status === 409,
    };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "Something went wrong." };
}

function revalidateInvoices(id?: string) {
  revalidatePath("/app/purchasing/invoices");
  if (id) revalidatePath(`/app/purchasing/invoices/${id}`);
}

export async function uploadInvoiceAction(
  _previous: InvoiceActionResult,
  formData: FormData,
): Promise<InvoiceActionResult> {
  try {
    const user = await requireUser();
    const outletId = String(formData.get("outletId") ?? "").trim() || null;
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Choose an invoice photo or PDF." };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await uploadInvoice(user, {
      outletId,
      bytes,
      mimeType: file.type || "image/jpeg",
      originalName: file.name,
    });

    revalidateInvoices(result.invoice.id);
    redirect(`/app/purchasing/invoices/${result.invoice.id}`);
  } catch (error) {
    // redirect() throws; rethrow those
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    return fail(error);
  }
}

export async function saveInvoiceDraftAction(
  _previous: InvoiceActionResult,
  formData: FormData,
): Promise<InvoiceActionResult> {
  try {
    const user = await requireUser();
    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    if (!invoiceId) return { error: "Missing invoice." };

    const lineDescriptions = formData.getAll("lineDescription").map(String);
    const lineItemIds = formData.getAll("lineItemId").map(String);
    const lineQtys = formData.getAll("lineQuantity").map(String);
    const lineUnits = formData.getAll("lineUnit").map(String);
    const linePrices = formData.getAll("lineUnitPrice").map(String);
    const lineTotals = formData.getAll("lineTotal").map(String);
    const lineNeedsReview = formData.getAll("lineNeedsReview").map(String);

    const lines = lineDescriptions.flatMap((desc, index) => {
      const rawDescription = desc.trim();
      if (!rawDescription) return [];
      const qtyRaw = lineQtys[index]?.trim() ?? "";
      const priceRaw = linePrices[index]?.trim() ?? "";
      const totalRaw = lineTotals[index]?.trim() ?? "";
      return [
        {
          rawDescription,
          itemId: lineItemIds[index]?.trim() || null,
          quantity: qtyRaw ? Number(qtyRaw) : null,
          unit: lineUnits[index]?.trim() || null,
          unitPrice: priceRaw ? Number(priceRaw) : null,
          lineTotal: totalRaw ? Number(totalRaw) : null,
          needsReview: lineNeedsReview[index] === "on",
        },
      ];
    });

    const subtotalRaw = String(formData.get("subtotal") ?? "").trim();
    const vatRaw = String(formData.get("vatAmount") ?? "").trim();
    const totalRaw = String(formData.get("total") ?? "").trim();

    await updateInvoiceDraft(user, invoiceId, {
      outletId: String(formData.get("outletId") ?? "").trim() || null,
      supplierId: String(formData.get("supplierId") ?? "").trim() || null,
      supplierTextRaw: String(formData.get("supplierTextRaw") ?? "").trim() || null,
      supplierVatRaw: String(formData.get("supplierVatRaw") ?? "").trim() || null,
      invoiceNumber: String(formData.get("invoiceNumber") ?? "").trim() || null,
      invoiceDate: String(formData.get("invoiceDate") ?? "").trim() || null,
      deliveryDate: String(formData.get("deliveryDate") ?? "").trim() || null,
      currency: String(formData.get("currency") ?? "").trim() || "EUR",
      subtotal: subtotalRaw ? Number(subtotalRaw) : null,
      vatAmount: vatRaw ? Number(vatRaw) : null,
      total: totalRaw ? Number(totalRaw) : null,
      lines,
    });

    revalidateInvoices(invoiceId);
    return { ...OK, message: "Draft saved.", invoiceId };
  } catch (error) {
    return fail(error);
  }
}

/**
 * One-step: save draft corrections, confirm invoice, and update stock.
 */
export async function confirmDeliveryAndUpdateStockAction(
  _previous: InvoiceActionResult,
  formData: FormData,
): Promise<InvoiceActionResult> {
  try {
    const user = await requireUser();
    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    if (!invoiceId) return { error: "Missing invoice." };

    const lineDescriptions = formData.getAll("lineDescription").map(String);
    const lineItemIds = formData.getAll("lineItemId").map(String);
    const lineQtys = formData.getAll("lineQuantity").map(String);
    const lineUnits = formData.getAll("lineUnit").map(String);
    const linePrices = formData.getAll("lineUnitPrice").map(String);
    const lineTotals = formData.getAll("lineTotal").map(String);
    const lineNeedsReview = formData.getAll("lineNeedsReview").map(String);
    const lineReceived = formData.getAll("lineReceivedQty").map(String);
    const lineExclude = formData.getAll("lineExclude").map(String);
    const lineIds = formData.getAll("lineId").map(String);

    const lines = lineDescriptions.flatMap((desc, index) => {
      const rawDescription = desc.trim();
      if (!rawDescription) return [];
      const qtyRaw = lineQtys[index]?.trim() ?? "";
      const priceRaw = linePrices[index]?.trim() ?? "";
      const totalRaw = lineTotals[index]?.trim() ?? "";
      return [
        {
          id: lineIds[index]?.trim() || undefined,
          rawDescription,
          itemId: lineItemIds[index]?.trim() || null,
          quantity: qtyRaw ? Number(qtyRaw) : null,
          unit: lineUnits[index]?.trim() || null,
          unitPrice: priceRaw ? Number(priceRaw) : null,
          lineTotal: totalRaw ? Number(totalRaw) : null,
          needsReview: lineNeedsReview[index] === "on",
          excludeFromReceiving: lineExclude[index] === "on",
        },
      ];
    });

    const subtotalRaw = String(formData.get("subtotal") ?? "").trim();
    const vatRaw = String(formData.get("vatAmount") ?? "").trim();
    const totalRaw = String(formData.get("total") ?? "").trim();

    // Persist review edits first (no stock yet).
    const draft = await updateInvoiceDraft(user, invoiceId, {
      outletId: String(formData.get("outletId") ?? "").trim() || null,
      supplierId: String(formData.get("supplierId") ?? "").trim() || null,
      supplierTextRaw:
        String(formData.get("supplierTextRaw") ?? "").trim() || null,
      supplierVatRaw: String(formData.get("supplierVatRaw") ?? "").trim() || null,
      invoiceNumber: String(formData.get("invoiceNumber") ?? "").trim() || null,
      invoiceDate: String(formData.get("invoiceDate") ?? "").trim() || null,
      deliveryDate: String(formData.get("deliveryDate") ?? "").trim() || null,
      currency: String(formData.get("currency") ?? "").trim() || "EUR",
      subtotal: subtotalRaw ? Number(subtotalRaw) : null,
      vatAmount: vatRaw ? Number(vatRaw) : null,
      total: totalRaw ? Number(totalRaw) : null,
      lines,
    });

    // Apply exclude flags on persisted lines (matched by order after draft save).
    const receiveLines = draft.invoice.lines.map((line, index) => {
      const receivedRaw = lineReceived[index]?.trim() ?? "";
      const exclude = lineExclude[index] === "on";
      return {
        invoiceLineId: line.id,
        quantity: receivedRaw ? Number(receivedRaw) : 0,
        quantityInStockUnit: false,
        exclude,
      };
    });

    const result = await confirmDeliveryAndUpdateStock(user, invoiceId, {
      lines: receiveLines,
      note: String(formData.get("note") ?? "").trim() || null,
      acknowledgeDocumentDuplicates:
        formData.get("acknowledgeDuplicates") === "on",
      acknowledgeSuspectedDuplicates:
        formData.get("acknowledgeSuspectedDuplicates") === "on",
      allowOverReceipt: formData.get("allowOverReceipt") === "on",
      overReceiptReason:
        String(formData.get("overReceiptReason") ?? "").trim() || null,
    });

    revalidateInvoices(invoiceId);
    revalidatePath("/app/inventory");
    revalidatePath("/app");
    return {
      ...OK,
      invoiceId,
      stockChanged: result.stockChanged,
      message: result.stockChanged
        ? `Delivery confirmed · stock updated (${result.receivingStatus.replace(/_/g, " ").toLowerCase()}). Purchase prices were not applied to dish costing.`
        : "Invoice confirmed. No stock lines were received (all excluded or zero).",
    };
  } catch (error) {
    return fail(error);
  }
}
