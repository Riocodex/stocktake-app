"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { createDish, updateDish } from "@/lib/dishes";
import {
  addRecipeIngredient,
  removeRecipeIngredient,
  updateRecipeIngredient,
} from "@/lib/recipes";

export type DishFormState = {
  error?: string;
  success?: string;
};

function revalidateDish(dishId: string) {
  revalidatePath("/app/products");
  revalidatePath("/app/products/dishes");
  revalidatePath(`/app/products/dishes/${dishId}`);
}

function readDishFields(formData: FormData) {
  const sellingRaw = String(formData.get("sellingPrice") ?? "").trim();
  const activeRaw = String(formData.get("isActive") ?? "");
  return {
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? ""),
    description: String(formData.get("description") ?? ""),
    sellingPrice: sellingRaw === "" ? null : Number(sellingRaw),
    isActive: activeRaw === "on" || activeRaw === "true" || activeRaw === "1",
    imageUrl: String(formData.get("imageUrl") ?? "").trim() || null,
    clearImage: String(formData.get("clearImage") ?? "") === "1",
  };
}

export async function createDishAction(
  _prev: DishFormState,
  formData: FormData,
): Promise<DishFormState> {
  const user = await requireUser();
  const result = await createDish(user, readDishFields(formData));
  if (!result.ok) return { error: result.error };
  if (!result.dish.id) {
    return { error: "Dish was created but no id was returned. Refresh the dishes list." };
  }

  revalidatePath("/app/products");
  revalidatePath("/app/products/dishes");
  redirect(`/app/products/dishes/${result.dish.id}`);
}

export async function updateDishAction(
  dishId: string,
  _prev: DishFormState,
  formData: FormData,
): Promise<DishFormState> {
  const user = await requireUser();
  const result = await updateDish(user, dishId, readDishFields(formData));
  if (!result.ok) return { error: result.error };

  revalidatePath("/app/products");
  revalidatePath("/app/products/dishes");
  revalidatePath(`/app/products/dishes/${dishId}`);
  redirect(`/app/products/dishes/${dishId}`);
}

export async function setDishActiveAction(
  dishId: string,
  isActive: boolean,
): Promise<DishFormState> {
  const user = await requireUser();
  const result = await updateDish(user, dishId, { isActive });
  if (!result.ok) return { error: result.error };

  revalidateDish(dishId);
  return {
    success: isActive ? "Dish activated." : "Dish deactivated.",
  };
}

export async function addRecipeIngredientAction(
  dishId: string,
  _prev: DishFormState,
  formData: FormData,
): Promise<DishFormState> {
  const user = await requireUser();
  const result = await addRecipeIngredient(user, dishId, {
    itemId: String(formData.get("itemId") ?? ""),
    quantity: Number(formData.get("quantity")),
    unit: String(formData.get("unit") ?? ""),
  });
  if (!result.ok) return { error: result.error };

  revalidateDish(dishId);
  return { success: "Ingredient added." };
}

export async function updateRecipeIngredientAction(
  dishId: string,
  ingredientId: string,
  _prev: DishFormState,
  formData: FormData,
): Promise<DishFormState> {
  const user = await requireUser();
  const result = await updateRecipeIngredient(user, dishId, ingredientId, {
    quantity: Number(formData.get("quantity")),
    unit: String(formData.get("unit") ?? ""),
  });
  if (!result.ok) return { error: result.error };

  revalidateDish(dishId);
  return { success: "Ingredient updated." };
}

export async function removeRecipeIngredientAction(
  dishId: string,
  ingredientId: string,
): Promise<DishFormState> {
  const user = await requireUser();
  const result = await removeRecipeIngredient(user, dishId, ingredientId);
  if (!result.ok) return { error: result.error };

  revalidateDish(dishId);
  return { success: "Ingredient removed." };
}
