import { NextRequest } from "next/server";

import { apiJson, apiOptions, handleApiError } from "@/lib/api";
import { requireAntaresToken } from "@/lib/antares-auth";
import { buildTribeSummary } from "@/lib/antares-ops";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: NextRequest) {
  try {
    requireAntaresToken(request);
    return apiJson(await buildTribeSummary());
  } catch (error) {
    return handleApiError(error);
  }
}
