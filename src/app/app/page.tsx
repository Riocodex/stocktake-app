import Link from "next/link";

import { requireUser, resolveOutletScope, isSuperAdmin } from "@/lib/auth";
import {
  getAutomationShare,
  getGroupSummaryByOutlet,
  getLowStock,
  getOutletSummary,
  getOutlets,
  getRecentStockTakes,
  getValueByCategory,
} from "@/lib/queries";
import { formatMoney, formatQty, formatRelative } from "@/lib/format";
import { STOCK_TAKE_STATUS } from "@/lib/constants";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  SectionHeading,
  StatCard,
  StockBar,
  TableShell,
  Td,
  Th,
} from "@/components/ui";
import { OutletSwitcher } from "@/components/app/outlet-switcher";
import { EyeMark } from "@/components/brand/marks";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ outlet?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const scope = resolveOutletScope(user, params.outlet ?? null);
  const superAdmin = isSuperAdmin(user);

  const [outlets, lowStock, recentTakes, automation, categories] =
    await Promise.all([
      superAdmin ? getOutlets() : Promise.resolve([]),
      getLowStock(scope.outletId, 6),
      getRecentStockTakes(scope.outletId, 5),
      getAutomationShare(scope.outletId),
      getValueByCategory(scope.outletId),
    ]);

  // Group-wide figures are the sum of each outlet; a single outlet is queried
  // directly.
  const perOutlet =
    superAdmin && !scope.outletId ? await getGroupSummaryByOutlet() : [];

  const summary = scope.outletId
    ? await getOutletSummary(scope.outletId)
    : {
        value: perOutlet.reduce((sum, row) => sum + row.summary.value, 0),
        trackedItems: perOutlet.reduce(
          (sum, row) => sum + row.summary.trackedItems,
          0,
        ),
        lowCount: perOutlet.reduce((sum, row) => sum + row.summary.lowCount, 0),
        outOfStock: perOutlet.reduce(
          (sum, row) => sum + row.summary.outOfStock,
          0,
        ),
        lastTake: perOutlet.reduce<
          (typeof perOutlet)[number]["summary"]["lastTake"]
        >((latest, row) => {
          const candidate = row.summary.lastTake;
          if (!candidate?.submittedAt) return latest;
          if (!latest?.submittedAt) return candidate;
          return candidate.submittedAt > latest.submittedAt ? candidate : latest;
        }, null),
        draftCount: perOutlet.reduce(
          (sum, row) => sum + row.summary.draftCount,
          0,
        ),
        takeCount: perOutlet.reduce(
          (sum, row) => sum + row.summary.takeCount,
          0,
        ),
      };

  const scopeName = scope.outletId
    ? (outlets.find((outlet) => outlet.id === scope.outletId)?.name ??
      user.outletName ??
      "Your outlet")
    : "All outlets";

  const maxCategoryValue = Math.max(
    ...categories.map((category) => category.value),
    1,
  );

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-clay">
            {superAdmin ? "Group overview" : "Outlet overview"}
          </p>
          <h1 className="display-heading mt-2 text-3xl text-ink sm:text-4xl">
            {scopeName}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Welcome back, {user.name.split(" ")[0]}.{" "}
            {summary.draftCount > 0 ? (
              <Link
                href="/app/stock-takes"
                className="font-semibold text-clay hover:underline"
              >
                {summary.draftCount} stock take
                {summary.draftCount === 1 ? "" : "s"} still open.
              </Link>
            ) : (
              "Everything is counted and closed off."
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {superAdmin ? (
            <OutletSwitcher outlets={outlets} value={scope.outletId} />
          ) : null}
          <ButtonLink href="/app/stock-takes/new">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            New stock take
          </ButtonLink>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Stock on hand"
          value={formatMoney(summary.value)}
          hint={`${summary.trackedItems} tracked positions`}
        />
        <StatCard
          label="Needs reordering"
          value={String(summary.lowCount)}
          hint={`${summary.outOfStock} completely out of stock`}
          tone={summary.lowCount > 0 ? "clay" : "sage"}
        />
        <StatCard
          label="Counted by AI"
          value={
            automation.total > 0
              ? `${Math.round(automation.aiShare * 100)}%`
              : "—"
          }
          hint={
            automation.averageConfidence !== null
              ? `Avg confidence ${Math.round(automation.averageConfidence * 100)}%`
              : "Last 30 days"
          }
          tone="sage"
          icon={<EyeMark className="w-9" />}
        />
        <StatCard
          label="Stock takes filed"
          value={String(summary.takeCount)}
          hint={
            summary.lastTake
              ? `Last count ${formatRelative(summary.lastTake.submittedAt)}`
              : "No submitted counts yet"
          }
          tone="ink"
        />
      </section>

      {perOutlet.length > 0 ? (
        <section>
          <SectionHeading
            title="Outlet comparison"
            description="Every venue in the group, side by side."
          />
          <TableShell
            head={
              <>
                <Th>Outlet</Th>
                <Th className="text-right">Stock value</Th>
                <Th className="text-right">Positions</Th>
                <Th className="text-right">Low</Th>
                <Th>Last counted</Th>
                <Th />
              </>
            }
          >
            {perOutlet.map(({ outlet, summary: row }) => (
              <tr key={outlet.id} className="transition-colors hover:bg-cream/60">
                <Td className="font-semibold text-ink">
                  {outlet.name}
                  <span className="block text-xs font-normal text-ink-muted">
                    {outlet.city}
                  </span>
                </Td>
                <Td className="text-right font-semibold text-ink">
                  {formatMoney(row.value)}
                </Td>
                <Td className="text-right">{row.trackedItems}</Td>
                <Td className="text-right">
                  {row.lowCount > 0 ? (
                    <Badge tone={row.lowCount > 12 ? "danger" : "warn"}>
                      {row.lowCount}
                    </Badge>
                  ) : (
                    <Badge tone="ok">0</Badge>
                  )}
                </Td>
                <Td className="text-xs">
                  {row.lastTake
                    ? formatRelative(row.lastTake.submittedAt)
                    : "never"}
                </Td>
                <Td className="text-right">
                  <Link
                    href={`/app?outlet=${outlet.id}`}
                    className="text-xs font-semibold text-clay hover:underline"
                  >
                    View
                  </Link>
                </Td>
              </tr>
            ))}
          </TableShell>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <SectionHeading
            title="Running low"
            description={
              lowStock.total > lowStock.rows.length
                ? `Showing the ${lowStock.rows.length} tightest of ${lowStock.total}.`
                : "Items at or below their reorder threshold."
            }
            action={
              <Link
                href="/app/inventory?filter=low"
                className="text-xs font-semibold text-clay hover:underline"
              >
                See all
              </Link>
            }
          />

          {lowStock.rows.length === 0 ? (
            <EmptyState
              title="Nothing to reorder"
              description="Every tracked item is comfortably above its threshold."
            />
          ) : (
            <Card className="divide-y divide-ink/6 p-0">
              {lowStock.rows.map((row) => {
                const ratio = row.parLevel > 0 ? row.quantity / row.parLevel : 0;
                return (
                  <div
                    key={`${row.outletId}-${row.itemId}`}
                    className="flex items-center gap-4 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {row.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-ink-muted">
                        {row.sku} · {row.category}
                        {!scope.outletId ? ` · ${row.outletName}` : ""}
                      </p>
                      <div className="mt-2 max-w-[14rem]">
                        <StockBar ratio={ratio} />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-ink">
                        {formatQty(row.quantity)}
                        <span className="ml-1 text-xs font-normal text-ink-muted">
                          {row.unit}
                        </span>
                      </p>
                      <p className="text-[11px] text-ink-muted">
                        par {formatQty(row.parLevel)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </section>

        <section className="lg:col-span-2">
          <SectionHeading
            title="Value by category"
            description="Where the money is sitting."
          />
          <Card className="space-y-4">
            {categories.slice(0, 8).map((category) => (
              <div key={category.name}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-ink">
                    {category.name}
                  </p>
                  <p className="shrink-0 text-xs font-semibold text-ink-muted">
                    {formatMoney(category.value)}
                  </p>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-pill bg-ink/8">
                  <div
                    className="h-full rounded-pill bg-clay"
                    style={{
                      width: `${(category.value / maxCategoryValue) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            {categories.length === 0 ? (
              <p className="text-sm text-ink-muted">No stock recorded yet.</p>
            ) : null}
          </Card>
        </section>
      </div>

      <section>
        <SectionHeading
          title="Recent stock takes"
          action={
            <Link
              href="/app/stock-takes"
              className="text-xs font-semibold text-clay hover:underline"
            >
              See all
            </Link>
          }
        />

        {recentTakes.length === 0 ? (
          <EmptyState
            title="No stock takes yet"
            description="Start a count and photograph your shelves — the AI does the rest."
            action={
              <ButtonLink href="/app/stock-takes/new">
                Start a stock take
              </ButtonLink>
            }
          />
        ) : (
          <TableShell
            head={
              <>
                <Th>Reference</Th>
                {!scope.outletId ? <Th>Outlet</Th> : null}
                <Th>Counted by</Th>
                <Th className="text-right">Lines</Th>
                <Th className="text-right">Photos</Th>
                <Th>Status</Th>
                <Th>When</Th>
              </>
            }
          >
            {recentTakes.map((take) => (
              <tr key={take.id} className="transition-colors hover:bg-cream/60">
                <Td>
                  <Link
                    href={`/app/stock-takes/${take.id}`}
                    className="font-semibold text-ink hover:text-clay"
                  >
                    {take.reference}
                  </Link>
                </Td>
                {!scope.outletId ? <Td>{take.outlet.name}</Td> : null}
                <Td>{take.user.name}</Td>
                <Td className="text-right">{take._count.lines}</Td>
                <Td className="text-right">{take._count.photos}</Td>
                <Td>
                  {take.status === STOCK_TAKE_STATUS.SUBMITTED ? (
                    <Badge tone="ok">Submitted</Badge>
                  ) : (
                    <Badge tone="warn">Draft</Badge>
                  )}
                </Td>
                <Td className="text-xs">
                  {formatRelative(take.submittedAt ?? take.createdAt)}
                </Td>
              </tr>
            ))}
          </TableShell>
        )}
      </section>
    </div>
  );
}
