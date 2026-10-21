"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { WASTAGE_TARGET } from "@/lib/constants";
import { recordDishWastage, recordItemWastage } from "@/lib/wastage";

export type WastageActionResult = {
  error: string | null;
  message?: string;
  itemId?: string;
  dishId?: string;
  remainingQuantity?: number;
  targetType?: string;
  value?: number;
};

const OK: WastageActionResult = { error: null };

export async function recordWastageAction(
  _previous: WastageActionResult,
  formData: FormData,
): Promise<WastageActionResult> {
  const user = await requireUser();
  const targetType = String(formData.get("targetType") ?? WASTAGE_TARGET.ITEM);

  if (targetType === WASTAGE_TARGET.DISH) {
    const result = await recordDishWastage(user, {
      outletId: String(formData.get("outletId") ?? ""),
      dishId: String(formData.get("dishId") ?? ""),
      quantity: Number(formData.get("quantity") ?? 0),
      reason: String(formData.get("reason") ?? ""),
      note: String(formData.get("note") ?? ""),
    });

    if (!result.ok) return { error: result.error };

    revalidatePath("/app/inventory");
    revalidatePath("/app/inventory/wastage");
    revalidatePath("/app/products/dishes");
    revalidatePath("/app");

    return {
      ...OK,
      targetType: WASTAGE_TARGET.DISH,
      dishId: result.wastage.dishId,
      value: result.wastage.value,
      message: `Dish wastage recorded · ${result.wastage.quantity} ${result.wastage.unit}${result.wastage.quantity === 1 ? "" : "s"} of ${result.wastage.dishName}. Financial loss ${formatMoneySimple(result.wastage.value)}. No ingredients deducted.`,
    };
  }

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
    targetType: WASTAGE_TARGET.ITEM,
    itemId: result.wastage.itemId,
    remainingQuantity: result.wastage.remainingQuantity,
    value: result.wastage.value,
    message: `Wastage recorded · ${result.wastage.quantity} ${result.wastage.unit}. ${formatQtyRemaining(result.wastage.remainingQuantity, result.wastage.unit)} left on hand.`,
  };
}

function formatQtyRemaining(quantity: number, unit: string) {
  const rounded = Math.round(quantity * 100) / 100;
  return `${rounded} ${unit}`;
}

function formatMoneySimple(value: number) {
  return `€${value.toFixed(2)}`;
}
