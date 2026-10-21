import {
  AVAILABILITY_STATUS,
  AVAILABILITY_STATUS_LABELS,
  DEFAULT_AVAILABILITY_AVAILABLE_MIN_PORTIONS,
  ROLES,
  type AvailabilityStatus,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { convertQuantity, toStockQuantity } from "@/lib/units";

function isSuperAdmin(user: AvailabilityActor) {
  return user.role === ROLES.SUPER_ADMIN;
}

export type AvailabilityActor = {
  id: string;
  role: string;
  outletId: string | null;
};

export type AvailabilityThresholds = {
  /** Portions at/above this → AVAILABLE. 1..(n-1) → LOW. 0 → UNAVAILABLE. */
  availableMinPortions: number;
};

export type IngredientAvailabilityLine = {
  ingredientId: string;
  itemId: string;
  itemName: string;
  itemActive: boolean;
  recipeQuantity: number;
  recipeUnit: string;
  stockUnit: string;
  /** Recipe qty expressed in the item's stock unit. */
  quantityRequiredInStockUnit: number | null;
  /** OutletStock.quantity at the scoped outlet (0 when no row). */
  quantityInStock: number;
  stockRecordExists: boolean;
  /** Stock qty expressed in the recipe unit when convertible. */
  quantityAvailableInRecipeUnit: number | null;
  portionsPossible: number | null;
  isLimiting: boolean;
  /** Human-readable problem for this line, if any. */
  issue: string | null;
  /** True when stock alone cannot support one full portion. */
  insufficient: boolean;
};

export type DishAvailabilityResult = {
  dishId: string;
  dishName: string;
  outletId: string;
  outletName: string;
  stockScope: "outlet";
  status: AvailabilityStatus;
  statusLabel: string;
  portionsPossible: number | null;
  availableMinPortions: number;
  limitingIngredientName: string | null;
  limitingItemId: string | null;
  ingredients: IngredientAvailabilityLine[];
  /** Ingredients that block a portion (zero/insufficient stock). */
  missingIngredients: {
    itemName: string;
    availableDisplay: string;
    requiredDisplay: string;
  }[];
  summary: string;
  issueCount: number;
};

function getAvailabilityThresholdsSync(): AvailabilityThresholds {
  // Constant today — swap for AppSettings when product needs a UI control.
  return {
    availableMinPortions: DEFAULT_AVAILABILITY_AVAILABLE_MIN_PORTIONS,
  };
}

export function getAvailabilityThresholds(): AvailabilityThresholds {
  return getAvailabilityThresholdsSync();
}

export function classifyAvailability(
  portionsPossible: number | null,
  hasUnresolvedIssue: boolean,
  thresholds: AvailabilityThresholds = getAvailabilityThresholdsSync(),
): AvailabilityStatus {
  if (hasUnresolvedIssue || portionsPossible === null) {
    return AVAILABILITY_STATUS.UNRESOLVED;
  }
  if (portionsPossible <= 0) return AVAILABILITY_STATUS.UNAVAILABLE;
  if (portionsPossible < thresholds.availableMinPortions) {
    return AVAILABILITY_STATUS.LOW;
  }
  return AVAILABILITY_STATUS.AVAILABLE;
}

function formatQty(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (Number.isInteger(value)) return String(value);
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

function itemDisplayName(item: { name: string; brand: string | null }) {
  return item.brand ? `${item.brand} ${item.name}` : item.name;
}

function buildSummary(result: {
  status: AvailabilityStatus;
  portionsPossible: number | null;
  limitingIngredientName: string | null;
  missingIngredients: DishAvailabilityResult["missingIngredients"];
  issueCount: number;
}): string {
  switch (result.status) {
    case AVAILABILITY_STATUS.AVAILABLE:
      return result.limitingIngredientName
        ? `${result.portionsPossible} portions possible. Limited by ${result.limitingIngredientName}.`
        : `${result.portionsPossible} portions possible.`;
    case AVAILABILITY_STATUS.LOW:
      return result.limitingIngredientName
        ? `Only ${result.portionsPossible} portion${result.portionsPossible === 1 ? "" : "s"} possible. Limited by ${result.limitingIngredientName}.`
        : `Only ${result.portionsPossible} portion${result.portionsPossible === 1 ? "" : "s"} possible.`;
    case AVAILABILITY_STATUS.UNAVAILABLE:
      if (result.missingIngredients.length > 0) {
        const first = result.missingIngredients[0];
        return `Unavailable. Missing: ${first.itemName} (${first.availableDisplay} available, ${first.requiredDisplay} required).`;
      }
      return "Unavailable — not enough stock for one portion.";
    case AVAILABILITY_STATUS.UNRESOLVED:
      return result.issueCount > 0
        ? `Cannot calculate availability (${result.issueCount} data issue${result.issueCount === 1 ? "" : "s"}).`
        : "Cannot calculate availability.";
    default:
      return "Availability unknown.";
  }
}

function finalizeAvailability(
  dish: { id: string; name: string },
  outlet: { id: string; name: string },
  ingredients: IngredientAvailabilityLine[],
  thresholds: AvailabilityThresholds,
): DishAvailabilityResult {
  const issueCount = ingredients.filter((line) => line.issue).length;
  const hasUnresolved = ingredients.length === 0 || issueCount > 0;

  let portionsPossible: number | null = null;
  let limitingIngredientName: string | null = null;
  let limitingItemId: string | null = null;

  if (!hasUnresolved) {
    portionsPossible = Infinity;
    for (const line of ingredients) {
      const portions = line.portionsPossible ?? 0;
      if (portions < portionsPossible) {
        portionsPossible = portions;
        limitingIngredientName = line.itemName;
        limitingItemId = line.itemId;
      }
    }
    if (!Number.isFinite(portionsPossible)) portionsPossible = 0;
  }

  const status = classifyAvailability(
    portionsPossible,
    hasUnresolved,
    thresholds,
  );

  const marked = ingredients.map((line) => ({
    ...line,
    isLimiting:
      status !== AVAILABILITY_STATUS.UNRESOLVED &&
      limitingItemId !== null &&
      line.itemId === limitingItemId,
  }));

  const missingIngredients =
    status === AVAILABILITY_STATUS.UNAVAILABLE
      ? marked
          .filter((line) => line.insufficient || (line.portionsPossible ?? 0) <= 0)
          .map((line) => ({
            itemName: line.itemName,
            availableDisplay:
              line.quantityAvailableInRecipeUnit !== null
                ? `${formatQty(line.quantityAvailableInRecipeUnit)} ${line.recipeUnit}`
                : `${formatQty(line.quantityInStock)} ${line.stockUnit}`,
            requiredDisplay: `${formatQty(line.recipeQuantity)} ${line.recipeUnit}`,
          }))
      : [];

  const base = {
    status,
    portionsPossible,
    limitingIngredientName,
    missingIngredients,
    issueCount,
  };

  return {
    dishId: dish.id,
    dishName: dish.name,
    outletId: outlet.id,
    outletName: outlet.name,
    stockScope: "outlet",
    status,
    statusLabel: AVAILABILITY_STATUS_LABELS[status],
    portionsPossible,
    availableMinPortions: thresholds.availableMinPortions,
    limitingIngredientName,
    limitingItemId,
    ingredients: marked,
    missingIngredients,
    summary: buildSummary(base),
    issueCount,
  };
}

function emptyUnresolved(
  dish: { id: string; name: string },
  outlet: { id: string; name: string },
  thresholds: AvailabilityThresholds,
  reason: string,
): DishAvailabilityResult {
  return {
    dishId: dish.id,
    dishName: dish.name,
    outletId: outlet.id,
    outletName: outlet.name,
    stockScope: "outlet",
    status: AVAILABILITY_STATUS.UNRESOLVED,
    statusLabel: AVAILABILITY_STATUS_LABELS.UNRESOLVED,
    portionsPossible: null,
    availableMinPortions: thresholds.availableMinPortions,
    limitingIngredientName: null,
    limitingItemId: null,
    ingredients: [],
    missingIngredients: [],
    summary: reason,
    issueCount: 1,
  };
}

type RecipeLineInput = {
  id: string;
  itemId: string;
  quantity: number;
  unit: string;
  item: {
    id: string;
    name: string;
    brand: string | null;
    unit: string;
    isActive: boolean;
    supplierPackQty: number | null;
  };
};

function buildIngredientLines(
  rows: RecipeLineInput[],
  stockByItemId: Map<string, { quantity: number; exists: boolean }>,
): IngredientAvailabilityLine[] {
  return rows.map((row) => {
    const itemName = itemDisplayName(row.item);
    const packOpts = { unitsPerStockUnit: row.item.supplierPackQty };
    const conversion = toStockQuantity(
      row.quantity,
      row.unit,
      row.item.unit,
      packOpts,
    );

    const stock = stockByItemId.get(row.itemId) ?? {
      quantity: 0,
      exists: false,
    };
    const quantityInStock = Number.isFinite(stock.quantity)
      ? Math.max(0, stock.quantity)
      : 0;

    if (!conversion.ok) {
      return {
        ingredientId: row.id,
        itemId: row.itemId,
        itemName,
        itemActive: row.item.isActive,
        recipeQuantity: row.quantity,
        recipeUnit: row.unit,
        stockUnit: row.item.unit,
        quantityRequiredInStockUnit: null,
        quantityInStock,
        stockRecordExists: stock.exists,
        quantityAvailableInRecipeUnit: null,
        portionsPossible: null,
        isLimiting: false,
        issue: conversion.error,
        insufficient: false,
      };
    }

    const required = conversion.quantity;
    if (!(required > 0)) {
      return {
        ingredientId: row.id,
        itemId: row.itemId,
        itemName,
        itemActive: row.item.isActive,
        recipeQuantity: row.quantity,
        recipeUnit: row.unit,
        stockUnit: row.item.unit,
        quantityRequiredInStockUnit: required,
        quantityInStock,
        stockRecordExists: stock.exists,
        quantityAvailableInRecipeUnit: null,
        portionsPossible: null,
        isLimiting: false,
        issue: "Recipe quantity must be greater than zero.",
        insufficient: false,
      };
    }

    const availableInRecipe = convertQuantity(
      quantityInStock,
      row.item.unit,
      row.unit,
      packOpts,
    );

    // Prefer recipe-unit division so pack bridges (box↔unit) are not floored
    // away by stock-unit rounding (e.g. 2/12 → 0.166667 → floor(1/0.166667)=5).
    let portionsPossible: number;
    if (availableInRecipe.ok && row.quantity > 0) {
      portionsPossible = Math.floor(
        availableInRecipe.quantity / row.quantity + 1e-9,
      );
    } else {
      portionsPossible = Math.floor(quantityInStock / required + 1e-9);
    }
    const insufficient = portionsPossible <= 0;

    return {
      ingredientId: row.id,
      itemId: row.itemId,
      itemName,
      itemActive: row.item.isActive,
      recipeQuantity: row.quantity,
      recipeUnit: row.unit,
      stockUnit: row.item.unit,
      quantityRequiredInStockUnit: required,
      quantityInStock,
      stockRecordExists: stock.exists,
      quantityAvailableInRecipeUnit: availableInRecipe.ok
        ? availableInRecipe.quantity
        : null,
      portionsPossible,
      isLimiting: false,
      issue: null,
      insufficient,
    };
  });
}

async function resolveAvailabilityOutlet(
  user: AvailabilityActor,
  requestedOutletId?: string | null,
): Promise<
  | { ok: true; outlet: { id: string; name: string } }
  | { ok: false; error: string }
> {
  if (isSuperAdmin(user)) {
    const outletId = String(requestedOutletId ?? "").trim();
    if (!outletId || outletId === "all") {
      return {
        ok: false,
        error: "Choose an outlet to view dish availability.",
      };
    }
    const outlet = await prisma.outlet.findUnique({
      where: { id: outletId },
      select: { id: true, name: true },
    });
    if (!outlet) return { ok: false, error: "Outlet not found." };
    return { ok: true, outlet };
  }

  const outletId = user.outletId;
  if (!outletId) {
    return {
      ok: false,
      error: "Your account is not assigned to an outlet.",
    };
  }

  const requested = String(requestedOutletId ?? "").trim();
  if (requested && requested !== "all" && requested !== outletId) {
    return {
      ok: false,
      error: "You do not have access to this outlet.",
    };
  }

  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    select: { id: true, name: true },
  });
  if (!outlet) {
    return { ok: false, error: "Assigned outlet was not found." };
  }
  return { ok: true, outlet };
}

