import { NextRequest } from "next/server";

import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  readJson,
  requireApiUser,
} from "@/lib/api";
import {
  WASTAGE_REASON_LABELS,
  WASTAGE_REASONS,
  WASTAGE_TARGET,
} from "@/lib/constants";
import {
  listWastage,
  recordDishWastage,
  recordItemWastage,
} from "@/lib/wastage";

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
      dishId: params.get("dishId"),
      targetType: params.get("target"),
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
      targets: [
        { id: WASTAGE_TARGET.ITEM, label: "Item" },
        { id: WASTAGE_TARGET.DISH, label: "Dish" },
      ],
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
      targetType?: string;
      itemId?: string;
      dishId?: string;
      quantity?: number;
      reason?: string;
      note?: string;
      imageUrl?: string;
      lines?: {
        itemId: string;
        quantity: number;
        reason?: string;
        note?: string;
      }[];
    }>(request);

    // Multi-line confirm from a photo analysis (item wastage only).
    if (body.lines && body.lines.length > 0) {
      const recorded = [];
      for (const line of body.lines) {
        const result = await recordItemWastage(user, {
          outletId: body.outletId,
          itemId: line.itemId,
          quantity: Number(line.quantity ?? 0),
          reason: line.reason || body.reason || "",
          note: line.note ?? body.note,
          imageUrl: body.imageUrl,
        });
        if (!result.ok) throw new ApiError(400, result.error);
        recorded.push(result.wastage);
      }
      return apiJson({ ok: true, wastage: recorded, count: recorded.length });
    }

    if (body.targetType === WASTAGE_TARGET.DISH) {
      const result = await recordDishWastage(user, {
        outletId: body.outletId,
        dishId: body.dishId ?? "",
        quantity: Number(body.quantity ?? 0),
        reason: body.reason ?? "",
        note: body.note,
      });
      if (!result.ok) {
        const status = result.error.includes("access") ? 403 : 400;
        throw new ApiError(status, result.error);
      }
      return apiJson({ ok: true, wastage: result.wastage, targetType: WASTAGE_TARGET.DISH });
    }

    const result = await recordItemWastage(user, {
      outletId: body.outletId,
      itemId: body.itemId ?? "",
      quantity: Number(body.quantity ?? 0),
      reason: body.reason ?? "",
      note: body.note,
      imageUrl: body.imageUrl,
    });

    if (!result.ok) {
      const status = result.error.includes("access") ? 403 : 400;
      throw new ApiError(status, result.error);
    }

    return apiJson({
      ok: true,
      wastage: result.wastage,
      targetType: WASTAGE_TARGET.ITEM,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
