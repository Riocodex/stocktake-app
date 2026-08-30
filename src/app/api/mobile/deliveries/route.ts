import { NextRequest } from "next/server";

import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  readJson,
  requireApiUser,
} from "@/lib/api";
import { recordDeliveryAction } from "@/lib/actions/inventory";

export function OPTIONS() {
  return apiOptions();
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const body = await readJson<{
      outletId?: string;
      note?: string;
      lines?: { itemId: string; quantity: number; expiryDate?: string }[];
    }>(request);

    const lines = body.lines ?? [];
    if (lines.length === 0) {
      throw new ApiError(400, "Add at least one product from the delivery.");
    }

    const form = new FormData();
    const outletId = body.outletId || user.outletId;
    if (outletId) form.set("outletId", outletId);
    if (body.note) form.set("note", body.note);

    for (const line of lines) {
      form.append("itemId", line.itemId);
      form.append("quantity", String(line.quantity));
      form.append("expiryDate", line.expiryDate ?? "");
    }

    const result = await recordDeliveryAction({ error: null }, form);
    if (result.error) throw new ApiError(400, result.error);

    return apiJson({ ok: true, message: result.message });
  } catch (error) {
    return handleApiError(error);
  }
}
