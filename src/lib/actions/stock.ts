"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assertOutletAccess, requireUser, isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  LINE_SOURCE,
  STOCK_AREAS,
  STOCK_TAKE_STATUS,
  type StockArea,
} from "@/lib/constants";
import {
  nextStockTakeReference,
  submitStockTake as commitStockTake,
} from "@/lib/stock";

export type ActionResult = { error: string | null; message?: string };

const OK: ActionResult = { error: null };

/** Loads a draft stock take the current user is allowed to modify. */
async function loadEditableStockTake(stockTakeId: string) {
  const user = await requireUser();

  const stockTake = await prisma.stockTake.findUnique({
    where: { id: stockTakeId },
  });
  if (!stockTake) throw new Error("Stock take not found.");

  assertOutletAccess(user, stockTake.outletId);

  if (stockTake.status === STOCK_TAKE_STATUS.SUBMITTED) {
    throw new Error("This stock take has already been submitted.");
  }

  return { user, stockTake };
}

export async function createStockTakeAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

  const requestedOutlet = String(formData.get("outletId") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim() as StockArea;

  if (area !== STOCK_AREAS.BAR && area !== STOCK_AREAS.KITCHEN) {
    return { error: "Choose whether this count is for the bar or the kitchen." };
  }

  const outletId = isSuperAdmin(user) ? requestedOutlet : user.outletId;

  if (!outletId) {
    return { error: "Choose which outlet you are counting." };
  }

  try {
    assertOutletAccess(user, outletId);
  } catch {
    return { error: "You do not have access to that outlet." };
  }

  const outlet = await prisma.outlet.findUnique({ where: { id: outletId } });
  if (!outlet) return { error: "That outlet no longer exists." };

  const stockTake = await prisma.stockTake.create({
    data: {
      reference: await nextStockTakeReference(),
      outletId,
      userId: user.id,
      area,
    },
  });

  redirect(`/app/stock-takes/${stockTake.id}`);
}

export async function updateLineAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const lineId = String(formData.get("lineId") ?? "");
  const quantityRaw = formData.get("countedQty");
  const priceRaw = formData.get("unitPrice");

  const line = await prisma.stockTakeLine.findUnique({
    where: { id: lineId },
    select: { id: true, stockTakeId: true },
  });
  if (!line) return { error: "That line no longer exists." };

  let canEditPrices = false;
  try {
    const loaded = await loadEditableStockTake(line.stockTakeId);
    canEditPrices = isSuperAdmin(loaded.user);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not allowed." };
  }

  const data: { countedQty?: number; unitPrice?: number; source?: string } = {};

  if (quantityRaw !== null) {
    const quantity = Number(quantityRaw);
    if (!Number.isFinite(quantity) || quantity < 0) {
      return { error: "Quantity must be zero or more." };
    }
    data.countedQty = Math.round(quantity * 100) / 100;
  }

  if (priceRaw !== null && canEditPrices) {
    const price = Number(priceRaw);
    if (!Number.isFinite(price) || price < 0) {
      return { error: "Price must be zero or more." };
    }
    data.unitPrice = Math.round(price * 100) / 100;
  }

  // A human touching an AI line makes it a human-verified line.
  data.source = LINE_SOURCE.MANUAL;

  await prisma.stockTakeLine.update({ where: { id: lineId }, data });

  revalidatePath(`/app/stock-takes/${line.stockTakeId}`);
  return { ...OK, message: "Saved" };
}

export async function deleteLineAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const lineId = String(formData.get("lineId") ?? "");

  const line = await prisma.stockTakeLine.findUnique({
    where: { id: lineId },
    select: { id: true, stockTakeId: true },
  });
  if (!line) return OK;

  try {
    await loadEditableStockTake(line.stockTakeId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not allowed." };
  }

  await prisma.stockTakeLine.delete({ where: { id: lineId } });

  revalidatePath(`/app/stock-takes/${line.stockTakeId}`);
  return OK;
}

