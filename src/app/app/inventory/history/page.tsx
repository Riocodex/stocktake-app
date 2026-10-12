import Link from "next/link";
import type { Metadata } from "next";

import { isSuperAdmin, requireUser, resolveOutletScope } from "@/lib/auth";
import {
  STOCK_MOVEMENT_TYPE,
  STOCK_MOVEMENT_TYPE_LABELS,
  type StockMovementType,
} from "@/lib/constants";
import { formatDateTime, formatQty } from "@/lib/format";
import { getOutlets } from "@/lib/queries";
import { listStockMovements } from "@/lib/stock-movements";
import { prisma } from "@/lib/db";
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

export const metadata: Metadata = { title: "Stock movement history" };

function changeTone(
  change: number,
): "ok" | "warn" | "neutral" {
  if (change > 0) return "ok";
  if (change < 0) return "warn";
  return "neutral";
}

export default async function StockHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    outlet?: string;
    type?: string;
    item?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const scope = resolveOutletScope(user, params.outlet ?? null);
  const superAdmin = isSuperAdmin(user);

  const [outlets, items, movements] = await Promise.all([
    superAdmin ? getOutlets() : Promise.resolve([]),
    prisma.inventoryItem.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, brand: true },
      take: 500,
    }),
    listStockMovements(user, {
      outletId: scope.outletId,
      movementType: params.type,
      itemId: params.item,
      from: params.from,
      to: params.to,
    }),
  ]);

  function href(overrides: Record<string, string | undefined>) {
    const next = new URLSearchParams();
    const merged = {
      outlet: scope.outletId ?? undefined,
      type: params.type,
      item: params.item,
      from: params.from,
      to: params.to,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query
      ? `/app/inventory/history?${query}`
      : "/app/inventory/history";
  }

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
            Stock movement history
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">
            Audit trail of every physical inventory change. Current balances
            still live on outlet stock — this page is for accountability.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {superAdmin ? (
            <OutletSwitcher outlets={outlets} value={scope.outletId} />
          ) : null}
          <ButtonLink href="/app/inventory" variant="secondary">
            Back to inventory
          </ButtonLink>
        </div>
      </header>

      <Card>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {scope.outletId ? (
            <input type="hidden" name="outlet" value={scope.outletId} />
          ) : null}
          <div>
            <label className="eyebrow mb-1.5 block text-ink-muted">Type</label>
            <select
              name="type"
              defaultValue={params.type ?? ""}
              className="w-full rounded-2xl border border-ink/15 bg-white px-3 py-2 text-sm"
            >
              <option value="">All types</option>
              {(Object.keys(STOCK_MOVEMENT_TYPE) as StockMovementType[]).map(
                (type) => (
                  <option key={type} value={type}>
                    {STOCK_MOVEMENT_TYPE_LABELS[type]}
                  </option>
                ),
              )}
            </select>
          </div>
          <div>
            <label className="eyebrow mb-1.5 block text-ink-muted">Item</label>
            <select
              name="item"
              defaultValue={params.item ?? ""}
              className="w-full rounded-2xl border border-ink/15 bg-white px-3 py-2 text-sm"
            >
              <option value="">All products</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.brand ? `${item.brand} ${item.name}` : item.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="eyebrow mb-1.5 block text-ink-muted">From</label>
            <input
              type="date"
              name="from"
              defaultValue={params.from ?? ""}
              className="w-full rounded-2xl border border-ink/15 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="eyebrow mb-1.5 block text-ink-muted">To</label>
            <input
              type="date"
              name="to"
              defaultValue={params.to ?? ""}
              className="w-full rounded-2xl border border-ink/15 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-cream"
            >
              Apply filters
            </button>
            {(params.type || params.item || params.from || params.to) && (
              <Link
                href={href({
                  type: undefined,
                  item: undefined,
                  from: undefined,
                  to: undefined,
                })}
                className="ml-3 text-sm font-semibold text-clay hover:underline"
              >
                Clear
              </Link>
            )}
          </div>
        </form>
      </Card>

      {movements.length === 0 ? (
        <EmptyState
          title="No movements yet"
          description="Deliveries, wastage, transfers and stock-take adjustments appear here as they happen."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <TableShell
            head={
              <>
                <Th>When</Th>
                <Th>Item</Th>
                <Th>Outlet</Th>
                <Th>Type</Th>
                <Th>Change</Th>
                <Th>Before → After</Th>
                <Th>By</Th>
                <Th>Reference</Th>
              </>
            }
          >
            {movements.map((row) => (
              <tr key={row.id} className="border-t border-ink/6">
                <Td className="whitespace-nowrap text-ink-muted">
                  {formatDateTime(row.createdAt)}
                </Td>
                <Td>
                  <Link
                    href={`/app/inventory/${row.itemId}`}
                    className="font-semibold text-ink hover:text-clay"
                  >
                    {row.itemName}
                  </Link>
                </Td>
                <Td className="text-sm text-ink-soft">{row.outletName}</Td>
                <Td>
                  <Badge tone="neutral">{row.movementTypeLabel}</Badge>
                </Td>
                <Td>
                  <Badge tone={changeTone(row.quantityChange)}>
                    {row.quantityChange > 0 ? "+" : ""}
                    {formatQty(row.quantityChange)} {row.unit}
                  </Badge>
                </Td>
                <Td className="text-sm text-ink-soft">
                  {row.balancesVerified ? (
                    <>
                      {formatQty(row.quantityBefore)} →{" "}
                      {formatQty(row.quantityAfter)}
                    </>
                  ) : (
                    <span className="text-ink-muted">Not verified</span>
                  )}
                </Td>
                <Td className="text-sm text-ink-soft">
                  {row.performedBy ?? "—"}
                </Td>
                <Td className="text-sm">
                  {row.href ? (
                    <Link
                      href={row.href}
                      className="font-semibold text-clay hover:underline"
                    >
                      Open
                    </Link>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                  {row.note ? (
                    <p className="mt-0.5 text-xs text-ink-muted">{row.note}</p>
                  ) : null}
                </Td>
              </tr>
            ))}
          </TableShell>
        </Card>
      )}
    </div>
  );
}
