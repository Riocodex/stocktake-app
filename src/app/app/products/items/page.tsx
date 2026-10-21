import Link from "next/link";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import {
  Badge,
  ButtonLink,
  EmptyState,
  TableShell,
  Td,
  Th,
} from "@/components/ui";

export const metadata: Metadata = { title: "Items" };

export default async function ProductItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; active?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const search = (params.q ?? "").trim();
  const categoryFilter = params.category ?? "";
  const activeFilter = params.active ?? "active";

  const [categories, items] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.inventoryItem.findMany({
      where: {
        ...(activeFilter === "active"
          ? { isActive: true }
          : activeFilter === "inactive"
            ? { isActive: false }
            : {}),
        ...(categoryFilter ? { categoryId: categoryFilter } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { sku: { contains: search } },
                { brand: { contains: search } },
              ],
            }
          : {}),
      },
      include: { category: true },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    }),
  ]);

  const filterHref = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = {
      q: params.q,
      category: params.category,
      active: params.active,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const qs = next.toString();
    return qs ? `/app/products/items?${qs}` : "/app/products/items";
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/app/products"
            className="text-xs font-semibold text-clay hover:underline"
          >
            ← Products &amp; Dishes
          </Link>
          <h1 className="display-heading mt-3 text-3xl text-ink sm:text-4xl">
            Items
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">
            Global catalogue of physical products and purchase prices. Outlet
            quantities are under{" "}
            <Link href="/app/inventory" className="font-semibold text-clay hover:underline">
              Stock &amp; Inventory
            </Link>
            .
          </p>
        </div>
        <ButtonLink href="/app/products/items/new">Add item</ButtonLink>
      </header>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div>
          <label htmlFor="q" className="eyebrow mb-2 block text-ink-muted">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Name, SKU, brand…"
            className="w-56 rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-clay"
          />
        </div>
        <div>
          <label htmlFor="category" className="eyebrow mb-2 block text-ink-muted">
            Section
          </label>
          <select
            id="category"
            name="category"
            defaultValue={categoryFilter}
            className="rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-clay"
          >
            <option value="">All</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="active" className="eyebrow mb-2 block text-ink-muted">
            Status
          </label>
          <select
            id="active"
            name="active"
            defaultValue={activeFilter}
            className="rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-clay"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-2xl bg-ink px-4 py-2.5 text-sm font-semibold text-white"
        >
          Filter
        </button>
        {(params.q || params.category || (params.active && params.active !== "active")) && (
          <Link
            href={filterHref({ q: undefined, category: undefined, active: "active" })}
            className="pb-2.5 text-sm font-semibold text-clay hover:underline"
          >
            Clear
          </Link>
        )}
      </form>

      {items.length === 0 ? (
        <EmptyState
          title="No items match"
          description="Try a different search, or add a new physical product."
        />
      ) : (
        <TableShell
          head={
            <>
              <Th>Name</Th>
              <Th>Section</Th>
              <Th>Unit</Th>
              <Th className="text-right">Purchase price</Th>
              <Th>Status</Th>
            </>
          }
        >
          {items.map((item) => (
            <tr key={item.id}>
              <Td>
                <Link
                  href={`/app/inventory/${item.id}`}
                  className="font-semibold text-ink hover:text-clay"
                >
                  {item.brand ? `${item.brand} ${item.name}` : item.name}
                </Link>
                <p className="text-xs text-ink-muted">{item.sku}</p>
              </Td>
              <Td>{item.category.name}</Td>
              <Td>{item.unit}</Td>
              <Td className="text-right tabular-nums">
                {formatMoney(item.referencePrice)}
              </Td>
              <Td>
                <Badge tone={item.isActive ? "sage" : "neutral"}>
                  {item.isActive ? "Active" : "Inactive"}
                </Badge>
              </Td>
            </tr>
          ))}
        </TableShell>
      )}
    </div>
  );
}
