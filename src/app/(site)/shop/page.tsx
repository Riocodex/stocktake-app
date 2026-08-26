import type { Metadata } from "next";

import { MERCH } from "@/lib/site-content";
import { CtaButton, Pill, SectionTitle } from "@/components/site/blocks";
import { Reveal } from "@/components/site/reveal";

export const metadata: Metadata = {
  title: "Shop",
  description:
    "TRiBE tees, totes, keep cups and caps, plus pastries and cakes baked fresh by the TRiBE team.",
};

const BAKERY = [
  { name: "Banana Bread Loaf", price: "€14.00" },
  { name: "Basque Cheesecake", price: "€28.00" },
  { name: "Croissant Box of 6", price: "€12.00" },
  { name: "Celebration Cake", price: "€45.00" },
];

export default function ShopPage() {
  return (
    <>
      <section className="px-5 pt-10 pb-14 text-center sm:px-8">
        <Reveal>
          <SectionTitle>Shop TRiBE</SectionTitle>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Pill tone="sage">Merch</Pill>
            <Pill tone="teal">Food</Pill>
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed font-bold text-clay-700 sm:text-base">
            Level up your wardrobe and your cravings. Shop tees, totes and more
            plus order pastries and cakes baked fresh by the TRiBE team.
          </p>
        </Reveal>
      </section>

      <section className="px-5 pb-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="display-heading mb-6 text-2xl text-sage">Merch</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {MERCH.map((product, index) => (
              <Reveal key={product.name} delay={index * 60}>
                <article className="group overflow-hidden rounded-2xl border-2 border-clay-100 bg-white transition-colors hover:border-clay">
                  <div className="w-full overflow-hidden bg-clay-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.image}
                      alt={product.name}
                      loading="lazy"
                      className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="display-heading text-base text-teal">
                      {product.name}
                    </h3>
                    <p className="mt-1 text-sm font-extrabold text-clay">
                      {product.price}
                    </p>
                    <button
                      type="button"
                      className="mt-3 w-full rounded-pill bg-clay py-2 text-xs font-bold text-white transition-colors hover:bg-clay-600"
                    >
                      Add to cart
                    </button>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>

          <h2 className="display-heading mt-16 mb-6 text-2xl text-sage">
            From the bakery
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BAKERY.map((item, index) => (
              <Reveal key={item.name} delay={index * 60}>
                <article className="offset-card flex h-full flex-col justify-between rounded-2xl bg-white p-5">
                  <h3 className="display-heading text-base text-teal">
                    {item.name}
                  </h3>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-sm font-extrabold text-clay">
                      {item.price}
                    </span>
                    <button
                      type="button"
                      className="rounded-pill bg-sage px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-sage-600"
                    >
                      Pre-order
                    </button>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-20 text-center sm:px-8">
        <div className="mx-auto max-w-3xl rounded-2xl border-2 border-sage bg-sage-50 p-8">
          <h2 className="display-heading text-xl text-teal">
            Collection only, for now
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm font-bold text-clay-700">
            Order online and pick up from any TRiBE outlet. Island-wide delivery
            is on its way.
          </p>
          <CtaButton href="/locations" className="mt-6">
            Choose a pickup outlet
          </CtaButton>
        </div>
      </section>
    </>
  );
}
