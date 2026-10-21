import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  readJson,
  requireApiUser,
} from "@/lib/api";
import { OrderingError, authorizeExternalOpen } from "@/lib/ordering";

export function OPTIONS() {
  return apiOptions();
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const body = await readJson<{ cardId?: string; outletId?: string }>(
      request,
    );
    const cardId = String(body.cardId ?? "").trim();
    if (!cardId) throw new ApiError(400, "cardId is required.");

    const opened = await authorizeExternalOpen(
      user,
      cardId,
      body.outletId ?? null,
    );

    return apiJson({
      url: opened.url,
      method: opened.method,
      title: opened.title,
      // Explicit: opening never submits an order or changes stock.
      orderSubmitted: false,
      stockChanged: false,
      notice:
        "Link ready. Opening does not submit an order or change stock.",
    });
  } catch (error) {
    if (error instanceof OrderingError) {
      return handleApiError(new ApiError(error.status, error.message));
    }
    return handleApiError(error);
  }
}
