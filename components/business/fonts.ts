import { Fraunces } from "next/font/google";

// The business page's headline serif (design/BRAND.md, Type: the one exception to Bricolage).
// Imported only by the business page and business cards, so no other route downloads it.
// latin-ext carries ₦; vietnamese carries the dotted letters of Yoruba names (Imọlẹ, Ọlá), and
// browsers fetch it only when a page uses them.
export const bizSerif = Fraunces({
  variable: "--font-biz-serif",
  subsets: ["latin", "latin-ext", "vietnamese"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  display: "swap",
});
