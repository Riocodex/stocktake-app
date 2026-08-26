import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/components/ui";
import {
  DIET_LABELS,
  type Dish,
  type Location,
  type Testimonial,
} from "@/lib/site-content";

export function SectionTitle({
  children,
  align = "center",
  tone = "sage",
  className,
}: {
  children: ReactNode;
  align?: "center" | "left" | "right";
  tone?: "clay" | "sage" | "teal" | "white";
  className?: string;
}) {
  const tones = {
    clay: "text-clay",
    sage: "text-sage",
    teal: "text-teal",
    white: "text-white",
  } as const;

  return (
    <h2
      className={cn(
        "display-heading text-3xl sm:text-4xl lg:text-5xl",
        tones[tone],
        align === "center" && "text-center",
        align === "right" && "text-right",
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function Pill({
  children,
  tone = "sage",
}: {
  children: ReactNode;
  tone?: "sage" | "teal" | "clay";
}) {
  const tones = {
    sage: "bg-sage text-white",
    teal: "bg-teal text-white",
    clay: "bg-clay-100 text-clay-700",
  } as const;

  return (
    <span
      className={cn(
        "inline-block rounded-pill px-4 py-1 text-xs font-extrabold italic",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Circular dietary marker, e.g. G for gluten. */
function DietBadge({ code }: { code: keyof typeof DIET_LABELS }) {
  return (
    <span
      title={DIET_LABELS[code]}
      className="grid h-6 w-6 place-items-center rounded-full bg-clay text-[10px] font-extrabold text-white"
    >
      {code}
    </span>
  );
}

export function DishCard({ dish }: { dish: Dish }) {
  return (
    <article className="offset-card flex h-full flex-col rounded-2xl bg-white p-5">
      {dish.tags && dish.tags.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {dish.tags.map((tag) => (
            <Pill key={tag} tone={tag === "Signature" ? "clay" : "sage"}>
              {tag}
            </Pill>
          ))}
        </div>
      ) : null}

      <h3 className="display-heading text-lg text-sage-700">{dish.name}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed font-bold text-clay">
        {dish.description}
      </p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {dish.diets.map((diet) => (
            <DietBadge key={diet} code={diet} />
          ))}
        </div>
        <span className="display-heading text-lg text-teal">{dish.price}</span>
      </div>
    </article>
  );
}

export function LocationCard({ location }: { location: Location }) {
  return (
    <article className="overflow-hidden rounded-2xl border-2 border-sage bg-white">
      <div className="w-full bg-sage-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={location.image}
          alt={`TRiBE ${location.name}`}
          loading="lazy"
          className="aspect-4/3 w-full object-cover"
        />
      </div>
      <div className="p-5">
        <h3 className="display-heading text-xl text-clay">{location.name}</h3>
        <p className="mt-2 text-sm leading-relaxed font-bold text-teal/80">
          {location.address}
        </p>
        <p className="mt-2 text-xs font-bold text-sage-700">{location.hours}</p>
        <Link
          href="/menu"
          className="mt-4 inline-block rounded-pill bg-clay px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-clay-600"
        >
          View Menu
        </Link>
      </div>
    </article>
  );
}

export function TestimonialCard({
  testimonial,
}: {
  testimonial: Testimonial;
}) {
  return (
    <article className="offset-card-clay w-[19rem] shrink-0 rounded-2xl bg-white p-5 sm:w-[22rem]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-0.5 text-clay" aria-label={`${testimonial.stars} out of 5`}>
          {Array.from({ length: testimonial.stars }, (_, index) => (
            <svg
              key={index}
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="m12 2 3 6.5 7 .9-5 4.8 1.2 7L12 17.8 5.8 21.2 7 14.2 2 9.4l7-.9L12 2Z" />
            </svg>
          ))}
        </div>
        <span className="text-[11px] font-bold text-clay-400">
          {testimonial.when}
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed font-bold text-clay">
        “{testimonial.quote}”
      </p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm font-extrabold text-clay-700">
          {testimonial.name}
        </span>
        <Pill tone="sage">{testimonial.outlet}</Pill>
      </div>
    </article>
  );
}

export function CtaButton({
  href,
  children,
  variant = "clay",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: "clay" | "outline" | "white";
  className?: string;
}) {
  const variants = {
    clay: "offset-button bg-clay text-white hover:bg-clay-600",
    outline:
      "border-2 border-clay text-clay hover:bg-clay hover:text-white",
    white: "bg-white text-teal hover:bg-sage-50",
  } as const;

  return (
    <Link
      href={href}
      className={cn(
        "display-heading inline-block rounded-2xl px-7 py-3.5 text-base transition-all",
        variants[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}
