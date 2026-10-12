import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { isSuperAdmin, requireUser } from "@/lib/auth";
import {
  TRANSFER_STATUS,
  TRANSFER_STATUS_LABELS,
  type TransferStatus,
} from "@/lib/constants";
import { formatDateTime, formatQty } from "@/lib/format";
import { getTransfer } from "@/lib/transfers";
import {
  Badge,
  Card,
  TableShell,
  Td,
  Th,
} from "@/components/ui";
import {
  TransferDraftActions,
  TransferReceiveForm,
} from "./transfer-actions";

export const metadata: Metadata = { title: "Transfer" };

function statusTone(status: string): "warn" | "clay" | "ok" | "neutral" {
  if (status === TRANSFER_STATUS.DRAFT) return "warn";
  if (status === TRANSFER_STATUS.SENT) return "clay";
  if (status === TRANSFER_STATUS.RECEIVED) return "ok";
  return "neutral";
}

export default async function TransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const result = await getTransfer(user, id);
  if (!result.ok) notFound();
  const transfer = result.transfer;
  const superAdmin = isSuperAdmin(user);

  const canSend =
    transfer.status === TRANSFER_STATUS.DRAFT &&
    (superAdmin || user.outletId === transfer.fromOutletId);
  const canReceive =
    transfer.status === TRANSFER_STATUS.SENT &&
    (superAdmin || user.outletId === transfer.toOutletId);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/app/inventory/transfers"
            className="text-xs font-semibold text-clay hover:underline"
          >
            ← Transfers
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="display-heading text-3xl text-ink sm:text-4xl">
              {transfer.reference}
            </h1>
            <Badge tone={statusTone(transfer.status)}>
              {TRANSFER_STATUS_LABELS[transfer.status as TransferStatus] ??
                transfer.status}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            {transfer.fromOutletName} → {transfer.toOutletName}
          </p>
        </div>
      </header>

      {transfer.imageUrl ? (
        <Card className="overflow-hidden p-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={transfer.imageUrl}
            alt={`Photo for ${transfer.reference}`}
            className="max-h-64 w-full object-cover"
          />
        </Card>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="eyebrow text-ink-muted">Created</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {transfer.createdBy}
          </p>
          <p className="text-xs text-ink-muted">
            {formatDateTime(transfer.createdAt)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="eyebrow text-ink-muted">Sent</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {transfer.sentBy ?? "—"}
          </p>
          <p className="text-xs text-ink-muted">
            {transfer.sentAt ? formatDateTime(transfer.sentAt) : "Not sent"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="eyebrow text-ink-muted">Received</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {transfer.receivedBy ?? "—"}
          </p>
          <p className="text-xs text-ink-muted">
            {transfer.receivedAt
              ? formatDateTime(transfer.receivedAt)
              : "Awaiting receipt"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="eyebrow text-ink-muted">Note</p>
          <p className="mt-1 text-sm text-ink-soft whitespace-pre-wrap">
            {transfer.note || "—"}
          </p>
        </Card>
      </section>

      <Card className="overflow-hidden p-0">
        <TableShell
          head={
            <>
              <Th>Product</Th>
              <Th>Sent</Th>
              <Th>Received</Th>
              <Th>Difference</Th>
              <Th>Note</Th>
            </>
          }
        >
          {transfer.lines.map((line) => (
            <tr key={line.id} className="border-t border-ink/6">
              <Td>
                <Link
                  href={`/app/inventory/${line.itemId}`}
                  className="font-semibold text-ink hover:text-clay"
                >
                  {line.name}
                </Link>
              </Td>
              <Td>
                {formatQty(line.sentQty)} {line.unit}
              </Td>
              <Td>
                {line.receivedQty === null
                  ? "—"
                  : `${formatQty(line.receivedQty)} ${line.unit}`}
              </Td>
              <Td
                className={
                  line.discrepancy && line.discrepancy !== 0
                    ? "font-semibold text-amber-800"
                    : "text-ink-muted"
                }
              >
                {line.discrepancy === null
                  ? "—"
                  : `${line.discrepancy > 0 ? "+" : ""}${formatQty(line.discrepancy)}`}
              </Td>
              <Td className="text-sm text-ink-muted">
                {line.discrepancyNote || "—"}
              </Td>
            </tr>
          ))}
        </TableShell>
      </Card>

      {canSend ? (
        <Card>
          <h2 className="text-lg font-bold text-ink">Send this transfer</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Sending deducts these quantities from {transfer.fromOutletName}{" "}
            immediately. Destination stock does not increase until they confirm
            receipt.
          </p>
          <div className="mt-4">
            <TransferDraftActions transferId={transfer.id} />
          </div>
        </Card>
      ) : null}

      {canReceive ? (
        <Card>
          <h2 className="text-lg font-bold text-ink">Confirm receipt</h2>
          <div className="mt-4">
            <TransferReceiveForm
              transferId={transfer.id}
              lines={transfer.lines.map((line) => ({
                itemId: line.itemId,
                name: line.name,
                unit: line.unit,
                sentQty: line.sentQty,
              }))}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
