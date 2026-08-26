const currency = new Intl.NumberFormat("en-MT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const decimal = new Intl.NumberFormat("en-MT", {
  maximumFractionDigits: 2,
});

export function formatMoney(value: number | null | undefined) {
  return currency.format(value ?? 0);
}

export function formatQty(value: number | null | undefined) {
  return decimal.format(value ?? 0);
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}, ${date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function formatRelative(value: Date | string | null | undefined) {
  if (!value) return "never";
  const date = typeof value === "string" ? new Date(value) : value;
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  return formatDate(date);
}

export function formatPercent(value: number) {
  const rounded = Math.round(value * 1000) / 10;
  return `${rounded > 0 ? "+" : ""}${decimal.format(rounded)}%`;
}

export function formatSigned(value: number) {
  return `${value > 0 ? "+" : ""}${decimal.format(value)}`;
}
