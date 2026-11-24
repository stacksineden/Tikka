# Business cards

Agreed with the owner on 24 Nov 2026 (prototype: `design/business-cards/prototype.html`). Built 24 Nov 2026 (migrations `20261202100000_contact_cards.sql` and `20261203100000_card_source.sql`, database tests 059 and 060; help: `content/help/print-business-cards.json`). Free for every business, like posters. This file is the requirement; PRD B10a points here.

## Why
Businesses kept asking for something to hand out. A poster sells today's drop; a business card sits in a wallet for months. So the card carries only what doesn't run out: who the business is, how to reach them, and one QR that opens their business page to see their work and book.

## Decisions
- **Free, no drop needed.** Every business, from the day they sign up.
- **The QR opens the business page, never a drop.** Each card has its own permanent 6-character code (the Tikka code alphabet) at `usetikka.com/c/[code]`, so a printed card keeps working when the page link changes. The easy-to-type page link (`usetikka.com/glowstudio`) is printed under the QR.
- **A printed card never stops working.** Removing a card hides it from the dashboard; its code still opens the page. A suspended business's codes open nothing (like posters).
- **The card is the business's brand, not Tikka's** (like the business page, design/BRAND.md): their colour, logo and Fraunces headlines; no Tikka indigo or gold. Tikka shows only as a small "Made with Tikka" on the back.
- **Nothing that expires:** no rewards, prices, dates or drop.
- **Owners only.** Staff never see or change cards (they're in the Posters area, which is owner-only).
- **In code they're "contact cards"** (`contact_cards`, `lib/contact-cards.ts`, `components/contact-cards/`), because "card" already means the Tikka card and card setup. Owners only ever read **"Business cards"**.

## What's on it
- **Size:** 85 × 55 mm, with 3 mm bleed.
- **Front:** the brand only. Logo (or initials), name and what the business is (Classic, Minimal, Bold), or a portfolio photo with the logo, name and tagline together at the bottom (Photo).
- **"What the business is"** is their tagline when it fits on one line (up to 44 characters, e.g. "Beauty and Content Studio"), else the category in words ("Hair and beauty"). Never a list of services (decided 25 Nov 2026).
- **Back:** the business name and what the business is, or a person's name and role ("Funmi Adeyemi, Founder & skin therapist · Glow Studio"); WhatsApp number, Instagram, area ("Lekki, Lagos"); the QR with "Scan to book" when bookings are on, else "Scan to see our work"; the page link; "Made with Tikka".
- Any of phone, Instagram and area can be hidden (More options). A line with nothing to show (no Instagram) hides itself.

## Styles
| Style | Front | Back | Default for |
| --- | --- | --- | --- |
| Classic | Logo in the middle on their colour, a thin frame | A soft tint of their colour | Everyone else |
| Photo | A portfolio photo edge to edge, name over it | The gallery tone (black, or soft white if their page is Light) | Photography and Beauty |
| Minimal | Soft white, small logo, name, a hairline in their colour | Soft white | |
| Bold | The name set very large in their colour | Their colour | |

Photo needs a photo: it uses the one the owner picks, else their first portfolio photo; with no photos, Photo isn't offered and the default falls back to Classic.

## Owner's screen
- **Posters becomes "Posters & cards"**, with a Business cards tab (`/app/posters/cards`; each card's editor at `/app/posters/cards/[id]`). In `components/dashboard/Nav.tsx` for both the More sheet and the sidebar.
- The first card ("The business") is made from their page the first time they open the tab, so most owners just tap **Print**.
- One decision per step: **Card style** → **Photo** (Photo style only, from their own portfolio) → **Whose card** (the business, or a person: name and role, prefilled from the team on their page). **More options:** rounded corners; hide phone, Instagram or area.
- A live card they can flip. Checked at 375px first.
- Up to 20 cards (one per person). Each shows its scans: "23 scans this month".

## Print kit (`/app/posters/cards/[id]/print`)
Same as posters: a page at the exact paper size, "Save as PDF".
- **For a printer:** front and back as two 91 × 61 mm pages (85 × 55 plus bleed), with crop marks.
- **A4 sheet:** 10 cards per page, fronts on page 1, backs on page 2 mirrored for two-sided printing, crop marks in the margins.
- Tips beside the buttons: 400–450gsm card, matte or soft-touch; spot UV on the logo and rounded corners if they want.

## Scans
- `/c/[code]` opens `/{slug}?c=card` and counts one scan per visitor per day (`contact_card_scan()`, server only).
- `card` becomes a source: a claim from the page's drop band after a card scan is credited to the card, and link activity shows "Business card".

## Build steps
1. **Database and rules:** `contact_cards` and daily scan counts; owner-only `my_contact_cards()`, `add_contact_card()`, `save_contact_card()`, `remove_contact_card()`; server-only `contact_card_scan()`; `lib/contact-cards.ts` (defaults, what shows, validation) with unit tests; the demo store mirrors it.
2. **The card face:** `components/contact-cards/CardFace.tsx`, four styles front and back, in mm, ported from the prototype; used by the preview and the print page.
3. **The owner's screen** (above).
4. **The print kit** (above).
5. **Scans and the `card` source** (above).
6. **Finish:** lint, typecheck, tests, database tests, 375px; CLAUDE.md, PRD, help (`content/help/`).

## Later
- Ordering printed cards through Tikka or Studio (needs a print partner and payments).
- Which person's cards brought which bookings (the per-person cards make it possible).
- A server-made PDF, if "Save as PDF" proves hard on iPhones (posters too).
