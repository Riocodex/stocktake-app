import { NextRequest } from "next/server";

import { createSession, loginWithPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { apiJson, apiOptions, handleApiError, readJson } from "@/lib/api";

export function OPTIONS() {
  return apiOptions();
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJson<{ email?: string; password?: string }>(request);
    const result = await loginWithPassword(body.email ?? "", body.password ?? "");
    if (!result.ok) {
      return apiJson({ error: result.error }, 401);
    }

    const token = await createSession(result.user.id);
    await prisma.activityLog.create({
      data: {
        userId: result.user.id,
        outletId: result.user.outletId,
        action: "LOGIN",
        detail: `${result.user.email} · app`,
      },
    });

    return apiJson({ token, user: result.user });
  } catch (error) {
    return handleApiError(error);
  }
}
