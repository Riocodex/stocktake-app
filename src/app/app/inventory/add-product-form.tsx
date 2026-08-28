"use client";

import { useActionState } from "react";

import { createProductAction, type InventoryActionResult } from "@/lib/actions/inventory";
import { UNITS } from "@/lib/constants";
import { Button } from "@/components/ui";

const INITIAL: InventoryActionResult = { error: null };

export function AddProductForm({
  categories,
}: {
  categories: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    createProductAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="name" className="eyebrow mb-2 block text-ink-muted">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder="e.g. Fever-Tree Tonic 200ml"
          className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="unit" className="eyebrow mb-2 block text-ink-muted">
            Unit
          </label>
          <select
            id="unit"
            name="unit"
            required
            defaultValue="bottle"
            className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="price" className="eyebrow mb-2 block text-ink-muted">
            Price (€)
          </label>
          <input
            id="price"
            name="price"
            type="number"
            min="0"
            step="0.01"
            required
            placeholder="0.00"
            className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
          />
        </div>
      </div>

      <div>
        <label htmlFor="categoryId" className="eyebrow mb-2 block text-ink-muted">
          Section
        </label>
        <select
          id="categoryId"
          name="categoryId"
          required
          defaultValue=""
          className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
        >
          <option value="" disabled>
            Choose a section…
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="brand" className="eyebrow mb-2 block text-ink-muted">
            Brand{" "}
            <span className="normal-case tracking-normal">(optional)</span>
          </label>
          <input
            id="brand"
            name="brand"
            className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
          />
        </div>
        <div>
          <label
            htmlFor="supplierPackQty"
            className="eyebrow mb-2 block text-ink-muted"
          >
            Qty from supplier
          </label>
          <input
            id="supplierPackQty"
            name="supplierPackQty"
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 24"
            className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
          />
        </div>
      </div>

      <div>
        <label htmlFor="picture" className="eyebrow mb-2 block text-ink-muted">
          Picture <span className="normal-case tracking-normal">(optional)</span>
        </label>
        <input
          id="picture"
          name="picture"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="w-full text-sm text-ink-muted file:mr-3 file:rounded-pill file:border-0 file:bg-clay file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Adding…" : "Add product"}
      </Button>
    </form>
  );
}
