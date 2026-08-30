import { NextRequest } from "next/server";

import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  readJson,
  requireApiUser,
} from "@/lib/api";
import { assertOutletAccess, isSuperAdmin, resolveOutletScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  AREA_LABELS,
  STOCK_AREAS,
  STOCK_TAKE_STATUS,
  type StockArea,
} from "@/lib/constants";
import { getCountProgress } from "@/lib/queries";
import { nextStockTakeReference } from "@/lib/stock";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const scope = resolveOutletScope(
      user,
      request.nextUrl.searchParams.get("outlet"),
    );

    const takes = await prisma.stockTake.findMany({
      where: scope.outletId ? { outletId: scope.outletId } : {},
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        outlet: { select: { name: true } },
        user: { select: { name: true } },
        lines: { select: { countedQty: true, unitPrice: true, itemId: true } },
      },
    });

    const rows = await Promise.all(
      takes.map(async (take) => {
        const progress = await getCountProgress(take.id, take.area);
        const value = take.lines.reduce(
          (sum, line) => sum + line.countedQty * line.unitPrice,
          0,
        );
        return {
          id: take.id,
          reference: take.reference,
          area: take.area,
          areaLabel: AREA_LABELS[take.area] ?? take.area,
          status: take.status,
          outletName: take.outlet.name,
          countedBy: take.user.name,
          lineCount: take.lines.length,
          value,
          counted: progress.counted,
          total: progress.total,
          createdAt: take.createdAt.toISOString(),
          submittedAt: take.submittedAt?.toISOString() ?? null,
        };
      }),
    );

    const outlets = isSuperAdmin(user)
      ? await prisma.outlet.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, city: true },
        })
      : [];

    return apiJson({ stockTakes: rows, outlets });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const body = await readJson<{ area?: string; outletId?: string }>(request);
    const area = String(body.area ?? "").trim() as StockArea;

    if (area !== STOCK_AREAS.BAR && area !== STOCK_AREAS.KITCHEN) {
      throw new ApiError(400, "Choose whether this count is for the bar or the kitchen.");
    }

    const outletId = isSuperAdmin(user) ? String(body.outletId ?? "").trim() : user.outletId;
    if (!outletId) throw new ApiError(400, "Choose which outlet you are counting.");

    try {
      assertOutletAccess(user, outletId);
    } catch {
      throw new ApiError(403, "You do not have access to that outlet.");
    }

    const outlet = await prisma.outlet.findUnique({ where: { id: outletId } });
    if (!outlet) throw new ApiError(400, "That outlet no longer exists.");

    const stockTake = await prisma.stockTake.create({
      data: {
        reference: await nextStockTakeReference(),
        outletId,
        userId: user.id,
        area,
      },
    });

    return apiJson({
      id: stockTake.id,
      reference: stockTake.reference,
      area: stockTake.area,
      status: STOCK_TAKE_STATUS.DRAFT,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
