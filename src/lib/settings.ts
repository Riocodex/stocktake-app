import {
  DEFAULT_FOOD_COST_CRITICAL_PERCENT,
  DEFAULT_FOOD_COST_WARNING_PERCENT,
  ROLES,
} from "@/lib/constants";
import { prisma } from "@/lib/db";

export type FoodCostThresholds = {
  warningPercent: number;
  criticalPercent: number;
};

export type SettingsActor = {
  id: string;
  role: string;
  outletId: string | null;
};

const SETTINGS_ID = "default";

function roundThreshold(value: number) {
  return Math.round(value * 10) / 10;
}

export async function getFoodCostThresholds(): Promise<FoodCostThresholds> {
  const row = await prisma.appSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      foodCostWarningPercent: DEFAULT_FOOD_COST_WARNING_PERCENT,
      foodCostCriticalPercent: DEFAULT_FOOD_COST_CRITICAL_PERCENT,
    },
    update: {},
  });

  return {
    warningPercent: row.foodCostWarningPercent,
    criticalPercent: row.foodCostCriticalPercent,
  };
}

export function validateFoodCostThresholds(
  warningRaw: number,
  criticalRaw: number,
): { ok: true; thresholds: FoodCostThresholds } | { ok: false; error: string } {
  const warningPercent = Number(warningRaw);
  const criticalPercent = Number(criticalRaw);

  if (!Number.isFinite(warningPercent) || !Number.isFinite(criticalPercent)) {
    return { ok: false, error: "Thresholds must be numbers." };
  }
  if (warningPercent < 0) {
    return { ok: false, error: "Warning threshold cannot be negative." };
  }
  if (warningPercent > 100 || criticalPercent > 100) {
    return { ok: false, error: "Thresholds cannot exceed 100%." };
  }
  if (criticalPercent <= warningPercent) {
    return {
      ok: false,
      error: "Critical threshold must be greater than the warning threshold.",
    };
  }

  return {
    ok: true,
    thresholds: {
      warningPercent: roundThreshold(warningPercent),
      criticalPercent: roundThreshold(criticalPercent),
    },
  };
}

export async function updateFoodCostThresholds(
  user: SettingsActor,
  warningRaw: number,
  criticalRaw: number,
): Promise<
  | { ok: true; thresholds: FoodCostThresholds }
  | { ok: false; error: string }
> {
  if (user.role !== ROLES.SUPER_ADMIN) {
    return {
      ok: false,
      error: "Only super admins can change food-cost thresholds.",
    };
  }

  const parsed = validateFoodCostThresholds(warningRaw, criticalRaw);
  if (!parsed.ok) return parsed;

  await prisma.appSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      foodCostWarningPercent: parsed.thresholds.warningPercent,
      foodCostCriticalPercent: parsed.thresholds.criticalPercent,
    },
    update: {
      foodCostWarningPercent: parsed.thresholds.warningPercent,
      foodCostCriticalPercent: parsed.thresholds.criticalPercent,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: user.id,
      outletId: user.outletId,
      action: "FOOD_COST_THRESHOLDS_UPDATED",
      detail: `Warning ${parsed.thresholds.warningPercent}% · Critical ${parsed.thresholds.criticalPercent}%`,
    },
  });

  return { ok: true, thresholds: parsed.thresholds };
}
