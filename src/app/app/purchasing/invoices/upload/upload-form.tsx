"use client";

import { useActionState } from "react";

import {
  uploadInvoiceAction,
  type InvoiceActionResult,
} from "../actions";
import { Button } from "@/components/ui";

const INITIAL: InvoiceActionResult = { error: null };

export function UploadInvoiceForm({
  outlets,
  fixedOutletId,
  fixedOutletName,
}: {
  outlets: { id: string; name: string }[];
  fixedOutletId: string | null;
  fixedOutletName: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    uploadInvoiceAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="space-y-5">
      {fixedOutletId ? (
        <>
          <input type="hidden" name="outletId" value={fixedOutletId} />
          <div className="rounded-2xl border border-sage-100 bg-sage-50/60 px-4 py-3">
            <p className="eyebrow text-sage-800">Receiving outlet</p>
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
            className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm outline-none focus:border-clay"
          >
            <option value="" disabled>
              Choose outlet…
            </option>
            {outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="file" className="eyebrow mb-2 block text-ink-muted">
          Invoice file
        </label>
        <input
          id="file"
          name="file"
          type="file"
          required
          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf,.pdf,.jpg,.jpeg,.png,.webp,.heic"
          className="block w-full text-sm text-ink"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Uploading & extracting…" : "Upload & extract"}
      </Button>
    </form>
  );
}
