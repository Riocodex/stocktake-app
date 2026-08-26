import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EyeMark, HamsaMark } from "@/components/brand/marks";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in · Stock Take",
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/app");

  const [outletCount, itemCount] = await Promise.all([
    prisma.outlet.count(),
    prisma.inventoryItem.count({ where: { isActive: true } }),
  ]);

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-ink px-12 py-14 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-[26rem] w-[26rem] rounded-full bg-clay/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 h-[24rem] w-[24rem] rounded-full bg-sage/15 blur-3xl"
        />

        <Link href="/" className="relative w-40">
          <Image
            src="/brand/tribe-wordmark.png"
            alt="TRiBE"
            width={1800}
            height={291}
            className="h-auto w-full"
            priority
          />
        </Link>

        <div className="relative max-w-lg">
          <HamsaMark className="mb-8 w-20 text-sage/80" />
          <h1 className="display-heading text-5xl text-cream">
            Stock take,
            <br />
            <span className="text-clay-300">sorted.</span>
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-cream/70">
            Photograph the shelf. Our AI reads the labels, counts the units and
            updates prices across every TRiBE outlet — so your team spends the
            morning on service, not on clipboards.
          </p>
        </div>

        <dl className="relative grid grid-cols-3 gap-6 border-t border-cream/10 pt-8">
          {[
            { value: String(outletCount), label: "Outlets" },
            { value: String(itemCount), label: "Catalogue items" },
            { value: "1 photo", label: "Per shelf" },
          ].map((stat) => (
            <div key={stat.label}>
              <dt className="display-heading text-2xl text-sage">
                {stat.value}
              </dt>
              <dd className="mt-1 text-[11px] tracking-[0.14em] text-cream/50 uppercase">
                {stat.label}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center px-6 py-14 sm:px-12">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-10 inline-block w-32 lg:hidden">
            <Image
              src="/brand/tribe-wordmark.png"
              alt="TRiBE"
              width={1800}
              height={291}
              className="h-auto w-full"
            />
          </Link>

          <EyeMark className="mb-6 w-12 text-clay animate-blink" />

          <p className="eyebrow text-clay">Stock Take</p>
          <h2 className="display-heading mt-2 text-3xl text-ink">
            Sign in to your outlet
          </h2>
          <p className="mt-2 mb-8 text-sm text-ink-muted">
            Outlet admins see their own venue. Super admins see the whole group.
          </p>

          <LoginForm />

          <p className="mt-8 text-xs text-ink-muted">
            <Link href="/" className="font-semibold text-clay hover:underline">
              ← Back to tribemalta.com
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