const ingredientInclude = {
  id: true,
  itemId: true,
  quantity: true,
  unit: true,
  item: {
    select: {
      id: true,
      name: true,
      brand: true,
      unit: true,
      isActive: true,
      supplierPackQty: true,
    },
  },
} as const;

async function loadStockMap(outletId: string, itemIds: string[]) {
  const map = new Map<string, { quantity: number; exists: boolean }>();
  if (itemIds.length === 0) return map;

  const rows = await prisma.outletStock.findMany({
    where: { outletId, itemId: { in: itemIds } },
    select: { itemId: true, quantity: true },
  });

  for (const id of itemIds) {
    map.set(id, { quantity: 0, exists: false });
  }
  for (const row of rows) {
    map.set(row.itemId, {
      quantity: row.quantity,
      exists: true,
    });
  }
  return map;
}

/**
 * Live dish availability for one dish at one outlet.
 * Reads current OutletStock — never writes stock or movements.
 */
export async function calculateDishAvailability(
  user: AvailabilityActor,
  dishId: string,
  requestedOutletId?: string | null,
): Promise<
  | { ok: true; availability: DishAvailabilityResult }
  | { ok: false; error: string }
> {
  const scoped = await resolveAvailabilityOutlet(user, requestedOutletId);
  if (!scoped.ok) return scoped;

  const dish = await prisma.dish.findUnique({
    where: { id: dishId },
    include: {
      ingredients: {
        include: { item: { select: ingredientInclude.item.select } },
        orderBy: [{ item: { name: "asc" } }],
      },
    },
  });
  if (!dish) return { ok: false, error: "Dish not found." };

  const thresholds = getAvailabilityThresholdsSync();

  if (dish.ingredients.length === 0) {
    return {
      ok: true,
      availability: emptyUnresolved(
        dish,
        scoped.outlet,
        thresholds,
        "No recipe configured — availability cannot be calculated.",
      ),
    };
  }

  const stockMap = await loadStockMap(
    scoped.outlet.id,
    dish.ingredients.map((line) => line.itemId),
  );
  const ingredients = buildIngredientLines(dish.ingredients, stockMap);

  return {
    ok: true,
    availability: finalizeAvailability(
      dish,
      scoped.outlet,
      ingredients,
      thresholds,
    ),
  };
}

