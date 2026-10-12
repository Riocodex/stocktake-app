import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  readJson,
  requireApiUser,
} from "@/lib/api";
import { receiveTransfer } from "@/lib/transfers";

export function OPTIONS() {
  return apiOptions();
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const body = await readJson<{
      note?: string;
      lines?: {
        itemId: string;
        receivedQty: number;
        discrepancyNote?: string;
      }[];
    }>(request);

    const result = await receiveTransfer(user, {
      transferId: id,
      note: body.note,
      lines: body.lines ?? [],
    });
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
