import { NextResponse } from "next/server";

import {
  apiOptions,
  ApiError,
  handleApiError,
  requireApiUser,
} from "@/lib/api";
import { CORS_HEADERS } from "@/lib/cors";
import { InvoiceError, getInvoiceFile } from "@/lib/invoices";

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
    const file = await getInvoiceFile(user, id);

    return new NextResponse(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${file.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof InvoiceError) {
      return handleApiError(new ApiError(error.status, error.message));
    }
    return handleApiError(error);
  }
}
