import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  requireApiUser,
} from "@/lib/api";
import { getTransfer } from "@/lib/transfers";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const result = await getTransfer(user, id);
    if (!result.ok) throw new ApiError(404, result.error);
    return apiJson({
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
