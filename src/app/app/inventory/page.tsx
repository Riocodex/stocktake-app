import Link from "next/link";
import type { Metadata } from "next";

import { isSuperAdmin, requireUser, resolveOutletScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOutlets, isLow } from "@/lib/queries";
import { formatMoney, formatQty, formatRelative } from "@/lib/format";
import {
  Badge,
  Card,
  EmptyState,
  StatCard,
  StockBar,
  TableShell,
  Td,
  Th,
} from "@/components/ui";
import { OutletSwitcher } from "@/components/app/outlet-switcher";

export const metadata: Metadata = { title: "Global inventory" };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    outlet?: string;
    q?: string;
    category?: string;
    filter?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const scope = resolveOutletScope(user, params.outlet ?? null);
  const superAdmin = isSuperAdmin(user);

  const search = (params.q ?? "").trim();
  const categoryFilter = params.category ?? "";
  const lowOnly = params.filter === "low";

  const [outlets, categories, items] = await Promise.all([
    superAdmin ? getOutlets() : Promise.resolve([]),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.inventoryItem.findMany({
      where: {
        isActive: true,
        ...(categoryFilter ? { categoryId: categoryFilter } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { sku: { contains: search } },
                { brand: { contains: search } },
                { aliases: { contains: search } },
              ],
            }
          : {}),
      },
      include: {
        category: true,
        outletStock: {
          where: scope.outletId ? { outletId: scope.outletId } : undefined,
          include: { outlet: { select: { name: true, slug: true } } },
        },
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    }),
  ]);

  type Row = {
    id: string;
    sku: string;
    name: string;
    brand: string | null;
    unit: string;
    category: string;
    packSize: string | null;
    referencePrice: number;
    parLevel: number;
    quantity: number;
    value: number;
    /** Average price where several outlets are aggregated. */
    price: number;
    outletCount: number;
    lastCounted: Date | null;
    /**
     * How many outlet positions sit below their own threshold. Group-wide
     * totals would hide a single starved venue, so reordering is always judged
     * per outlet.
     */
    lowOutlets: number;
    isLow: boolean;
  };

  const rows: Row[] = items.map((item) => {
    const stock = item.outletStock;
    const quantity = stock.reduce((sum, entry) => sum + entry.quantity, 0);
    const value = stock.reduce(
      (sum, entry) => sum + entry.quantity * entry.unitPrice,
      0,
    );
    const par = scope.outletId
      ? (stock[0]?.parLevel ?? item.parLevel)
      : item.parLevel * Math.max(stock.length, 1);

    const lastCounted = stock.reduce<Date | null>((latest, entry) => {
      if (!entry.lastCountedAt) return latest;
      if (!latest || entry.lastCountedAt > latest) return entry.lastCountedAt;
      return latest;
    }, null);

    const lowOutlets = stock.filter((entry) =>
      isLow(
        entry.quantity,
        item.lowStockThreshold,
        entry.parLevel ?? item.parLevel,
      ),
    ).length;

    return {
      id: item.id,
      sku: item.sku,
      name: item.name,
      brand: item.brand,
      unit: item.unit,
      category: item.category.name,
      packSize: item.packSize,
      referencePrice: item.referencePrice,
      parLevel: par,
      quantity,
      value,
      price: quantity > 0 ? value / quantity : item.referencePrice,
      outletCount: stock.length,
      lastCounted,
      lowOutlets,
      isLow: lowOutlets > 0,
    };
  });

  const visible = lowOnly ? rows.filter((row) => row.isLow) : rows;

  const totals = {
    value: rows.reduce((sum, row) => sum + row.value, 0),
    items: rows.length,
    low: rows.reduce((sum, row) => sum + row.lowOutlets, 0),
    outOfStock: rows.filter((row) => row.quantity === 0).length,
  };

  const scopeLabel = scope.outletId
    ? (outlets.find((outlet) => outlet.id === scope.outletId)?.name ??
      user.outletName ??
      "Your outlet")
    : "Group-wide";

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-clay">{scopeLabel}</p>
          <h1 className="display-heading mt-2 text-3xl text-ink sm:text-4xl">
            Global inventory
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">
            One catalogue shared by every outlet. Quantities and prices are
            tracked per venue and updated by each stock take.
          </p>
        </div>

        {superAdmin ? (
          <OutletSwitcher outlets={outlets} value={scope.outletId} />
        ) : null}
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={scope.outletId ? "Outlet stock value" : "Group stock value"}
          value={formatMoney(totals.value)}
        />
        <StatCard label="Catalogue items" value={String(totals.items)} tone="ink" />
        <StatCard
          label={scope.outletId ? "Below threshold" : "Positions to reorder"}
          value={String(totals.low)}
          tone={totals.low > 0 ? "clay" : "sage"}
        />
        <StatCard
          label="Out of stock"
          value={String(totals.outOfStock)}
          tone={totals.outOfStock > 0 ? "clay" : "sage"}
        />
      </section>

      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          {scope.outletId ? (
            <input type="hidden" name="outlet" value={scope.outletId} />
          ) : null}

          <div className="min-w-[12rem] flex-1">
            <label
              htmlFor="q"
              className="mb-1.5 block text-[11px] font-semibold text-ink-soft"
            >
              Search
            </label>
            <input
              id="q"
              name="q"
              defaultValue={search}
              placeholder="Product, SKU or brand…"
              className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-clay"
            />
          </div>

          <div className="min-w-[10rem]">
            <label
              htmlFor="category"
              className="mb-1.5 block text-[11px] font-semibold text-ink-soft"
            >
              Category
            </label>
            <select
              id="category"
              name="category"
              defaultValue={categoryFilter}
              className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-clay"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              name="filter"
              value="low"
              defaultChecked={lowOnly}
              className="h-4 w-4 accent-[#ba8976]"
            />
            Low stock only
          </label>

          <button
            type="submit"
            className="rounded-pill bg-clay px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-clay-600"
          >
            Apply
          </button>

          {search || categoryFilter || lowOnly ? (
            <Link
              href={
                scope.outletId
                  ? `/app/inventory?outlet=${scope.outletId}`
                  : "/app/inventory"
              }
              className="text-xs font-semibold text-ink-muted hover:text-clay"
            >
              Clear
            </Link>
          ) : null}
        </form>
      </Card>

      {visible.length === 0 ? (
        <EmptyState
          title="No products match"
          description="Try a different search term or clear the filters."
        />
      ) : (
        <TableShell
          head={
            <>
              <Th>Product</Th>
              <Th>Category</Th>
              <Th className="text-right">
                {scope.outletId ? "On hand" : "Total on hand"}
              </Th>
              <Th className="w-32">vs par</Th>
              <Th className="text-right">
                {scope.outletId ? "Unit price" : "Avg price"}
              </Th>
              <Th className="text-right">Value</Th>
              {!scope.outletId ? <Th className="text-right">Outlets</Th> : null}
              <Th>Last counted</Th>
            </>
          }
        >
          {visible.map((row) => {
            const ratio = row.parLevel > 0 ? row.quantity / row.parLevel : 0;

            return (
              <tr key={row.id} className="transition-colors hover:bg-cream/60">
                <Td>
                  <Link
                    href={`/app/inventory/${row.id}${
                      scope.outletId ? `?outlet=${scope.outletId}` : ""
                    }`}
                    className="font-semibold text-ink hover:text-clay"
                  >
                    {row.brand ? `${row.brand} ` : ""}
                    {row.name}
                  </Link>
                  <span className="block text-[11px] text-ink-muted">
                    {row.sku}
                    {row.packSize ? ` · ${row.packSize}` : ""}
                  </span>
                </Td>
                <Td className="text-xs">{row.category}</Td>
                <Td className="text-right">
                  <span className="font-semibold text-ink">
                    {formatQty(row.quantity)}
                  </span>
                  <span className="ml-1 text-[11px] text-ink-muted">
                    {row.unit}
                  </span>
                  {row.quantity === 0 ? (
                    <Badge tone="danger" className="ml-2">
                      Out
                    </Badge>
                  ) : row.isLow ? (
                    <Badge tone="warn" className="ml-2">
                      {scope.outletId
                        ? "Low"
                        : `Low in ${row.lowOutlets}`}
                    </Badge>
                  ) : null}
                </Td>
                <Td>
                  <StockBar ratio={ratio} />
                  <span className="mt-1 block text-[10px] text-ink-muted">
                    par {formatQty(row.parLevel)}
                  </span>
                </Td>
                <Td className="text-right text-xs">{formatMoney(row.price)}</Td>
                <Td className="text-right font-semibold text-ink">
                  {formatMoney(row.value)}
                </Td>
                {!scope.outletId ? (
                  <Td className="text-right text-xs">{row.outletCount}</Td>
                ) : null}
                <Td className="text-xs whitespace-nowrap">
                  {formatRelative(row.lastCounted)}
                </Td>
              </tr>
            );
          })}
        </TableShell>
      )}
    </div>
  );
}
