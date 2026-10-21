import Link from "next/link";
import type { Metadata } from "next";

import { OutletSwitcher } from "@/components/app/outlet-switcher";
import { isSuperAdmin, requireUser } from "@/lib/auth";
import {
  AVAILABILITY_STATUS,
  COST_ALERT_LEVEL,
  DISH_CATEGORIES,
} from "@/lib/constants";
import { listDishCostAlerts } from "@/lib/cost-alerts";
import { calculateDishAvailabilitiesForOutlet } from "@/lib/dish-availability";
import { listDishes } from "@/lib/dishes";
import { formatMoney } from "@/lib/format";
import { getOutlets } from "@/lib/queries";
import {
  Badge,
  ButtonLink,
  EmptyState,
  TableShell,
  Td,
  Th,
} from "@/components/ui";

export const metadata: Metadata = { title: "Dishes" };

function alertTone(
  level: string | undefined,
): "sage" | "warn" | "danger" | "neutral" {
  if (level === COST_ALERT_LEVEL.HEALTHY) return "sage";
  if (level === COST_ALERT_LEVEL.WARNING) return "warn";
  if (level === COST_ALERT_LEVEL.CRITICAL) return "danger";
  return "neutral";
}

function availabilityTone(
  status: string | undefined,
): "sage" | "warn" | "danger" | "neutral" {
  if (status === AVAILABILITY_STATUS.AVAILABLE) return "sage";
  if (status === AVAILABILITY_STATUS.LOW) return "warn";
  if (status === AVAILABILITY_STATUS.UNAVAILABLE) return "danger";
  return "neutral";
}

export default async function DishesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    active?: string;
    outlet?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const superAdmin = isSuperAdmin(user);
  const active =
    params.active === "inactive" || params.active === "all"
      ? params.active
      : "active";

  const outlets = superAdmin ? await getOutlets() : [];
  const outletId = superAdmin
    ? params.outlet && params.outlet !== "all"
      ? params.outlet
      : outlets[0]?.id ?? null
    : user.outletId;

  const [dishes, alertData] = await Promise.all([
    listDishes(user, {
      q: params.q,
      category: params.category,
      active,
    }),
    listDishCostAlerts(user, {
      attentionOnly: false,
      activeOnly: active !== "inactive",
    }),
  ]);

  const availabilityBatch = outletId
    ? await calculateDishAvailabilitiesForOutlet(
        user,
        dishes.map((dish) => dish.id),
        outletId,
      )
    : null;

  const alertsById = new Map(
    alertData.alerts.map((alert) => [alert.dishId, alert] as const),
  );
  const attentionCount =
    alertData.summary.warning +
    alertData.summary.critical +
    alertData.summary.unresolved;

  const availabilityById =
    availabilityBatch && availabilityBatch.ok
      ? availabilityBatch.availabilities
      : new Map();
  const outletName =
    availabilityBatch && availabilityBatch.ok
      ? availabilityBatch.outletName
      : outlets.find((outlet) => outlet.id === outletId)?.name ??
        user.outletName ??
        null;

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
            Dishes
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">
            Costs and food-cost alerts are group-wide. Availability uses live
            stock at {outletName ?? "the selected outlet"}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {superAdmin && outlets.length > 0 ? (
            <OutletSwitcher
              outlets={outlets.map((outlet) => ({
                id: outlet.id,
                name: outlet.name,
              }))}
              value={outletId}
              allowAll={false}
              placeholderLabel="Choose outlet…"
            />
          ) : null}
          <ButtonLink href="/app/products/cost-alerts" variant="secondary">
            Cost alerts{attentionCount > 0 ? ` (${attentionCount})` : ""}
          </ButtonLink>
          {superAdmin ? (
            <ButtonLink href="/app/products/dishes/new">Add dish</ButtonLink>
          ) : null}
        </div>
      </header>

      <form className="flex flex-wrap items-end gap-3" method="get">
        {outletId ? (
          <input type="hidden" name="outlet" value={outletId} />
        ) : null}
        <div>
          <label htmlFor="q" className="eyebrow mb-2 block text-ink-muted">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Name or category…"
            className="w-56 rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-clay"
          />
        </div>
        <div>
          <label htmlFor="category" className="eyebrow mb-2 block text-ink-muted">
            Category
          </label>
          <select
            id="category"
            name="category"
            defaultValue={params.category ?? ""}
            className="rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-clay"
          >
            <option value="">All</option>
            {DISH_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
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
            defaultValue={active}
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
      </form>

      {!outletId ? (
        <EmptyState
          title="Choose an outlet"
          description="Dish availability is outlet-specific. Select an outlet to see how many portions can be prepared from current stock."
        />
      ) : dishes.length === 0 ? (
        <EmptyState
          title="No dishes yet"
          description={
            superAdmin
              ? "Create a dish to start the menu catalogue."
              : "Ask a super admin to add dishes."
          }
          action={
            superAdmin ? (
              <ButtonLink href="/app/products/dishes/new">Add dish</ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <TableShell
          head={
            <>
              <Th>Name</Th>
              <Th>Category</Th>
              <Th className="text-right">Selling</Th>
              <Th className="text-right">Cost</Th>
              <Th>Cost alert</Th>
              <Th>Availability</Th>
              <Th className="text-right">Portions</Th>
              <Th>Limited by</Th>
            </>
          }
        >
          {dishes.map((dish) => {
            const alert = alertsById.get(dish.id);
            const availability = availabilityById.get(dish.id);
            return (
              <tr key={dish.id}>
                <Td>
                  <Link
                    href={
                      outletId
                        ? `/app/products/dishes/${dish.id}?outlet=${outletId}`
                        : `/app/products/dishes/${dish.id}`
                    }
                    className="font-semibold text-ink hover:text-clay"
                  >
                    {dish.name}
                  </Link>
                </Td>
                <Td>{dish.category}</Td>
                <Td className="text-right tabular-nums">
                  {formatMoney(dish.sellingPrice)}
                </Td>
                <Td className="text-right tabular-nums">
                  {alert?.dishCost !== null && alert?.dishCost !== undefined
                    ? formatMoney(alert.dishCost)
                    : "—"}
                </Td>
                <Td>
                  <Badge tone={alertTone(alert?.alertLevel)}>
                    {alert?.alertLabel ?? "—"}
                  </Badge>
                </Td>
                <Td>
                  <Badge tone={availabilityTone(availability?.status)}>
                    {availability?.statusLabel ?? "—"}
                  </Badge>
                </Td>
                <Td className="text-right tabular-nums">
                  {availability?.portionsPossible !== null &&
                  availability?.portionsPossible !== undefined
                    ? availability.portionsPossible
                    : "—"}
                </Td>
                <Td className="text-sm text-ink-muted">
                  {availability?.status === AVAILABILITY_STATUS.UNAVAILABLE &&
                  availability.missingIngredients.length > 0
                    ? availability.missingIngredients
                        .map((row) => row.itemName)
                        .slice(0, 2)
                        .join(", ")
                    : (availability?.limitingIngredientName ?? "—")}
                </Td>
              </tr>
            );
          })}
        </TableShell>
      )}
    </div>
  );
}
