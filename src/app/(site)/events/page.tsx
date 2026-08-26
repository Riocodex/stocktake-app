import type { Metadata } from "next";

import { CONTACT, GALLERY } from "@/lib/site-content";
import { CtaButton, Pill, SectionTitle } from "@/components/site/blocks";
import { Reveal } from "@/components/site/reveal";
import { MoonSunBand } from "@/components/site/decor";

export const metadata: Metadata = {
  title: "Events",
  description:
    "Brunch clubs, supper sessions and private hire at TRiBE Malta. Book the room, bring the people.",
};

const EVENTS = [
  {
    date: "Every Saturday",
    title: "Bottomless Brunch Club",
    outlet: "Mercury Tower",
    time: "11:00 – 15:00",
    body: "Two hours of free-flowing spritz and prosecco with any brunch main. Bring the group chat.",
    tag: "Weekly",
  },
  {
    date: "First Friday",
    title: "Vinyl & Vermouth",
    outlet: "Valletta",
    time: "19:00 – late",
    body: "Local selectors, small plates and a cocktail list built for the evening. Walk-ins welcome.",
    tag: "Monthly",
  },
  {
    date: "Last Sunday",
    title: "Plant Plate Sunday",
    outlet: "Naxxar",
    time: "10:00 – 16:00",
    body: "A fully plant-based special menu alongside the regular one. Proof that vegan never means boring.",
    tag: "Monthly",
  },
  {
    date: "By arrangement",
    title: "Private hire",
    outlet: "Any outlet",
    time: "Flexible",
    body: "Birthdays, team lunches, baby showers. Tell us the vibe and we will build the menu around it.",
    tag: "On request",
  },
];

export default function EventsPage() {
  return (
    <>
      <section className="px-5 pt-10 pb-14 text-center sm:px-8">
        <Reveal>
          <SectionTitle>Events</SectionTitle>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Pill tone="sage">Brunch clubs</Pill>
            <Pill tone="teal">Private hire</Pill>
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed font-bold text-clay-700 sm:text-base">
            Something is always happening at TRiBE. Grab a seat, or take the whole
            room.
          </p>
        </Reveal>
      </section>

      <section className="px-5 pb-16 sm:px-8">
        <div className="mx-auto grid max-w-5xl gap-5 sm:grid-cols-2">
          {EVENTS.map((event, index) => (
            <Reveal key={event.title} delay={index * 70}>
              <article className="offset-card flex h-full flex-col overflow-hidden rounded-2xl bg-white">
                <div className="w-full bg-sage-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={GALLERY[index % GALLERY.length]}
                    alt=""
                    loading="lazy"
                    className="aspect-16/9 w-full object-cover"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="clay">{event.tag}</Pill>
                    <span className="text-xs font-extrabold text-sage-700">
                      {event.date}
                    </span>
                  </div>
                  <h3 className="display-heading mt-3 text-xl text-teal">
                    {event.title}
                  </h3>
                  <p className="mt-1 text-xs font-extrabold text-clay-600">
                    {event.outlet} · {event.time}
                  </p>
                  <p className="mt-3 flex-1 text-sm leading-relaxed font-bold text-clay">
                    {event.body}
                  </p>
                  <CtaButton
                    href={CONTACT.phoneHref}
                    className="mt-5 self-start text-sm"
                  >
                    Enquire
                  </CtaButton>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <MoonSunBand words={["Good vibes", "Real food"]} />

      <section className="px-5 py-16 text-center sm:px-8">
        <SectionTitle>Planning something bigger?</SectionTitle>
        <p className="mx-auto mt-5 max-w-xl text-sm font-bold text-clay-700">
          Drop us a line and we will put together a menu and a space that fits.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <CtaButton href={`mailto:${CONTACT.email}`}>Email us</CtaButton>
          <CtaButton href={CONTACT.phoneHref} variant="outline">
            {CONTACT.phone}
          </CtaButton>
        </div>
      </section>
    </>
  );
}
