import type { SVGProps } from "react";

/**
 * Vector recreations of the TRiBE brand marks so they can be tinted with
 * `currentColor` and scaled freely. The original artwork also ships as PNG and
 * PDF under /public/brand.
 */

export function EyeMark({
  strokeWidth = 7,
  ...props
}: SVGProps<SVGSVGElement> & { strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 100 74"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      aria-hidden="true"
      {...props}
    >
      {/* Lashes */}
      <path d="M50 4v12M28 9l5 11M72 9l-5 11M9 20l8 9M91 20l-8 9" />
      {/* Lens */}
      <path d="M5 47c13-19 32-19 45-19s32 0 45 19c-13 19-32 19-45 19s-32 0-45-19Z" />
      {/* Iris */}
      <circle cx="50" cy="47" r="14" />
      <circle cx="50" cy="47" r="7" />
      <circle cx="50" cy="47" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function HamsaMark({
  strokeWidth = 7,
  ...props
}: SVGProps<SVGSVGElement> & { strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 100 128"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* Palm with thumbs sweeping outwards */}
      <path d="M30 62c0-6-1-30-1-38a9 9 0 0 1 18 0v22M47 46V24a9 9 0 0 1 18 0c0 8-1 32-1 38" />
      <path d="M30 62c-6-6-16-10-26-9 8 4 12 9 12 22 0 18 2 34 12 41 9 6 18 3 22-2 4 5 13 8 22 2 10-7 12-23 12-41 0-13 4-18 12-22-10-1-20 3-26 9" />
      {/* Eye in the palm */}
      <g strokeWidth={strokeWidth * 0.62}>
        <path d="M50 78v7M39 81l3 6M61 81l-3 6M31 87l4 5M69 87l-4 5" />
        <path d="M32 101c6-8 11-9 18-9s12 1 18 9c-6 8-11 9-18 9s-12-1-18-9Z" />
        <circle cx="50" cy="101" r="5" />
      </g>
    </svg>
  );
}

export function MoonMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M62 6A44 44 0 1 0 62 94A32 32 0 1 1 62 6Z
           M12 50a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z
           M24.5 33a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0Z
           M24.5 67a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0Z"
      />
    </svg>
  );
}

export function SunMark({
  strokeWidth = 7,
  ...props
}: SVGProps<SVGSVGElement> & { strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="50" cy="50" r="20" />
      <path d="M50 6v12M50 82v12M6 50h12M82 50h12M19 19l8 8M73 73l8 8M81 19l-8 8M27 73l-8 8" />
    </svg>
  );
}
