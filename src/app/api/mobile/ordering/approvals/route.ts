import { NextRequest } from "next/server";

import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  readJson,
  requireApiUser,
} from "@/lib/api";
import {
  OrderingError,
  listOrderApprovals,
  requestOrderApproval,
  reviewOrderApproval,
} from "@/lib/ordering";
import { isSuperAdmin } from "@/lib/auth";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const status = request.nextUrl.searchParams.get("status");
    const outletId = request.nextUrl.searchParams.get("outlet");
    const requests = await listOrderApprovals(user, { status, outletId });
    return apiJson({
      requests: requests.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    if (error instanceof OrderingError) {
      return handleApiError(new ApiError(error.status, error.message));
    }
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const body = await readJson<{
      cardId?: string;
      outletId?: string;
      note?: string;
      expectedItems?: string;
      requestId?: string;
      decision?: string;
      decisionNote?: string;
      action?: string;
    }>(request);

    if (body.action === "review") {
      if (!isSuperAdmin(user)) {
        throw new ApiError(403, "Only super admins can review approvals.");
      }
      const decision = String(body.decision ?? "").trim();
      if (decision !== "APPROVED" && decision !== "REJECTED") {
        throw new ApiError(400, "decision must be APPROVED or REJECTED.");
      }
      const updated = await reviewOrderApproval(
        user,
        String(body.requestId ?? "").trim(),
        decision,
        body.decisionNote ?? null,
      );
      return apiJson({
        request: {
          ...updated,
          createdAt: updated.createdAt.toISOString(),
          reviewedAt: updated.reviewedAt?.toISOString() ?? null,
        },
      });
    }

    const created = await requestOrderApproval(user, {
      cardId: String(body.cardId ?? "").trim(),
      outletId: body.outletId ?? null,
      note: body.note ?? null,
      expectedItems: body.expectedItems ?? null,
    });

    return apiJson({
      request: {
        ...created,
        createdAt: created.createdAt.toISOString(),
        reviewedAt: created.reviewedAt?.toISOString() ?? null,
      },
      notice:
        "Approval authorizes ordering but does not prove the supplier received an order.",
    });
  } catch (error) {
    if (error instanceof OrderingError) {
      return handleApiError(new ApiError(error.status, error.message));
    }
    return handleApiError(error);
  }
}
