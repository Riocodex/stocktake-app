"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui";
import { setDishActiveAction } from "./actions";

export function DishActiveToggle({
  dishId,
  isActive,
}: {
  dishId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await setDishActiveAction(dishId, !isActive);
            if (result.error) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {pending
          ? "Updating…"
          : isActive
            ? "Deactivate"
            : "Activate"}
      </Button>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
