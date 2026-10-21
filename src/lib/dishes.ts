import "server-only";

import {
  assertOutletAccess,
  isSuperAdmin,
  type SessionUser,
} from "@/lib/auth";
import { DISH_CATEGORIES } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export type DishInput = {
  name?: string | null;
  category?: string | null;
  description?: string | null;
  sellingPrice?: number | null;
  isActive?: boolean | null;
  imageUrl?: string | null;
  clearImage?: boolean;
};

function serializeDish(
  row: {
    id: string;
    name: string;
    category: string;
    description: string | null;
    imageUrl: string | null;
    sellingPrice: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
  ingredientCount = 0,
) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    imageUrl: row.imageUrl,
    sellingPrice: row.sellingPrice,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ingredientCount,
    recipeStatus:
      ingredientCount > 0
        ? (`${ingredientCount} ingredient${ingredientCount === 1 ? "" : "s"}` as const)
        : ("Not configured" as const),
    // Costing is group-wide (dish-costing.ts). Availability is outlet-scoped
    // and computed live in dish-availability.ts — never stored on Dish.
    costingStatus:
      ingredientCount > 0
        ? ("Calculated from ingredient prices" as const)
        : ("Available after recipe setup" as const),
    availabilityStatus: "Calculated per outlet" as const,
  };
}

export type SerializedDish = ReturnType<typeof serializeDish>;

function parseDishFields(input: DishInput, { partial }: { partial: boolean }) {
  const name = String(input.name ?? "").trim();
  const category = String(input.category ?? "").trim();
  const description = String(input.description ?? "").trim();
  const sellingRaw = input.sellingPrice;
  const sellingPrice =
    sellingRaw === null || sellingRaw === undefined
      ? null
      : Number(sellingRaw);

  if (!partial || input.name !== undefined) {
    if (!name) return { error: "Give the dish a name." as const };
  }
  if (!partial || input.category !== undefined) {
    if (!category) return { error: "Choose a dish category." as const };
    if (!(DISH_CATEGORIES as readonly string[]).includes(category)) {
      return { error: "That dish category is not supported." as const };
    }
  }
  if (!partial || input.sellingPrice !== undefined) {
    if (
      sellingPrice === null ||
      !Number.isFinite(sellingPrice) ||
      sellingPrice < 0
    ) {
      return { error: "Selling price must be zero or more." as const };
    }
  }

  return {
    name: name || undefined,
    category: category || undefined,
    description: description ? description : null,
    sellingPrice:
      sellingPrice === null ? undefined : roundMoney(sellingPrice),
    isActive:
      input.isActive === null || input.isActive === undefined
        ? undefined
        : Boolean(input.isActive),
    imageUrl:
      input.clearImage
        ? null
        : input.imageUrl === undefined
          ? undefined
          : String(input.imageUrl).trim() || null,
  };
}

export async function listDishes(
  _user: SessionUser,
  filters: {
    q?: string | null;
    category?: string | null;
    active?: "all" | "active" | "inactive" | null;
    take?: number;
  } = {},
) {
  const q = String(filters.q ?? "").trim();
  const category = String(filters.category ?? "").trim();
  const active = filters.active ?? "all";

  const rows = await prisma.dish.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { category: { contains: q } },
              { description: { contains: q } },
            ],
          }
        : {}),
      ...(category ? { category } : {}),
      ...(active === "active"
        ? { isActive: true }
        : active === "inactive"
          ? { isActive: false }
          : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: filters.take ?? 300,
  });

  const counts =
    rows.length === 0
      ? []
      : await prisma.dishIngredient.groupBy({
          by: ["dishId"],
          where: { dishId: { in: rows.map((row) => row.id) } },
          _count: { _all: true },
        });
  const countByDish = new Map(
    counts.map((row) => [row.dishId, row._count._all] as const),
  );

  return rows.map((row) =>
    serializeDish(row, countByDish.get(row.id) ?? 0),
  );
}

export async function getDish(_user: SessionUser, id: string) {
  const row = await prisma.dish.findUnique({ where: { id } });
  if (!row) return { ok: false as const, error: "Dish not found." };
  const ingredientCount = await prisma.dishIngredient.count({
    where: { dishId: id },
  });
  return {
    ok: true as const,
    dish: serializeDish(row, ingredientCount),
  };
}

export async function createDish(user: SessionUser, input: DishInput) {
  if (!isSuperAdmin(user)) {
    return {
      ok: false as const,
      error: "Only super admins can create dishes.",
    };
  }

  const parsed = parseDishFields(input, { partial: false });
  if ("error" in parsed) return { ok: false as const, error: parsed.error };

  const dish = await prisma.dish.create({
    data: {
      name: parsed.name!,
      category: parsed.category!,
      description: parsed.description,
      sellingPrice: parsed.sellingPrice!,
      isActive: parsed.isActive ?? true,
      imageUrl: parsed.imageUrl ?? null,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: user.id,
      outletId: user.outletId,
      action: "DISH_CREATED",
      detail: `${dish.name} · ${formatMoney(dish.sellingPrice)}`,
    },
  });

  return { ok: true as const, dish: serializeDish(dish) };
}

export async function updateDish(
  user: SessionUser,
  id: string,
  input: DishInput,
) {
  if (!isSuperAdmin(user)) {
    return {
      ok: false as const,
      error: "Only super admins can edit dishes.",
    };
  }

  const existing = await prisma.dish.findUnique({ where: { id } });
  if (!existing) return { ok: false as const, error: "Dish not found." };

  const parsed = parseDishFields(input, { partial: true });
  if ("error" in parsed) return { ok: false as const, error: parsed.error };

  const dish = await prisma.dish.update({
    where: { id },
    data: {
      ...(parsed.name !== undefined ? { name: parsed.name } : {}),
      ...(parsed.category !== undefined ? { category: parsed.category } : {}),
      ...(input.description !== undefined
        ? { description: parsed.description }
        : {}),
      ...(parsed.sellingPrice !== undefined
        ? { sellingPrice: parsed.sellingPrice }
        : {}),
      ...(parsed.isActive !== undefined ? { isActive: parsed.isActive } : {}),
      ...(input.clearImage || input.imageUrl !== undefined
        ? { imageUrl: parsed.imageUrl ?? null }
        : {}),
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: user.id,
      outletId: user.outletId,
      action: "DISH_UPDATED",
      detail: `${dish.name} · ${formatMoney(dish.sellingPrice)}${
        dish.isActive ? "" : " · inactive"
      }`,
    },
  });

  return { ok: true as const, dish: serializeDish(dish) };
}

/** Soft check helpers for callers that need outlet context later. */
export function canManageDishes(user: SessionUser) {
  return isSuperAdmin(user);
}

export function canViewDishes(user: SessionUser) {
  try {
    if (isSuperAdmin(user)) return true;
    if (user.outletId) {
      assertOutletAccess(user, user.outletId);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
