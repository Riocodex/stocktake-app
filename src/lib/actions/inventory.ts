"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assertOutletAccess, isSuperAdmin, requireUser } from "@/lib/auth";
import {
  STOCK_MOVEMENT_REFERENCE,
  STOCK_MOVEMENT_TYPE,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { createStockMovement } from "@/lib/stock-movements";
import { saveUploadedImage } from "@/lib/uploads";

export type InventoryActionResult = { error: string | null; message?: string };

const OK: InventoryActionResult = { error: null };

function slugSku(name: string) {
  const letters = name
    .replace(/[^A-Za-z0-9]+/g, "")
    .slice(0, 6)
    .toUpperCase()
    .padEnd(3, "X");
  return `${letters}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

export async function createProductAction(
  _previous: InventoryActionResult,
  formData: FormData,
): Promise<InventoryActionResult> {
  const user = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim();
  const price = Number(formData.get("price") ?? 0);
  const supplierPackQtyRaw = String(formData.get("supplierPackQty") ?? "").trim();
  const packSize = String(formData.get("packSize") ?? "").trim();

  if (!name) return { error: "Give the product a name." };
  if (!categoryId) return { error: "Choose which section it belongs to." };
  if (!unit) return { error: "Choose a unit." };
  if (!Number.isFinite(price) || price < 0) {
    return { error: "Price must be zero or more." };
  }

  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) return { error: "That section no longer exists." };

  const picture = formData.get("picture");
  let imageUrl: string | null = null;
  if (picture instanceof File && picture.size > 0) {
    try {
      imageUrl = await saveUploadedImage(picture, "product");
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Could not save the picture.",
      };
    }
  }

  const supplierPackQty = supplierPackQtyRaw
    ? Number(supplierPackQtyRaw)
    : null;
  if (
    supplierPackQty !== null &&
    (!Number.isFinite(supplierPackQty) || supplierPackQty < 0)
  ) {
    return { error: "Supplier quantity must be zero or more." };
  }

  const item = await prisma.inventoryItem.create({
    data: {
      sku: slugSku(name),
      name,
      brand: brand || null,
      categoryId,
      unit: unit || "unit",
      packSize: packSize || null,
      referencePrice: Math.round(price * 100) / 100,
      supplierPackQty,
      imageUrl,
    },
  });

  if (user.outletId) {
    await prisma.outletStock.create({
      data: {
        outletId: user.outletId,
        itemId: item.id,
        quantity: 0,
        unitPrice: Math.round(price * 100) / 100,
      },
    });
  } else if (isSuperAdmin(user)) {
    const outlets = await prisma.outlet.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    if (outlets.length > 0) {
      await prisma.outletStock.createMany({
        data: outlets.map((outlet) => ({
          outletId: outlet.id,
          itemId: item.id,
          quantity: 0,
          unitPrice: Math.round(price * 100) / 100,
        })),
      });
    }
  }

  await prisma.activityLog.create({
    data: {
      userId: user.id,
      outletId: user.outletId,
      action: "PRODUCT_CREATED",
      detail: `${item.name} · ${item.sku}`,
    },
  });

  revalidatePath("/app/inventory");
  redirect(`/app/inventory/${item.id}`);
}

export async function recordDeliveryAction(
  _previous: InventoryActionResult,
  formData: FormData,
): Promise<InventoryActionResult> {
  const user = await requireUser();

  const requestedOutlet = String(formData.get("outletId") ?? "").trim();
  const outletId = isSuperAdmin(user) ? requestedOutlet : user.outletId;
  const note = String(formData.get("note") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const supplierIdRaw = String(formData.get("supplierId") ?? "").trim();
  const supplierId = supplierIdRaw || null;

  if (!outletId) return { error: "Choose which outlet received this delivery." };

  try {
    assertOutletAccess(user, outletId);
  } catch {
    return { error: "You do not have access to that outlet." };
  }

  if (supplierId) {
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, isActive: true },
    });
    if (!supplier || !supplier.isActive) {
      return { error: "That supplier is not available." };
    }
  }

  const rawItems = formData.getAll("itemId");
  const rawQty = formData.getAll("quantity");
  const rawExpiry = formData.getAll("expiryDate");
  const rawUnitPrice = formData.getAll("unitPrice");

  const lines: {
    itemId: string;
    quantity: number;
    expiryDate: Date | null;
    unitPrice: number | null;
  }[] = [];

  for (let index = 0; index < rawItems.length; index++) {
    const itemId = String(rawItems[index] ?? "").trim();
    const quantity = Number(rawQty[index] ?? 0);
    const expiryValue = String(rawExpiry[index] ?? "").trim();
    const unitPriceRaw = String(rawUnitPrice[index] ?? "").trim();
    if (!itemId) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { error: "Each line needs a quantity greater than zero." };
    }
    let unitPrice: number | null = null;
    if (unitPriceRaw) {
      unitPrice = Number(unitPriceRaw);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return { error: "Purchase prices must be zero or more." };
      }
      unitPrice = Math.round(unitPrice * 100) / 100;
    }
    lines.push({
      itemId,
      quantity: Math.round(quantity * 100) / 100,
      expiryDate: expiryValue ? new Date(expiryValue) : null,
      unitPrice,
    });
  }

  if (lines.length === 0) {
    return { error: "Add at least one product from the delivery." };
  }

  const delivery = await prisma.$transaction(async (tx) => {
    const created = await tx.delivery.create({
      data: {
        outletId,
        userId: user.id,
        supplierId,
        reference: reference || null,
        note: note || null,
        lines: {
          create: lines.map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            expiryDate: line.expiryDate,
          })),
        },
      },
      include: {
        lines: {
          include: { item: { select: { unit: true, referencePrice: true } } },
        },
      },
    });

    for (const line of created.lines) {
      // OutletStock.unitPrice stays on group referencePrice for costing.
      // DeliveryLine.unitPrice is purchase history only — never overwrites
      // InventoryItem.referencePrice.
      await tx.outletStock.upsert({
        where: { outletId_itemId: { outletId, itemId: line.itemId } },
        create: {
          outletId,
          itemId: line.itemId,
          quantity: line.quantity,
          unitPrice: line.item.referencePrice ?? 0,
          expiryDate: line.expiryDate,
        },
        update: {
          quantity: { increment: line.quantity },
          ...(line.expiryDate ? { expiryDate: line.expiryDate } : {}),
        },
      });

      const fresh = await tx.outletStock.findUniqueOrThrow({
        where: { outletId_itemId: { outletId, itemId: line.itemId } },
        select: { quantity: true },
      });
      const quantityAfter = Math.round(fresh.quantity * 100) / 100;
      const quantityBefore =
        Math.round((quantityAfter - line.quantity) * 100) / 100;

      await createStockMovement(tx, {
        outletId,
        itemId: line.itemId,
        movementType: STOCK_MOVEMENT_TYPE.DELIVERY,
        quantityChange: line.quantity,
        unit: line.item.unit,
        quantityBefore,
        quantityAfter,
        performedById: user.id,
        referenceType: STOCK_MOVEMENT_REFERENCE.DELIVERY_LINE,
        referenceId: line.id,
        note: note || null,
      });
    }

    await tx.activityLog.create({
      data: {
        userId: user.id,
        outletId,
        action: "DELIVERY_RECORDED",
        detail: `${lines.length} line${lines.length === 1 ? "" : "s"} received`,
      },
    });

    return created;
  });

  revalidatePath("/app/inventory");
  revalidatePath("/app");
  return {
    ...OK,
    message: `Delivery recorded · ${lines.length} product${
      lines.length === 1 ? "" : "s"
    } added to stock.`,
  };
}

export async function receiveProductAction(
  _previous: InventoryActionResult,
  formData: FormData,
): Promise<InventoryActionResult> {
  const itemId = String(formData.get("itemId") ?? "");
  const quantity = String(formData.get("quantity") ?? "");
  const expiryDate = String(formData.get("expiryDate") ?? "");
  const outletId = String(formData.get("outletId") ?? "");

  const wrapped = new FormData();
  if (outletId) wrapped.set("outletId", outletId);
  wrapped.append("itemId", itemId);
  wrapped.append("quantity", quantity);
  wrapped.append("expiryDate", expiryDate);
  wrapped.set("note", "Single product receive");

  const result = await recordDeliveryAction(_previous, wrapped);
  if (!result.error) {
    revalidatePath(`/app/inventory/${itemId}`);
  }
  return result;
}

/**
 * SUPER_ADMIN updates the group-wide purchase price used for dish costing.
 * Writes PriceHistory with outletId null (group reference). Does not change
 * OutletStock quantities or outlet unit prices.
 */
export async function updateReferencePriceAction(
  _previous: InventoryActionResult,
  formData: FormData,
): Promise<InventoryActionResult> {
  const user = await requireUser();
  if (!isSuperAdmin(user)) {
    return { error: "Only super admins can edit the group purchase price." };
  }

  const itemId = String(formData.get("itemId") ?? "").trim();
  const price = Number(formData.get("price"));
  if (!itemId) return { error: "Item is required." };
  if (!Number.isFinite(price) || price < 0) {
    return { error: "Price must be zero or more." };
  }

  const nextPrice = Math.round(price * 100) / 100;
  const item = await prisma.inventoryItem.findUnique({
    where: { id: itemId },
    select: { id: true, name: true, referencePrice: true },
  });
  if (!item) return { error: "Item not found." };

  const previousPrice = item.referencePrice;
  if (Math.abs(previousPrice - nextPrice) < 0.005) {
    return { error: null, message: "Purchase price unchanged." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.inventoryItem.update({
      where: { id: itemId },
      data: { referencePrice: nextPrice },
    });
    await tx.priceHistory.create({
      data: {
        itemId,
        outletId: null,
        price: nextPrice,
        previousPrice,
        source: "MANUAL",
      },
    });
    await tx.activityLog.create({
      data: {
        userId: user.id,
        outletId: user.outletId,
        action: "ITEM_REFERENCE_PRICE_UPDATED",
        detail: `${item.name}: €${previousPrice.toFixed(2)} → €${nextPrice.toFixed(2)}`,
      },
    });
  });

  revalidatePath("/app/inventory");
  revalidatePath(`/app/inventory/${itemId}`);
  revalidatePath("/app/products");
  revalidatePath("/app/products/items");
  revalidatePath("/app/products/dishes");
  return {
    error: null,
    message: `Group purchase price updated to €${nextPrice.toFixed(2)}. Dish costs recalculate on next view.`,
  };
}
