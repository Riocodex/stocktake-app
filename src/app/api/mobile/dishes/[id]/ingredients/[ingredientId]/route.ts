import { NextRequest } from "next/server";

import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  readJson,
  requireApiUser,
} from "@/lib/api";
import {
  removeRecipeIngredient,
  updateRecipeIngredient,
} from "@/lib/recipes";

export function OPTIONS() {
  return apiOptions();
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; ingredientId: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id, ingredientId } = await context.params;
    const body = await readJson<{
      quantity?: number;
      unit?: string;
    }>(request);

    const result = await updateRecipeIngredient(user, id, ingredientId, body);
    if (!result.ok) {
      const message = result.error ?? "Could not update ingredient.";
      const status =
        message === "Recipe ingredient not found."
          ? 404
          : message.includes("super admin")
            ? 403
            : 400;
      throw new ApiError(status, message);
    }

    return apiJson({
      ingredient: {
        ...result.ingredient,
        createdAt: result.ingredient.createdAt.toISOString(),
        updatedAt: result.ingredient.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string; ingredientId: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id, ingredientId } = await context.params;
    const result = await removeRecipeIngredient(user, id, ingredientId);
    if (!result.ok) {
      const message = result.error ?? "Could not remove ingredient.";
      const status =
        message === "Recipe ingredient not found."
          ? 404
          : message.includes("super admin")
            ? 403
            : 400;
      throw new ApiError(status, message);
    }

    return apiJson({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
