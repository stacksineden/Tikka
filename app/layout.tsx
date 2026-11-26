import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Space_Mono } from "next/font/google";
import "./globals.css";

// latin-ext carries ₦ (U+20A6).
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  display: "swap",
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute links for link previews (drop and business page images). https://usetikka.com in production.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Tikka · Book what makes you look and feel good",
    template: "%s · Tikka",
  },
  description:
    "Book salons, barbers, spas, makeup artists, photographers and content studios anywhere in Nigeria. See their work, real prices and free times, and book in a minute.",
  // Added to an iPhone's home screen, the dashboard opens full screen as "Tikka" (needed for lead alerts there).
  appleWebApp: { capable: true, title: "Tikka", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#1B1440",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bricolage.variable} ${spaceMono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
