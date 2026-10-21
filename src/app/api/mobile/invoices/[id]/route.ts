import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  readJson,
  requireApiUser,
} from "@/lib/api";
import {
  InvoiceError,
  getInvoice,
  updateInvoiceDraft,
  type InvoiceLineInput,
} from "@/lib/invoices";
import { confirmDeliveryAndUpdateStock } from "@/lib/invoice-receiving";

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
    const result = await getInvoice(user, id);
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
      duplicates: result.duplicates.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        outletName: row.outlet.name,
      })),
      reconciliation: result.reconciliation,
      stockChanged: false,
    });
  } catch (error) {
    if (error instanceof InvoiceError) {
      return handleApiError(new ApiError(error.status, error.message));
    }
    return handleApiError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const body = await readJson<{
      action?: string;
      acknowledgeDuplicates?: boolean;
      acknowledgeSuspectedDuplicates?: boolean;
      allowOverReceipt?: boolean;
      overReceiptReason?: string | null;
      note?: string | null;
      outletId?: string | null;
      supplierId?: string | null;
      supplierTextRaw?: string | null;
      supplierVatRaw?: string | null;
      invoiceNumber?: string | null;
      invoiceDate?: string | null;
      deliveryDate?: string | null;
      currency?: string | null;
      subtotal?: number | null;
      vatAmount?: number | null;
      total?: number | null;
      lines?: InvoiceLineInput[];
      receiveLines?: Array<{
        invoiceLineId?: string;
        quantity: number;
        quantityInStockUnit?: boolean;
        exclude?: boolean;
      }>;
    }>(request);

    if (body.action === "confirmDeliveryAndUpdateStock") {
      // Persist review edits first (no stock yet).
      const draft = await updateInvoiceDraft(user, id, body);
      const receiveLines = (body.receiveLines ?? []).map((line, index) => ({
        invoiceLineId:
          line.invoiceLineId || draft.invoice.lines[index]?.id || "",
        quantity: line.quantity,
        quantityInStockUnit: Boolean(line.quantityInStockUnit),
        exclude: Boolean(line.exclude),
      }));

      const result = await confirmDeliveryAndUpdateStock(user, id, {
        lines: receiveLines.filter((l) => l.invoiceLineId),
        note: body.note ?? null,
        acknowledgeDocumentDuplicates: Boolean(body.acknowledgeDuplicates),
        acknowledgeSuspectedDuplicates: Boolean(
          body.acknowledgeSuspectedDuplicates,
        ),
        allowOverReceipt: Boolean(body.allowOverReceipt),
        overReceiptReason: body.overReceiptReason ?? null,
      });

      return apiJson({
        receivingStatus: result.receivingStatus,
        stockChanged: result.stockChanged,
        pricesChanged: false,
        invoiceStatus: result.invoiceStatus,
        deliveryId: result.delivery?.id ?? null,
        notice: result.stockChanged
          ? "Delivery confirmed and stock updated. Purchase prices were not applied to dish costing."
          : "Invoice confirmed. No stock lines were received.",
      });
    }

    const updated = await updateInvoiceDraft(user, id, body);
    return apiJson({
      invoice: {
        ...updated.invoice,
        invoiceDate: updated.invoice.invoiceDate?.toISOString() ?? null,
        deliveryDate: updated.invoice.deliveryDate?.toISOString() ?? null,
        createdAt: updated.invoice.createdAt.toISOString(),
        updatedAt: updated.invoice.updatedAt.toISOString(),
        confirmedAt: updated.invoice.confirmedAt?.toISOString() ?? null,
        lines: updated.invoice.lines.map((line) => ({
          ...line,
          createdAt: line.createdAt.toISOString(),
          updatedAt: line.updatedAt.toISOString(),
        })),
      },
      duplicates: updated.duplicates.map((row) => row.id),
      reconciliation: updated.reconciliation,
    });
  } catch (error) {
    if (error instanceof InvoiceError) {
      return handleApiError(new ApiError(error.status, error.message));
    }
    return handleApiError(error);
  }
}
