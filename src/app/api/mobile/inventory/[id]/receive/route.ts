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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const body = await readJson<{
      quantity?: number;
      expiryDate?: string;
      outletId?: string;
    }>(request);

    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ApiError(400, "Quantity must be greater than zero.");
    }

    const form = new FormData();
    const outletId = body.outletId || user.outletId;
    if (outletId) form.set("outletId", outletId);
    form.append("itemId", id);
    form.append("quantity", String(quantity));
    form.append("expiryDate", body.expiryDate ?? "");
    form.set("note", "App receive");

    const result = await recordDeliveryAction({ error: null }, form);
    if (result.error) throw new ApiError(400, result.error);

    return apiJson({ ok: true, message: result.message });
  } catch (error) {
    return handleApiError(error);
  }
}
