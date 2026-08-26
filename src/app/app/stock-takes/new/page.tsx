import Link from "next/link";
import type { Metadata } from "next";

import { isSuperAdmin, requireUser } from "@/lib/auth";
import { getOutlets } from "@/lib/queries";
import { isAiConfigured } from "@/lib/ai";
import { Card } from "@/components/ui";
import { EyeMark } from "@/components/brand/marks";
import { NewStockTakeForm } from "./new-stock-take-form";

export const metadata: Metadata = { title: "New stock take" };

const STEPS = [
  {
    title: "Photograph each area",
    body: "Shelf, fridge, back bar, dry store. One clear photo per area is enough.",
  },
  {
    title: "AI reads and counts",
    body: "Labels are matched to your catalogue, units are counted and visible price tags are read.",
  },
  {
    title: "Review and submit",
    body: "Adjust anything that looks off, then submit to update your live stock.",
  },
];

export default async function NewStockTakePage() {
  const user = await requireUser();
  const superAdmin = isSuperAdmin(user);
  const outlets = superAdmin ? await getOutlets() : [];

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/app/stock-takes"
          className="text-xs font-semibold text-clay hover:underline"
        >
          ← All stock takes
        </Link>
        <h1 className="display-heading mt-3 text-3xl text-ink sm:text-4xl">
          Start a stock take
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          Create the session first, then add photos. Nothing touches your live
          stock until you submit.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <NewStockTakeForm
            outlets={outlets}
            fixedOutletName={superAdmin ? null : user.outletName}
          />
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card className="bg-ink text-cream">
            <EyeMark className="w-10 text-sage animate-blink" />
            <p className="eyebrow mt-4 text-sage">How it works</p>
            <ol className="mt-4 space-y-4">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-clay text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-cream">
                      {step.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-cream/60">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          {!isAiConfigured() ? (
            <Card className="border-amber-200 bg-amber-50">
              <p className="eyebrow text-amber-800">Simulation mode</p>
              <p className="mt-2 text-xs leading-relaxed text-amber-900">
                No vision API key is configured, so photo analysis returns
                realistic simulated readings. The full flow still works. Add{" "}
                <code className="font-semibold">OPENAI_API_KEY</code> to{" "}
                <code className="font-semibold">.env</code> for real analysis.
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
