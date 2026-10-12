import Link from "next/link";
import type { Metadata } from "next";

import { isSuperAdmin, requireUser, resolveOutletScope } from "@/lib/auth";
import {
  TRANSFER_STATUS,
  TRANSFER_STATUS_LABELS,
  type TransferStatus,
} from "@/lib/constants";
import { formatDateTime, formatQty } from "@/lib/format";
import { getOutlets } from "@/lib/queries";
import { listTransfers } from "@/lib/transfers";
import { OutletSwitcher } from "@/components/app/outlet-switcher";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  TableShell,
  Td,
  Th,
} from "@/components/ui";

export const metadata: Metadata = { title: "Transfers" };

function statusTone(status: string): "warn" | "clay" | "ok" | "neutral" {
  if (status === TRANSFER_STATUS.DRAFT) return "warn";
  if (status === TRANSFER_STATUS.SENT) return "clay";
  if (status === TRANSFER_STATUS.RECEIVED) return "ok";
  return "neutral";
}

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{
    outlet?: string;
    direction?: string;
    status?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const scope = resolveOutletScope(user, params.outlet ?? null);
  const superAdmin = isSuperAdmin(user);
  const direction = (params.direction ?? "all") as
    | "all"
    | "incoming"
    | "outgoing"
    | "drafts";

  const [outlets, transfers] = await Promise.all([
    superAdmin ? getOutlets() : Promise.resolve([]),
    listTransfers(user, {
      outletId: scope.outletId,
      direction,
      status: params.status,
    }),
  ]);

  function href(overrides: Record<string, string | undefined>) {
    const next = new URLSearchParams();
    const merged = {
      outlet: scope.outletId ?? undefined,
      direction,
      status: params.status,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query
      ? `/app/inventory/transfers?${query}`
      : "/app/inventory/transfers";
  }

  const tabs: { id: typeof direction; label: string }[] = [
    { id: "all", label: "All" },
    { id: "drafts", label: "Drafts" },
    { id: "outgoing", label: "Outgoing" },
    { id: "incoming", label: "Incoming" },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/app/inventory"
            className="text-xs font-semibold text-clay hover:underline"
          >
            ← Inventory
          </Link>
          <h1 className="display-heading mt-3 text-3xl text-ink sm:text-4xl">
            Transfers
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">
            Move stock between outlets. Drafts leave inventory untouched; sending
            deducts the source; receiving adds to the destination.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {superAdmin ? (
            <OutletSwitcher outlets={outlets} value={scope.outletId} />
          ) : null}
          <ButtonLink href="/app/inventory/transfers/new">
            New transfer
          </ButtonLink>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={href({ direction: tab.id === "all" ? undefined : tab.id })}
            className={
              direction === tab.id
                ? "rounded-pill bg-ink px-4 py-1.5 text-xs font-bold text-cream"
                : "rounded-pill border border-ink/15 px-4 py-1.5 text-xs font-bold text-ink-soft transition hover:border-clay hover:text-clay"
            }
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {transfers.length === 0 ? (
        <EmptyState
          title="No transfers yet"
          description="Create a draft when one outlet needs to send stock to another."
          action={
            <ButtonLink href="/app/inventory/transfers/new">
              New transfer
            </ButtonLink>
          }
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <TableShell
            head={
              <>
                <Th>Reference</Th>
                <Th>Route</Th>
                <Th>Items</Th>
                <Th>Status</Th>
                <Th>Updated</Th>
              </>
            }
          >
            {transfers.map((row) => (
              <tr key={row.id} className="border-t border-ink/6">
                <Td>
                  <Link
                    href={`/app/inventory/transfers/${row.id}`}
                    className="font-semibold text-ink hover:text-clay"
                  >
                    {row.reference}
                  </Link>
                  {row.hasDiscrepancy ? (
                    <p className="mt-0.5 text-xs font-semibold text-amber-800">
                      Discrepancy recorded
                    </p>
                  ) : null}
                </Td>
                <Td className="text-sm text-ink-soft">
                  {row.fromOutletName} → {row.toOutletName}
                </Td>
                <Td className="max-w-sm">
                  <ul className="space-y-1 text-sm text-ink-soft">
                    {row.lines.slice(0, 4).map((line) => {
                      const shown =
                        line.receivedQty !== null
                          ? line.receivedQty
                          : line.sentQty;
                      return (
                        <li key={line.id}>
                          <span className="font-semibold text-ink">
                            {formatQty(shown)} {line.unit}
                          </span>{" "}
                          {line.name}
                          {line.receivedQty !== null &&
                          line.receivedQty !== line.sentQty ? (
                            <span className="text-xs text-amber-800">
                              {" "}
                              · sent {formatQty(line.sentQty)}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  {row.lineCount > 4 ? (
                    <p className="mt-1 text-xs text-ink-muted">
                      +{row.lineCount - 4} more
                    </p>
                  ) : null}
                </Td>
                <Td>
                  <Badge tone={statusTone(row.status)}>
                    {TRANSFER_STATUS_LABELS[row.status as TransferStatus] ??
                      row.status}
                  </Badge>
                </Td>
                <Td className="whitespace-nowrap text-ink-muted">
                  {formatDateTime(
                    row.receivedAt ?? row.sentAt ?? row.cancelledAt ?? row.createdAt,
                  )}
                </Td>
              </tr>
            ))}
          </TableShell>
        </Card>
      )}
    </div>
  );
}
