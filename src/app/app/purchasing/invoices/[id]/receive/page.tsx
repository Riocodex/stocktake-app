import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import {
  INVOICE_RECEIVING_STATUS_LABELS,
  INVOICE_STATUS,
  type InvoiceReceivingStatus,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { InvoiceError } from "@/lib/invoices";
import { getInvoiceReceivingPreview } from "@/lib/invoice-receiving";
import { ButtonLink, Card } from "@/components/ui";
import { ReceiveFromInvoiceForm } from "./receive-form";
import { MatchLineForm } from "./match-form";

export const metadata: Metadata = { title: "Receive from invoice" };

export default async function ReceiveFromInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  let preview: Awaited<ReturnType<typeof getInvoiceReceivingPreview>>;
  try {
    preview = await getInvoiceReceivingPreview(user, id);
  } catch (error) {
    if (error instanceof InvoiceError && error.status === 404) notFound();
    throw error;
  }

  if (preview.invoice.status !== INVOICE_STATUS.CONFIRMED) {
    return (
      <div className="space-y-4">
        <Link
          href={`/app/purchasing/invoices/${id}`}
          className="text-xs font-semibold text-clay hover:underline"
        >
          ← Invoice
        </Link>
        <Card>
          <p className="text-sm text-ink-muted">
            Use <strong>Confirm Delivery &amp; Update Stock</strong> on the
            invoice review screen for new scans. This page is only for invoices
            already confirmed without receiving stock.
          </p>
          <ButtonLink
            href={`/app/purchasing/invoices/${id}`}
            className="mt-3"
          >
            Open invoice review
          </ButtonLink>
        </Card>
      </div>
    );
  }

  const items = await prisma.inventoryItem.findMany({
    where: { isActive: true },
    select: { id: true, name: true, sku: true, unit: true },
    orderBy: { name: "asc" },
  });

  const suspected = await Promise.all(
    preview.suspectedManualDeliveries.map(async (row) => {
      const delivery = await prisma.delivery.findUnique({
        where: { id: row.id },
        include: {
          lines: {
            include: { item: { select: { name: true } } },
          },
        },
      });
      return {
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        userName: row.userName,
        overlappingItems: row.overlappingItems,
        risk: row.risk,
        lines: (delivery?.lines ?? []).map((line) => ({
          id: line.id,
          itemId: line.itemId,
          quantity: line.quantity,
          itemName: line.item.name,
        })),
      };
    }),
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href={`/app/purchasing/invoices/${id}`}
            className="text-xs font-semibold text-clay hover:underline"
          >
            ← Invoice
          </Link>
          <h1 className="display-heading mt-3 text-3xl text-ink sm:text-4xl">
            Receive Existing Invoice
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">
            {preview.invoice.outletName}
            {preview.invoice.supplierName
              ? ` · ${preview.invoice.supplierName}`
              : ""}
            {preview.invoice.invoiceNumber
              ? ` · #${preview.invoice.invoiceNumber}`
              : ""}
          </p>
          <p className="mt-2 text-sm font-semibold text-ink">
            Receiving:{" "}
            {INVOICE_RECEIVING_STATUS_LABELS[
              preview.invoice.receivingStatus as InvoiceReceivingStatus
            ] ?? preview.invoice.receivingStatus}
            <span className="font-normal text-ink-muted">
              {" "}
              · Document: Confirmed (unchanged by receiving)
            </span>
          </p>
        </div>
        <ButtonLink href={`/app/purchasing/invoices/${id}`} variant="secondary">
          View document
        </ButtonLink>
      </header>

      <Card className="space-y-4">
        <h2 className="text-lg font-bold text-ink">Match unmatched lines</h2>
        <p className="text-xs text-ink-muted">
          Only matched inventory items can increase stock. Non-stock charges can
          be excluded on the form below.
        </p>
        {preview.lines
          .filter((line) => !line.itemId && !line.excludeFromReceiving)
          .map((line) => (
            <MatchLineForm
              key={line.invoiceLineId}
              invoiceId={id}
              invoiceLineId={line.invoiceLineId}
              description={line.rawDescription}
              items={items}
            />
          ))}
        {preview.lines.every((l) => l.itemId || l.excludeFromReceiving) ? (
          <p className="text-sm text-ink-muted">All lines are matched or excluded.</p>
        ) : null}
      </Card>

      <Card>
        <ReceiveFromInvoiceForm
          invoiceId={id}
          lines={preview.lines}
          suspected={suspected}
          invoiceLinesForMap={preview.lines.map((line) => ({
            id: line.invoiceLineId,
            itemId: line.itemId,
            label: `${line.rawDescription}${
              line.itemName ? ` → ${line.itemName}` : ""
            }`,
          }))}
        />
      </Card>

      {preview.linkedDeliveries.length > 0 ? (
        <Card>
          <h2 className="text-lg font-bold text-ink">Linked deliveries</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-muted">
            {preview.linkedDeliveries.map((delivery) => (
              <li key={delivery.id}>
                {delivery.createdAt.toISOString().slice(0, 16).replace("T", " ")}{" "}
                · {delivery.user.name}
                {delivery.linkedWithoutStock ? " · linked (no stock)" : " · stock added"}
                {" · "}
                {delivery.lines.length} line(s)
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
