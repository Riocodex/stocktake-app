import { NextResponse } from "next/server";

import { assertOutletAccess, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AREA_LABELS, STOCK_TAKE_STATUS } from "@/lib/constants";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";

function csvCell(value: string | number | null | undefined) {
  const string = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(string)) return `"${string.replaceAll('"', '""')}"`;
  return string;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { id } = await context.params;
  const stockTake = await prisma.stockTake.findUnique({
    where: { id },
    include: {
      outlet: { select: { name: true } },
      user: { select: { name: true } },
      lines: {
        include: {
          item: { include: { category: true } },
        },
        orderBy: [
          { item: { category: { sortOrder: "asc" } } },
          { item: { name: "asc" } },
        ],
      },
    },
  });

  if (!stockTake) {
    return NextResponse.json({ error: "Stock take not found." }, { status: 404 });
  }

  try {
    assertOutletAccess(user, stockTake.outletId);
  } catch {
    return NextResponse.json(
      { error: "You do not have access to this outlet." },
      { status: 403 },
    );
  }

  const total = stockTake.lines.reduce(
    (sum, line) => sum + line.countedQty * line.unitPrice,
    0,
  );

  const rows: string[] = [
    ["TRiBE stock take", stockTake.reference].map(csvCell).join(","),
    ["Outlet", stockTake.outlet.name].map(csvCell).join(","),
    ["Section", AREA_LABELS[stockTake.area] ?? stockTake.area].map(csvCell).join(","),
    ["Counted by", stockTake.user.name].map(csvCell).join(","),
    [
      "Status",
      stockTake.status === STOCK_TAKE_STATUS.SUBMITTED ? "Submitted" : "Draft",
    ]
      .map(csvCell)
      .join(","),
    [
      "Date",
      formatDateTime(stockTake.submittedAt ?? stockTake.createdAt),
    ]
      .map(csvCell)
      .join(","),
    "",
    ["Item", "Section", "Unit", "Counted", "Unit price", "Line value"]
      .map(csvCell)
      .join(","),
  ];

  for (const line of stockTake.lines) {
    const name = line.item.brand
      ? `${line.item.brand} ${line.item.name}`
      : line.item.name;
    rows.push(
      [
        name,
        line.item.category.name,
        line.item.unit,
        formatQty(line.countedQty),
        line.unitPrice.toFixed(2),
        (line.countedQty * line.unitPrice).toFixed(2),
      ]
        .map(csvCell)
        .join(","),
    );
  }

  rows.push("");
  rows.push(
    ["", "", "", "", "Total stock value", total.toFixed(2)]
      .map(csvCell)
      .join(","),
  );
  rows.push(["", "", "", "", "Total (EUR)", formatMoney(total)].map(csvCell).join(","));

  const body = `\uFEFF${rows.join("\n")}\n`;
  const fileName = `${stockTake.reference.replaceAll(" ", "-")}.csv`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
