"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import {
  cancelTransferDraft,
  createTransferDraft,
  receiveTransfer,
  sendTransfer,
} from "@/lib/transfers";

export type TransferActionResult = { error: string | null; message?: string };

const OK: TransferActionResult = { error: null };

function refreshTransferPaths(id?: string) {
  revalidatePath("/app/inventory");
  revalidatePath("/app/inventory/transfers");
  revalidatePath("/app");
  if (id) revalidatePath(`/app/inventory/transfers/${id}`);
}

export async function createTransferAction(
  _previous: TransferActionResult,
  formData: FormData,
): Promise<TransferActionResult> {
  const user = await requireUser();
  const rawItems = formData.getAll("itemId");
  const rawQty = formData.getAll("quantity");
  const lines = [];
  for (let index = 0; index < rawItems.length; index++) {
    const itemId = String(rawItems[index] ?? "").trim();
    const quantity = Number(rawQty[index] ?? 0);
    if (!itemId) continue;
    lines.push({ itemId, quantity });
  }

  const result = await createTransferDraft(user, {
    fromOutletId: String(formData.get("fromOutletId") ?? ""),
    toOutletId: String(formData.get("toOutletId") ?? ""),
    note: String(formData.get("note") ?? ""),
    imageUrl: String(formData.get("imageUrl") ?? "") || null,
    lines,
  });
  if (!result.ok) {
    return { error: result.error ?? "Could not create transfer." };
  }

  refreshTransferPaths(result.transfer.id);
  redirect(`/app/inventory/transfers/${result.transfer.id}`);
}

export async function sendTransferAction(
  _previous: TransferActionResult,
  formData: FormData,
): Promise<TransferActionResult> {
  const user = await requireUser();
  const id = String(formData.get("transferId") ?? "");
  const result = await sendTransfer(user, id);
  if (!result.ok) return { error: result.error ?? "Could not send transfer." };
  refreshTransferPaths(id);
  return { ...OK, message: `Transfer ${result.transfer.reference} sent.` };
}

export async function cancelTransferAction(
  _previous: TransferActionResult,
  formData: FormData,
): Promise<TransferActionResult> {
  const user = await requireUser();
  const id = String(formData.get("transferId") ?? "");
  const result = await cancelTransferDraft(user, id);
  if (!result.ok) {
    return { error: result.error ?? "Could not cancel transfer." };
  }
  refreshTransferPaths(id);
  return { ...OK, message: `Transfer ${result.transfer.reference} cancelled.` };
}

export async function receiveTransferAction(
  _previous: TransferActionResult,
  formData: FormData,
): Promise<TransferActionResult> {
  const user = await requireUser();
  const id = String(formData.get("transferId") ?? "");
  const rawItems = formData.getAll("itemId");
  const rawQty = formData.getAll("receivedQty");
  const rawNotes = formData.getAll("discrepancyNote");

  const lines = [];
  for (let index = 0; index < rawItems.length; index++) {
    lines.push({
      itemId: String(rawItems[index] ?? ""),
      receivedQty: Number(rawQty[index] ?? 0),
      discrepancyNote: String(rawNotes[index] ?? ""),
    });
  }

  const result = await receiveTransfer(user, {
    transferId: id,
    note: String(formData.get("note") ?? ""),
    lines,
  });
  if (!result.ok) {
    return { error: result.error ?? "Could not receive transfer." };
  }
  refreshTransferPaths(id);
  return {
    ...OK,
    message: `Transfer ${result.transfer.reference} received.`,
  };
}
