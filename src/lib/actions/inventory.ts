"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assertOutletAccess, isSuperAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
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

  if (!outletId) return { error: "Choose which outlet received this delivery." };

  try {
    assertOutletAccess(user, outletId);
  } catch {
    return { error: "You do not have access to that outlet." };
  }

  const rawItems = formData.getAll("itemId");
  const rawQty = formData.getAll("quantity");
  const rawExpiry = formData.getAll("expiryDate");

  const lines: {
    itemId: string;
    quantity: number;
    expiryDate: Date | null;
  }[] = [];

  for (let index = 0; index < rawItems.length; index++) {
    const itemId = String(rawItems[index] ?? "").trim();
    const quantity = Number(rawQty[index] ?? 0);
    const expiryValue = String(rawExpiry[index] ?? "").trim();
    if (!itemId) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { error: "Each line needs a quantity greater than zero." };
    }
    lines.push({
      itemId,
      quantity: Math.round(quantity * 100) / 100,
      expiryDate: expiryValue ? new Date(expiryValue) : null,
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
        note: note || null,
        lines: {
          create: lines.map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity,
            expiryDate: line.expiryDate,
          })),
        },
      },
    });

    for (const line of lines) {
      const item = await tx.inventoryItem.findUnique({
        where: { id: line.itemId },
        select: { referencePrice: true },
      });
      const existing = await tx.outletStock.findUnique({
        where: { outletId_itemId: { outletId, itemId: line.itemId } },
      });

      await tx.outletStock.upsert({
        where: { outletId_itemId: { outletId, itemId: line.itemId } },
        create: {
          outletId,
          itemId: line.itemId,
          quantity: line.quantity,
          unitPrice: item?.referencePrice ?? 0,
          expiryDate: line.expiryDate,
        },
        update: {
          quantity: (existing?.quantity ?? 0) + line.quantity,
          ...(line.expiryDate ? { expiryDate: line.expiryDate } : {}),
        },
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
