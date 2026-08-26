import type { ReactNode } from "react";

import { cn } from "@/components/ui";
import { MoonMark, SunMark } from "@/components/brand/marks";

/**
 * Organic wave used on the live site to transition between colour blocks.
 * `position` decides whether the wave caps the top or the bottom of a section.
 */
export function Wave({
  className,
  fill = "currentColor",
  position = "top",
}: {
  className?: string;
  fill?: string;
  position?: "top" | "bottom";
}) {
  return (
    <svg
      viewBox="0 0 1440 90"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn(
        "block h-[42px] w-full sm:h-[64px]",
        position === "bottom" && "rotate-180",
        className,
      )}
    >
      <path
        fill={fill}
        d="M0 46c96-26 192-38 288-30 96 9 192 37 288 41 96 5 192-14 288-27 96-14 192-22 288-9 96 12 192 45 288 60V90H0V46Z"
      />
    </svg>
  );
}

/** Hand-drawn style eye used as a section accent on the live site. */
export function SketchEye({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 90"
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M14 58c10-16 26-24 42-24s30 9 38 22c-9 12-23 20-38 20s-31-6-42-18Z" />
      <circle cx="58" cy="55" r="11" />
      <circle cx="58" cy="55" r="4" fill="currentColor" />
      <path d="M8 34l6 9M26 22l5 11M48 16l2 12M72 18l-1 12M94 26l-5 10" />
    </svg>
  );
}

/**
 * Infinite scrolling band. The children are rendered twice so the animation can
 * translate by exactly -50% and loop seamlessly.
 */
export function Marquee({
  children,
  className,
  speed = "normal",
}: {
  children: ReactNode;
  className?: string;
  speed?: "normal" | "fast";
}) {
  return (
    <div className={cn("group relative overflow-hidden", className)}>
      <div
        className={cn(
          "flex w-max",
          speed === "fast" ? "animate-marquee-fast" : "animate-marquee",
        )}
      >
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}

/** The repeating "Moon / Sun" band from tribemalta.com. */
export function MoonSunBand({
  className,
  words = ["Moon", "Sun"],
}: {
  className?: string;
  words?: string[];
}) {
  const items = Array.from({ length: 8 }, (_, index) => index);

  return (
    <Marquee className={cn("bg-clay py-3 text-white", className)}>
      {items.map((index) => (
        <span key={index} className="flex items-center gap-4 px-4">
          <span className="display-heading text-lg tracking-[0.12em] sm:text-2xl">
            {words[index % words.length]}
          </span>
          {index % 2 === 0 ? (
            <MoonMark className="h-5 w-5 shrink-0 text-white/80 sm:h-6 sm:w-6" />
          ) : (
            <SunMark className="h-5 w-5 shrink-0 text-white/80 sm:h-6 sm:w-6" />
          )}
        </span>
      ))}
    </Marquee>
  );
}
