import Link from "next/link";
import type { Metadata } from "next";

import { OutletSwitcher } from "@/components/app/outlet-switcher";
import {
  Badge,
  Card,
  EmptyState,
  StockBar,
  TableShell,
  Td,
  Th,
} from "@/components/ui";
import { isSuperAdmin, requireUser, resolveOutletScope } from "@/lib/auth";
import { formatMoney, formatQty } from "@/lib/format";
import { getLowStock, getOutlets, type LowStockRow } from "@/lib/queries";

export const metadata: Metadata = { title: "Needs reordering" };

export default async function ReorderPage({
  searchParams,
}: {
  searchParams: Promise<{ outlet?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const scope = resolveOutletScope(user, params.outlet ?? null);
  const superAdmin = isSuperAdmin(user);

  const [outlets, lowStock] = await Promise.all([
    superAdmin ? getOutlets() : Promise.resolve([]),
    getLowStock(scope.outletId, 500),
  ]);

  const scopeName = scope.outletId
    ? (outlets.find((outlet) => outlet.id === scope.outletId)?.name ??
      user.outletName ??
      "Your outlet")
    : "All outlets";

  const grouped = new Map<string, { outletName: string; rows: LowStockRow[] }>();
  for (const row of lowStock.rows) {
    const existing = grouped.get(row.outletId);
    if (existing) {
      existing.rows.push(row);
    } else {
      grouped.set(row.outletId, {
        outletName: row.outletName,
        rows: [row],
      });
    }
  }

  const sections = [...grouped.entries()].sort((a, b) =>
    a[1].outletName.localeCompare(b[1].outletName),
  );

  const reorderHref = (outletId?: string | null) => {
    if (outletId) return `/app/inventory/reorder?outlet=${outletId}`;
    return "/app/inventory/reorder";
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={
              scope.outletId
                ? `/app?outlet=${scope.outletId}`
                : "/app"
            }
            className="text-xs font-semibold text-clay hover:underline"
          >
            ← Dashboard
          </Link>
          <h1 className="display-heading mt-3 text-3xl text-ink sm:text-4xl">
            Needs reordering
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">
            {lowStock.total === 0
              ? `Nothing is below threshold at ${scopeName}.`
              : `${lowStock.total} stock position${lowStock.total === 1 ? "" : "s"} at or below reorder threshold at ${scopeName}.`}
          </p>
        </div>
        {superAdmin ? (
          <OutletSwitcher outlets={outlets} value={scope.outletId} />
        ) : null}
      </header>

      {lowStock.total === 0 ? (
        <EmptyState
          title="Nothing to reorder"
          description="Every tracked item is comfortably above its threshold."
        />
      ) : (
        <div className="space-y-8">
          {sections.map(([outletId, section]) => (
            <section key={outletId} className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-ink">
                    {section.outletName}
                  </h2>
                  <p className="text-xs text-ink-muted">
                    {section.rows.length} item
                    {section.rows.length === 1 ? "" : "s"} to reorder
                  </p>
                </div>
                {superAdmin && !scope.outletId ? (
                  <Link
                    href={reorderHref(outletId)}
                    className="text-xs font-semibold text-clay hover:underline"
                  >
                    View this outlet only
                  </Link>
                ) : null}
              </div>

              <TableShell
                head={
                  <>
                    <Th>Product</Th>
                    <Th>Category</Th>
                    <Th className="text-right">On hand</Th>
                    <Th className="text-right">Par</Th>
                    <Th className="text-right">Threshold</Th>
                    <Th className="text-right">Value</Th>
                    <Th>Level</Th>
                  </>
                }
              >
                {section.rows.map((row) => {
                  const ratio =
                    row.parLevel > 0 ? row.quantity / row.parLevel : 0;
                  const out = row.quantity <= 0;
                  return (
                    <tr
                      key={`${row.outletId}-${row.itemId}`}
                      className="border-t border-ink/6"
                    >
                      <Td>
                        <Link
                          href={`/app/inventory/${row.itemId}`}
                          className="font-semibold text-ink hover:text-clay"
                        >
                          {row.name}
                        </Link>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {row.sku}
                        </p>
                      </Td>
                      <Td className="text-ink-soft">{row.category}</Td>
                      <Td className="text-right tabular-nums font-semibold">
                        {formatQty(row.quantity)}{" "}
                        <span className="text-xs font-normal text-ink-muted">
                          {row.unit}
                        </span>
                      </Td>
                      <Td className="text-right tabular-nums text-ink-soft">
                        {formatQty(row.parLevel)}
                      </Td>
                      <Td className="text-right tabular-nums text-ink-soft">
                        {row.threshold > 0 ? formatQty(row.threshold) : "—"}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {formatMoney(row.value)}
                      </Td>
                      <Td>
                        <div className="flex min-w-[7rem] flex-col gap-1.5">
                          <Badge tone={out ? "danger" : "warn"}>
                            {out ? "Out of stock" : "Low"}
                          </Badge>
                          <StockBar ratio={ratio} />
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </TableShell>
            </section>
          ))}
        </div>
      )}

      {superAdmin && scope.outletId ? (
        <Card className="p-4 text-sm text-ink-muted">
          Showing one outlet.{" "}
          <Link
            href="/app/inventory/reorder"
            className="font-semibold text-clay hover:underline"
          >
            See every outlet
          </Link>
        </Card>
      ) : null}
    </div>
  );
}
