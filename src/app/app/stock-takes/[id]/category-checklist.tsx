"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { Badge, Button, cn } from "@/components/ui";
import { formatMoney, formatQty } from "@/lib/format";
import { addLineAction, deleteLineAction, updateLineAction } from "@/lib/actions/stock";

export type ChecklistItem = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  onRecord: number;
  unitPrice: number;
  lineId: string | null;
  countedQty: number | null;
  imageUrl: string | null;
};

export type ChecklistCategory = {
  id: string;
  name: string;
  items: ChecklistItem[];
};

function CheckBubble({ counted }: { counted: boolean }) {
  return (
    <span
      className={cn(
        "grid h-6 w-6 shrink-0 place-items-center rounded-full border-2",
        counted
          ? "border-emerald-500 bg-emerald-500 text-white"
          : "border-ink/25 bg-white",
      )}
      aria-hidden="true"
    >
      {counted ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
        >
          <path d="M5 12l5 5L20 7" />
        </svg>
      ) : null}
    </span>
  );
}

function ItemRow({
  item,
  stockTakeId,
  canEditPrices,
  editable,
  onChanged,
}: {
  item: ChecklistItem;
  stockTakeId: string;
  canEditPrices: boolean;
  editable: boolean;
  onChanged: () => void;
}) {
  const counted = item.lineId !== null;
  const [qty, setQty] = useState(
    item.countedQty !== null ? String(item.countedQty) : "",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    const quantity = Number(qty);
    if (!Number.isFinite(quantity) || quantity < 0 || qty === "") {
      setError("Enter a count.");
      return;
    }
    setError(null);

    startTransition(async () => {
      if (item.lineId) {
        const formData = new FormData();
        formData.set("lineId", item.lineId);
        formData.set("countedQty", qty);
        const result = await updateLineAction({ error: null }, formData);
        if (result.error) setError(result.error);
        else onChanged();
      } else {
        const formData = new FormData();
        formData.set("stockTakeId", stockTakeId);
        formData.set("itemId", item.id);
        formData.set("countedQty", qty);
        const result = await addLineAction({ error: null }, formData);
        if (result.error) setError(result.error);
        else onChanged();
      }
    });
  }

  function uncount() {
    if (!item.lineId) return;
    const formData = new FormData();
    formData.set("lineId", item.lineId);
    startTransition(async () => {
      const result = await deleteLineAction({ error: null }, formData);
      if (result.error) setError(result.error);
      else {
        setQty("");
        onChanged();
      }
    });
  }

  return (
    <li
      id={`count-item-${item.id}`}
      className="flex flex-wrap items-center gap-3 border-t border-ink/6 px-4 py-3 first:border-t-0"
    >
      <button
        type="button"
        onClick={() => (counted && editable ? uncount() : undefined)}
        disabled={!editable || pending}
        aria-label={
          counted
            ? `${item.name} counted. Click to remove from this count.`
            : `${item.name} not yet counted`
        }
        className="shrink-0 disabled:opacity-70"
      >
        <CheckBubble counted={counted} />
      </button>

      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt=""
          className="hidden h-9 w-9 shrink-0 rounded-lg object-cover sm:block"
        />
      ) : null}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
        <p className="truncate text-[11px] text-ink-muted">
          {item.sku} · on record {formatQty(item.onRecord)} {item.unit}
          {canEditPrices ? ` · ${formatMoney(item.unitPrice)}` : ""}
        </p>
        {error ? (
          <p className="text-[11px] font-semibold text-red-600">{error}</p>
        ) : null}
      </div>

      {editable ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            onBlur={() => {
              if (qty !== "" && Number(qty) !== item.countedQty) save();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                save();
              }
            }}
            disabled={pending}
            placeholder="0"
            aria-label={`Count for ${item.name}`}
            className="w-20 rounded-xl border border-ink/15 bg-white px-2 py-1.5 text-right text-sm font-semibold text-ink outline-none transition focus:border-clay disabled:opacity-60"
          />
          <span className="w-12 text-[11px] text-ink-muted">{item.unit}</span>
          <Button
            type="button"
            size="sm"
            variant={counted ? "secondary" : "primary"}
            onClick={save}
            disabled={pending || qty === ""}
          >
            {pending ? "…" : counted ? "Update" : "Count"}
          </Button>
        </div>
      ) : (
        <p className="text-sm font-semibold text-ink">
          {item.countedQty !== null ? (
            <>
              {formatQty(item.countedQty)}{" "}
              <span className="text-xs font-normal text-ink-muted">
                {item.unit}
              </span>
            </>
          ) : (
            <span className="text-xs font-normal text-ink-muted">Not counted</span>
          )}
        </p>
      )}
    </li>
  );
}

export function CategoryChecklist({
  stockTakeId,
  categories,
  canEditPrices,
  editable,
}: {
  stockTakeId: string;
  categories: ChecklistCategory[];
  canEditPrices: boolean;
  editable: boolean;
}) {
  const router = useRouter();
  const firstOpen = useMemo(() => {
    const unfinished = categories.find((category) =>
      category.items.some((item) => item.lineId === null),
    );
    return unfinished?.id ?? categories[0]?.id ?? null;
  }, [categories]);

  const [openId, setOpenId] = useState<string | null>(firstOpen);
  const pendingJump = useRef<string | null>(null);
  const [jumpNonce, setJumpNonce] = useState(0);

  useEffect(() => {
    function onJump(event: Event) {
      const detail = (event as CustomEvent<{ categoryId: string; itemId: string }>)
        .detail;
      if (!detail?.categoryId) return;
      pendingJump.current = detail.itemId;
      setOpenId(detail.categoryId);
      setJumpNonce((value) => value + 1);
    }
    window.addEventListener("tribe:focus-count-item", onJump);
    return () => window.removeEventListener("tribe:focus-count-item", onJump);
  }, []);

  useEffect(() => {
    const itemId = pendingJump.current;
    if (!itemId) return;
    pendingJump.current = null;
    window.requestAnimationFrame(() => {
      document
        .getElementById(`count-item-${itemId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [openId, jumpNonce]);

  if (categories.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        No catalogue items sit in this section yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {categories.map((category) => {
        const counted = category.items.filter((item) => item.lineId).length;
        const open = openId === category.id;
        const done = counted === category.items.length && category.items.length > 0;

        return (
          <section
            key={category.id}
            className="overflow-hidden rounded-3xl border border-ink/8 bg-white"
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? null : category.id)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <div className="min-w-0">
                <p className="display-heading text-lg text-ink">{category.name}</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {counted} of {category.items.length} counted
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {done ? <Badge tone="ok">Done</Badge> : null}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  className={cn(
                    "h-5 w-5 text-ink-muted transition-transform",
                    open && "rotate-180",
                  )}
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </button>

            {open ? (
              <ul className="border-t border-ink/8">
                {category.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    stockTakeId={stockTakeId}
                    canEditPrices={canEditPrices}
                    editable={editable}
                    onChanged={() => router.refresh()}
                  />
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
