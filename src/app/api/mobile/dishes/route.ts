import { NextRequest } from "next/server";

import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  readJson,
  requireApiUser,
} from "@/lib/api";
import { DISH_CATEGORIES } from "@/lib/constants";
import { calculateDishAvailabilitiesForOutlet } from "@/lib/dish-availability";
import { calculateDishCostsForOutlet } from "@/lib/dish-costing";
import { createDish, listDishes } from "@/lib/dishes";
import { isSuperAdmin } from "@/lib/auth";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const params = request.nextUrl.searchParams;
    const activeParam = params.get("active");
    const active =
      activeParam === "inactive" || activeParam === "all"
        ? activeParam
        : activeParam === "active"
          ? "active"
          : "all";
    const outletParam = params.get("outlet");

    const dishes = await listDishes(user, {
      q: params.get("q"),
      category: params.get("category"),
      active,
    });

    const dishIds = dishes.map((dish) => dish.id);
    const [batch, availabilityBatch] = await Promise.all([
      calculateDishCostsForOutlet(user, dishIds),
      outletParam || user.outletId
        ? calculateDishAvailabilitiesForOutlet(
            user,
            dishIds,
            outletParam ?? user.outletId,
          )
        : Promise.resolve(null),
    ]);
    if (!batch.ok) throw new ApiError(400, batch.error);
    if (availabilityBatch && !availabilityBatch.ok) {
      throw new ApiError(
        availabilityBatch.error.includes("access") ? 403 : 400,
        availabilityBatch.error,
      );
    }

    return apiJson({
      dishes: dishes.map((dish) => {
        const costing = batch.costs.get(dish.id) ?? null;
        const availability =
          availabilityBatch && availabilityBatch.ok
            ? (availabilityBatch.availabilities.get(dish.id) ?? null)
            : null;
        return {
          ...dish,
          createdAt: dish.createdAt.toISOString(),
          updatedAt: dish.updatedAt.toISOString(),
          costing: costing
            ? {
                status: costing.status,
                statusLabel: costing.statusLabel,
                dishCost: costing.dishCost,
                foodCostPercent: costing.foodCostPercent,
                grossMarginPercent: costing.grossMarginPercent,
                sellingPrice: costing.sellingPrice,
                priceScope: costing.priceScope,
              }
            : null,
          availability: availability
            ? {
                status: availability.status,
                statusLabel: availability.statusLabel,
                portionsPossible: availability.portionsPossible,
                limitingIngredientName: availability.limitingIngredientName,
                summary: availability.summary,
                outletId: availability.outletId,
                outletName: availability.outletName,
              }
            : null,
        };
      }),
      categories: [...DISH_CATEGORIES],
      canManage: isSuperAdmin(user),
      priceScope: "group",
      availabilityOutletId:
        availabilityBatch && availabilityBatch.ok
          ? availabilityBatch.outletId
          : null,
      availabilityOutletName:
        availabilityBatch && availabilityBatch.ok
          ? availabilityBatch.outletName
          : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const body = await readJson<{
      name?: string;
      category?: string;
      description?: string;
      sellingPrice?: number;
      isActive?: boolean;
      imageUrl?: string | null;
    }>(request);

    const result = await createDish(user, {
      name: body.name,
      category: body.category,
      description: body.description,
      sellingPrice: body.sellingPrice,
      isActive: body.isActive,
      imageUrl: body.imageUrl,
    });

    if (!result.ok) {
      const message = result.error ?? "Could not create dish.";
      const status = message.includes("super admin") ? 403 : 400;
      throw new ApiError(status, message);
    }

    return apiJson({
      dish: {
        ...result.dish,
        createdAt: result.dish.createdAt.toISOString(),
        updatedAt: result.dish.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
