"use client";

import { useActionState } from "react";

import { DISH_CATEGORIES } from "@/lib/constants";
import { Button } from "@/components/ui";
import {
  createDishAction,
  updateDishAction,
  type DishFormState,
} from "./actions";

const INITIAL: DishFormState = {};

type DishDefaults = {
  name?: string;
  category?: string;
  description?: string | null;
  sellingPrice?: number;
  isActive?: boolean;
  imageUrl?: string | null;
};

export function DishForm({
  mode,
  dishId,
  defaults,
}: {
  mode: "create" | "edit";
  dishId?: string;
  defaults?: DishDefaults;
}) {
  const action =
    mode === "create"
      ? createDishAction
      : updateDishAction.bind(null, dishId!);

  const [state, formAction, pending] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor="name" className="eyebrow mb-2 block text-ink-muted">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={defaults?.name ?? ""}
          placeholder="e.g. Strawberry Smoothie"
          className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="category" className="eyebrow mb-2 block text-ink-muted">
            Category
          </label>
          <select
            id="category"
            name="category"
            required
            defaultValue={defaults?.category ?? ""}
            className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
          >
            <option value="" disabled>
              Choose a category…
            </option>
            {DISH_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="sellingPrice"
            className="eyebrow mb-2 block text-ink-muted"
          >
            Selling price (€)
          </label>
          <input
            id="sellingPrice"
            name="sellingPrice"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={
              defaults?.sellingPrice !== undefined
                ? String(defaults.sellingPrice)
                : ""
            }
            placeholder="0.00"
            className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="description"
          className="eyebrow mb-2 block text-ink-muted"
        >
          Description{" "}
          <span className="normal-case tracking-normal">(optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={defaults?.description ?? ""}
          placeholder="Short menu description"
          className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
        />
      </div>

      <div>
        <label htmlFor="imageUrl" className="eyebrow mb-2 block text-ink-muted">
          Image URL{" "}
          <span className="normal-case tracking-normal">(optional)</span>
        </label>
        <input
          id="imageUrl"
          name="imageUrl"
          type="url"
          defaultValue={defaults?.imageUrl ?? ""}
          placeholder="https://…"
          className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
        />
        {mode === "edit" && defaults?.imageUrl ? (
          <label className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" name="clearImage" value="1" />
            Remove current image
          </label>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="isActive"
          value="on"
          defaultChecked={defaults?.isActive ?? true}
        />
        Active (listed in the catalogue)
      </label>
      <p className="text-xs text-ink-muted">
        Active means the dish is in the menu catalogue. It is not the same as
        stock availability.
      </p>

      <Button type="submit" disabled={pending}>
        {pending
          ? mode === "create"
            ? "Creating…"
            : "Saving…"
          : mode === "create"
            ? "Create dish"
            : "Save changes"}
      </Button>
    </form>
  );
}
