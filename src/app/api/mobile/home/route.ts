import { NextRequest } from "next/server";

import { apiJson, apiOptions, handleApiError, requireApiUser } from "@/lib/api";
import { isSuperAdmin, resolveOutletScope } from "@/lib/auth";
import { AREA_LABELS } from "@/lib/constants";
import {
  getActiveStockTakes,
  getCountProgress,
  getGroupSummaryByOutlet,
  getLowStock,
  getOutletSummary,
  getOutlets,
  getRecentStockTakes,
  getValueByCategory,
} from "@/lib/queries";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const requested = request.nextUrl.searchParams.get("outlet");
    const scope = resolveOutletScope(user, requested);
    const superAdmin = isSuperAdmin(user);
    const outletId = scope.outletId;

    if (!outletId && !superAdmin) {
      return apiJson({ error: "No outlet is linked to this account." }, 400);
    }

    const [lowStock, recent, categories, drafts, outlets] = await Promise.all([
      getLowStock(outletId, 6),
      getRecentStockTakes(outletId, 5),
      getValueByCategory(outletId),
      getActiveStockTakes(outletId),
      superAdmin ? getOutlets() : Promise.resolve([]),
    ]);

    const perOutlet =
      superAdmin && !outletId ? await getGroupSummaryByOutlet() : [];

    const summary = outletId
      ? await getOutletSummary(outletId)
      : {
          value: perOutlet.reduce((sum, row) => sum + row.summary.value, 0),
          trackedItems: perOutlet.reduce(
            (sum, row) => sum + row.summary.trackedItems,
            0,
          ),
          lowCount: perOutlet.reduce((sum, row) => sum + row.summary.lowCount, 0),
          outOfStock: perOutlet.reduce(
            (sum, row) => sum + row.summary.outOfStock,
            0,
          ),
          draftCount: perOutlet.reduce(
            (sum, row) => sum + row.summary.draftCount,
            0,
          ),
          takeCount: perOutlet.reduce(
            (sum, row) => sum + row.summary.takeCount,
            0,
          ),
        };

    const active = await Promise.all(
      drafts.map(async (take) => {
        const progress = await getCountProgress(take.id, take.area);
        return {
          id: take.id,
          reference: take.reference,
          area: take.area,
          areaLabel: AREA_LABELS[take.area] ?? take.area,
          outletName: take.outlet.name,
          counted: progress.counted,
          total: progress.total,
          createdAt: take.createdAt.toISOString(),
        };
      }),
    );

    return apiJson({
      user,
      scope: {
        outletId,
        canSeeAll: superAdmin,
        outletName:
          outlets.find((outlet) => outlet.id === outletId)?.name ??
          user.outletName,
      },
      summary: {
        value: summary.value,
        trackedItems: summary.trackedItems,
        lowCount: summary.lowCount,
        outOfStock: summary.outOfStock,
        draftCount: summary.draftCount,
        takeCount: summary.takeCount,
      },
      outlets: outlets.map((outlet) => ({
        id: outlet.id,
        name: outlet.name,
        city: outlet.city,
      })),
      comparison: perOutlet.map(({ outlet, summary: row }) => ({
        id: outlet.id,
        name: outlet.name,
        city: outlet.city,
        value: row.value,
        lowCount: row.lowCount,
        draftCount: row.draftCount,
      })),
      lowStock: lowStock.rows.map((row) => ({
        itemId: row.itemId,
        name: row.name,
        sku: row.sku,
        unit: row.unit,
        category: row.category,
        outletName: row.outletName,
        quantity: row.quantity,
        parLevel: row.parLevel,
      })),
      lowStockTotal: lowStock.total,
      categories: categories.slice(0, 8).map((row) => ({
        name: row.name,
        value: row.value,
        units: row.units,
      })),
      active,
      recent: recent.map((take) => ({
        id: take.id,
        reference: take.reference,
        area: take.area,
        areaLabel: AREA_LABELS[take.area] ?? take.area,
        status: take.status,
        outletName: take.outlet.name,
        countedBy: take.user.name,
        lineCount: take._count.lines,
        createdAt: take.createdAt.toISOString(),
        submittedAt: take.submittedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
