import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { OutletSwitcher } from "@/components/app/outlet-switcher";
import { isSuperAdmin, requireUser } from "@/lib/auth";
import { AVAILABILITY_STATUS, COST_ALERT_LEVEL } from "@/lib/constants";
import { getDishCostAlert } from "@/lib/cost-alerts";
import { calculateDishAvailability } from "@/lib/dish-availability";
import { calculateDishCost } from "@/lib/dish-costing";
import { getDish } from "@/lib/dishes";
import { formatCostPercent, formatMoney, formatQty } from "@/lib/format";
import { getOutlets } from "@/lib/queries";
import {
  listCatalogueItemsForRecipe,
  listRecipeIngredients,
} from "@/lib/recipes";
import {
  Badge,
  ButtonLink,
  Card,
  TableShell,
  Td,
  Th,
} from "@/components/ui";
import { DishActiveToggle } from "../../dish-active-toggle";
import { DishRecipeSection } from "../../dish-recipe";

function alertTone(
  level: string,
): "sage" | "warn" | "danger" | "neutral" {
  if (level === COST_ALERT_LEVEL.HEALTHY) return "sage";
  if (level === COST_ALERT_LEVEL.WARNING) return "warn";
  if (level === COST_ALERT_LEVEL.CRITICAL) return "danger";
  return "neutral";
}

function availabilityTone(
  status: string,
): "sage" | "warn" | "danger" | "neutral" {
  if (status === AVAILABILITY_STATUS.AVAILABLE) return "sage";
  if (status === AVAILABILITY_STATUS.LOW) return "warn";
  if (status === AVAILABILITY_STATUS.UNAVAILABLE) return "danger";
  return "neutral";
}

export const metadata: Metadata = { title: "Dish" };

