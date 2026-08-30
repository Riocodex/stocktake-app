import { apiJson, apiOptions, ApiError, handleApiError, requireApiUser } from "@/lib/api";
import { isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
    const superAdmin = isSuperAdmin(user);

    const item = await prisma.inventoryItem.findUnique({
      where: { id },
      include: {
        category: true,
        outletStock: {
          where: superAdmin ? undefined : { outletId: user.outletId ?? "" },
          include: { outlet: { select: { name: true, city: true } } },
          orderBy: { outlet: { name: "asc" } },
        },
        priceHistory: {
          where: superAdmin
            ? undefined
            : { OR: [{ outletId: user.outletId }, { outletId: null }] },
          orderBy: { createdAt: "desc" },
          take: 12,
          include: { outlet: { select: { name: true } } },
        },
      },
    });

    const recentCounts = await prisma.stockTakeLine.findMany({
      where: {
        itemId: id,
        ...(superAdmin ? {} : { stockTake: { outletId: user.outletId ?? "" } }),
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        stockTake: {
          select: {
            id: true,
            reference: true,
            submittedAt: true,
            createdAt: true,
            outlet: { select: { name: true } },
          },
        },
      },
    });

    if (!item) throw new ApiError(404, "Product not found.");

    const quantity = item.outletStock.reduce((sum, row) => sum + row.quantity, 0);
    const value = item.outletStock.reduce(
      (sum, row) => sum + row.quantity * row.unitPrice,
      0,
    );

    return apiJson({
      id: item.id,
      sku: item.sku,
      name: item.name,
      brand: item.brand,
      unit: item.unit,
      packSize: item.packSize,
      category: item.category.name,
      supplierPackQty: item.supplierPackQty,
      imageUrl: item.imageUrl,
      referencePrice: item.referencePrice,
      quantity,
      value,
      positions: item.outletStock.map((row) => ({
        outletName: row.outlet.name,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        value: row.quantity * row.unitPrice,
        expiryDate: row.expiryDate?.toISOString() ?? null,
        lastCountedAt: row.lastCountedAt?.toISOString() ?? null,
      })),
      priceHistory: item.priceHistory.map((row) => ({
        price: row.price,
        previousPrice: row.previousPrice,
        source: row.source,
        outletName: row.outlet?.name ?? "Group",
        createdAt: row.createdAt.toISOString(),
      })),
      recentCounts: recentCounts.map((row) => ({
        takeId: row.stockTake.id,
        reference: row.stockTake.reference,
        outletName: row.stockTake.outlet.name,
        countedQty: row.countedQty,
        createdAt: (row.stockTake.submittedAt ?? row.stockTake.createdAt).toISOString(),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
