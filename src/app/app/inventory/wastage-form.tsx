"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";

import {
  recordWastageAction,
  type WastageActionResult,
} from "@/lib/actions/wastage";
import {
  WASTAGE_REASON_LABELS,
  WASTAGE_TARGET,
  type WastageReason,
} from "@/lib/constants";
import { Button } from "@/components/ui";
import { WastagePhotoPanel } from "./wastage-photo";

const INITIAL: WastageActionResult = { error: null };

type CatalogItem = {
  id: string;
  name: string;
  unit: string;
  category: string;
  quantity: number;
  unitPrice: number;
};

type CatalogDish = {
  id: string;
  name: string;
  category: string;
  dishCost: number | null;
  costingStatus: string;
  costingStatusLabel: string;
  canWaste: boolean;
  blockReason: string | null;
};

export function WastageForm({
  outlets,
  items: initialItems,
  dishes: initialDishes,
  fixedOutletId,
  fixedOutletName,
  recordPath,
  simulatedAi,
  initialTarget = WASTAGE_TARGET.ITEM,
}: {
  outlets: { id: string; name: string }[];
  items: CatalogItem[];
  dishes: CatalogDish[];
  fixedOutletId: string | null;
  fixedOutletName: string | null;
  /** Path used to reload stock when the outlet changes, e.g. /app/inventory/wastage?record=1 */
  recordPath: string;
  simulatedAi: boolean;
  initialTarget?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    recordWastageAction,
    INITIAL,
  );
  const [targetType, setTargetType] = useState(
    initialTarget === WASTAGE_TARGET.DISH
      ? WASTAGE_TARGET.DISH
      : WASTAGE_TARGET.ITEM,
  );
  const [items, setItems] = useState(initialItems);
  const [itemId, setItemId] = useState("");
  const [dishId, setDishId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    if (!state.error && state.remainingQuantity !== undefined && state.itemId) {
      setItems((current) =>
        current.map((item) =>
          item.id === state.itemId
            ? { ...item, quantity: state.remainingQuantity ?? item.quantity }
            : item,
        ),
      );
      setQuantity("");
      router.refresh();
    } else if (!state.error && state.message && state.targetType === WASTAGE_TARGET.DISH) {
      setQuantity("");
      router.refresh();
    }
  }, [state, router]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === itemId) ?? null,
    [items, itemId],
  );
  const selectedDish = useMemo(
    () => initialDishes.find((dish) => dish.id === dishId) ?? null,
    [initialDishes, dishId],
  );

  const qty = Number(quantity);
  const estimatedItemValue =
    selectedItem && Number.isFinite(qty) && qty > 0
      ? Math.round(qty * selectedItem.unitPrice * 100) / 100
      : null;
  const estimatedDishValue =
    selectedDish &&
    selectedDish.dishCost !== null &&
    Number.isInteger(qty) &&
    qty > 0
      ? Math.round(qty * selectedDish.dishCost * 100) / 100
      : null;

  const availableItems = items.filter((item) => item.quantity > 0);
  const grouped = availableItems.reduce<Record<string, CatalogItem[]>>(
    (accumulator, item) => {
      (accumulator[item.category] ??= []).push(item);
      return accumulator;
    },
    {},
  );
  const dishesByCategory = initialDishes.reduce<Record<string, CatalogDish[]>>(
    (accumulator, dish) => {
      (accumulator[dish.category] ??= []).push(dish);
      return accumulator;
    },
    {},
  );

  function onOutletChange(nextOutletId: string) {
    if (!nextOutletId) return;
    const url = new URL(recordPath, window.location.origin);
    url.searchParams.set("outlet", nextOutletId);
    url.searchParams.set("record", "1");
    url.searchParams.set("kind", targetType === WASTAGE_TARGET.DISH ? "dish" : "item");
    router.push(`${url.pathname}?${url.searchParams.toString()}`);
  }

  function validateBeforeSubmit(formData: FormData) {
    setClientError(null);
    const kind = String(formData.get("targetType") ?? "");
    const chosenQty = Number(formData.get("quantity") ?? 0);

    if (kind === WASTAGE_TARGET.DISH) {
      const chosenId = String(formData.get("dishId") ?? "");
      const chosen = initialDishes.find((dish) => dish.id === chosenId);
      if (!chosen) {
        setClientError("Choose which dish was wasted.");
        return false;
      }
      if (!Number.isInteger(chosenQty) || chosenQty <= 0) {
        setClientError("Quantity must be a whole number greater than zero.");
        return false;
      }
      if (!chosen.canWaste) {
        setClientError(
          chosen.blockReason ??
            "This dish cannot be costed yet — fix the recipe first.",
        );
        return false;
      }
      return true;
    }

    const chosenId = String(formData.get("itemId") ?? "");
    const chosen = items.find((item) => item.id === chosenId);
    if (!chosen) {
      setClientError("Choose which product was wasted.");
      return false;
    }
    if (!Number.isFinite(chosenQty) || chosenQty <= 0) {
      setClientError("Quantity must be greater than zero.");
      return false;
    }
    if (chosen.quantity <= 0) {
      setClientError(
        `Cannot record wastage. Current stock is 0 ${chosen.unit}.`,
      );
      return false;
    }
    if (chosenQty > chosen.quantity) {
      setClientError(
        `Cannot record ${chosenQty} ${chosen.unit} of wastage. Current stock is ${chosen.quantity} ${chosen.unit}.`,
      );
      return false;
    }
    return true;
  }

  if (!fixedOutletId) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          Choose an outlet first. On-hand quantities and dish loss are always
          for one venue — never a group total for stock.
        </p>
        <div>
          <label htmlFor="outletId" className="eyebrow mb-2 block text-ink-muted">
            Outlet
          </label>
          <select
            id="outletId"
            defaultValue=""
            onChange={(event) => onOutletChange(event.target.value)}
            className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
          >
            <option value="" disabled>
              Choose an outlet…
            </option>
            {outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <form
      action={(formData) => {
        if (!validateBeforeSubmit(formData)) return;
        formAction(formData);
      }}
      className="space-y-5"
    >
      <input type="hidden" name="outletId" value={fixedOutletId} />
      <input type="hidden" name="targetType" value={targetType} />

      <div className="rounded-2xl border border-sage-100 bg-sage-50/60 px-4 py-3">
        <p className="eyebrow text-sage-800">Recording at</p>
        <p className="mt-1 text-sm font-semibold text-ink">
          {fixedOutletName ?? "Selected outlet"}
        </p>
        {outlets.length > 1 ? (
          <button
            type="button"
            onClick={() => {
              const url = new URL(recordPath, window.location.origin);
              url.searchParams.delete("outlet");
              url.searchParams.set("record", "1");
              router.push(`${url.pathname}?${url.searchParams.toString()}`);
            }}
            className="mt-2 text-xs font-semibold text-clay hover:underline"
          >
            Change outlet
          </button>
        ) : null}
      </div>

      <div>
        <p className="eyebrow mb-2 block text-ink-muted">Wastage type</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setTargetType(WASTAGE_TARGET.ITEM);
              setClientError(null);
            }}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              targetType === WASTAGE_TARGET.ITEM
                ? "bg-ink text-white"
                : "bg-white text-ink border border-ink/15"
            }`}
          >
            Item Wastage
          </button>
          <button
            type="button"
            onClick={() => {
              setTargetType(WASTAGE_TARGET.DISH);
              setClientError(null);
            }}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              targetType === WASTAGE_TARGET.DISH
                ? "bg-ink text-white"
                : "bg-white text-ink border border-ink/15"
            }`}
          >
            Dish Wastage
          </button>
        </div>
      </div>

      {targetType === WASTAGE_TARGET.DISH ? (
        <p className="rounded-2xl border border-clay/20 bg-cream/70 px-4 py-3 text-sm text-ink-soft">
          Dish Wastage records financial loss only. No ingredients are deducted
          from stock.
        </p>
      ) : (
        <>
          <WastagePhotoPanel outletId={fixedOutletId} simulated={simulatedAi} />
          <p className="eyebrow text-ink-muted">Or record manually</p>
        </>
      )}

      {targetType === WASTAGE_TARGET.ITEM ? (
        <div>
          <label htmlFor="itemId" className="eyebrow mb-2 block text-ink-muted">
            Product
          </label>
          <select
            id="itemId"
            name="itemId"
            required
            value={itemId}
            onChange={(event) => {
              setItemId(event.target.value);
              setClientError(null);
            }}
            className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
          >
            <option value="">Choose…</option>
            {Object.entries(grouped).map(([category, categoryItems]) => (
              <optgroup key={category} label={category}>
                {categoryItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · on hand {item.quantity} {item.unit}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {availableItems.length === 0 ? (
            <p className="mt-2 text-xs text-ink-muted">
              No products currently have stock at this outlet.
            </p>
          ) : null}
        </div>
      ) : (
        <div>
          <label htmlFor="dishId" className="eyebrow mb-2 block text-ink-muted">
            Dish
          </label>
          <select
            id="dishId"
            name="dishId"
            required
            value={dishId}
            onChange={(event) => {
              setDishId(event.target.value);
              setClientError(null);
            }}
            className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
          >
            <option value="">Choose…</option>
            {Object.entries(dishesByCategory).map(([category, categoryDishes]) => (
              <optgroup key={category} label={category}>
                {categoryDishes.map((dish) => (
                  <option key={dish.id} value={dish.id}>
                    {dish.name}
                    {dish.dishCost !== null
                      ? ` · €${dish.dishCost.toFixed(2)} / portion`
                      : ` · ${dish.costingStatusLabel}`}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {selectedDish && !selectedDish.canWaste ? (
            <p className="mt-2 text-xs text-red-700">
              {selectedDish.blockReason}
            </p>
          ) : null}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="quantity" className="eyebrow mb-2 block text-ink-muted">
            Quantity
            {targetType === WASTAGE_TARGET.DISH
              ? " (portions)"
              : selectedItem
                ? ` (${selectedItem.unit})`
                : ""}
          </label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min={targetType === WASTAGE_TARGET.DISH ? "1" : "0.01"}
            step={targetType === WASTAGE_TARGET.DISH ? "1" : "any"}
            max={
              targetType === WASTAGE_TARGET.ITEM
                ? selectedItem?.quantity || undefined
                : undefined
            }
            required
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value);
              setClientError(null);
            }}
            className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
          />
          {targetType === WASTAGE_TARGET.ITEM && selectedItem ? (
            <p className="mt-1.5 text-xs text-ink-muted">
              Current stock: {selectedItem.quantity} {selectedItem.unit}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="reason" className="eyebrow mb-2 block text-ink-muted">
            Reason
          </label>
          <select
            id="reason"
            name="reason"
            required
            defaultValue=""
            className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
          >
            <option value="" disabled>
              Choose…
            </option>
            {(Object.keys(WASTAGE_REASON_LABELS) as WastageReason[]).map(
              (reason) => (
                <option key={reason} value={reason}>
                  {WASTAGE_REASON_LABELS[reason]}
                </option>
              ),
            )}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="note" className="eyebrow mb-2 block text-ink-muted">
          Note (optional)
        </label>
        <textarea
          id="note"
          name="note"
          rows={2}
          placeholder={
            targetType === WASTAGE_TARGET.DISH
              ? "e.g. overproduced batch for lunch service"
              : "e.g. fridge failure overnight"
          }
          className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
        />
      </div>

      {targetType === WASTAGE_TARGET.ITEM && estimatedItemValue !== null ? (
        <p className="rounded-2xl border border-ink/8 bg-cream/50 px-4 py-3 text-sm text-ink-soft">
          Estimated value:{" "}
          <span className="font-semibold text-ink">
            €{estimatedItemValue.toFixed(2)}
          </span>
          {selectedItem ? (
            <span className="text-ink-muted">
              {" "}
              · €{selectedItem.unitPrice.toFixed(2)} / {selectedItem.unit}
            </span>
          ) : null}
        </p>
      ) : null}

      {targetType === WASTAGE_TARGET.DISH && selectedDish ? (
        <div className="rounded-2xl border border-ink/8 bg-cream/50 px-4 py-3 text-sm text-ink-soft space-y-1">
          <p>
            Ingredient cost / dish:{" "}
            <span className="font-semibold text-ink">
              {selectedDish.dishCost !== null
                ? `€${selectedDish.dishCost.toFixed(2)}`
                : "—"}
            </span>
            <span className="text-ink-muted"> (group-wide)</span>
          </p>
          {estimatedDishValue !== null ? (
            <p>
              Total financial loss:{" "}
              <span className="font-semibold text-ink">
                €{estimatedDishValue.toFixed(2)}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {clientError || state.error ? (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {clientError || state.error}
        </p>
      ) : null}

      {state.message ? (
        <p className="rounded-2xl border border-sage-100 bg-sage-50/60 px-4 py-3 text-sm text-sage-800">
          {state.message}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={
          pending ||
          (targetType === WASTAGE_TARGET.ITEM && availableItems.length === 0) ||
          (targetType === WASTAGE_TARGET.DISH &&
            (initialDishes.length === 0 ||
              (selectedDish !== null && !selectedDish.canWaste)))
        }
      >
        {pending
          ? "Recording…"
          : targetType === WASTAGE_TARGET.DISH
            ? "Record dish wastage"
            : "Record wastage"}
      </Button>
    </form>
  );
}
