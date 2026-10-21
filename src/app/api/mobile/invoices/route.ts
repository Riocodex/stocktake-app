import { NextRequest } from "next/server";

import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  requireApiUser,
} from "@/lib/api";
import { InvoiceError, listInvoices, uploadInvoice } from "@/lib/invoices";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const status = request.nextUrl.searchParams.get("status");
    const outletId = request.nextUrl.searchParams.get("outlet");
    const invoices = await listInvoices(user, { status, outletId });
    return apiJson({
      invoices: invoices.map((row) => ({
        ...row,
        invoiceDate: row.invoiceDate?.toISOString() ?? null,
        deliveryDate: row.deliveryDate?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        confirmedAt: row.confirmedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    if (error instanceof InvoiceError) {
      return handleApiError(new ApiError(error.status, error.message));
    }
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const form = await request.formData();
    const outletId = String(form.get("outletId") ?? "").trim() || null;
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new ApiError(400, "Choose an invoice photo or PDF.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await uploadInvoice(user, {
      outletId,
      bytes,
      mimeType: file.type || "image/jpeg",
      originalName: file.name,
    });

    return apiJson({
      invoice: {
        ...result.invoice,
        invoiceDate: result.invoice.invoiceDate?.toISOString() ?? null,
        deliveryDate: result.invoice.deliveryDate?.toISOString() ?? null,
        createdAt: result.invoice.createdAt.toISOString(),
        updatedAt: result.invoice.updatedAt.toISOString(),
        confirmedAt: result.invoice.confirmedAt?.toISOString() ?? null,
        lines: result.invoice.lines.map((line) => ({
          ...line,
          createdAt: line.createdAt.toISOString(),
          updatedAt: line.updatedAt.toISOString(),
        })),
      },
      duplicates: result.duplicates.map((row) => row.id),
      reconciliation: result.reconciliation,
      stockChanged: false,
      notice:
        "Extraction is a draft. Confirming later saves the document only — no stock change.",
    });
  } catch (error) {
    if (error instanceof InvoiceError) {
      return handleApiError(new ApiError(error.status, error.message));
    }
    return handleApiError(error);
  }
}
