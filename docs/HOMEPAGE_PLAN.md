# The customer homepage and "For businesses"

**Agreed 26 November 2026; built on `new-direction/demo`:** the search (`search_businesses()`, `lib/search.ts`, `lib/search-db.ts`), the homepage (`app/(site)/page.tsx`, `components/home/`) and the results page (`app/(site)/search/page.tsx`). Still to do: the "For businesses" rewrite (the old landing sits at `/business` until then, never going live as it is). Prototype: `design/prototypes/homepage.html`.

usetikka.com becomes the customer side: find a business near you, see when it's free, book. Businesses sign up from "For businesses". We take the structure of Fresha (a search-first homepage, "For businesses" as its own site) and Airbnb (the search pill, the step-by-step search sheet on phones, rows of cards by theme). The look stays Tikka's own: indigo and cream, Bricolage, no copied layouts, colours or illustrations.

## 1. The search (the heart of it)

Three questions, like Airbnb's Where / When / Who, in the order a customer thinks: **what**, **where**, **when**.

| Part | What the customer picks | Notes |
| --- | --- | --- |
| What | A service or a kind of business: "Knotless braids", "Bridal makeup", "Photoshoot", or a trade (Hair, Makeup, Nails, Lashes & brows, Barber, Spa, Gele, Photography, Videography, Content studio) | Type to search; popular services shown before typing. Empty = everything. |
| Where | Near me, a city ("Ibadan"), or an area ("Bodija, Ibadan") | Nigeria-wide. States and cities from lib/nigeria. "Comes to you" businesses show for anywhere they travel to. |
| When | Any time, Today, Tomorrow, This weekend, or a date; then morning, afternoon or evening | Uses the businesses' real free times (booking_busy). |

- **On a computer:** one pill with three segments and a Search button. Clicking a segment opens its panel underneath; the next opens after a pick.
- **On a phone:** a compact pill ("What do you need? · Anywhere · Any time"). Tapping it opens a full-screen sheet with the three questions as stacked cards: one open at a time, the others showing their answer. "Clear all" and "Search" stay at the bottom, within thumb reach.
- **Results:** a list of business cards with filters (Comes to you, No deposit, Open now, Price, Rating). Each card shows a photo, name, area, rating, a starting price and **the next free time** ("Free tomorrow, 10am"). That last one is Tikka's edge over a directory: you see who can actually take you.
- **No map in version one.** It costs a Maps API key and mobile data; most customers search by city and area. Revisit once there are enough businesses for a map to help.

## 2. The homepage, top to bottom

1. **Header:** the Tikka logo, "For businesses", "Sign in" (for businesses), a menu.
2. **Hero:** "Book trusted pros near you" / "Hair, makeup, nails, lashes and photographers across Nigeria. See who's free, book in a minute, and pay a small deposit to hold your time." Then the search. The headline stays as Tikka adds kinds of business; only the line under it and the category row change (decided 26 Nov 2026).
3. **Categories:** a row of trades with icons, swipeable on phones. Tapping one fills "What".
4. **Rows of businesses** (swipeable on phones, like Airbnb's rows):
   - "Free tomorrow near you"
   - "Top rated in {city}"
   - "Photographers" (the pilot's second focus)
   - "New on Tikka"
   - "Recently viewed" (in this browser only)
5. **Offers near you:** the drops. A short explainer ("A drop is a limited batch of gifts and discounts from a business. Open one, it lands on your WhatsApp, show it at the counter") and "See offers", which opens today's drops marketplace.
6. **How it works:** Find someone good, Book a free time (a small deposit holds it), Show up.
7. **For businesses band:** "Run your business on Tikka. A free website people book from, deposits that stop no-shows, and knowing what you made." with "For businesses".
8. **Footer:** For businesses, Help, Privacy, Terms, Tikka Studio.

Live numbers ("X bookings this week") wait until they're big enough to impress. For now they would show single figures.

## 3. "For businesses" (usetikka.com/business)

Today's landing page, rewritten for the new direction, in this order: the hero (a free website people book from), deposits that stop no-shows, Today and Money (knowing what you made), drops for new customers, pricing (free website and bookings, 1% of payments, drops per drop), FAQs, sign up. Its wording comes in the next round, with pricing decided.

## 4. Built in this order

1. The search data: a public `search_businesses()` (service, place, date) returning cards with the next free time; never customers' details.
2. The homepage and the search sheet.
3. The results page.
4. "For businesses" (the current landing, moved and rewritten).
5. "Offers near you" links to the drops marketplace as it is; folding drops into the search comes later.

## 5. Decisions for Samuel

1. **The headline (decided 26 Nov 2026):** "Book trusted pros near you", with today's trades named in the line under it. New kinds of business are added when there are businesses in them (the categories and setup already work by trade), not all at once like Fresha's list.
2. **A city with nobody yet (decided 26 Nov 2026):** "Nobody in Lagos yet. Tikka is new there. Here's who's free soonest, including people who come to you." Then those businesses, the ones that come to you first.
3. **The old landing page (decided 26 Nov 2026):** launch the homepage and the rewritten "For businesses" together, at the merge. The old drops-first page is never moved as it is.
