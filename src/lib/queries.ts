import "server-only";

import { prisma } from "@/lib/db";
import { LINE_SOURCE, STOCK_TAKE_STATUS } from "@/lib/constants";

export async function getOutlets() {
  return prisma.outlet.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
}

/** An item is "low" when it drops under its threshold, or under 30% of par. */
export function isLow(quantity: number, threshold: number, par: number) {
  if (threshold > 0) return quantity <= threshold;
  if (par > 0) return quantity <= par * 0.3;
  return quantity === 0;
}

export type LowStockRow = {
  itemId: string;
  name: string;
  sku: string;
  unit: string;
  category: string;
  outletId: string;
  outletName: string;
  quantity: number;
  parLevel: number;
  threshold: number;
  value: number;
};

/**
 * Stock positions that need attention, newest count first.
 * Pass `outletId: null` to look across the whole group.
 */
export async function getLowStock(outletId: string | null, limit = 8) {
  const rows = await prisma.outletStock.findMany({
    where: outletId ? { outletId } : undefined,
    include: {
      item: { include: { category: true } },
      outlet: { select: { name: true } },
    },
  });

  const low: LowStockRow[] = rows
    .filter((row) =>
      isLow(
        row.quantity,
        row.item.lowStockThreshold,
        row.parLevel ?? row.item.parLevel,
      ),
    )
    .map((row) => ({
      itemId: row.itemId,
      name: row.item.name,
      sku: row.item.sku,
      unit: row.item.unit,
      category: row.item.category.name,
      outletId: row.outletId,
      outletName: row.outlet.name,
      quantity: row.quantity,
      parLevel: row.parLevel ?? row.item.parLevel,
      threshold: row.item.lowStockThreshold,
      value: row.quantity * row.unitPrice,
    }))
    .sort((a, b) => {
      const aRatio = a.parLevel > 0 ? a.quantity / a.parLevel : a.quantity;
      const bRatio = b.parLevel > 0 ? b.quantity / b.parLevel : b.quantity;
      return aRatio - bRatio;
    });

  return { rows: low.slice(0, limit), total: low.length };
}

export async function getOutletSummary(outletId: string) {
  const [stock, lastTake, draftCount, takeCount] = await Promise.all([
    prisma.outletStock.findMany({
      where: { outletId },
      include: { item: true },
    }),
    prisma.stockTake.findFirst({
      where: { outletId, status: STOCK_TAKE_STATUS.SUBMITTED },
      orderBy: { submittedAt: "desc" },
      include: { user: { select: { name: true } }, _count: { select: { lines: true } } },
    }),
    prisma.stockTake.count({
      where: { outletId, status: STOCK_TAKE_STATUS.DRAFT },
    }),
    prisma.stockTake.count({
      where: { outletId, status: STOCK_TAKE_STATUS.SUBMITTED },
    }),
  ]);

  const value = stock.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
  const lowCount = stock.filter((row) =>
    isLow(row.quantity, row.item.lowStockThreshold, row.parLevel ?? row.item.parLevel),
  ).length;

  return {
    value,
    trackedItems: stock.length,
    lowCount,
    outOfStock: stock.filter((row) => row.quantity === 0).length,
    lastTake,
    draftCount,
    takeCount,
  };
}

export async function getGroupSummaryByOutlet() {
  const outlets = await getOutlets();

  return Promise.all(
    outlets.map(async (outlet) => ({
      outlet,
      summary: await getOutletSummary(outlet.id),
    })),
  );
}

export async function getRecentStockTakes(
  outletId: string | null,
  limit = 6,
) {
  return prisma.stockTake.findMany({
    where: outletId ? { outletId } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      outlet: { select: { name: true, slug: true } },
      user: { select: { name: true } },
      _count: { select: { lines: true, photos: true } },
    },
  });
}

/** How much of the counting is being done by AI vs by hand. */
export async function getAutomationShare(outletId: string | null, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);

  const lines = await prisma.stockTakeLine.findMany({
    where: {
      createdAt: { gte: since },
      stockTake: outletId ? { outletId } : undefined,
    },
    select: { source: true, confidence: true },
  });

  const ai = lines.filter((line) => line.source === LINE_SOURCE.AI);
  const confidences = ai
    .map((line) => line.confidence)
    .filter((value): value is number => value !== null);

  return {
    total: lines.length,
    aiCount: ai.length,
    manualCount: lines.length - ai.length,
    aiShare: lines.length > 0 ? ai.length / lines.length : 0,
    averageConfidence:
      confidences.length > 0
        ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
        : null,
  };
}

export type CategoryValue = {
  name: string;
  value: number;
  units: number;
};

export async function getValueByCategory(
  outletId: string | null,
): Promise<CategoryValue[]> {
  const rows = await prisma.outletStock.findMany({
    where: outletId ? { outletId } : undefined,
    include: { item: { include: { category: true } } },
  });

  const totals = new Map<string, CategoryValue>();

  for (const row of rows) {
    const name = row.item.category.name;
    const current = totals.get(name) ?? { name, value: 0, units: 0 };
    current.value += row.quantity * row.unitPrice;
    current.units += row.quantity;
    totals.set(name, current);
  }

  return [...totals.values()].sort((a, b) => b.value - a.value);
}
