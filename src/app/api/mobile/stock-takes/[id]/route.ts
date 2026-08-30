import { apiJson, apiOptions, ApiError, handleApiError, requireApiUser } from "@/lib/api";
import { assertOutletAccess, isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  AREA_LABELS,
  STOCK_TAKE_STATUS,
  categoryMatchesArea,
} from "@/lib/constants";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;

    const stockTake = await prisma.stockTake.findUnique({
      where: { id },
      include: {
        outlet: { select: { name: true } },
        user: { select: { name: true } },
        lines: {
          include: {
            item: { include: { category: true } },
          },
        },
        photos: {
          orderBy: { createdAt: "desc" },
          take: 12,
        },
      },
    });

    if (!stockTake) throw new ApiError(404, "Stock take not found.");

    try {
      assertOutletAccess(user, stockTake.outletId);
    } catch {
      throw new ApiError(404, "Stock take not found.");
    }

    const [categoriesRaw, outletStock] = await Promise.all([
      prisma.category.findMany({
        where: { items: { some: { isActive: true } } },
        include: {
          items: { where: { isActive: true }, orderBy: { name: "asc" } },
        },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.outletStock.findMany({
        where: { outletId: stockTake.outletId },
        select: { itemId: true, quantity: true, unitPrice: true },
      }),
    ]);

    const stockByItem = new Map(outletStock.map((row) => [row.itemId, row]));
    const lineByItem = new Map(stockTake.lines.map((line) => [line.itemId, line]));

    const categories = categoriesRaw
      .filter((category) => categoryMatchesArea(category.area, stockTake.area))
      .map((category) => ({
        id: category.id,
        name: category.name,
        items: category.items.map((item) => {
          const stock = stockByItem.get(item.id);
          const line = lineByItem.get(item.id);
          return {
            id: item.id,
            name: item.brand ? `${item.brand} ${item.name}` : item.name,
            sku: item.sku,
            unit: item.unit,
            onRecord: stock?.quantity ?? 0,
            unitPrice: line?.unitPrice ?? stock?.unitPrice ?? item.referencePrice,
            lineId: line?.id ?? null,
            countedQty: line?.countedQty ?? null,
            imageUrl: item.imageUrl,
          };
        }),
      }));

    const totalItems = categories.reduce((sum, category) => sum + category.items.length, 0);
    const countedItems = categories.reduce(
      (sum, category) =>
        sum + category.items.filter((item) => item.lineId).length,
      0,
    );

    const counted = stockTake.lines.map((line) => ({
      id: line.itemId,
      lineId: line.id,
      name: line.item.brand
        ? `${line.item.brand} ${line.item.name}`
        : line.item.name,
      sku: line.item.sku,
      unit: line.item.unit,
      category: line.item.category.name,
      categoryId: line.item.category.id,
      countedQty: line.countedQty,
      unitPrice: line.unitPrice,
      imageUrl: line.item.imageUrl,
    }));

    const totalValue = counted.reduce(
      (sum, item) => sum + item.countedQty * item.unitPrice,
      0,
    );

    return apiJson({
      id: stockTake.id,
      reference: stockTake.reference,
      area: stockTake.area,
      areaLabel: AREA_LABELS[stockTake.area] ?? stockTake.area,
      status: stockTake.status,
      isDraft: stockTake.status === STOCK_TAKE_STATUS.DRAFT,
      note: stockTake.note,
      outletName: stockTake.outlet.name,
      countedBy: stockTake.user.name,
      createdAt: stockTake.createdAt.toISOString(),
      submittedAt: stockTake.submittedAt?.toISOString() ?? null,
      canEditPrices: isSuperAdmin(user),
      progress: { counted: countedItems, total: totalItems },
      totalValue,
      categories,
      counted,
      photos: stockTake.photos.map((photo) => ({
        id: photo.id,
        url: photo.url,
        status: photo.status,
        detectedCount: photo.detectedCount,
        provider: photo.provider,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
