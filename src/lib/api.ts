import { NextResponse } from "next/server";

import { getCurrentUser, type SessionUser } from "@/lib/auth";
import { CORS_HEADERS } from "@/lib/cors";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function apiJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export function apiOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    return apiJson({ error: error.message }, error.status);
  }
  const message =
    error instanceof Error ? error.message : "Something went wrong.";
  return apiJson({ error: message }, 400);
}

export async function requireApiUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "Not signed in.");
  return user;
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, "Send JSON in the request body.");
  }
}
