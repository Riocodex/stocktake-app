"use client";

import { useActionState, useState } from "react";

import {
  recordDeliveryAction,
  type InventoryActionResult,
} from "@/lib/actions/inventory";
import { Button } from "@/components/ui";

const INITIAL: InventoryActionResult = { error: null };

type Line = {
  key: string;
  itemId: string;
  quantity: string;
  unitPrice: string;
  expiryDate: string;
};

export function DeliveryForm({
  outlets,
  suppliers,
  items,
  fixedOutletId,
  fixedOutletName,
}: {
  outlets: { id: string; name: string }[];
  suppliers: { id: string; name: string; isSample: boolean }[];
  items: { id: string; name: string; unit: string; category: string }[];
  fixedOutletId: string | null;
  fixedOutletName: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    recordDeliveryAction,
    INITIAL,
  );
  const [lines, setLines] = useState<Line[]>([
    { key: "1", itemId: "", quantity: "", unitPrice: "", expiryDate: "" },
  ]);

  const grouped = items.reduce<Record<string, typeof items>>(
    (accumulator, item) => {
      (accumulator[item.category] ??= []).push(item);
      return accumulator;
    },
    {},
  );

  return (
    <form action={formAction} className="space-y-6">
      {fixedOutletId ? (
        <>
          <input type="hidden" name="outletId" value={fixedOutletId} />
          <div className="rounded-2xl border border-sage-100 bg-sage-50/60 px-4 py-3">
            <p className="eyebrow text-sage-800">Receiving at</p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {fixedOutletName}
            </p>
          </div>
        </>
      ) : (
        <div>
          <label htmlFor="outletId" className="eyebrow mb-2 block text-ink-muted">
            Outlet
          </label>
          <select
            id="outletId"
            name="outletId"
            required
            defaultValue=""
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
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="supplierId" className="eyebrow mb-2 block text-ink-muted">
            Supplier (optional)
          </label>
          <select
            id="supplierId"
            name="supplierId"
            defaultValue=""
            className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
          >
            <option value="">Unknown / not listed</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
                {supplier.isSample ? " (sample)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="reference" className="eyebrow mb-2 block text-ink-muted">
            Delivery note / reference
          </label>
          <input
            id="reference"
            name="reference"
            type="text"
            placeholder="Invoice or DN number"
            className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
          />
        </div>
      </div>

      <div>
        <label htmlFor="note" className="eyebrow mb-2 block text-ink-muted">
          Notes
        </label>
        <input
          id="note"
          name="note"
          type="text"
          className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
        />
      </div>

      <div className="space-y-3">
        {lines.map((line, index) => (
          <div
            key={line.key}
            className="grid gap-3 rounded-2xl border border-ink/8 bg-cream/40 p-4 sm:grid-cols-[1fr_6rem_6rem_8rem_auto]"
          >
            <div>
              {index === 0 ? (
                <label className="mb-1.5 block text-[11px] font-semibold text-ink-soft">
                  Product
                </label>
              ) : null}
              <select
                name="itemId"
                required
                value={line.itemId}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((entry) =>
                      entry.key === line.key
                        ? { ...entry, itemId: event.target.value }
                        : entry,
                    ),
                  )
                }
                className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-clay"
              >
                <option value="">Choose…</option>
                {Object.entries(grouped).map(([category, categoryItems]) => (
                  <optgroup key={category} label={category}>
                    {categoryItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.unit})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              {index === 0 ? (
                <label className="mb-1.5 block text-[11px] font-semibold text-ink-soft">
                  Qty
                </label>
              ) : null}
              <input
                name="quantity"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={line.quantity}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((entry) =>
                      entry.key === line.key
                        ? { ...entry, quantity: event.target.value }
                        : entry,
                    ),
                  )
                }
                className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-clay"
              />
            </div>
            <div>
              {index === 0 ? (
                <label className="mb-1.5 block text-[11px] font-semibold text-ink-soft">
                  € / unit
                </label>
              ) : null}
              <input
                name="unitPrice"
                type="number"
                min="0"
                step="0.01"
                value={line.unitPrice}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((entry) =>
                      entry.key === line.key
                        ? { ...entry, unitPrice: event.target.value }
                        : entry,
                    ),
                  )
                }
                placeholder="opt."
                className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-clay"
              />
            </div>
            <div>
              {index === 0 ? (
                <label className="mb-1.5 block text-[11px] font-semibold text-ink-soft">
                  Expiry
                </label>
              ) : null}
              <input
                name="expiryDate"
                type="date"
                value={line.expiryDate}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((entry) =>
                      entry.key === line.key
                        ? { ...entry, expiryDate: event.target.value }
                        : entry,
                    ),
                  )
                }
                className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-clay"
              />
            </div>
            <div className={index === 0 ? "flex items-end" : ""}>
              {lines.length > 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setLines((current) =>
                      current.filter((entry) => entry.key !== line.key),
                    )
                  }
                  className="rounded-xl px-3 py-2 text-xs font-semibold text-ink-muted hover:text-red-600"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          setLines((current) => [
            ...current,
            {
              key: String(Date.now()),
              itemId: "",
              quantity: "",
              unitPrice: "",
              expiryDate: "",
            },
          ])
        }
        className="text-sm font-semibold text-clay hover:underline"
      >
        + Add another product
      </button>

      <p className="text-xs text-ink-muted">
        Optional purchase prices are stored on this delivery only. They do not
        overwrite group-wide reference prices used for dish costing.
      </p>

      {state.error ? (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : state.message ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Recording…" : "Add to inventory"}
      </Button>
    </form>
  );
}
