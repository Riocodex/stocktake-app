import { prisma } from "@/lib/db";
import { multiplyMoney, percentOf, roundEuros } from "@/lib/money";
import { toStockQuantity } from "@/lib/units";

export type CostingActor = {
  id: string;
  role: string;
  outletId: string | null;
};

/** Purchase price for dish costing is always the group catalogue price. */
export type PriceSource = "reference" | "missing";

export type CostingStatus = "COMPLETE" | "INCOMPLETE" | "NO_RECIPE";

export type IngredientCostLine = {
  ingredientId: string;
  itemId: string;
  itemName: string;
  itemActive: boolean;
  recipeQuantity: number;
  recipeUnit: string;
  stockUnit: string;
  quantityInStockUnit: number | null;
  /** Group purchase price per stock unit, or null when missing. */
  unitPrice: number | null;
  priceSource: PriceSource;
  ingredientCost: number | null;
  issue: string | null;
};

export type DishCostResult = {
  dishId: string;
  dishName: string;
  sellingPrice: number;
  /** Always null — dish cost is group-wide, not outlet-scoped. */
  outletId: null;
  outletName: null;
  /** Explicit label for UI: group-wide pricing. */
  priceScope: "group";
  status: CostingStatus;
  statusLabel: string;
  dishCost: number | null;
  foodCostPercent: number | null;
  grossProfit: number | null;
  grossMarginPercent: number | null;
  ingredients: IngredientCostLine[];
  issueCount: number;
};

function resolveReferencePrice(referencePrice: number): {
  unitPrice: number | null;
  priceSource: PriceSource;
} {
  if (Number.isFinite(referencePrice) && referencePrice > 0) {
    return {
      unitPrice: roundEuros(referencePrice),
      priceSource: "reference",
    };
  }
  return { unitPrice: null, priceSource: "missing" };
}

function statusLabel(status: CostingStatus, issueCount: number): string {
  switch (status) {
    case "COMPLETE":
      return "Costed";
    case "NO_RECIPE":
      return "No recipe";
    case "INCOMPLETE":
      return issueCount === 1
        ? "1 unresolved ingredient"
        : `${issueCount} unresolved ingredients`;
    default:
      return status;
  }
}

function emptyCost(
  dish: { id: string; name: string; sellingPrice: number },
  status: CostingStatus,
  ingredients: IngredientCostLine[] = [],
): DishCostResult {
  const issueCount = ingredients.filter((line) => line.issue).length;
  return {
    dishId: dish.id,
    dishName: dish.name,
    sellingPrice: roundEuros(dish.sellingPrice),
    outletId: null,
    outletName: null,
    priceScope: "group",
    status,
    statusLabel: statusLabel(status, issueCount),
    dishCost: null,
    foodCostPercent: null,
    grossProfit: null,
    grossMarginPercent: null,
    ingredients,
    issueCount,
  };
}

function finalizeDishCost(
  dish: { id: string; name: string; sellingPrice: number },
  ingredients: IngredientCostLine[],
): DishCostResult {
  const sellingPrice = roundEuros(dish.sellingPrice);
  const issueCount = ingredients.filter((line) => line.issue).length;

  if (ingredients.length === 0) {
    return emptyCost(dish, "NO_RECIPE");
  }

  if (issueCount > 0) {
    return {
      ...emptyCost(dish, "INCOMPLETE", ingredients),
      issueCount,
      statusLabel: statusLabel("INCOMPLETE", issueCount),
    };
  }

  const dishCost = roundEuros(
    ingredients.reduce((sum, line) => sum + (line.ingredientCost ?? 0), 0),
  );
  const grossProfit = roundEuros(sellingPrice - dishCost);
  const foodCostPercent = percentOf(dishCost, sellingPrice);
  const grossMarginPercent = percentOf(grossProfit, sellingPrice);

  return {
    dishId: dish.id,
    dishName: dish.name,
    sellingPrice,
    outletId: null,
    outletName: null,
    priceScope: "group",
    status: "COMPLETE",
    statusLabel: statusLabel("COMPLETE", 0),
    dishCost,
    foodCostPercent,
    grossProfit,
    grossMarginPercent,
    ingredients,
    issueCount: 0,
  };
}

