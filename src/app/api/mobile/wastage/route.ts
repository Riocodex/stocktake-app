import { NextRequest } from "next/server";

import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  readJson,
  requireApiUser,
} from "@/lib/api";
import { WASTAGE_REASON_LABELS, WASTAGE_REASONS } from "@/lib/constants";
import { listWastage, recordItemWastage } from "@/lib/wastage";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const params = request.nextUrl.searchParams;
    const data = await listWastage(user, {
      outletId: params.get("outlet"),
      itemId: params.get("itemId"),
      reason: params.get("reason"),
      q: params.get("q"),
      from: params.get("from"),
      to: params.get("to"),
      take: 100,
    });

    return apiJson({
      rows: data.rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      summary: data.summary,
      reasons: Object.entries(WASTAGE_REASON_LABELS).map(([id, label]) => ({
        id,
        label,
      })),
      reasonIds: Object.values(WASTAGE_REASONS),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const body = await readJson<{
      outletId?: string;
      itemId?: string;
      quantity?: number;
      reason?: string;
      note?: string;
    }>(request);

    const result = await recordItemWastage(user, {
      outletId: body.outletId,
      itemId: body.itemId ?? "",
      quantity: Number(body.quantity ?? 0),
      reason: body.reason ?? "",
      note: body.note,
    });

    if (!result.ok) throw new ApiError(400, result.error);

    return apiJson({ ok: true, wastage: result.wastage });
  } catch (error) {
    return handleApiError(error);
  }
}
