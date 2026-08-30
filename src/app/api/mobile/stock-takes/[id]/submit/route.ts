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
import { STOCK_TAKE_STATUS } from "@/lib/constants";
import { submitStockTake as commitStockTake } from "@/lib/stock";

export function OPTIONS() {
  return apiOptions();
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    let body: { note?: string } = {};
    try {
      body = await readJson<{ note?: string }>(request);
    } catch {
      body = {};
    }

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

    const note = String(body.note ?? "").trim();
    if (note) {
      await prisma.stockTake.update({
        where: { id },
        data: { note },
      });
    }

    await commitStockTake(id, { updatePrices: isSuperAdmin(user) });

    return apiJson({ ok: true, message: "Stock take submitted" });
  } catch (error) {
    return handleApiError(error);
  }
}
