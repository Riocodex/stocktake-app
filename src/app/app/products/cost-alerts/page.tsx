import Link from "next/link";
import type { Metadata } from "next";

import { isSuperAdmin, requireUser } from "@/lib/auth";
import { COST_ALERT_LEVEL } from "@/lib/constants";
import { listDishCostAlerts } from "@/lib/cost-alerts";
import { formatCostPercent, formatMoney } from "@/lib/format";
import {
  Badge,
  Card,
  EmptyState,
  StatCard,
  TableShell,
  Td,
  Th,
} from "@/components/ui";
import { FoodCostThresholdForm } from "../threshold-form";

export const metadata: Metadata = { title: "Cost alerts" };

function alertTone(
  level: string,
): "sage" | "warn" | "danger" | "neutral" {
  if (level === COST_ALERT_LEVEL.HEALTHY) return "sage";
  if (level === COST_ALERT_LEVEL.WARNING) return "warn";
  if (level === COST_ALERT_LEVEL.CRITICAL) return "danger";
  return "neutral";
}

export default async function CostAlertsPage() {
  const user = await requireUser();
  const superAdmin = isSuperAdmin(user);
  const { alerts, thresholds, summary } = await listDishCostAlerts(user, {
    attentionOnly: true,
    activeOnly: true,
  });

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/app/products/dishes"
          className="text-xs font-semibold text-clay hover:underline"
        >
          ← Dishes
        </Link>
        <h1 className="display-heading mt-3 text-3xl text-ink sm:text-4xl">
          Cost alerts
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          Dishes needing attention based on group-wide food-cost %. Informational
          only — selling prices are never changed automatically.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Critical" value={String(summary.critical)} tone="clay" />
        <StatCard label="Warning" value={String(summary.warning)} tone="ink" />
        <StatCard
          label="Unresolved"
          value={String(summary.unresolved)}
          tone="sage"
        />
        <StatCard label="Healthy" value={String(summary.healthy)} tone="sage" />
      </section>

      <Card className="space-y-3">
        <p className="eyebrow text-ink-muted">Food-cost thresholds</p>
        <FoodCostThresholdForm
          warningPercent={thresholds.warningPercent}
          criticalPercent={thresholds.criticalPercent}
          canEdit={superAdmin}
        />
      </Card>

      {alerts.length === 0 ? (
        <EmptyState
          title="No cost alerts"
          description="All active dishes with complete recipes are within the healthy food-cost range."
        />
      ) : (
        <TableShell
          head={
            <>
              <Th>Dish</Th>
              <Th>Scope</Th>
              <Th className="text-right">Selling</Th>
              <Th className="text-right">Cost</Th>
              <Th className="text-right">Food cost %</Th>
              <Th>Threshold</Th>
              <Th>Status</Th>
            </>
          }
        >
          {alerts.map((alert) => (
            <tr key={alert.dishId}>
              <Td>
                <Link
                  href={`/app/products/dishes/${alert.dishId}`}
                  className="font-semibold text-ink hover:text-clay"
                >
                  {alert.dishName}
                </Link>
              </Td>
              <Td>{alert.scopeLabel}</Td>
              <Td className="text-right tabular-nums">
                {formatMoney(alert.sellingPrice)}
              </Td>
              <Td className="text-right tabular-nums">
                {alert.dishCost !== null ? formatMoney(alert.dishCost) : "—"}
              </Td>
              <Td className="text-right tabular-nums">
                {formatCostPercent(alert.foodCostPercent)}
              </Td>
              <Td className="text-sm text-ink-muted">
                {alert.thresholdExceeded === "critical"
                  ? `≥ ${alert.thresholds.criticalPercent}% critical`
                  : alert.thresholdExceeded === "warning"
                    ? `≥ ${alert.thresholds.warningPercent}% warning`
                    : alert.alertLevel === COST_ALERT_LEVEL.UNRESOLVED
                      ? "Data incomplete"
                      : "—"}
              </Td>
              <Td>
                <Badge tone={alertTone(alert.alertLevel)}>
                  {alert.alertLabel}
                </Badge>
                <p className="mt-1 text-[11px] text-ink-muted">
                  {alert.costingStatusLabel}
                </p>
              </Td>
            </tr>
          ))}
        </TableShell>
      )}
    </div>
  );
}
