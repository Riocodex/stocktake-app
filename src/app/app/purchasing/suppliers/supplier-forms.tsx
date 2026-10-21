"use client";

import { useActionState } from "react";

import {
  ORDERING_METHOD,
  ORDERING_METHOD_LABELS,
} from "@/lib/constants";
import {
  saveOrderingCardAction,
  saveSupplierAction,
  type PurchasingActionResult,
} from "../actions";
import { Button } from "@/components/ui";

const INITIAL: PurchasingActionResult = { error: null };

export function SupplierForm({
  supplier,
}: {
  supplier?: {
    id: string;
    name: string;
    notes: string | null;
    isActive: boolean;
  };
}) {
  const [state, formAction, pending] = useActionState(
    saveSupplierAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-ink/10 bg-white p-4">
      {supplier ? (
        <input type="hidden" name="supplierId" value={supplier.id} />
      ) : null}
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-ink-soft">
          Supplier name
        </label>
        <input
          name="name"
          required
          defaultValue={supplier?.name ?? ""}
          className="w-full rounded-xl border border-ink/15 px-3 py-2 text-sm outline-none focus:border-clay"
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-ink-soft">
          Notes
        </label>
        <textarea
          name="notes"
          rows={2}
          defaultValue={supplier?.notes ?? ""}
          className="w-full rounded-xl border border-ink/15 px-3 py-2 text-sm outline-none focus:border-clay"
        />
      </div>
      {supplier ? (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={supplier.isActive}
          />
          Active
        </label>
      ) : null}
      {state.error ? (
        <p className="text-xs text-red-700">{state.error}</p>
      ) : state.message ? (
        <p className="text-xs text-emerald-800">{state.message}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending
          ? "Saving…"
          : supplier
            ? "Update supplier"
            : "Add supplier"}
      </Button>
    </form>
  );
}

export function OrderingCardForm({
  suppliers,
  outlets,
  card,
}: {
  suppliers: { id: string; name: string }[];
  outlets: { id: string; name: string }[];
  card?: {
    id: string;
    supplierId: string;
    title: string;
    category: string;
    method: string;
    externalUrl: string | null;
    instructions: string | null;
    requiresApproval: boolean;
    isActive: boolean;
    sortOrder: number;
    outletIds: string[];
  };
}) {
  const [state, formAction, pending] = useActionState(
    saveOrderingCardAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-ink/10 bg-cream/40 p-4">
      {card ? <input type="hidden" name="cardId" value={card.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-ink-soft">
            Supplier
          </label>
          <select
            name="supplierId"
            required
            defaultValue={card?.supplierId ?? ""}
            disabled={Boolean(card)}
            className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay disabled:opacity-70"
          >
            <option value="" disabled>
              Choose…
            </option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-ink-soft">
            Method
          </label>
          <select
            name="method"
            required
            defaultValue={card?.method ?? ORDERING_METHOD.WHATSAPP}
            className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
          >
            {Object.values(ORDERING_METHOD).map((method) => (
              <option key={method} value={method}>
                {ORDERING_METHOD_LABELS[method]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-ink-soft">
            Card title
          </label>
          <input
            name="title"
            required
            defaultValue={card?.title ?? ""}
            placeholder="Order Vegetables"
            className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-ink-soft">
            Category
          </label>
          <input
            name="category"
            required
            defaultValue={card?.category ?? ""}
            className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-ink-soft">
          External URL (https)
        </label>
        <input
          name="externalUrl"
          type="url"
          defaultValue={card?.externalUrl ?? ""}
          placeholder="https://…"
          className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-ink-soft">
          Instructions
        </label>
        <textarea
          name="instructions"
          rows={2}
          defaultValue={card?.instructions ?? ""}
          className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-clay"
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-ink-soft">
          Outlets (leave empty = all)
        </label>
        <div className="flex flex-wrap gap-3">
          {outlets.map((outlet) => (
            <label key={outlet.id} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name="outletIds"
                value={outlet.id}
                defaultChecked={card?.outletIds.includes(outlet.id)}
              />
              {outlet.name}
            </label>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="requiresApproval"
            defaultChecked={card?.requiresApproval}
          />
          Office approval required
        </label>
        {card ? (
          <label className="flex items-center gap-2">
            <input type="hidden" name="isActive" value="off" />
            <input
              type="checkbox"
              name="isActive"
              value="on"
              defaultChecked={card.isActive}
              onChange={(event) => {
                const hidden = event.currentTarget
                  .closest("form")
                  ?.querySelector<HTMLInputElement>(
                    'input[name="isActive"][type="hidden"]',
                  );
                if (hidden) hidden.disabled = event.currentTarget.checked;
              }}
            />
            Active
          </label>
        ) : null}
        <label className="flex items-center gap-2">
          Sort
          <input
            type="number"
            name="sortOrder"
            defaultValue={card?.sortOrder ?? 0}
            className="w-20 rounded-xl border border-ink/15 bg-white px-2 py-1 text-sm"
          />
        </label>
      </div>
      {state.error ? (
        <p className="text-xs text-red-700">{state.error}</p>
      ) : state.message ? (
        <p className="text-xs text-emerald-800">{state.message}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : card ? "Update card" : "Add ordering card"}
      </Button>
    </form>
  );
}
