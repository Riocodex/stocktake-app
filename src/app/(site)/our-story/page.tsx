import type { Metadata } from "next";

import { GALLERY, LOCATIONS } from "@/lib/site-content";
import { HamsaMark } from "@/components/brand/marks";
import { CtaButton, Pill, SectionTitle } from "@/components/site/blocks";
import { MoonSunBand, SketchEye, Wave } from "@/components/site/decor";
import { Reveal } from "@/components/site/reveal";

export const metadata: Metadata = {
  title: "Our story",
  description:
    "TRiBE opened its first outlet in Valletta in 2022 with one mission: hearty, creative flavours that feel like a celebration every day.",
};

const TIMELINE = [
  {
    year: "2022",
    title: "The first table",
    body: "TRiBE opens on South Street in Valletta with a short menu, a loud espresso machine and a lot of ambition.",
  },
  {
    year: "2023",
    title: "Brunch takes over",
    body: "All-day brunch becomes the thing people queue for. We add Naxxar and San Gwann to keep up.",
  },
  {
    year: "2024",
    title: "Recognised",
    body: "Restaurant Guru and Travellers' Choice awards land in the same year, voted for by the people who matter most.",
  },
  {
    year: "2025",
    title: "Five strong",
    body: "Balluta and Mercury Tower join the family, bringing TRiBE to five outlets across Malta.",
  },
];

const VALUES = [
  {
    title: "Real ingredients",
    body: "We buy fresh, we prep daily and we do not hide behind sauces. If it is on the plate, it earned its place.",
  },
  {
    title: "Everyone eats",
    body: "Vegan, veggie, gluten-aware or dairy-free — every menu section has something built for you, not an afterthought.",
  },
  {
    title: "Good vibes included",
    body: "Service that feels like friends. Music that makes you stay for one more coffee. No stiff dining rooms here.",
  },
];

export default function OurStoryPage() {
  return (
    <>
      <section className="px-5 pt-10 pb-14 text-center sm:px-8">
        <Reveal>
          <SketchEye className="mx-auto w-20 text-sage" />
          <SectionTitle className="mt-6">Our story</SectionTitle>
          <div className="mt-4 flex justify-center gap-2">
            <Pill tone="sage">Since 2022</Pill>
            <Pill tone="teal">Made in Malta</Pill>
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed font-extrabold text-clay-700 sm:text-lg">
            We opened our very first TRiBE in Valletta back in 2022 with one
            mission: bring hearty, creative flavours to Malta that feel like a
            celebration every day. We have been crafting memories, serving
            thousands of happy guests and growing fast across the island. This
            family keeps expanding and the good vibes never slow down.
          </p>
        </Reveal>
      </section>

      <section className="px-5 pb-16 sm:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3 lg:grid-cols-3">
          {GALLERY.map((src, index) => (
            <Reveal key={src} delay={index * 50}>
              <div className="overflow-hidden rounded-2xl border-2 border-sage bg-sage-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  className="aspect-4/3 w-full object-cover"
                />
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <MoonSunBand />

      {/* Timeline */}
      <section className="px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <SectionTitle align="left" tone="sage">
              How we got here
            </SectionTitle>
          </Reveal>

          <ol className="mt-10 space-y-4">
            {TIMELINE.map((entry, index) => (
              <Reveal key={entry.year} delay={index * 80}>
                <li className="offset-card flex flex-wrap items-start gap-5 rounded-2xl bg-white p-6">
                  <span className="display-heading shrink-0 rounded-xl bg-clay px-4 py-2 text-lg text-white">
                    {entry.year}
                  </span>
                  <div className="min-w-[14rem] flex-1">
                    <h3 className="display-heading text-lg text-teal">
                      {entry.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed font-bold text-clay">
                      {entry.body}
                    </p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Values */}
      <section className="relative">
        <Wave className="text-teal" fill="currentColor" />
        <div className="bg-teal px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <Reveal>
              <HamsaMark className="mx-auto w-16 text-sage" strokeWidth={6} />
              <SectionTitle tone="sage" className="mt-6">
                What we stand for
              </SectionTitle>
            </Reveal>

            <div className="mt-10 grid gap-5 sm:grid-cols-3">
              {VALUES.map((value, index) => (
                <Reveal key={value.title} delay={index * 80}>
                  <div className="h-full rounded-2xl bg-white/8 p-6 ring-1 ring-white/15">
                    <h3 className="display-heading text-lg text-sage">
                      {value.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed font-bold text-white/85">
                      {value.body}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>

            <div className="mt-12 text-center">
              <CtaButton href="/locations" variant="white">
                Come and say hi
              </CtaButton>
            </div>
          </div>
        </div>
        <Wave className="text-teal" position="bottom" fill="currentColor" />
      </section>

      <section className="px-5 py-16 text-center sm:px-8">
        <SectionTitle>
          {LOCATIONS.length} outlets. One TRiBE.
        </SectionTitle>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <CtaButton href="/menu">See the menu</CtaButton>
          <CtaButton href="/locations" variant="outline">
            Find us
          </CtaButton>
        </div>
      </section>
    </>
  );
}
