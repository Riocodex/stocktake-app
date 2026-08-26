import Link from "next/link";

import {
  DISHES,
  GALLERY,
  LOCATIONS,
  MERCH,
  TESTIMONIALS,
} from "@/lib/site-content";
import { EyeMark } from "@/components/brand/marks";
import {
  CtaButton,
  DishCard,
  LocationCard,
  Pill,
  SectionTitle,
  TestimonialCard,
} from "@/components/site/blocks";
import { MoonSunBand, SketchEye, Wave } from "@/components/site/decor";
import { Reveal } from "@/components/site/reveal";

export default function HomePage() {
  return (
    <>
      {/* ---------------- Hero ---------------- */}
      <section className="px-3 sm:px-6">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-teal">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1800&q=75"
            alt="Brunch spread on a TRiBE table"
            className="h-[62vh] max-h-[40rem] min-h-[26rem] w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-cocoa/80 via-cocoa/25 to-transparent" />

          <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10">
            <Reveal>
              <div className="flex flex-wrap gap-2">
                <Pill tone="sage">All-day dining</Pill>
                <Pill tone="teal">Vegan & veggie friendly</Pill>
              </div>
              <h1 className="display-heading mt-4 max-w-3xl text-4xl text-white sm:text-6xl lg:text-7xl">
                Eat. Sip. Repeat.
              </h1>
              <p className="mt-3 max-w-xl text-sm font-bold text-white/90 sm:text-base">
                Where every bite brings you closer to the Tribe.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <CtaButton href="/menu">See the menu</CtaButton>
                <CtaButton href="/locations" variant="white">
                  Find us
                </CtaButton>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------------- Clay strap line ---------------- */}
      <section className="relative px-3 pt-12 sm:px-6 sm:pt-16">
        <SketchEye className="mx-auto mb-[-1rem] ml-4 w-20 text-sage sm:ml-16" />
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 rounded-2xl bg-clay px-6 py-6 sm:px-10">
          <div>
            <p className="display-heading text-xl text-white sm:text-2xl">
              Real ingredients. Real freshness. Real fun.
            </p>
            <p className="display-heading mt-1 text-sm text-clay-200 sm:text-base">
              Malta&apos;s heartiest all-day dining experience
            </p>
          </div>
          <div className="flex items-center gap-4">
            {["Restaurant Guru 2024", "Travellers' Choice 2024"].map((award) => (
              <div
                key={award}
                className="grid h-16 w-16 place-items-center rounded-full border-2 border-white/60 px-2 text-center text-[8px] leading-tight font-extrabold text-white uppercase"
              >
                {award}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- What is TRiBE ---------------- */}
      <section className="px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <SectionTitle>What is TRiBE?</SectionTitle>
            <div className="mt-4 flex justify-center gap-2">
              <Pill tone="sage">TRiBE Vibe</Pill>
              <Pill tone="teal">Brunch &amp; More</Pill>
            </div>
            <p className="mt-7 text-base leading-relaxed font-extrabold text-clay-700 sm:text-lg">
              What if eating out felt like hanging with your favourite people?
              That is TRiBE. A place for food with soul and cocktails with
              personality. Breakfasts that kickstart your day. Coffee brewed to
              perfection. Brunch that stretches all afternoon. Lunch that keeps
              you fueled. Plates crafted for all dietary needs, without ever
              compromising flavour. Real ingredients. Real freshness. Real fun.
              Malta&apos;s heartiest all-day dining experience is here.
            </p>
          </Reveal>
        </div>
      </section>

      <MoonSunBand />

      {/* ---------------- TRiBE Goodness ---------------- */}
      <section className="px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <SectionTitle align="left" tone="sage">
              TRiBE Goodness
            </SectionTitle>
          </Reveal>

          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <Reveal>
              <div className="overflow-hidden rounded-2xl border-2 border-sage bg-sage-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={DISHES[3].image}
                  alt={DISHES[3].name}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
              </div>
            </Reveal>

            <div className="grid gap-4 sm:grid-cols-2">
              {DISHES.slice(0, 4).map((dish, index) => (
                <Reveal key={dish.name} delay={index * 70}>
                  <DishCard dish={dish} />
                </Reveal>
              ))}
            </div>
          </div>

          <div className="mt-10 text-center">
            <CtaButton href="/menu">See all dishes</CtaButton>
          </div>
        </div>
      </section>

      {/* ---------------- Get the vibe ---------------- */}
      <section className="relative">
        <Wave className="text-cocoa" fill="currentColor" />
        <div className="bg-teal px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center">
            <Reveal>
              <SectionTitle align="left" tone="sage">
                Get the vibe
              </SectionTitle>
              <p className="mt-5 text-base leading-relaxed font-extrabold text-white sm:text-lg">
                We opened our very first TRiBE in Valletta back in 2022 with one
                mission: bring hearty, creative flavours to Malta that feel like
                a celebration every day. We have been crafting memories, serving
                thousands of happy guests and growing fast across the island.
                This family keeps expanding and the good vibes never slow down.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <CtaButton href="/our-story" variant="white">
                  Our story
                </CtaButton>
              </div>

              <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/15 pt-7">
                {[
                  { value: `${LOCATIONS.length}`, label: "Locations" },
                  { value: "2022", label: "Since" },
                  { value: "All day", label: "Kitchen open" },
                ].map((stat) => (
                  <div key={stat.label}>
                    <dt className="display-heading text-2xl text-sage sm:text-3xl">
                      {stat.value}
                    </dt>
                    <dd className="mt-1 text-[11px] font-bold tracking-[0.14em] text-white/60 uppercase">
                      {stat.label}
                    </dd>
                  </div>
                ))}
              </dl>
            </Reveal>

            <Reveal delay={120}>
              <div className="grid grid-cols-2 gap-3">
                {GALLERY.slice(0, 4).map((src, index) => (
                  <div
                    key={src}
                    className={
                      index % 3 === 0
                        ? "overflow-hidden rounded-2xl bg-teal-600 sm:translate-y-4"
                        : "overflow-hidden rounded-2xl bg-teal-600"
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
        <Wave className="text-cocoa" position="bottom" fill="currentColor" />
      </section>

      {/* ---------------- Locations ---------------- */}
      <section className="px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <SectionTitle>Find your TRiBE</SectionTitle>
            <p className="mx-auto mt-4 max-w-xl text-center text-sm font-bold text-clay-700">
              Five homes across Malta, all serving the same good vibes.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {LOCATIONS.slice(0, 3).map((location, index) => (
              <Reveal key={location.slug} delay={index * 80}>
                <LocationCard location={location} />
              </Reveal>
            ))}
          </div>

          <div className="mt-8 text-center">
            <CtaButton href="/locations" variant="outline">
              All locations
            </CtaButton>
          </div>
        </div>
      </section>

      {/* ---------------- Testimonials ---------------- */}
      <section className="bg-teal py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <Reveal>
            <SectionTitle align="right" tone="clay">
              Our best reviews are
              <br />
              our customers
            </SectionTitle>
            <div className="mt-5 text-right text-sm font-bold text-white/85">
              <p>You made TRiBE what it is.</p>
              <p>Your moments, your memories, your reviews.</p>
              <p>Thanks for being part of the Tribe.</p>
            </div>
          </Reveal>
        </div>

        <div className="no-scrollbar mt-10 flex gap-4 overflow-x-auto px-5 pb-2 sm:px-8">
          {TESTIMONIALS.map((testimonial) => (
            <TestimonialCard key={testimonial.name} testimonial={testimonial} />
          ))}
        </div>
      </section>

      {/* ---------------- Shop ---------------- */}
      <section className="px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <SectionTitle>Shop TRiBE merch</SectionTitle>
            <p className="mx-auto mt-4 max-w-2xl text-center text-sm font-bold text-clay-700">
              Level up your wardrobe and your cravings. Shop tees, totes and more
              plus order pastries and cakes baked fresh by the TRiBE team.
            </p>
          </Reveal>

          <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {MERCH.map((product, index) => (
              <Reveal key={product.name} delay={index * 70}>
                <Link
                  href="/shop"
                  className="group block overflow-hidden rounded-2xl border-2 border-clay-100 bg-white transition-colors hover:border-clay"
                >
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
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>

          <div className="mt-8 text-center">
            <CtaButton href="/shop">Shop all merch</CtaButton>
          </div>
        </div>
      </section>

      <MoonSunBand words={["Good vibes", "Real food"]} />

      {/* ---------------- Closing ---------------- */}
      <section className="px-5 py-20 text-center sm:px-8">
        <EyeMark className="mx-auto w-16 text-sage animate-blink" />
        <SectionTitle className="mt-6">See you at the table</SectionTitle>
        <p className="mx-auto mt-4 max-w-lg text-sm font-bold text-clay-700">
          Walk in, book a table, or grab it to go. Either way, you are part of the
          Tribe.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <CtaButton href="/locations">Book a table</CtaButton>
          <CtaButton href="/menu" variant="outline">
            Browse the menu
          </CtaButton>
        </div>
      </section>
    </>
  );
}
