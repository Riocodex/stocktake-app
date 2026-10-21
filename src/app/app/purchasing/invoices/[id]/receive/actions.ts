"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { InvoiceError } from "@/lib/invoices";
import {
  linkManualDeliveryToInvoice,
  markInvoiceReceivedWithoutStock,
  receiveGoodsFromInvoice,
  setInvoiceLineReceivingFlags,
} from "@/lib/invoice-receiving";

export type ReceiveActionResult = {
  error: string | null;
  message?: string;
  suspected?: boolean;
};

const OK: ReceiveActionResult = { error: null };

function fail(error: unknown): ReceiveActionResult {
  if (error instanceof InvoiceError) {
    return { error: error.message, suspected: error.status === 409 };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "Something went wrong." };
}

function revalidate(invoiceId: string) {
  revalidatePath(`/app/purchasing/invoices/${invoiceId}`);
  revalidatePath(`/app/purchasing/invoices/${invoiceId}/receive`);
  revalidatePath("/app/purchasing/invoices");
  revalidatePath("/app/inventory");
  revalidatePath("/app");
}

export async function receiveFromInvoiceAction(
  _previous: ReceiveActionResult,
  formData: FormData,
): Promise<ReceiveActionResult> {
  try {
    const user = await requireUser();
    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    if (!invoiceId) return { error: "Missing invoice." };

    const lineIds = formData.getAll("lineId").map(String);
    const quantities = formData.getAll("quantity").map(String);
    const excludes = new Set(
      formData.getAll("excludeLineId").map(String).filter(Boolean),
    );

    const lines = lineIds.map((invoiceLineId, index) => ({
      invoiceLineId,
      quantity: Number(quantities[index] ?? 0),
      quantityInStockUnit: true,
      exclude: excludes.has(invoiceLineId),
    }));

    const result = await receiveGoodsFromInvoice(user, invoiceId, {
      lines,
      note: String(formData.get("note") ?? "").trim() || null,
      allowOverReceipt: formData.get("allowOverReceipt") === "on",
      overReceiptReason:
        String(formData.get("overReceiptReason") ?? "").trim() || null,
      acknowledgeSuspectedDuplicates:
        formData.get("acknowledgeSuspectedDuplicates") === "on",
    });

    revalidate(invoiceId);
    return {
      ...OK,
      message: result.stockChanged
        ? `Goods received · ${result.receivingStatus
            .replace(/_/g, " ")
            .toLowerCase()}. Document status remains Confirmed.`
        : "Updated exclusions. No stock change.",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function linkDeliveryAction(
  _previous: ReceiveActionResult,
  formData: FormData,
): Promise<ReceiveActionResult> {
  try {
    const user = await requireUser();
    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    const deliveryId = String(formData.get("deliveryId") ?? "").trim();
    if (!invoiceId || !deliveryId) {
      return { error: "Missing invoice or delivery." };
    }

    const deliveryLineIds = formData.getAll("deliveryLineId").map(String);
    const invoiceLineIds = formData.getAll("mapInvoiceLineId").map(String);
    const mappings = deliveryLineIds
      .map((deliveryLineId, index) => ({
        deliveryLineId,
        invoiceLineId: invoiceLineIds[index] ?? "",
      }))
      .filter((row) => row.deliveryLineId && row.invoiceLineId);

    if (mappings.length === 0) {
      return { error: "Map at least one delivery line to an invoice line." };
    }

    await linkManualDeliveryToInvoice(user, invoiceId, deliveryId, mappings);
    revalidate(invoiceId);
    return {
      ...OK,
      message: "Delivery linked without adding stock again.",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function matchReceiveLineAction(
  _previous: ReceiveActionResult,
  formData: FormData,
): Promise<ReceiveActionResult> {
  try {
    const user = await requireUser();
    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    const invoiceLineId = String(formData.get("invoiceLineId") ?? "").trim();
    const itemId = String(formData.get("itemId") ?? "").trim() || null;
    if (!invoiceId || !invoiceLineId) return { error: "Missing line." };

    await setInvoiceLineReceivingFlags(user, invoiceId, [
      { invoiceLineId, itemId },
    ]);
    revalidate(invoiceId);
    return { ...OK, message: "Line match updated." };
  } catch (error) {
    return fail(error);
  }
}

export async function markReceivedWithoutStockAction(
  _previous: ReceiveActionResult,
  formData: FormData,
): Promise<ReceiveActionResult> {
  try {
    const user = await requireUser();
    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();
    if (!invoiceId) return { error: "Missing invoice." };
    await markInvoiceReceivedWithoutStock(user, invoiceId, reason);
    revalidate(invoiceId);
    return {
      ...OK,
      message: "Invoice marked fully received without changing stock.",
    };
  } catch (error) {
    return fail(error);
  }
}
