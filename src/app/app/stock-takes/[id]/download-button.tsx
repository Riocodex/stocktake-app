"use client";

import { Button } from "@/components/ui";
import { formatMoney } from "@/lib/format";

export function DownloadStockTakeButton({
  stockTakeId,
  reference,
}: {
  stockTakeId: string;
  reference: string;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={() => {
        window.location.href = `/api/stock-takes/${stockTakeId}/export`;
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />
      </svg>
      Download {reference}
    </Button>
  );
}

export function DownloadHint({ totalValue }: { totalValue: number }) {
  return (
    <p className="text-xs text-ink-muted">
      Spreadsheet includes every item, unit, count, price and the total of{" "}
      <span className="font-semibold text-ink">{formatMoney(totalValue)}</span>.
    </p>
  );
}
