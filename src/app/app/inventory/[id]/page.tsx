import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { isSuperAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, formatMoney, formatQty, formatRelative } from "@/lib/format";
import {
  Badge,
  Card,
  StatCard,
  StockBar,
  TableShell,
  Td,
  Th,
} from "@/components/ui";
import { ReceiveForm } from "./receive-form";

export const metadata: Metadata = { title: "Product" };

export default async function InventoryItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const superAdmin = isSuperAdmin(user);

  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    include: {
      category: true,
      // Outlet admins only ever see their own venue's position.
      outletStock: {
        where: superAdmin ? undefined : { outletId: user.outletId ?? "" },
        include: { outlet: true },
        orderBy: { outlet: { name: "asc" } },
      },
      priceHistory: {
        where: superAdmin ? undefined : { OR: [{ outletId: user.outletId }, { outletId: null }] },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { outlet: { select: { name: true } } },
      },
    },
  });

  if (!item) notFound();

  const recentLines = await prisma.stockTakeLine.findMany({
    where: {
      itemId: id,
      ...(superAdmin
        ? {}
        : { stockTake: { outletId: user.outletId ?? "" } }),
    },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: {
      stockTake: {
        select: {
          reference: true,
          id: true,
          submittedAt: true,
          createdAt: true,
          outlet: { select: { name: true } },
        },
      },
    },
  });

  const totalQty = item.outletStock.reduce(
    (sum, row) => sum + row.quantity,
    0,
  );
  const totalValue = item.outletStock.reduce(
    (sum, row) => sum + row.quantity * row.unitPrice,
    0,
  );
  const averagePrice = totalQty > 0 ? totalValue / totalQty : item.referencePrice;

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/app/inventory"
          className="text-xs font-semibold text-clay hover:underline"
        >
          ← Inventory
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-start gap-4">
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.imageUrl}
                alt=""
                className="h-20 w-20 rounded-2xl object-cover"
              />
            ) : null}
            <div>
              <p className="eyebrow text-clay">{item.category.name}</p>
              <h1 className="display-heading mt-2 text-3xl text-ink sm:text-4xl">
                {item.brand ? `${item.brand} ` : ""}
                {item.name}
              </h1>
              <p className="mt-2 text-sm text-ink-muted">
                {item.sku} · counted in {item.unit}
                {item.packSize ? ` · ${item.packSize}` : ""}
                {item.supplierPackQty
                  ? ` · supplier pack ${item.supplierPackQty} ${item.unit}`
                  : ""}
              </p>
            </div>
          </div>
          {item.isActive ? (
            <Badge tone="ok">Active</Badge>
          ) : (
            <Badge tone="neutral">Archived</Badge>
          )}
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={superAdmin ? "Total on hand" : "On hand"}
          value={`${formatQty(totalQty)} ${item.unit}`}
        />
        <StatCard label="Stock value" value={formatMoney(totalValue)} tone="ink" />
        <StatCard
          label="Average price"
          value={formatMoney(averagePrice)}
          hint={`Reference ${formatMoney(item.referencePrice)}`}
          tone="sage"
        />
        <StatCard
          label="Reorder threshold"
          value={formatQty(item.lowStockThreshold)}
          hint={`Par level ${formatQty(item.parLevel)}`}
          tone="clay"
        />
      </section>

      {user.outletId ? (
        <Card>
          <p className="eyebrow text-ink-muted">Supplier just delivered?</p>
          <p className="mt-1 mb-4 text-xs text-ink-muted">
            Add incoming quantity to live stock. Set an expiry if the batch has
            one.
          </p>
          <ReceiveForm
            itemId={item.id}
            outletId={user.outletId}
            unit={item.unit}
          />
        </Card>
      ) : null}

      <section>
        <h2 className="display-heading mb-4 text-xl text-ink">
          {superAdmin ? "Position by outlet" : "Your outlet"}
        </h2>
        {item.outletStock.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-muted">
              This product is not stocked at{" "}
              {superAdmin ? "any outlet" : "your outlet"} yet.
            </p>
          </Card>
        ) : (
          <TableShell
            head={
              <>
                <Th>Outlet</Th>
                <Th className="text-right">On hand</Th>
                <Th className="w-32">vs par</Th>
                <Th>Unit price</Th>
                <Th className="text-right">Value</Th>
                <Th>Expiry</Th>
                <Th>Last counted</Th>
              </>
            }
          >
            {item.outletStock.map((row) => {
              const par = row.parLevel ?? item.parLevel;
              const ratio = par > 0 ? row.quantity / par : 0;

              return (
                <tr key={row.id} className="transition-colors hover:bg-cream/60">
                  <Td className="font-semibold text-ink">
                    {row.outlet.name}
                    <span className="block text-[11px] font-normal text-ink-muted">
                      {row.outlet.city}
                    </span>
                  </Td>
                  <Td className="text-right">
                    <span className="font-semibold text-ink">
                      {formatQty(row.quantity)}
                    </span>
                    <span className="ml-1 text-[11px] text-ink-muted">
                      {item.unit}
                    </span>
                  </Td>
                  <Td>
                    <StockBar ratio={ratio} />
                    <span className="mt-1 block text-[10px] text-ink-muted">
                      par {formatQty(par)}
                    </span>
                  </Td>
                  <Td className="text-right text-xs">
                    {formatMoney(row.unitPrice)}
                  </Td>
                  <Td className="text-right font-semibold text-ink">
                    {formatMoney(row.quantity * row.unitPrice)}
                  </Td>
                  <Td className="text-xs whitespace-nowrap">
                    {formatDate(row.expiryDate)}
                  </Td>
                  <Td className="text-xs whitespace-nowrap">
                    {formatRelative(row.lastCountedAt)}
                  </Td>
                </tr>
              );
            })}
          </TableShell>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="display-heading mb-4 text-xl text-ink">
            Price movements
          </h2>
          {item.priceHistory.length === 0 ? (
            <Card>
              <p className="text-sm text-ink-muted">
                No price changes recorded yet.
              </p>
            </Card>
          ) : (
            <Card className="divide-y divide-ink/6 p-0">
              {item.priceHistory.map((entry) => {
                const delta =
                  entry.previousPrice !== null
                    ? entry.price - entry.previousPrice
                    : 0;

                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {formatMoney(entry.price)}
                        {entry.previousPrice !== null ? (
                          <span className="ml-2 text-xs font-normal text-ink-muted line-through">
                            {formatMoney(entry.previousPrice)}
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-[11px] text-ink-muted">
                        {entry.outlet?.name ?? "Group reference"} ·{" "}
                        {formatDate(entry.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={entry.source === "AI" ? "sage" : "neutral"}>
                        {entry.source}
                      </Badge>
                      {delta !== 0 ? (
                        <span
                          className={
                            delta > 0
                              ? "text-xs font-semibold text-red-600"
                              : "text-xs font-semibold text-emerald-700"
                          }
                        >
                          {delta > 0 ? "+" : ""}
                          {formatMoney(delta)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </section>

        <section>
          <h2 className="display-heading mb-4 text-xl text-ink">
            Recent counts
          </h2>
          {recentLines.length === 0 ? (
            <Card>
              <p className="text-sm text-ink-muted">
                This product has not appeared in a stock take yet.
              </p>
            </Card>
          ) : (
            <Card className="divide-y divide-ink/6 p-0">
              {recentLines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/app/stock-takes/${line.stockTake.id}`}
                      className="text-sm font-semibold text-ink hover:text-clay"
                    >
                      {line.stockTake.reference}
                    </Link>
                    <p className="truncate text-[11px] text-ink-muted">
                      {line.stockTake.outlet.name} ·{" "}
                      {formatDate(
                        line.stockTake.submittedAt ?? line.stockTake.createdAt,
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-ink">
                      {formatQty(line.countedQty)} {item.unit}
                    </p>
                    <Badge tone={line.source === "AI" ? "sage" : "neutral"}>
                      {line.source === "AI"
                        ? `AI ${
                            line.confidence !== null
                              ? `${Math.round(line.confidence * 100)}%`
                              : ""
                          }`
                        : "Manual"}
                    </Badge>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