/**
 * Batch availability for many dishes at one outlet.
 */
export async function calculateDishAvailabilitiesForOutlet(
  user: AvailabilityActor,
  dishIds: string[],
  requestedOutletId?: string | null,
): Promise<
  | {
      ok: true;
      availabilities: Map<string, DishAvailabilityResult>;
      outletId: string;
      outletName: string;
    }
  | { ok: false; error: string }
> {
  const scoped = await resolveAvailabilityOutlet(user, requestedOutletId);
  if (!scoped.ok) return scoped;

  const uniqueIds = [...new Set(dishIds.filter(Boolean))];
  const thresholds = getAvailabilityThresholdsSync();

  if (uniqueIds.length === 0) {
    return {
      ok: true,
      availabilities: new Map(),
      outletId: scoped.outlet.id,
      outletName: scoped.outlet.name,
    };
  }

  const dishes = await prisma.dish.findMany({
    where: { id: { in: uniqueIds } },
    include: {
      ingredients: {
        include: { item: { select: ingredientInclude.item.select } },
      },
    },
  });

  const allItemIds = [
    ...new Set(
      dishes.flatMap((dish) => dish.ingredients.map((line) => line.itemId)),
    ),
  ];
  const stockMap = await loadStockMap(scoped.outlet.id, allItemIds);
  const availabilities = new Map<string, DishAvailabilityResult>();

  for (const dish of dishes) {
    if (dish.ingredients.length === 0) {
      availabilities.set(
        dish.id,
        emptyUnresolved(
          dish,
          scoped.outlet,
          thresholds,
          "No recipe configured — availability cannot be calculated.",
        ),
      );
      continue;
    }
    const ingredients = buildIngredientLines(dish.ingredients, stockMap);
    availabilities.set(
      dish.id,
      finalizeAvailability(dish, scoped.outlet, ingredients, thresholds),
    );
  }

  return {
    ok: true,
    availabilities,
    outletId: scoped.outlet.id,
    outletName: scoped.outlet.name,
  };
}

