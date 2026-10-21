import { ROLES, UNITS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { canonicalUnit, toStockQuantity } from "@/lib/units";

/** Minimal user shape — avoids importing auth (server-only) into testable helpers. */
export type RecipeActor = {
  id: string;
  role: string;
  outletId: string | null;
};

function canEditRecipes(user: RecipeActor) {
  return user.role === ROLES.SUPER_ADMIN;
}

function roundQty(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export type RecipeIngredientInput = {
  itemId?: string | null;
  quantity?: number | null;
  unit?: string | null;
};

function serializeIngredient(row: {
  id: string;
  dishId: string;
  itemId: string;
  quantity: number;
  unit: string;
  createdAt: Date;
  updatedAt: Date;
  item: {
    id: string;
    name: string;
    brand: string | null;
    sku: string;
    unit: string;
    isActive: boolean;
    supplierPackQty: number | null;
    packSize: string | null;
    referencePrice: number;
  };
}) {
  const stock = toStockQuantity(row.quantity, row.unit, row.item.unit, {
    unitsPerStockUnit: row.item.supplierPackQty,
  });

  return {
    id: row.id,
    dishId: row.dishId,
    itemId: row.itemId,
    quantity: row.quantity,
    unit: row.unit,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    item: {
      id: row.item.id,
      name: row.item.brand
        ? `${row.item.brand} ${row.item.name}`
        : row.item.name,
      sku: row.item.sku,
      unit: row.item.unit,
      isActive: row.item.isActive,
      supplierPackQty: row.item.supplierPackQty,
      packSize: row.item.packSize,
      referencePrice: row.item.referencePrice,
    },
    /** Recipe qty expressed in the item's stock unit — for Steps 7 / 9. */
    quantityInStockUnit: stock.ok ? stock.quantity : null,
    stockUnit: row.item.unit,
    conversionError: stock.ok ? null : stock.error,
  };
}

export type SerializedIngredient = ReturnType<typeof serializeIngredient>;

const ingredientInclude = {
  item: {
    select: {
      id: true,
      name: true,
      brand: true,
      sku: true,
      unit: true,
      isActive: true,
      supplierPackQty: true,
      packSize: true,
      referencePrice: true,
    },
  },
} as const;

function parseQuantityUnit(input: RecipeIngredientInput) {
  const quantity = Number(input.quantity);
  const unit = canonicalUnit(String(input.unit ?? ""));

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: "Quantity must be greater than zero." as const };
  }
  if (!unit) {
    return { error: "Choose a unit." as const };
  }
  if (!(UNITS as readonly string[]).includes(unit)) {
    return { error: "That unit is not supported." as const };
  }

  return { quantity: roundQty(quantity), unit };
}

export async function listRecipeIngredients(_user: RecipeActor, dishId: string) {
  const dish = await prisma.dish.findUnique({ where: { id: dishId } });
  if (!dish) return { ok: false as const, error: "Dish not found." };

  const rows = await prisma.dishIngredient.findMany({
    where: { dishId },
    include: ingredientInclude,
    orderBy: [{ item: { name: "asc" } }],
  });

  return {
    ok: true as const,
    ingredients: rows.map(serializeIngredient),
  };
}