export default async function DishDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ outlet?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const result = await getDish(user, id);
  if (!result.ok) notFound();

  const dish = result.dish;
  const superAdmin = isSuperAdmin(user);
  const outlets = superAdmin ? await getOutlets() : [];
  const outletId = superAdmin
    ? query.outlet && query.outlet !== "all"
      ? query.outlet
      : outlets[0]?.id ?? null
    : user.outletId;

  const [recipe, catalogue, costResult, alertResult, availabilityResult] =
    await Promise.all([
      listRecipeIngredients(user, id),
      superAdmin ? listCatalogueItemsForRecipe() : Promise.resolve([]),
      calculateDishCost(user, id),
      getDishCostAlert(user, id),
      outletId
        ? calculateDishAvailability(user, id, outletId)
        : Promise.resolve(null),
    ]);

  const ingredients = recipe.ok ? recipe.ingredients : [];
  const cost = costResult.ok ? costResult.cost : null;
  const alert = alertResult.ok ? alertResult.alert : null;
  const availability =
    availabilityResult && availabilityResult.ok
      ? availabilityResult.availability
      : null;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href={
              outletId
                ? `/app/products/dishes?outlet=${outletId}`
                : "/app/products/dishes"
            }
            className="text-xs font-semibold text-clay hover:underline"
          >
            ← Dishes
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="display-heading text-3xl text-ink sm:text-4xl">
              {dish.name}
            </h1>
            <Badge tone={dish.isActive ? "sage" : "neutral"}>
              {dish.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-ink-muted">{dish.category}</p>
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
            />
          ) : null}
          {superAdmin ? (
            <>
              <ButtonLink href={`/app/products/dishes/${dish.id}/edit`}>
                Edit
              </ButtonLink>
              <DishActiveToggle dishId={dish.id} isActive={dish.isActive} />
            </>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="eyebrow text-ink-muted">Selling price (group-wide)</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-ink">
            {formatMoney(dish.sellingPrice)}
          </p>
          {dish.description ? (
            <p className="mt-4 text-sm text-ink-soft">{dish.description}</p>
          ) : (
            <p className="mt-4 text-sm text-ink-muted">No description.</p>
          )}
          {dish.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dish.imageUrl}
              alt=""
              className="mt-4 max-h-48 rounded-2xl object-cover"
            />
          ) : null}
        </Card>

        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow text-ink-muted">Dish cost (group-wide)</p>
            <div className="flex flex-wrap gap-2">
              {alert ? (
                <Badge tone={alertTone(alert.alertLevel)}>
                  {alert.alertLabel}
                </Badge>
              ) : null}
              {cost ? (
                <Badge
                  tone={
                    cost.status === "COMPLETE"
                      ? "sage"
                      : cost.status === "INCOMPLETE"
                        ? "warn"
                        : "neutral"
                  }
                >
                  {cost.statusLabel}
                </Badge>
              ) : null}
            </div>
          </div>
          <p className="text-xs text-ink-muted">
            Calculated from catalogue purchase prices shared by every outlet.
            Alerts are informational and never change the selling price.
            {alert
              ? ` Thresholds: warning ${alert.thresholds.warningPercent}% / critical ${alert.thresholds.criticalPercent}%.`
              : ""}
          </p>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-ink-muted">Dish cost</dt>
              <dd className="mt-1 text-xl font-bold tabular-nums text-ink">
                {cost?.dishCost !== null && cost?.dishCost !== undefined
                  ? formatMoney(cost.dishCost)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Gross profit</dt>
              <dd className="mt-1 text-xl font-bold tabular-nums text-ink">
                {cost?.grossProfit !== null && cost?.grossProfit !== undefined
                  ? formatMoney(cost.grossProfit)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Food cost %</dt>
              <dd className="mt-1 font-semibold tabular-nums text-ink">
                {formatCostPercent(cost?.foodCostPercent)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Gross margin %</dt>
              <dd className="mt-1 font-semibold tabular-nums text-ink">
                {formatCostPercent(cost?.grossMarginPercent)}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow text-ink-muted">
              Availability
              {availability
                ? ` at ${availability.outletName}`
                : outletId
                  ? ""
                  : ""}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              Live from this outlet&apos;s inventory. Viewing availability never
              changes stock.
            </p>
          </div>
          {availability ? (
            <Badge tone={availabilityTone(availability.status)}>
              {availability.statusLabel}
            </Badge>
          ) : null}
        </div>

        {!outletId ? (
          <p className="text-sm text-ink-muted">
            Choose an outlet to calculate how many portions can be prepared.
          </p>
        ) : availability ? (
          <>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-ink-muted">Portions possible</dt>
                <dd className="mt-1 text-3xl font-bold tabular-nums text-ink">
                  {availability.portionsPossible !== null
                    ? availability.portionsPossible
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Limited by</dt>
                <dd className="mt-1 text-lg font-semibold text-ink">
                  {availability.limitingIngredientName ?? "—"}
                </dd>
              </div>
              <div className="sm:col-span-1 col-span-2">
                <dt className="text-ink-muted">Summary</dt>
                <dd className="mt-1 text-sm text-ink-soft">
                  {availability.summary}
                </dd>
              </div>
            </dl>

            {availability.missingIngredients.length > 0 ? (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
                <p className="font-semibold">Missing / insufficient</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {availability.missingIngredients.map((row) => (
                    <li key={row.itemName}>
                      {row.itemName}: {row.availableDisplay} available,{" "}
                      {row.requiredDisplay} required
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {availability.ingredients.length > 0 ? (
              <TableShell
                head={
                  <>
                    <Th>Ingredient</Th>
                    <Th>Required</Th>
                    <Th>In stock</Th>
                    <Th className="text-right">Portions supported</Th>
                  </>
                }
              >
                {availability.ingredients.map((line) => (
                  <tr key={line.ingredientId}>
                    <Td>
                      <p className="font-semibold text-ink">
                        {line.itemName}
                        {line.isLimiting ? (
                          <span className="ml-2 text-xs font-semibold text-clay">
                            limiting
                          </span>
                        ) : null}
                      </p>
                      {!line.stockRecordExists ? (
                        <p className="text-xs text-ink-muted">
                          No stock record at this outlet
                        </p>
                      ) : null}
                      {line.issue ? (
                        <p className="text-xs text-red-700">{line.issue}</p>
                      ) : null}
                    </Td>
                    <Td>
                      {formatQty(line.recipeQuantity)} {line.recipeUnit}
                      {line.quantityRequiredInStockUnit !== null &&
                      line.recipeUnit !== line.stockUnit ? (
                        <p className="text-xs text-ink-muted">
                          = {formatQty(line.quantityRequiredInStockUnit)}{" "}
                          {line.stockUnit}
                        </p>
                      ) : null}
                    </Td>
                    <Td>
                      {formatQty(line.quantityInStock)} {line.stockUnit}
                      {line.quantityAvailableInRecipeUnit !== null &&
                      line.recipeUnit !== line.stockUnit ? (
                        <p className="text-xs text-ink-muted">
                          ≈ {formatQty(line.quantityAvailableInRecipeUnit)}{" "}
                          {line.recipeUnit}
                        </p>
                      ) : null}
                    </Td>
                    <Td className="text-right tabular-nums font-semibold">
                      {line.portionsPossible !== null
                        ? line.portionsPossible
                        : "—"}
                    </Td>
                  </tr>
                ))}
              </TableShell>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-red-700">
            Could not calculate availability for this outlet.
          </p>
        )}
      </Card>

      {cost && cost.ingredients.length > 0 ? (
        <Card className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-ink">Cost breakdown</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Ingredient costs from group purchase prices (same at every
              outlet).
            </p>
          </div>
          <TableShell
            head={
              <>
                <Th>Ingredient</Th>
                <Th>Recipe qty</Th>
                <Th className="text-right">Group price</Th>
                <Th className="text-right">Ingredient cost</Th>
              </>
            }
          >
            {cost.ingredients.map((line) => (
              <tr key={line.ingredientId}>
                <Td>
                  <p className="font-semibold text-ink">{line.itemName}</p>
                  {!line.itemActive ? (
                    <p className="text-xs text-ink-muted">Inactive item</p>
                  ) : null}
                  {line.issue ? (
                    <p className="text-xs text-red-700">{line.issue}</p>
                  ) : null}
                </Td>
                <Td>
                  {formatQty(line.recipeQuantity)} {line.recipeUnit}
                  {line.quantityInStockUnit !== null &&
                  line.recipeUnit !== line.stockUnit ? (
                    <p className="text-xs text-ink-muted">
                      = {formatQty(line.quantityInStockUnit)} {line.stockUnit}
                    </p>
                  ) : null}
                </Td>
                <Td className="text-right tabular-nums">
                  {line.unitPrice !== null
                    ? `${formatMoney(line.unitPrice)} / ${line.stockUnit}`
                    : "—"}
                </Td>
                <Td className="text-right tabular-nums font-semibold">
                  {line.ingredientCost !== null
                    ? formatMoney(line.ingredientCost)
                    : "—"}
                </Td>
              </tr>
            ))}
          </TableShell>
          {cost.status === "COMPLETE" ? (
            <p className="text-right text-sm font-semibold text-ink">
              Total dish cost {formatMoney(cost.dishCost ?? 0)}
            </p>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <DishRecipeSection
          dishId={dish.id}
          canEdit={superAdmin}
          ingredients={ingredients}
          catalogue={catalogue}
        />
      </Card>
    </div>
  );
}
