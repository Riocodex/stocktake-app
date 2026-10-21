import {
  COST_ALERT_LEVEL,
  COST_ALERT_LEVEL_LABELS,
  type CostAlertLevel,
} from "@/lib/constants";
import {
  calculateDishCost,
  calculateDishCostsForOutlet,
  type CostingActor,
  type DishCostResult,
} from "@/lib/dish-costing";
import { prisma } from "@/lib/db";
import {
  getFoodCostThresholds,
  type FoodCostThresholds,
} from "@/lib/settings";

export type DishCostAlert = {
  dishId: string;
  dishName: string;
  /** Group-wide after Step 7 adjustment — not per-outlet. */
  priceScope: "group";
  scopeLabel: "Group";
  sellingPrice: number;
  dishCost: number | null;
  foodCostPercent: number | null;
  grossMarginPercent: number | null;
  costingStatus: DishCostResult["status"];
  costingStatusLabel: string;
  alertLevel: CostAlertLevel;
  alertLabel: string;
  /** Which threshold was crossed, if any. */
  thresholdExceeded: "warning" | "critical" | null;
  thresholds: FoodCostThresholds;
  isActive: boolean;
};

/**
 * Classify a completed food-cost % against thresholds.
 * Pure helper for tests — does not load the DB.
 */
export function classifyFoodCostAlert(
  foodCostPercent: number | null,
  sellingPrice: number,
  costingStatus: DishCostResult["status"],
  thresholds: FoodCostThresholds,
): {
  alertLevel: CostAlertLevel;
  thresholdExceeded: "warning" | "critical" | null;
} {
  // Incomplete recipe / conversion / missing prices → Unresolved (not Critical).
  if (costingStatus === "NO_RECIPE" || costingStatus === "INCOMPLETE") {
    return { alertLevel: COST_ALERT_LEVEL.UNRESOLVED, thresholdExceeded: null };
  }

  // Zero or negative selling price cannot be Healthy.
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
    return { alertLevel: COST_ALERT_LEVEL.UNRESOLVED, thresholdExceeded: null };
  }

  if (foodCostPercent === null || !Number.isFinite(foodCostPercent)) {
    return { alertLevel: COST_ALERT_LEVEL.UNRESOLVED, thresholdExceeded: null };
  }

  if (foodCostPercent >= thresholds.criticalPercent) {
    return {
      alertLevel: COST_ALERT_LEVEL.CRITICAL,
      thresholdExceeded: "critical",
    };
  }
  if (foodCostPercent >= thresholds.warningPercent) {
    return {
      alertLevel: COST_ALERT_LEVEL.WARNING,
      thresholdExceeded: "warning",
    };
  }
  return { alertLevel: COST_ALERT_LEVEL.HEALTHY, thresholdExceeded: null };
}

function toAlert(
  cost: DishCostResult,
  thresholds: FoodCostThresholds,
  isActive: boolean,
): DishCostAlert {
  const { alertLevel, thresholdExceeded } = classifyFoodCostAlert(
    cost.foodCostPercent,
    cost.sellingPrice,
    cost.status,
    thresholds,
  );

  return {
    dishId: cost.dishId,
    dishName: cost.dishName,
    priceScope: "group",
    scopeLabel: "Group",
    sellingPrice: cost.sellingPrice,
    dishCost: cost.dishCost,
    foodCostPercent: cost.foodCostPercent,
    grossMarginPercent: cost.grossMarginPercent,
    costingStatus: cost.status,
    costingStatusLabel: cost.statusLabel,
    alertLevel,
    alertLabel: COST_ALERT_LEVEL_LABELS[alertLevel],
    thresholdExceeded,
    thresholds,
    isActive,
  };
}

export async function getDishCostAlert(
  user: CostingActor,
  dishId: string,
): Promise<{ ok: true; alert: DishCostAlert } | { ok: false; error: string }> {
  const [costResult, thresholds, dish] = await Promise.all([
    calculateDishCost(user, dishId),
    getFoodCostThresholds(),
    prisma.dish.findUnique({
      where: { id: dishId },
      select: { isActive: true },
    }),
  ]);

  if (!costResult.ok) return { ok: false, error: costResult.error };
  if (!dish) return { ok: false, error: "Dish not found." };

  return {
    ok: true,
    alert: toAlert(costResult.cost, thresholds, dish.isActive),
  };
}

export async function listDishCostAlerts(
  user: CostingActor,
  options: {
    /** Only WARNING / CRITICAL / UNRESOLVED when true. */
    attentionOnly?: boolean;
    activeOnly?: boolean;
  } = {},
): Promise<{
  alerts: DishCostAlert[];
  thresholds: FoodCostThresholds;
  summary: {
    healthy: number;
    warning: number;
    critical: number;
    unresolved: number;
  };
}> {
  const thresholds = await getFoodCostThresholds();

  const dishes = await prisma.dish.findMany({
    where: options.activeOnly === false ? undefined : { isActive: true },
    select: { id: true, isActive: true },
    orderBy: [{ name: "asc" }],
  });

  const batch = await calculateDishCostsForOutlet(
    user,
    dishes.map((dish) => dish.id),
  );
  if (!batch.ok) {
    return {
      alerts: [],
      thresholds,
      summary: { healthy: 0, warning: 0, critical: 0, unresolved: 0 },
    };
  }

  const activeById = new Map(dishes.map((d) => [d.id, d.isActive] as const));
  let alerts = [...batch.costs.values()].map((cost) =>
    toAlert(cost, thresholds, activeById.get(cost.dishId) ?? true),
  );

  const summary = {
    healthy: alerts.filter((a) => a.alertLevel === COST_ALERT_LEVEL.HEALTHY)
      .length,
    warning: alerts.filter((a) => a.alertLevel === COST_ALERT_LEVEL.WARNING)
      .length,
    critical: alerts.filter((a) => a.alertLevel === COST_ALERT_LEVEL.CRITICAL)
      .length,
    unresolved: alerts.filter(
      (a) => a.alertLevel === COST_ALERT_LEVEL.UNRESOLVED,
    ).length,
  };

  if (options.attentionOnly) {
    alerts = alerts.filter((a) => a.alertLevel !== COST_ALERT_LEVEL.HEALTHY);
    const order: Record<CostAlertLevel, number> = {
      CRITICAL: 0,
      WARNING: 1,
      UNRESOLVED: 2,
      HEALTHY: 3,
    };
    alerts.sort(
      (a, b) =>
        order[a.alertLevel] - order[b.alertLevel] ||
        a.dishName.localeCompare(b.dishName),
    );
  }

  return { alerts, thresholds, summary };
}
