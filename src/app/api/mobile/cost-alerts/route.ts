import { NextRequest } from "next/server";

import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  readJson,
  requireApiUser,
} from "@/lib/api";
import { isSuperAdmin } from "@/lib/auth";
import { listDishCostAlerts } from "@/lib/cost-alerts";
import { updateFoodCostThresholds } from "@/lib/settings";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const attentionOnly =
      request.nextUrl.searchParams.get("attention") !== "0";

    const data = await listDishCostAlerts(user, {
      attentionOnly,
      activeOnly: true,
    });

    return apiJson({
      alerts: data.alerts,
      thresholds: data.thresholds,
      summary: data.summary,
      canEditThresholds: isSuperAdmin(user),
      priceScope: "group",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const body = await readJson<{
      warningPercent?: number;
      criticalPercent?: number;
    }>(request);

    const result = await updateFoodCostThresholds(
      user,
      Number(body.warningPercent),
      Number(body.criticalPercent),
    );
    if (!result.ok) {
      throw new ApiError(
        result.error.includes("super admin") ? 403 : 400,
        result.error,
      );
    }

    return apiJson({ thresholds: result.thresholds });
  } catch (error) {
    return handleApiError(error);
  }
}
