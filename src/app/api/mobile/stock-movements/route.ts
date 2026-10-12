import { NextRequest } from "next/server";

import { apiJson, apiOptions, handleApiError, requireApiUser } from "@/lib/api";
import { listStockMovements } from "@/lib/stock-movements";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const params = request.nextUrl.searchParams;
    const rows = await listStockMovements(user, {
      outletId: params.get("outlet"),
      itemId: params.get("item"),
      movementType: params.get("type"),
      from: params.get("from"),
      to: params.get("to"),
      take: 200,
    });
    return apiJson({
      movements: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
