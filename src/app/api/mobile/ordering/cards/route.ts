import { NextRequest } from "next/server";

import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  requireApiUser,
} from "@/lib/api";
import { ensureDemoOrderingCards } from "@/lib/ensure-demo-ordering";
import { OrderingError, listOrderingCardsForHub } from "@/lib/ordering";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    await ensureDemoOrderingCards();
    const outletId = request.nextUrl.searchParams.get("outlet");
    const cards = await listOrderingCardsForHub(user, { outletId });
    return apiJson({
      cards: cards.map((card) => ({
        ...card,
        approval: card.approval
          ? {
              ...card.approval,
              createdAt: card.approval.createdAt.toISOString(),
              reviewedAt: card.approval.reviewedAt?.toISOString() ?? null,
            }
          : null,
      })),
    });
  } catch (error) {
    if (error instanceof OrderingError) {
      return handleApiError(new ApiError(error.status, error.message));
    }
    return handleApiError(error);
  }
}
