import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Merges class lists so a caller's `className` reliably beats a component's
 * defaults. Plain concatenation leaves both `bg-white` and `bg-ink` in the
 * attribute and lets the stylesheet order pick a winner, which silently
 * discards overrides.
 */
const twMerge = extendTailwindMerge({
  extend: {
    // `rounded-pill` is a project radius token, so it has to be declared as
    // part of the border-radius group to conflict correctly.
    classGroups: { rounded: [{ rounded: ["pill"] }] },
  },
});

export function cn(...values: (string | false | null | undefined)[]) {
  return twMerge(values.filter(Boolean).join(" "));
}

/* ---------------- Buttons ---------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "sage";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-clay text-white hover:bg-clay-600 disabled:bg-clay-200 shadow-sm shadow-clay-800/10",
  sage: "bg-sage text-ink hover:bg-sage-600 hover:text-white disabled:bg-sage-100",
  secondary:
    "border border-ink/15 bg-white text-ink hover:border-clay hover:text-clay",
  ghost: "text-ink-soft hover:bg-ink/5 hover:text-ink",
  danger: "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-6 py-3.5 text-sm",
};

function buttonClasses(
  variant: ButtonVariant,
  size: ButtonSize,
  className?: string,
) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-pill font-semibold tracking-wide transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70",
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button className={buttonClasses(variant, size, className)} {...props} />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}

/* ---------------- Surfaces ---------------- */

export function Card({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-ink/8 bg-white p-6 shadow-[0_1px_2px_rgb(43_38_34/0.04)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="display-heading text-xl text-ink">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/* ---------------- Badges ---------------- */

type BadgeTone = "clay" | "sage" | "neutral" | "warn" | "danger" | "ok";

const BADGE_TONES: Record<BadgeTone, string> = {
  clay: "bg-clay-50 text-clay-700 border-clay-100",
  sage: "bg-sage-50 text-sage-800 border-sage-100",
  neutral: "bg-ink/5 text-ink-soft border-ink/10",
  warn: "bg-amber-50 text-amber-800 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------------- Stats ---------------- */

export function StatCard({
  label,
  value,
  hint,
  tone = "clay",
  icon,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "clay" | "sage" | "ink";
  icon?: ReactNode;
  /** When set, the whole card is a link (e.g. drill into a detail list). */
  href?: string;
}) {
  const accents = {
    clay: "text-clay",
    sage: "text-sage-700",
    ink: "text-ink",
  } as const;

  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="eyebrow text-ink-muted">{label}</p>
        <p
          className={cn(
            "display-heading mt-2 truncate text-3xl transition-colors",
            accents[tone],
            href ? "group-hover:text-clay" : null,
          )}
        >
          {value}
        </p>
        {hint ? (
          <p className="mt-1 truncate text-xs text-ink-muted">{hint}</p>
        ) : null}
        {href ? (
          <p className="mt-2 text-[11px] font-semibold tracking-wide text-clay/0 transition group-hover:text-clay">
            Explore →
          </p>
        ) : null}
      </div>
      {icon ? <div className="shrink-0 text-sage">{icon}</div> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group block rounded-3xl outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
      >
        <Card
          className={cn(
            "flex items-start justify-between gap-4 border-transparent p-5 shadow-none",
            "bg-white/90 transition duration-200",
            "group-hover:-translate-y-0.5 group-hover:bg-cream group-hover:shadow-[0_12px_28px_rgb(43_38_34/0.08)]",
          )}
        >
          {body}
        </Card>
      </Link>
    );
  }

  return (
    <Card className="flex items-start justify-between gap-4 p-5">{body}</Card>
  );
}

/* ---------------- Tables ---------------- */

export function TableShell({
  head,
  children,
  className,
}: {
  head: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-3xl border border-ink/8 bg-white",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead className="bg-cream-deep/70">
            <tr className="text-left">{head}</tr>
          </thead>
          <tbody className="divide-y divide-ink/6">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function Th({
  className,
  children,
  ...props
}: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-[11px] font-bold tracking-[0.14em] text-ink-muted uppercase",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({
  className,
  children,
  ...props
}: ComponentProps<"td">) {
  return (
    <td className={cn("px-4 py-3 align-middle text-ink-soft", className)} {...props}>
      {children}
    </td>
  );
}

/* ---------------- Empty state ---------------- */

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-ink/15 bg-white/60 px-6 py-14 text-center">
      {icon ? (
        <div className="mx-auto mb-4 w-12 text-sage">{icon}</div>
      ) : null}
      <p className="display-heading text-lg text-ink">{title}</p>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

/* ---------------- Progress ---------------- */

export function ProgressRing({
  value,
  total,
  size = 72,
}: {
  value: number;
  total: number;
  size?: number;
}) {
  const pct = total > 0 ? Math.min(value / total, 1) : 0;
  const radius = 16;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${value} of ${total} items counted`}
    >
      <svg
        viewBox="0 0 40 40"
        className="h-full w-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-ink/10"
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          className="text-sage"
          strokeDasharray={`${circumference * pct} ${circumference}`}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[11px] font-bold text-ink">
        {total > 0 ? `${Math.round(pct * 100)}%` : "—"}
      </span>
    </div>
  );
}

export function StockBar({ ratio }: { ratio: number }) {
  const clamped = Math.max(0, Math.min(ratio, 1.35));
  const percent = Math.min(clamped / 1.35, 1) * 100;

  const tone =
    ratio < 0.25 ? "bg-red-400" : ratio < 0.6 ? "bg-amber-400" : "bg-sage";

  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-pill bg-ink/8"
      role="img"
      aria-label={`${Math.round(ratio * 100)}% of par level`}
    >
      <div
        className={cn("h-full rounded-pill transition-all", tone)}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