export async function addLineAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const stockTakeId = String(formData.get("stockTakeId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const quantity = Number(formData.get("countedQty") ?? 0);

  if (!itemId) return { error: "Pick a product to add." };
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { error: "Quantity must be zero or more." };
  }

  let stockTake;
  let user;
  try {
    ({ stockTake, user } = await loadEditableStockTake(stockTakeId));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not allowed." };
  }

  const [item, outletStock] = await Promise.all([
    prisma.inventoryItem.findUnique({ where: { id: itemId } }),
    prisma.outletStock.findUnique({
      where: { outletId_itemId: { outletId: stockTake.outletId, itemId } },
    }),
  ]);

  if (!item) return { error: "That product no longer exists." };

  const previousQty = outletStock?.quantity ?? 0;
  const previousPrice = outletStock?.unitPrice || item.referencePrice;

  const canEditPrices = isSuperAdmin(user);
  const priceRaw = formData.get("unitPrice");
  const price =
    canEditPrices && priceRaw !== null && priceRaw !== ""
      ? Number(priceRaw)
      : previousPrice;

  if (!Number.isFinite(price) || price < 0) {
    return { error: "Price must be zero or more." };
  }

  await prisma.stockTakeLine.upsert({
    where: { stockTakeId_itemId: { stockTakeId, itemId } },
    create: {
      stockTakeId,
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

  revalidatePath(`/app/stock-takes/${stockTakeId}`);
  return { ...OK, message: `${item.name} added` };
}

/** Maps a detection the matcher could not resolve onto a catalogue item. */
export async function resolveDetectionAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const detectionId = String(formData.get("detectionId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const dismiss = formData.get("dismiss") === "1";

  const detection = await prisma.photoDetection.findUnique({
    where: { id: detectionId },
  });
  if (!detection) return { error: "That detection no longer exists." };

  let stockTake;
  try {
    ({ stockTake } = await loadEditableStockTake(detection.stockTakeId));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not allowed." };
  }

  if (dismiss) {
    await prisma.photoDetection.update({
      where: { id: detectionId },
      data: { status: "DISMISSED" },
    });
    revalidatePath(`/app/stock-takes/${detection.stockTakeId}`);
    return { ...OK, message: "Detection dismissed" };
  }

  if (!itemId) return { error: "Pick which product this is." };

  const [item, outletStock, existingLine] = await Promise.all([
    prisma.inventoryItem.findUnique({ where: { id: itemId } }),
    prisma.outletStock.findUnique({
      where: { outletId_itemId: { outletId: stockTake.outletId, itemId } },
    }),
    prisma.stockTakeLine.findUnique({
      where: {
        stockTakeId_itemId: { stockTakeId: detection.stockTakeId, itemId },
      },
    }),
  ]);

  if (!item) return { error: "That product no longer exists." };

  const previousQty = outletStock?.quantity ?? 0;
  const previousPrice = outletStock?.unitPrice || item.referencePrice;

  if (existingLine) {
    await prisma.stockTakeLine.update({
      where: { id: existingLine.id },
      data: {
        countedQty: existingLine.countedQty + detection.quantity,
        unitPrice: detection.unitPrice ?? existingLine.unitPrice,
      },
    });
  } else {
    await prisma.stockTakeLine.create({
      data: {
        stockTakeId: detection.stockTakeId,
        itemId,
        photoId: detection.photoId,
        countedQty: detection.quantity,
        previousQty,
        unitPrice: detection.unitPrice ?? previousPrice,
        previousPrice,
        source: LINE_SOURCE.AI,
        confidence: detection.confidence,
        aiLabel: detection.label,
      },
    });
  }

  await prisma.photoDetection.update({
    where: { id: detectionId },
    data: { status: "MATCHED", matchedItemId: itemId, matchReason: "manual" },
  });

  revalidatePath(`/app/stock-takes/${detection.stockTakeId}`);
  return { ...OK, message: `Mapped to ${item.name}` };
}

export async function submitStockTakeAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const stockTakeId = String(formData.get("stockTakeId") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  try {
    const { user } = await loadEditableStockTake(stockTakeId);

    if (note) {
      await prisma.stockTake.update({
        where: { id: stockTakeId },
        data: { note },
      });
    }

    await commitStockTake(stockTakeId, {
      updatePrices: isSuperAdmin(user),
    });
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not submit this count.",
    };
  }

  revalidatePath("/app");
  revalidatePath("/app/inventory");
  revalidatePath(`/app/stock-takes/${stockTakeId}`);
  return { ...OK, message: "Stock take submitted" };
}

export async function deleteStockTakeAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const stockTakeId = String(formData.get("stockTakeId") ?? "");

  try {
    await loadEditableStockTake(stockTakeId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not allowed." };
  }

  await prisma.stockTake.delete({ where: { id: stockTakeId } });

  revalidatePath("/app/stock-takes");
  redirect("/app/stock-takes");
}