async function loadReferencePriceMap(
  itemIds: string[],
): Promise<Map<string, number>> {
  if (itemIds.length === 0) return new Map();
  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, referencePrice: true },
  });
  return new Map(items.map((item) => [item.id, item.referencePrice] as const));
}

function costIngredientLines(
  rows: {
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
      referencePrice: number;
    };
  }[],
  priceMap: Map<string, number>,
): IngredientCostLine[] {
  return rows.map((row) => {
    const itemName = row.item.brand
      ? `${row.item.brand} ${row.item.name}`
      : row.item.name;
    const conversion = toStockQuantity(row.quantity, row.unit, row.item.unit, {
      unitsPerStockUnit: row.item.supplierPackQty,
    });

    if (!conversion.ok) {
      return {
        ingredientId: row.id,
        itemId: row.itemId,
        itemName,
        itemActive: row.item.isActive,
        recipeQuantity: row.quantity,
        recipeUnit: row.unit,
        stockUnit: row.item.unit,
        quantityInStockUnit: null,
        unitPrice: null,
        priceSource: "missing" as const,
        ingredientCost: null,
        issue: conversion.error,
      };
    }

    const referencePrice =
      priceMap.get(row.itemId) ?? row.item.referencePrice ?? 0;
    const { unitPrice, priceSource } = resolveReferencePrice(referencePrice);

    if (unitPrice === null) {
      return {
        ingredientId: row.id,
        itemId: row.itemId,
        itemName,
        itemActive: row.item.isActive,
        recipeQuantity: row.quantity,
        recipeUnit: row.unit,
        stockUnit: row.item.unit,
        quantityInStockUnit: conversion.quantity,
        unitPrice: null,
        priceSource,
        ingredientCost: null,
        issue: "No group purchase price set for this item.",
      };
    }

    return {
      ingredientId: row.id,
      itemId: row.itemId,
      itemName,
      itemActive: row.item.isActive,
      recipeQuantity: row.quantity,
      recipeUnit: row.unit,
      stockUnit: row.item.unit,
      quantityInStockUnit: conversion.quantity,
      unitPrice,
      priceSource,
      ingredientCost: multiplyMoney(conversion.quantity, unitPrice),
      issue: null,
    };
  });
}

const ingredientSelect = {
  id: true,
  name: true,
  brand: true,
  unit: true,
  isActive: true,
  supplierPackQty: true,
  referencePrice: true,
} as const;

/**
 * Calculate dish cost from group-wide InventoryItem.referencePrice.
 * OutletStock.unitPrice is never used — all outlets share the same dish cost.
 */
export async function calculateDishCost(
  _user: CostingActor,
  dishId: string,
  _requestedOutletId?: string | null,
): Promise<{ ok: true; cost: DishCostResult } | { ok: false; error: string }> {
  const dish = await prisma.dish.findUnique({
    where: { id: dishId },
    include: {
      ingredients: {
        include: { item: { select: ingredientSelect } },
        orderBy: [{ item: { name: "asc" } }],
      },
    },
  });
  if (!dish) return { ok: false, error: "Dish not found." };

  if (dish.ingredients.length === 0) {
    return { ok: true, cost: emptyCost(dish, "NO_RECIPE") };
  }

  const priceMap = await loadReferencePriceMap(
    dish.ingredients.map((line) => line.itemId),
  );
  const ingredients = costIngredientLines(dish.ingredients, priceMap);

  return { ok: true, cost: finalizeDishCost(dish, ingredients) };
}

/**
 * Batch-calculate dish costs (group-wide). Outlet argument is ignored for prices
 * and kept only for API compatibility with earlier outlet-scoped callers.
 */
export async function calculateDishCostsForOutlet(
  _user: CostingActor,
  dishIds: string[],
  _requestedOutletId?: string | null,
): Promise<
  | {
      ok: true;
      costs: Map<string, DishCostResult>;
      outletId: null;
      outletName: null;
    }
  | { ok: false; error: string }
