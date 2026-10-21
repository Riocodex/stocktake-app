import { NextRequest } from "next/server";

import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  readJson,
  requireApiUser,
} from "@/lib/api";
import { isSuperAdmin } from "@/lib/auth";
import { getDishCostAlert } from "@/lib/cost-alerts";
import { calculateDishAvailability } from "@/lib/dish-availability";
import { calculateDishCost } from "@/lib/dish-costing";
import { getDish, updateDish } from "@/lib/dishes";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const outletParam = request.nextUrl.searchParams.get("outlet");
    const result = await getDish(user, id);
    if (!result.ok) throw new ApiError(404, result.error);

    const [costResult, alertResult, availabilityResult] = await Promise.all([
      calculateDishCost(user, id),
      getDishCostAlert(user, id),
      outletParam || user.outletId
        ? calculateDishAvailability(
            user,
            id,
            outletParam ?? user.outletId,
          )
        : Promise.resolve(null),
    ]);
    if (!costResult.ok) throw new ApiError(404, costResult.error);
    if (availabilityResult && !availabilityResult.ok) {
      throw new ApiError(
        availabilityResult.error.includes("access") ? 403 : 400,
        availabilityResult.error,
      );
    }

    return apiJson({
      dish: {
        ...result.dish,
        createdAt: result.dish.createdAt.toISOString(),
        updatedAt: result.dish.updatedAt.toISOString(),
      },
      costing: costResult.cost,
      alert: alertResult.ok ? alertResult.alert : null,
      availability:
        availabilityResult && availabilityResult.ok
          ? availabilityResult.availability
          : null,
      canManage: isSuperAdmin(user),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const body = await readJson<{
      name?: string;
      category?: string;
      description?: string;
      sellingPrice?: number;
      isActive?: boolean;
      imageUrl?: string | null;
      clearImage?: boolean;
    }>(request);

    const result = await updateDish(user, id, {
      name: body.name,
      category: body.category,
      description: body.description,
      sellingPrice: body.sellingPrice,
      isActive: body.isActive,
      imageUrl: body.imageUrl,
      clearImage: body.clearImage,
    });

    if (!result.ok) {
      const message = result.error ?? "Could not update dish.";
      const status =
        message === "Dish not found."
          ? 404
          : message.includes("super admin")
            ? 403
            : 400;
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
