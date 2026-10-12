"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { recordItemWastage } from "@/lib/wastage";

export type WastageActionResult = {
  error: string | null;
  message?: string;
  itemId?: string;
  remainingQuantity?: number;
};

const OK: WastageActionResult = { error: null };

export async function recordWastageAction(
  _previous: WastageActionResult,
  formData: FormData,
): Promise<WastageActionResult> {
  const user = await requireUser();

  const result = await recordItemWastage(user, {
    outletId: String(formData.get("outletId") ?? ""),
    itemId: String(formData.get("itemId") ?? ""),
    quantity: Number(formData.get("quantity") ?? 0),
    reason: String(formData.get("reason") ?? ""),
    note: String(formData.get("note") ?? ""),
    imageUrl: String(formData.get("imageUrl") ?? ""),
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/app/inventory");
  revalidatePath("/app/inventory/wastage");
  revalidatePath("/app");

  return {
    ...OK,
    itemId: result.wastage.itemId,
    remainingQuantity: result.wastage.remainingQuantity,
    message: `Wastage recorded · ${result.wastage.quantity} ${result.wastage.unit}. ${formatQtyRemaining(result.wastage.remainingQuantity, result.wastage.unit)} left on hand.`,
  };
}

function formatQtyRemaining(quantity: number, unit: string) {
  const rounded = Math.round(quantity * 100) / 100;
  return `${rounded} ${unit}`;
}