> {
  const uniqueIds = [...new Set(dishIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return {
      ok: true,
      costs: new Map(),
      outletId: null,
      outletName: null,
    };
  }

  const dishes = await prisma.dish.findMany({
    where: { id: { in: uniqueIds } },
    include: {
      ingredients: {
        include: { item: { select: ingredientSelect } },
      },
    },
  });

  const allItemIds = [
    ...new Set(
      dishes.flatMap((dish) => dish.ingredients.map((line) => line.itemId)),
    ),
  ];
  const priceMap = await loadReferencePriceMap(allItemIds);
  const costs = new Map<string, DishCostResult>();

  for (const dish of dishes) {
    if (dish.ingredients.length === 0) {
      costs.set(dish.id, emptyCost(dish, "NO_RECIPE"));
      continue;
    }
    const ingredients = costIngredientLines(dish.ingredients, priceMap);
    costs.set(dish.id, finalizeDishCost(dish, ingredients));
  }

  return {
    ok: true,
    costs,
    outletId: null,
    outletName: null,
  };
}

/** @deprecated Alias — dish costs are group-wide. */
export const calculateDishCosts = calculateDishCostsForOutlet;

/** Pure helper for tests — cost lines from in-memory recipe + reference prices. */
export function calculateDishCostFromParts(input: {
  dishId: string;
  dishName: string;
  sellingPrice: number;
  lines: {
    ingredientId: string;
    itemId: string;
    itemName: string;
    itemActive?: boolean;
    recipeQuantity: number;
    recipeUnit: string;
    stockUnit: string;
    supplierPackQty?: number | null;
    referencePrice?: number;
    /** Ignored — kept so older tests fail loudly if still passed as source. */
    outletPrice?: number | null;
  }[];
}): DishCostResult {
  if (input.lines.length === 0) {
    return emptyCost(
      {
        id: input.dishId,
        name: input.dishName,
        sellingPrice: input.sellingPrice,
      },
      "NO_RECIPE",
    );
  }

  const ingredients: IngredientCostLine[] = input.lines.map((line) => {
    const conversion = toStockQuantity(
      line.recipeQuantity,
      line.recipeUnit,
      line.stockUnit,
      { unitsPerStockUnit: line.supplierPackQty },
    );
    if (!conversion.ok) {
      return {
        ingredientId: line.ingredientId,
        itemId: line.itemId,
        itemName: line.itemName,
        itemActive: line.itemActive ?? true,
        recipeQuantity: line.recipeQuantity,
        recipeUnit: line.recipeUnit,
        stockUnit: line.stockUnit,
        quantityInStockUnit: null,
        unitPrice: null,
        priceSource: "missing" as const,
        ingredientCost: null,
        issue: conversion.error,
      };
    }
    const { unitPrice, priceSource } = resolveReferencePrice(
      line.referencePrice ?? 0,
    );
    if (unitPrice === null) {
      return {
        ingredientId: line.ingredientId,
        itemId: line.itemId,
        itemName: line.itemName,
        itemActive: line.itemActive ?? true,
        recipeQuantity: line.recipeQuantity,
        recipeUnit: line.recipeUnit,
        stockUnit: line.stockUnit,
        quantityInStockUnit: conversion.quantity,
        unitPrice: null,
        priceSource,
        ingredientCost: null,
        issue: "No group purchase price set for this item.",
      };
    }
    return {
      ingredientId: line.ingredientId,
      itemId: line.itemId,
      itemName: line.itemName,
      itemActive: line.itemActive ?? true,
      recipeQuantity: line.recipeQuantity,
      recipeUnit: line.recipeUnit,
      stockUnit: line.stockUnit,
      quantityInStockUnit: conversion.quantity,
      unitPrice,
      priceSource,
      ingredientCost: multiplyMoney(conversion.quantity, unitPrice),
      issue: null,
    };
  });

  return finalizeDishCost(
    {
      id: input.dishId,
      name: input.dishName,
      sellingPrice: input.sellingPrice,
    },
    ingredients,
  );
}
