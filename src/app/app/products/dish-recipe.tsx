"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { UNITS } from "@/lib/constants";
import { Button } from "@/components/ui";
import {
  addRecipeIngredientAction,
  removeRecipeIngredientAction,
  updateRecipeIngredientAction,
  type DishFormState,
} from "./actions";

const INITIAL: DishFormState = {};

type CatalogueItem = {
  id: string;
  name: string;
  brand: string | null;
  sku: string;
  unit: string;
  supplierPackQty: number | null;
  category: { name: string };
};

type Ingredient = {
  id: string;
  quantity: number;
  unit: string;
  quantityInStockUnit: number | null;
  stockUnit: string;
  conversionError: string | null;
  item: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    isActive: boolean;
  };
};

function itemLabel(item: CatalogueItem) {
  const name = item.brand ? `${item.brand} ${item.name}` : item.name;
  return `${name} (${item.unit})`;
}

export function DishRecipeSection({
  dishId,
  canEdit,
  ingredients,
  catalogue,
}: {
  dishId: string;
  canEdit: boolean;
  ingredients: Ingredient[];
  catalogue: CatalogueItem[];
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-ink">Recipe</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Ingredients for one portion. Costing and availability come later.
        </p>
      </div>

      {ingredients.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ink/15 bg-white/60 px-4 py-8 text-center text-sm text-ink-muted">
          No ingredients yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {ingredients.map((line) => (
            <IngredientRow
              key={line.id}
              dishId={dishId}
              canEdit={canEdit}
              line={line}
            />
          ))}
        </ul>
      )}

      {canEdit ? (
        <AddIngredientForm
          dishId={dishId}
          catalogue={catalogue}
          usedItemIds={ingredients.map((line) => line.item.id)}
        />
      ) : (
        <p className="text-xs text-ink-muted">
          Only super admins can edit recipes.
        </p>
      )}
    </section>
  );
}

function IngredientRow({
  dishId,
  canEdit,
  line,
}: {
  dishId: string;
  canEdit: boolean;
  line: Ingredient;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const updateAction = updateRecipeIngredientAction.bind(null, dishId, line.id);
  const [state, formAction, formPending] = useActionState(updateAction, INITIAL);

  useEffect(() => {
    if (state.success) {
      setEditing(false);
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <li className="rounded-2xl border border-ink/10 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">
            {line.item.name}
            {!line.item.isActive ? (
              <span className="ml-2 text-xs font-semibold text-ink-muted">
                (inactive item)
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {line.quantity} {line.unit}
            {line.quantityInStockUnit !== null &&
            line.unit !== line.stockUnit ? (
              <span className="text-ink-muted">
                {" "}
                · {line.quantityInStockUnit} {line.stockUnit} stocked
              </span>
            ) : null}
          </p>
          {line.conversionError ? (
            <p className="mt-1 text-xs text-red-700">{line.conversionError}</p>
          ) : null}
        </div>

        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? "Cancel" : "Edit"}
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await removeRecipeIngredientAction(
                    dishId,
                    line.id,
                  );
                  if (result.error) {
                    setError(result.error);
                    return;
                  }
                  router.refresh();
                });
              }}
            >
              {pending ? "Removing…" : "Remove"}
            </Button>
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      {state.error ? (
        <p className="mt-2 text-xs text-red-700">{state.error}</p>
      ) : null}

      {editing && canEdit ? (
        <form action={formAction} className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="eyebrow mb-1 block text-ink-muted" htmlFor={`q-${line.id}`}>
              Qty
            </label>
            <input
              id={`q-${line.id}`}
              name="quantity"
              type="number"
              min="0.000001"
              step="any"
              required
              defaultValue={String(line.quantity)}
              className="w-28 rounded-xl border border-ink/15 px-3 py-2 text-sm outline-none focus:border-clay"
            />
          </div>
          <div>
            <label className="eyebrow mb-1 block text-ink-muted" htmlFor={`u-${line.id}`}>
              Unit
            </label>
            <select
              id={`u-${line.id}`}
              name="unit"
              defaultValue={line.unit}
              className="rounded-xl border border-ink/15 px-3 py-2 text-sm outline-none focus:border-clay"
            >
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" disabled={formPending}>
            {formPending ? "Saving…" : "Save"}
          </Button>
        </form>
      ) : null}
    </li>
  );
}

function AddIngredientForm({
  dishId,
  catalogue,
  usedItemIds,
}: {
  dishId: string;
  catalogue: CatalogueItem[];
  usedItemIds: string[];
}) {
  const router = useRouter();
  const addAction = addRecipeIngredientAction.bind(null, dishId);
  const [state, formAction, pending] = useActionState(addAction, INITIAL);
  const used = new Set(usedItemIds);
  const available = catalogue.filter((item) => !used.has(item.id));

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-ink/10 bg-cream-deep/40 p-4 space-y-4"
    >
      <p className="eyebrow text-ink-muted">Add ingredient</p>
      {state.error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-sage-800">{state.success}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <label htmlFor="itemId" className="eyebrow mb-1 block text-ink-muted">
            Item
          </label>
          <select
            id="itemId"
            name="itemId"
            required
            defaultValue=""
            className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
          >
            <option value="" disabled>
              Choose an item…
            </option>
            {available.map((item) => (
              <option key={item.id} value={item.id}>
                {item.category.name} · {itemLabel(item)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="quantity" className="eyebrow mb-1 block text-ink-muted">
            Quantity
          </label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min="0.000001"
            step="any"
            required
            placeholder="e.g. 100"
            className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
          />
        </div>
        <div>
          <label htmlFor="unit" className="eyebrow mb-1 block text-ink-muted">
            Unit
          </label>
          <select
            id="unit"
            name="unit"
            required
            defaultValue="g"
            className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={pending || available.length === 0}>
            {pending ? "Adding…" : "Add"}
          </Button>
        </div>
      </div>
      <p className="text-xs text-ink-muted">
        Use g/ml when the item is stocked in kg/litre. Box/pack recipes need a
        pack size on the item.
      </p>
    </form>
  );
}
