import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isSuperAdmin, requireUser } from "@/lib/auth";
import {
  INVOICE_RECEIVING_STATUS,
  INVOICE_RECEIVING_STATUS_LABELS,
  INVOICE_STATUS,
  INVOICE_STATUS_LABELS,
  type InvoiceReceivingStatus,
  type InvoiceStatus,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { getInvoice, InvoiceError } from "@/lib/invoices";
import { getInvoiceReceivingPreview } from "@/lib/invoice-receiving";
import { getOutlets } from "@/lib/queries";
import { ButtonLink, Card } from "@/components/ui";
import { InvoiceReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Review invoice" };

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const superAdmin = isSuperAdmin(user);

  let payload: Awaited<ReturnType<typeof getInvoice>>;
  try {
    payload = await getInvoice(user, id);
  } catch (error) {
    if (error instanceof InvoiceError && error.status === 404) notFound();
    throw error;
  }

  const { invoice, duplicates, reconciliation } = payload;
  const [outlets, suppliers, items] = await Promise.all([
    superAdmin ? getOutlets() : Promise.resolve([]),
    prisma.supplier.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.inventoryItem.findMany({
      where: { isActive: true },
      select: { id: true, name: true, sku: true, unit: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const isPdf = invoice.fileMimeType === "application/pdf";
  const readOnly = invoice.status === INVOICE_STATUS.CONFIRMED;
  const duplicateWarning =
    duplicates.length > 0
      ? `Likely duplicate of ${duplicates
          .map(
            (row) =>
              `${row.invoiceNumber ?? row.id} (${row.outlet.name}${
                row.invoiceDate
                  ? `, ${row.invoiceDate.toISOString().slice(0, 10)}`
                  : ""
              })`,
          )
          .join("; ")}.`
      : null;

  let suspectedManualWarning: string | null = null;
  if (!readOnly) {
    try {
      const preview = await getInvoiceReceivingPreview(user, invoice.id);
      if (preview.suspectedManualDeliveries.length > 0) {
        suspectedManualWarning = `Possible prior manual delivery (${preview.suspectedManualDeliveries.length}). Link it on the receive page or acknowledge before updating stock.`;
      }
    } catch {
      suspectedManualWarning = null;
    }
  }

  const needsLegacyReceive =
    invoice.status === INVOICE_STATUS.CONFIRMED &&
    invoice.receivingStatus !== INVOICE_RECEIVING_STATUS.FULLY_RECEIVED;

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/app/purchasing/invoices"
          className="text-xs font-semibold text-clay hover:underline"
        >
          ← Invoices
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="display-heading text-3xl text-ink sm:text-4xl">
              Review invoice
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              {invoice.outlet.name} ·{" "}
              {INVOICE_STATUS_LABELS[invoice.status as InvoiceStatus] ??
                invoice.status}
              {invoice.extractionProvider
                ? ` · ${invoice.extractionProvider}`
                : ""}
              {" · Receiving: "}
              {INVOICE_RECEIVING_STATUS_LABELS[
                invoice.receivingStatus as InvoiceReceivingStatus
              ] ?? invoice.receivingStatus}
            </p>
            {!readOnly ? (
              <p className="mt-1 text-xs text-ink-muted">
                Match lines to goods received, then Confirm Delivery &amp; Update
                Stock — one step. Upload and AI extraction never change stock.
              </p>
            ) : null}
          </div>
          {needsLegacyReceive ? (
            <ButtonLink href={`/app/purchasing/invoices/${invoice.id}/receive`}>
              Receive Existing Invoice
            </ButtonLink>
          ) : null}
        </div>
        {invoice.extractionError ? (
          <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {invoice.extractionError}
          </p>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-ink/8 px-4 py-3">
            <p className="eyebrow text-ink-muted">Original document</p>
            <p className="text-xs text-ink-muted">
              {invoice.fileName ?? invoice.fileKey} (authenticated)
            </p>
          </div>
          <div className="bg-cream/40 p-4">
            {isPdf ? (
              <iframe
                title="Invoice PDF"
                src={`/api/invoices/${invoice.id}/file`}
                className="h-[70vh] w-full rounded-xl border border-ink/10 bg-white"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/invoices/${invoice.id}/file`}
                alt="Invoice"
                className="max-h-[70vh] w-full rounded-xl object-contain"
              />
            )}
          </div>
        </Card>

        <Card>
          <InvoiceReviewForm
            invoiceId={invoice.id}
            readOnly={readOnly}
            isSuper={superAdmin}
            outlets={outlets}
            suppliers={suppliers}
            items={items}
            duplicateWarning={duplicateWarning}
            suspectedManualWarning={suspectedManualWarning}
            reconciliationIssues={reconciliation.issues.map((i) => i.message)}
            receivingStatus={invoice.receivingStatus}
            defaults={{
              outletId: invoice.outletId,
              supplierId: invoice.supplierId,
              supplierTextRaw: invoice.supplierTextRaw,
              supplierVatRaw: invoice.supplierVatRaw,
              invoiceNumber: invoice.invoiceNumber,
              invoiceDate: invoice.invoiceDate
                ? invoice.invoiceDate.toISOString().slice(0, 10)
                : null,
              deliveryDate: invoice.deliveryDate
                ? invoice.deliveryDate.toISOString().slice(0, 10)
                : null,
              currency: invoice.currency,
              subtotal: invoice.subtotal,
              vatAmount: invoice.vatAmount,
              total: invoice.total,
              lines: invoice.lines.map((line) => ({
                key: line.id,
                rawDescription: line.rawDescription,
                itemId: line.itemId ?? "",
                quantity:
                  line.quantity === null || line.quantity === undefined
                    ? ""
                    : String(line.quantity),
                unit: line.unit ?? "",
                unitPrice:
                  line.unitPrice === null || line.unitPrice === undefined
                    ? ""
                    : String(line.unitPrice),
                lineTotal:
                  line.lineTotal === null || line.lineTotal === undefined
                    ? ""
                    : String(line.lineTotal),
                needsReview: line.needsReview,
                receivedQty:
                  line.excludeFromReceiving ||
                  line.quantity === null ||
                  line.quantity === undefined
                    ? ""
                    : String(line.quantity),
                exclude: line.excludeFromReceiving,
              })),
            }}
          />
        </Card>
      </div>
    </div>
  );
}
