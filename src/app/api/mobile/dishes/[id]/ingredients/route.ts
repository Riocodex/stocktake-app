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
import {
  addRecipeIngredient,
  listCatalogueItemsForRecipe,
  listRecipeIngredients,
} from "@/lib/recipes";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const result = await listRecipeIngredients(user, id);
    if (!result.ok) throw new ApiError(404, result.error);

    const catalogue = isSuperAdmin(user)
      ? await listCatalogueItemsForRecipe()
      : [];

    return apiJson({
      ingredients: result.ingredients.map(serializeForApi),
      catalogue: catalogue.map((item) => ({
        id: item.id,
        name: item.brand ? `${item.brand} ${item.name}` : item.name,
        sku: item.sku,
        unit: item.unit,
        supplierPackQty: item.supplierPackQty,
        category: item.category.name,
      })),
      canEdit: isSuperAdmin(user),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const body = await readJson<{
      itemId?: string;
      quantity?: number;
      unit?: string;
    }>(request);

    const result = await addRecipeIngredient(user, id, body);
    if (!result.ok) {
      const message = result.error ?? "Could not add ingredient.";
      throw new ApiError(
        message.includes("super admin") ? 403 : 400,
        message,
      );
    }

    return apiJson({ ingredient: serializeForApi(result.ingredient) });
  } catch (error) {
    return handleApiError(error);
  }
}

function serializeForApi(ingredient: {
  id: string;
  dishId: string;
  itemId: string;
  quantity: number;
  unit: string;
  quantityInStockUnit: number | null;
  stockUnit: string;
  conversionError: string | null;
  createdAt: Date;
  updatedAt: Date;
  item: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    isActive: boolean;
    supplierPackQty: number | null;
    packSize: string | null;
    referencePrice: number;
  };
}) {
  return {
    ...ingredient,
    createdAt: ingredient.createdAt.toISOString(),
    updatedAt: ingredient.updatedAt.toISOString(),
  };
}
