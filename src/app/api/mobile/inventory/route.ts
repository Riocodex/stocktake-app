import { NextRequest } from "next/server";

import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  readJson,
  requireApiUser,
} from "@/lib/api";
import { isSuperAdmin, resolveOutletScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isLow } from "@/lib/queries";
import { saveBase64Image } from "@/lib/uploads";

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
    const categoryId = request.nextUrl.searchParams.get("category") ?? "";
    const search = (request.nextUrl.searchParams.get("q") ?? "").trim();
    const lowOnly = request.nextUrl.searchParams.get("filter") === "low";

    const [categories, items] = await Promise.all([
      prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.inventoryItem.findMany({
        where: {
          isActive: true,
          ...(categoryId ? { categoryId } : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search } },
                  { sku: { contains: search } },
                  { brand: { contains: search } },
                  { aliases: { contains: search } },
                ],
              }
            : {}),
        },
        include: {
          category: true,
          outletStock: {
            where: scope.outletId ? { outletId: scope.outletId } : undefined,
          },
        },
        orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
      }),
    ]);

    const rows = items.map((item) => {
      const stock = item.outletStock;
      const quantity = stock.reduce((sum, entry) => sum + entry.quantity, 0);
      const value = stock.reduce(
        (sum, entry) => sum + entry.quantity * entry.unitPrice,
        0,
      );
      const price = quantity > 0 ? value / quantity : item.referencePrice;
      const low = stock.some((entry) =>
        isLow(
          entry.quantity,
          item.lowStockThreshold,
          entry.parLevel ?? item.parLevel,
        ),
      );

      return {
        id: item.id,
        sku: item.sku,
        name: item.name,
        brand: item.brand,
        unit: item.unit,
        category: item.category.name,
        categoryId: item.categoryId,
        supplierPackQty: item.supplierPackQty,
        imageUrl: item.imageUrl,
        expiryDate: stock[0]?.expiryDate?.toISOString() ?? null,
        packSize: item.packSize,
        quantity,
        price,
        value,
        isLow: low,
      };
    });

    return apiJson({
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
      })),
      items: lowOnly ? rows.filter((row) => row.isLow) : rows,
      stats: {
        value: rows.reduce((sum, row) => sum + row.value, 0),
        count: rows.length,
        lowCount: rows.filter((row) => row.isLow).length,
        outOfStock: rows.filter((row) => row.quantity === 0).length,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

function slugSku(name: string) {
  const letters = name
    .replace(/[^A-Za-z0-9]+/g, "")
    .slice(0, 6)
    .toUpperCase()
    .padEnd(3, "X");
  return `${letters}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const body = await readJson<{
      name?: string;
      unit?: string;
      categoryId?: string;
      price?: number;
      brand?: string;
      packSize?: string;
      supplierPackQty?: number | null;
      imageBase64?: string;
      imageType?: string;
    }>(request);

    const name = String(body.name ?? "").trim();
    const unit = String(body.unit ?? "").trim();
    const categoryId = String(body.categoryId ?? "").trim();
    const price = Number(body.price ?? 0);
    const brand = String(body.brand ?? "").trim();
    const packSize = String(body.packSize ?? "").trim();

    if (!name) throw new ApiError(400, "Give the product a name.");
    if (!categoryId) throw new ApiError(400, "Choose which section it belongs to.");
    if (!unit) throw new ApiError(400, "Choose a unit.");
    if (!Number.isFinite(price) || price < 0) {
      throw new ApiError(400, "Price must be zero or more.");
    }

    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new ApiError(400, "That section no longer exists.");

    const supplierPackQty =
      body.supplierPackQty === null || body.supplierPackQty === undefined
        ? null
        : Number(body.supplierPackQty);
    if (
      supplierPackQty !== null &&
      (!Number.isFinite(supplierPackQty) || supplierPackQty < 0)
    ) {
      throw new ApiError(400, "Supplier quantity must be zero or more.");
    }

    let imageUrl: string | null = null;
    if (body.imageBase64) {
      try {
        imageUrl = await saveBase64Image(
          body.imageBase64,
          body.imageType || "image/jpeg",
          "product",
        );
      } catch (error) {
        throw new ApiError(
          400,
          error instanceof Error ? error.message : "Could not save the picture.",
        );
      }
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

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        outletId: user.outletId,
        action: "PRODUCT_CREATED",
        detail: `${item.name} · ${item.sku}`,
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

    return apiJson({ id: item.id, sku: item.sku });
  } catch (error) {
    return handleApiError(error);
  }
}
