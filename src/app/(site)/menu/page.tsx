import type { Metadata } from "next";

import { DIET_LABELS, DISHES } from "@/lib/site-content";
import {
  CtaButton,
  DishCard,
  Pill,
  SectionTitle,
} from "@/components/site/blocks";
import { MoonSunBand } from "@/components/site/decor";
import { Reveal } from "@/components/site/reveal";

export const metadata: Metadata = {
  title: "Menu",
  description:
    "All-day breakfast, brunch, burgers and bowls. Vegan, veggie and dairy-free options across every TRiBE outlet in Malta.",
};

export default function MenuPage() {
  return (
    <>
      <section className="px-5 pt-10 pb-14 text-center sm:px-8">
        <Reveal>
          <SectionTitle>The menu</SectionTitle>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Pill tone="sage">All day</Pill>
            <Pill tone="teal">Vegan &amp; veggie</Pill>
            <Pill tone="clay">Dairy-free options</Pill>
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed font-bold text-clay-700 sm:text-base">
            Real ingredients, generous plates and nothing sacrificed on flavour.
            Every dish is available across all five TRiBE outlets.
          </p>
        </Reveal>
      </section>

      <section className="px-5 pb-16 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {DISHES.map((dish, index) => (
            <Reveal key={dish.name} delay={index * 60}>
              <div className="flex h-full flex-col overflow-hidden rounded-2xl">
                <div className="w-full overflow-hidden rounded-t-2xl bg-sage-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={dish.image}
                    alt={dish.name}
                    loading="lazy"
                    className="aspect-4/3 w-full object-cover"
                  />
                </div>
                <div className="-mt-1 flex-1">
                  <DishCard dish={dish} />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="px-5 pb-16 sm:px-8">
        <div className="mx-auto max-w-3xl rounded-2xl border-2 border-sage bg-sage-50 p-6 text-center">
          <h2 className="display-heading text-lg text-teal">Allergen key</h2>
          <ul className="mt-4 flex flex-wrap justify-center gap-3">
            {Object.entries(DIET_LABELS).map(([code, label]) => (
              <li
                key={code}
                className="flex items-center gap-2 rounded-pill bg-white px-3 py-1.5"
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-clay text-[10px] font-extrabold text-white">
                  {code}
                </span>
                <span className="text-xs font-bold text-clay-700">{label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs font-bold text-clay-600">
            Please tell your server about any allergies before ordering.
          </p>
        </div>
      </section>

      <MoonSunBand />

      <section className="px-5 py-16 text-center sm:px-8">
        <SectionTitle>Hungry yet?</SectionTitle>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <CtaButton href="/locations">Find your nearest TRiBE</CtaButton>
        </div>
      </section>
    </>
  );
}
