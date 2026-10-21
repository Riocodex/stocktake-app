import {
  apiJson,
  apiOptions,
  ApiError,
  handleApiError,
  readJson,
  requireApiUser,
} from "@/lib/api";
import { InvoiceError } from "@/lib/invoices";
import {
  getInvoiceReceivingPreview,
  linkManualDeliveryToInvoice,
  receiveGoodsFromInvoice,
  setInvoiceLineReceivingFlags,
} from "@/lib/invoice-receiving";

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
    const preview = await getInvoiceReceivingPreview(user, id);
    return apiJson({
      ...preview,
      invoice: {
        ...preview.invoice,
        invoiceDate: preview.invoice.invoiceDate?.toISOString() ?? null,
      },
      linkedDeliveries: preview.linkedDeliveries.map((d) => ({
        id: d.id,
        createdAt: d.createdAt.toISOString(),
        linkedWithoutStock: d.linkedWithoutStock,
        userName: d.user.name,
        lineCount: d.lines.length,
      })),
      suspectedManualDeliveries: preview.suspectedManualDeliveries.map((d) => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof InvoiceError) {
      return handleApiError(new ApiError(error.status, error.message));
    }
    return handleApiError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const body = await readJson<{
      action?: string;
      lines?: Array<{
        invoiceLineId: string;
        quantity: number;
        quantityInStockUnit?: boolean;
        exclude?: boolean;
      }>;
      note?: string;
      allowOverReceipt?: boolean;
      overReceiptReason?: string;
      acknowledgeSuspectedDuplicates?: boolean;
      deliveryId?: string;
      mappings?: Array<{ deliveryLineId: string; invoiceLineId: string }>;
      matchUpdates?: Array<{
        invoiceLineId: string;
        itemId?: string | null;
        excludeFromReceiving?: boolean;
      }>;
    }>(request);

    if (body.action === "link") {
      const linked = await linkManualDeliveryToInvoice(
        user,
        id,
        String(body.deliveryId ?? ""),
        body.mappings ?? [],
      );
      return apiJson({
        ...linked,
        notice: "Delivery linked without adding stock.",
      });
    }

    if (body.action === "match") {
      const preview = await setInvoiceLineReceivingFlags(
        user,
        id,
        body.matchUpdates ?? [],
      );
      return apiJson({ preview });
    }

    const result = await receiveGoodsFromInvoice(user, id, {
      lines: body.lines ?? [],
      note: body.note ?? null,
      allowOverReceipt: Boolean(body.allowOverReceipt),
      overReceiptReason: body.overReceiptReason ?? null,
      acknowledgeSuspectedDuplicates: Boolean(
        body.acknowledgeSuspectedDuplicates,
      ),
      // Legacy path for invoices already confirmed without stock.
      confirmDocument: false,
    });

    return apiJson({
      receivingStatus: result.receivingStatus,
      stockChanged: result.stockChanged,
      pricesChanged: false,
      invoiceStatus: result.invoiceStatus,
      deliveryId: result.delivery?.id ?? null,
      notice: result.stockChanged
        ? "Existing invoice received into stock. Dish costing prices unchanged."
        : "No stock change.",
    });
  } catch (error) {
    if (error instanceof InvoiceError) {
      return handleApiError(new ApiError(error.status, error.message));
    }
    return handleApiError(error);
  }
}
