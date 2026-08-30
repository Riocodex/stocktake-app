import { NextRequest } from "next/server";

import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  readJson,
  requireApiUser,
} from "@/lib/api";
import { assertOutletAccess, isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LINE_SOURCE, STOCK_TAKE_STATUS } from "@/lib/constants";

export function OPTIONS() {
  return apiOptions();
}

async function loadDraft(id: string) {
  const user = await requireApiUser();
  const stockTake = await prisma.stockTake.findUnique({ where: { id } });
  if (!stockTake) throw new ApiError(404, "Stock take not found.");
  try {
    assertOutletAccess(user, stockTake.outletId);
  } catch {
    throw new ApiError(404, "Stock take not found.");
  }
  if (stockTake.status === STOCK_TAKE_STATUS.SUBMITTED) {
    throw new ApiError(409, "This stock take has already been submitted.");
  }
  return { user, stockTake };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { user, stockTake } = await loadDraft(id);
    const body = await readJson<{
      itemId?: string;
      countedQty?: number;
      unitPrice?: number;
    }>(request);

    const itemId = String(body.itemId ?? "");
    const quantity = Number(body.countedQty);
    if (!itemId) throw new ApiError(400, "Pick a product to count.");
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new ApiError(400, "Quantity must be zero or more.");
    }

    const [item, outletStock] = await Promise.all([
      prisma.inventoryItem.findUnique({ where: { id: itemId } }),
      prisma.outletStock.findUnique({
        where: { outletId_itemId: { outletId: stockTake.outletId, itemId } },
      }),
    ]);
    if (!item) throw new ApiError(400, "That product no longer exists.");

    const previousQty = outletStock?.quantity ?? 0;
    const previousPrice = outletStock?.unitPrice || item.referencePrice;
    const requestedPrice = Number(body.unitPrice);
    const price =
      isSuperAdmin(user) && Number.isFinite(requestedPrice) && requestedPrice >= 0
        ? requestedPrice
        : previousPrice;

    if (!isSuperAdmin(user) && Number.isFinite(price) === false) {
      throw new ApiError(400, "Price must be zero or more.");
    }

    const line = await prisma.stockTakeLine.upsert({
      where: { stockTakeId_itemId: { stockTakeId: id, itemId } },
      create: {
        stockTakeId: id,
        itemId,
        countedQty: Math.round(quantity * 100) / 100,
        previousQty,
        unitPrice: Math.round(price * 100) / 100,
        previousPrice,
        source: LINE_SOURCE.MANUAL,
      },
      update: {
        countedQty: Math.round(quantity * 100) / 100,
        unitPrice: Math.round(price * 100) / 100,
        source: LINE_SOURCE.MANUAL,
      },
    });

    return apiJson({
      lineId: line.id,
      itemId,
      countedQty: line.countedQty,
      unitPrice: line.unitPrice,
      message: `${item.name} counted`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    await loadDraft(id);
    const body = await readJson<{ itemId?: string; lineId?: string }>(request);

    if (body.lineId) {
      await prisma.stockTakeLine.deleteMany({
        where: { id: body.lineId, stockTakeId: id },
      });
    } else if (body.itemId) {
      await prisma.stockTakeLine.deleteMany({
        where: { stockTakeId: id, itemId: body.itemId },
      });
    } else {
      throw new ApiError(400, "Say which product to remove.");
    }

    return apiJson({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