/** Pure helper for tests — no DB reads. */
export function calculateDishAvailabilityFromParts(input: {
  dishId: string;
  dishName: string;
  outletId: string;
  outletName: string;
  availableMinPortions?: number;
  lines: {
    ingredientId: string;
    itemId: string;
    itemName: string;
    itemActive?: boolean;
    recipeQuantity: number;
    recipeUnit: string;
    stockUnit: string;
    supplierPackQty?: number | null;
    quantityInStock: number;
    stockRecordExists?: boolean;
  }[];
}): DishAvailabilityResult {
  const thresholds: AvailabilityThresholds = {
    availableMinPortions:
      input.availableMinPortions ?? DEFAULT_AVAILABILITY_AVAILABLE_MIN_PORTIONS,
  };

  const outlet = { id: input.outletId, name: input.outletName };
  const dish = { id: input.dishId, name: input.dishName };

  if (input.lines.length === 0) {
    return emptyUnresolved(
      dish,
      outlet,
      thresholds,
      "No recipe configured — availability cannot be calculated.",
    );
  }

  const rows: RecipeLineInput[] = input.lines.map((line) => ({
    id: line.ingredientId,
    itemId: line.itemId,
    quantity: line.recipeQuantity,
    unit: line.recipeUnit,
    item: {
      id: line.itemId,
      name: line.itemName,
      brand: null,
      unit: line.stockUnit,
      isActive: line.itemActive ?? true,
      supplierPackQty: line.supplierPackQty ?? null,
    },
  }));

  const stockMap = new Map(
    input.lines.map((line) => [
      line.itemId,
      {
        quantity: line.quantityInStock,
        exists: line.stockRecordExists ?? true,
      },
    ]),
  );

  const ingredients = buildIngredientLines(rows, stockMap);
  return finalizeAvailability(dish, outlet, ingredients, thresholds);
}
