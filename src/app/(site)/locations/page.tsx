import type { Metadata } from "next";

import { CONTACT, LOCATIONS } from "@/lib/site-content";
import {
  CtaButton,
  LocationCard,
  SectionTitle,
} from "@/components/site/blocks";
import { Reveal } from "@/components/site/reveal";
import { Wave } from "@/components/site/decor";

export const metadata: Metadata = {
  title: "Locations",
  description:
    "Find TRiBE in Balluta, Mercury Tower, Naxxar, San Gwann and Valletta. Opening hours and menus for every outlet.",
};

export default function LocationsPage() {
  return (
    <>
      <section className="px-5 pt-10 pb-14 text-center sm:px-8">
        <Reveal>
          <SectionTitle>Locations</SectionTitle>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed font-bold text-clay-700 sm:text-base">
            Five homes across the island. Same TRiBE welcome, same all-day
            kitchen, wherever you find us.
          </p>
        </Reveal>
      </section>

      <section className="px-5 pb-16 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {LOCATIONS.map((location, index) => (
            <Reveal key={location.slug} delay={index * 70}>
              <LocationCard location={location} />
            </Reveal>
          ))}
        </div>
      </section>

      <section className="relative">
        <Wave className="text-teal" fill="currentColor" />
        <div className="bg-teal px-5 py-16 text-center sm:px-8">
          <SectionTitle tone="sage">Book a table</SectionTitle>
          <p className="mx-auto mt-5 max-w-xl text-sm font-bold text-white/85">
            Walk-ins are always welcome, but for larger groups give us a ring and
            we will sort you out.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <CtaButton href={CONTACT.phoneHref} variant="white">
              {CONTACT.phone}
            </CtaButton>
            <CtaButton href={`mailto:${CONTACT.email}`} variant="white">
              Email us
            </CtaButton>
          </div>
        </div>
        <Wave className="text-teal" position="bottom" fill="currentColor" />
      </section>
    </>
  );
}
