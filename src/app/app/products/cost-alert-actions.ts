"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { updateFoodCostThresholds } from "@/lib/settings";

export type ThresholdFormState = {
  error?: string;
  success?: string;
};

export async function updateFoodCostThresholdsAction(
  _prev: ThresholdFormState,
  formData: FormData,
): Promise<ThresholdFormState> {
  const user = await requireUser();
  const result = await updateFoodCostThresholds(
    user,
    Number(formData.get("warningPercent")),
    Number(formData.get("criticalPercent")),
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/app/products/dishes");
  revalidatePath("/app/products/cost-alerts");
  return {
    success: `Thresholds updated: warning ${result.thresholds.warningPercent}%, critical ${result.thresholds.criticalPercent}%.`,
  };
}
