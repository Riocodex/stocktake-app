import { NextRequest } from "next/server";

import { ApiError } from "@/lib/api";

/**
 * Shared service secret for Antares → TRiBE read-only ops calls.
 * Must match Antares `TRIBE_ANTARES_TOKEN`. Never log or return this value.
 */
export function requireAntaresToken(request: NextRequest): void {
  const expected = (process.env.ANTARES_API_TOKEN || "").trim();
  if (!expected) {
    throw new ApiError(503, "antares_token_unconfigured");
  }

  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const provided = match?.[1]?.trim() ?? "";
  if (!provided || provided !== expected) {
    throw new ApiError(401, "unauthorized");
  }
}