export async function addRecipeIngredient(
  user: RecipeActor,
  dishId: string,
  input: RecipeIngredientInput,
) {
  if (!canEditRecipes(user)) {
    return {
      ok: false as const,
      error: "Only super admins can edit recipes.",
    };
  }

  const dish = await prisma.dish.findUnique({ where: { id: dishId } });
  if (!dish) return { ok: false as const, error: "Dish not found." };

  const itemId = String(input.itemId ?? "").trim();
  if (!itemId) return { ok: false as const, error: "Choose an item." };

  const parsed = parseQuantityUnit(input);
  if ("error" in parsed) return { ok: false as const, error: parsed.error };

  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false as const, error: "That item was not found." };
  if (!item.isActive) {
    return {
      ok: false as const,
      error: "Inactive items cannot be added to recipes.",
    };
  }

  const conversion = toStockQuantity(parsed.quantity, parsed.unit, item.unit, {
    unitsPerStockUnit: item.supplierPackQty,
  });
  if (!conversion.ok) {
    return { ok: false as const, error: conversion.error };
  }

  const existing = await prisma.dishIngredient.findUnique({
    where: { dishId_itemId: { dishId, itemId } },
  });
  if (existing) {
    return {
      ok: false as const,
      error: "That item is already in the recipe. Edit its quantity instead.",
    };
  }

  const row = await prisma.dishIngredient.create({
    data: {
      dishId,
      itemId,
      quantity: parsed.quantity,
      unit: parsed.unit,
    },
    include: ingredientInclude,
  });

  await prisma.activityLog.create({
    data: {
      userId: user.id,
      outletId: user.outletId,
      action: "DISH_RECIPE_INGREDIENT_ADDED",
      detail: `${dish.name}: ${parsed.quantity} ${parsed.unit} ${item.name}`,
    },
  });

  return { ok: true as const, ingredient: serializeIngredient(row) };
}

export async function updateRecipeIngredient(
  user: RecipeActor,
  dishId: string,
  ingredientId: string,
  input: RecipeIngredientInput,
) {
  if (!canEditRecipes(user)) {
    return {
      ok: false as const,
      error: "Only super admins can edit recipes.",
    };
  }

  const existing = await prisma.dishIngredient.findFirst({
    where: { id: ingredientId, dishId },
    include: { item: true, dish: true },
  });
  if (!existing) {
    return { ok: false as const, error: "Recipe ingredient not found." };
  }

  const parsed = parseQuantityUnit({
    quantity: input.quantity ?? existing.quantity,
    unit: input.unit ?? existing.unit,
  });
  if ("error" in parsed) return { ok: false as const, error: parsed.error };

  const conversion = toStockQuantity(
    parsed.quantity,
    parsed.unit,
    existing.item.unit,
    { unitsPerStockUnit: existing.item.supplierPackQty },
  );
  if (!conversion.ok) {
    return { ok: false as const, error: conversion.error };
  }

  const row = await prisma.dishIngredient.update({
    where: { id: ingredientId },
    data: {
      quantity: parsed.quantity,
      unit: parsed.unit,
    },
    include: ingredientInclude,
  });

  await prisma.activityLog.create({
    data: {
      userId: user.id,
      outletId: user.outletId,
      action: "DISH_RECIPE_INGREDIENT_UPDATED",
      detail: `${existing.dish.name}: ${parsed.quantity} ${parsed.unit} ${existing.item.name}`,
    },
  });

  return { ok: true as const, ingredient: serializeIngredient(row) };
}

export async function removeRecipeIngredient(
  user: RecipeActor,
  dishId: string,
  ingredientId: string,
) {
  if (!canEditRecipes(user)) {
    return {
      ok: false as const,
      error: "Only super admins can edit recipes.",
    };
  }

  const existing = await prisma.dishIngredient.findFirst({
    where: { id: ingredientId, dishId },
    include: { item: true, dish: true },
  });
  if (!existing) {
    return { ok: false as const, error: "Recipe ingredient not found." };
  }

  await prisma.dishIngredient.delete({ where: { id: ingredientId } });

  await prisma.activityLog.create({
    data: {
      userId: user.id,
      outletId: user.outletId,
      action: "DISH_RECIPE_INGREDIENT_REMOVED",
      detail: `${existing.dish.name}: removed ${existing.item.name}`,
    },
  });

  return { ok: true as const };
}

export async function listCatalogueItemsForRecipe() {
  return prisma.inventoryItem.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      brand: true,
      sku: true,
      unit: true,
      supplierPackQty: true,
      category: { select: { name: true } },
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
  });
}
