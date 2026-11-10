import { Fraunces } from "next/font/google";

// The business page's headline serif (design/BRAND.md, Type: the one exception to Bricolage).
// Imported only by the business page, so no other route downloads it. latin-ext carries ₦.
export const bizSerif = Fraunces({
  variable: "--font-biz-serif",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  display: "swap",
});
