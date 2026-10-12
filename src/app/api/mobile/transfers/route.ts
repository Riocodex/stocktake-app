import { NextRequest } from "next/server";

import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  readJson,
  requireApiUser,
} from "@/lib/api";
import { prisma } from "@/lib/db";
import { createTransferDraft, listTransfers } from "@/lib/transfers";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const params = request.nextUrl.searchParams;
    const [rows, destinations] = await Promise.all([
      listTransfers(user, {
        outletId: params.get("outlet"),
        direction: (params.get("direction") as
          | "all"
          | "incoming"
          | "outgoing"
          | "drafts"
          | null) ?? "all",
        status: params.get("status"),
        take: 100,
      }),
      // Destination choices for create-transfer (any authenticated admin).
      prisma.outlet.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);
    return apiJson({
      transfers: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        sentAt: row.sentAt?.toISOString() ?? null,
        receivedAt: row.receivedAt?.toISOString() ?? null,
        cancelledAt: row.cancelledAt?.toISOString() ?? null,
      })),
      destinations,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const body = await readJson<{
      fromOutletId?: string;
      toOutletId?: string;
      note?: string;
      imageUrl?: string;
      lines?: { itemId: string; quantity: number }[];
    }>(request);

    const result = await createTransferDraft(user, {
      fromOutletId: body.fromOutletId,
      toOutletId: body.toOutletId,
      note: body.note,
      imageUrl: body.imageUrl,
      lines: body.lines ?? [],
    });
    if (!result.ok) {
      throw new ApiError(400, result.error ?? "Could not create transfer.");
    }

    return apiJson({
      ok: true,
      transfer: {
        ...result.transfer,
        createdAt: result.transfer.createdAt.toISOString(),
        sentAt: result.transfer.sentAt?.toISOString() ?? null,
        receivedAt: result.transfer.receivedAt?.toISOString() ?? null,
        cancelledAt: result.transfer.cancelledAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
