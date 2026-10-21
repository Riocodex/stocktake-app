import Link from "next/link";
import type { Metadata } from "next";

import { isSuperAdmin, requireUser } from "@/lib/auth";
import {
  INVOICE_RECEIVING_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  type InvoiceReceivingStatus,
  type InvoiceStatus,
} from "@/lib/constants";
import { listInvoices } from "@/lib/invoices";
import { isInvoiceAiConfigured } from "@/lib/invoice-ai";
import { ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Invoices" };

function money(value: number | null | undefined, currency = "EUR") {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-MT", {
    style: "currency",
    currency,
  }).format(value);
}

export default async function InvoicesPage() {
  const user = await requireUser();
  const invoices = await listInvoices(user);
  const aiOn = isInvoiceAiConfigured();

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/app/purchasing"
            className="text-xs font-semibold text-clay hover:underline"
          >
            ← Purchasing
          </Link>
          <h1 className="display-heading mt-3 text-3xl text-ink sm:text-4xl">
            Invoices
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">
            Photograph or upload supplier invoices, review AI extraction, then
            confirm the document. Confirmation does not receive stock or change
            costing prices.
          </p>
        </div>
        <ButtonLink href="/app/purchasing/invoices/upload">
          Upload invoice
        </ButtonLink>
      </header>

      <p className="rounded-2xl border border-ink/10 bg-cream/60 px-4 py-3 text-xs text-ink-muted">
        {aiOn
          ? "Using OpenAI vision for extraction."
          : "Simulation mode — set OPENAI_API_KEY for real extraction. Upload and review still work."}
        {isSuperAdmin(user) ? " · Viewing all outlets." : null}
      </p>

      <div className="overflow-x-auto rounded-3xl border border-ink/8 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-ink/8 text-[11px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Document</th>
              <th className="px-4 py-3 font-semibold">Receiving</th>
              <th className="px-4 py-3 font-semibold">Supplier</th>
              <th className="px-4 py-3 font-semibold">Outlet</th>
              <th className="px-4 py-3 font-semibold">Number</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Total</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="border-b border-ink/5">
                <td className="px-4 py-3">
                  <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-semibold">
                    {INVOICE_STATUS_LABELS[invoice.status as InvoiceStatus] ??
                      invoice.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-ink-muted">
                  {INVOICE_RECEIVING_STATUS_LABELS[
                    invoice.receivingStatus as InvoiceReceivingStatus
                  ] ?? invoice.receivingStatus}
                </td>
                <td className="px-4 py-3 text-ink">
                  {invoice.supplier?.name ??
                    invoice.supplierTextRaw ??
                    "—"}
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  {invoice.outlet.name}
                </td>
                <td className="px-4 py-3">{invoice.invoiceNumber ?? "—"}</td>
                <td className="px-4 py-3 text-ink-muted">
                  {invoice.invoiceDate
                    ? invoice.invoiceDate.toISOString().slice(0, 10)
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  {money(invoice.total, invoice.currency)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/app/purchasing/invoices/${invoice.id}`}
                    className="text-xs font-semibold text-clay hover:underline"
                  >
                    Review →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices.length === 0 ? (
          <p className="px-4 py-8 text-sm text-ink-muted">
            No invoices yet. Upload a photo or PDF to start.
          </p>
        ) : null}
      </div>

      <Card>
        <p className="text-sm text-ink-muted">
          After goods arrive, record quantities under{" "}
          <Link href="/app/inventory/delivery" className="font-semibold text-clay">
            Deliveries
          </Link>
          . That is separate from confirming an invoice document.
        </p>
      </Card>
    </div>
  );
}
