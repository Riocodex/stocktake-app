import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito } from "next/font/google";

import "./globals.css";

// TRiBE's own type is a rounded, slightly hand-drawn display face paired with a
// rounded geometric body face. Baloo 2 + Nunito are the closest web pairing.
const display = Baloo_2({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-tribe-display",
  display: "swap",
});

const body = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-tribe-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "TRiBE Malta | Breakfast, Brunch, Lunch & Cocktails",
    template: "%s | TRiBE Malta",
  },
  description:
    "All-day breakfast, brunch, lunch and cocktails across Malta. Real food for every lifestyle including vegan, veggie and dairy-free options. Good vibes included.",
  icons: { icon: "/icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#fbf6ef",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
