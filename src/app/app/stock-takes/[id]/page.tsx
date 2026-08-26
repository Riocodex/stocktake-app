import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { assertOutletAccess, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAiConfigured } from "@/lib/ai";
import { PHOTO_STATUS, STOCK_TAKE_STATUS } from "@/lib/constants";
import { formatDateTime, formatMoney, formatRelative } from "@/lib/format";
import { Badge, Card, EmptyState, SectionHeading } from "@/components/ui";
import { PhotoUploader } from "./photo-uploader";
import { LineEditor, type EditableLine } from "./line-editor";
import {
  AddLineForm,
  DetectionResolver,
  SubmitPanel,
  type CatalogueOption,
  type UnmatchedDetection,
} from "./draft-controls";

export const metadata: Metadata = { title: "Stock take" };

export default async function StockTakeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const stockTake = await prisma.stockTake.findUnique({
    where: { id },
    include: {
      outlet: true,
      user: { select: { name: true } },
      photos: { orderBy: { createdAt: "asc" } },
      lines: {
        include: {
          item: { include: { category: true } },
          photo: { select: { url: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!stockTake) notFound();

  try {
    assertOutletAccess(user, stockTake.outletId);
  } catch {
    notFound();
  }

  const isDraft = stockTake.status === STOCK_TAKE_STATUS.DRAFT;

  const [unmatchedRaw, catalogue] = await Promise.all([
    prisma.photoDetection.findMany({
      where: { stockTakeId: id, status: "UNMATCHED" },
      include: { photo: { select: { url: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.inventoryItem.findMany({
      where: { isActive: true },
      include: { category: true },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    }),
  ]);

  const lines: EditableLine[] = stockTake.lines.map((line) => ({
    id: line.id,
    itemName: line.item.brand
      ? `${line.item.brand} ${line.item.name}`
      : line.item.name,
    sku: line.item.sku,
    unit: line.item.unit,
    category: line.item.category.name,
    countedQty: line.countedQty,
    previousQty: line.previousQty,
    unitPrice: line.unitPrice,
    previousPrice: line.previousPrice,
    source: line.source,
    confidence: line.confidence,
    aiLabel: line.aiLabel,
    photoUrl: line.photo?.url ?? null,
  }));

  const unmatched: UnmatchedDetection[] = unmatchedRaw.map((detection) => ({
    id: detection.id,
    label: detection.label,
    quantity: detection.quantity,
    unitPrice: detection.unitPrice,
    unit: detection.unit,
    confidence: detection.confidence,
    photoUrl: detection.photo?.url ?? null,
  }));

  const options: CatalogueOption[] = catalogue.map((item) => ({
    id: item.id,
    label: `${item.brand ? `${item.brand} ` : ""}${item.name} (${item.sku})`,
    category: item.category.name,
    unit: item.unit,
  }));

  const totalValue = lines.reduce(
    (sum, line) => sum + line.countedQty * line.unitPrice,
    0,
  );
  const aiLines = lines.filter((line) => line.source === "AI").length;
  const shrinkage = lines.reduce((sum, line) => {
    const delta = line.countedQty - line.previousQty;
    return delta < 0 ? sum + delta * line.unitPrice : sum;
  }, 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/app/stock-takes"
            className="text-xs font-semibold text-clay hover:underline"
          >
            ← All stock takes
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="display-heading text-3xl text-ink sm:text-4xl">
              {stockTake.reference}
            </h1>
            {isDraft ? (
              <Badge tone="warn">Draft</Badge>
            ) : (
              <Badge tone="ok">Submitted</Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            {stockTake.outlet.name} · started by {stockTake.user.name} ·{" "}
            {formatDateTime(stockTake.createdAt)}
            {stockTake.submittedAt
              ? ` · filed ${formatRelative(stockTake.submittedAt)}`
              : ""}
          </p>
          {stockTake.note ? (
            <p className="mt-2 max-w-xl rounded-2xl bg-cream-deep/70 px-3 py-2 text-xs text-ink-soft">
              {stockTake.note}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-4 text-right">
          <div>
            <p className="eyebrow text-ink-muted">Lines</p>
            <p className="display-heading mt-1 text-2xl text-ink">
              {lines.length}
            </p>
          </div>
          <div>
            <p className="eyebrow text-ink-muted">By AI</p>
            <p className="display-heading mt-1 text-2xl text-sage-700">
              {aiLines}
            </p>
          </div>
          <div>
            <p className="eyebrow text-ink-muted">Value</p>
            <p className="display-heading mt-1 text-2xl text-clay">
              {formatMoney(totalValue)}
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {isDraft ? (
            <PhotoUploader stockTakeId={id} simulated={!isAiConfigured()} />
          ) : null}

          {stockTake.photos.length > 0 ? (
            <section>
              <SectionHeading
                title="Photos"
                description={`${stockTake.photos.length} image${
                  stockTake.photos.length === 1 ? "" : "s"
                } analysed for this count.`}
              />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {stockTake.photos.map((photo) => (
                  <figure
                    key={photo.id}
                    className="overflow-hidden rounded-2xl border border-ink/8 bg-white"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.fileName}
                      className="aspect-square w-full object-cover"
                    />
                    <figcaption className="px-3 py-2">
                      <p className="truncate text-[11px] font-semibold text-ink">
                        {photo.detectedCount} detected
                      </p>
                      <p className="truncate text-[10px] text-ink-muted">
                        {photo.status === PHOTO_STATUS.FAILED
                          ? (photo.error ?? "Analysis failed")
                          : (photo.provider ?? photo.status)}
                      </p>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ) : null}

          {unmatched.length > 0 && isDraft ? (
            <DetectionResolver detections={unmatched} options={options} />
          ) : null}
        </div>

        <div className="space-y-4">
          {isDraft ? (
            <SubmitPanel
              stockTakeId={id}
              lineCount={lines.length}
              totalValue={totalValue}
              note={stockTake.note}
            />
          ) : (
            <Card className="bg-sage-50">
              <p className="eyebrow text-sage-800">Filed</p>
              <p className="mt-2 text-sm text-ink-soft">
                Submitted {formatDateTime(stockTake.submittedAt)}. Live stock for{" "}
                {stockTake.outlet.name} was updated from these figures.
              </p>
            </Card>
          )}

          <Card>
            <p className="eyebrow text-ink-muted">Count summary</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Counted value</dt>
                <dd className="font-semibold text-ink">
                  {formatMoney(totalValue)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Lines from AI</dt>
                <dd className="font-semibold text-ink">
                  {aiLines}/{lines.length}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Negative variance</dt>
                <dd
                  className={
                    shrinkage < 0
                      ? "font-semibold text-red-600"
                      : "font-semibold text-ink"
                  }
                >
                  {formatMoney(shrinkage)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Photos</dt>
                <dd className="font-semibold text-ink">
                  {stockTake.photos.length}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      {/* Full width: the line table has too many columns for a third of the page. */}
      <section>
        <SectionHeading
          title="Counted lines"
          description={
            isDraft
              ? "Edit any figure inline. Changes save when you leave the field."
              : "This count has been filed and is read-only."
          }
        />

        {lines.length === 0 ? (
          <EmptyState
            title="Nothing counted yet"
            description="Add a photo above and the AI will fill this in, or add products by hand."
          />
        ) : (
          <LineEditor lines={lines} editable={isDraft} />
        )}
      </section>

      {isDraft ? <AddLineForm stockTakeId={id} options={options} /> : null}
    </div>
  );
}
