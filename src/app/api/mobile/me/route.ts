import { apiJson, apiOptions, handleApiError, requireApiUser } from "@/lib/api";

export function OPTIONS() {
  return apiOptions();
}

export async function GET() {
  try {
    const user = await requireApiUser();
    return apiJson({ user });
  } catch (error) {
    return handleApiError(error);
  }
}
