import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  requireApiUser,
} from "@/lib/api";
import { cancelTransferDraft } from "@/lib/transfers";

export function OPTIONS() {
  return apiOptions();
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const result = await cancelTransferDraft(user, id);
    if (!result.ok) throw new ApiError(400, result.error);
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
