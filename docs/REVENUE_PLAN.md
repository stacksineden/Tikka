# Tikka revenue and product plan (Nov 2026)

The requirements that came out of a strategy review on 17 Nov 2026: what Tikka is, what it charges, what to build now, next and later, and why. **Read this with `CLAUDE.md`, `docs/PRD.md` and `docs/TECH_PLAN.md`.** Where this file changes something those files say (pricing, the counter check, the reward mix), this file wins, and the build must update `CLAUDE.md`, the PRD, the tech plan, `docs/drop-templates.md` and the help pages (`content/help/`) to match, so the docs never contradict the product.

Status key: **NOW** = build in the next few days, in the order given. **NEXT** = after the lawyer and Paystack answer, or once NOW is proven. **LATER** = only once the pilot passes. **BUILT** = already in the code.

---

## 0. Context: why this plan exists

### The problem Tikka solves
Nigerian service businesses (salons, spas, barbers, clinics, fitness, food) get views on their posts but can't turn those views into paying visits, and can't see which posts worked. They also lose money every week to **no-shows** and to **regulars who drift away** without anyone noticing.

### What Tikka is (the one sentence for every screen and pitch)
**Tikka fills your chairs: drops bring people in, deposits make sure they show up, and your page shows off your work.**

The three drop goals, ranked by how much pain they solve:
1. **Fill quiet days**: real, felt every week.
2. **Bring customers back**: real, but owners don't see it until Tikka shows them.
3. **Get new customers**: the weakest today. Tikka converts the owner's own audience; it doesn't bring new eyes yet. "Bring 3 friends" (NEXT) and joint drops (LATER) are the fixes.

### First real data (pilot, Nov 2026)
One business published its first drop on 16 Nov. In its first day: **~80 views on the owner's post → ~65 opened the link → 6 claimed.**
- Opening the link: **81%**. The sealed wrapper works.
- Claiming: **6 of 65 = 9%**. People are lost between opening and claiming. The offer isn't strong enough, and with a 2/10/88 mix, 6 claims most likely produced no Rare or Legendary, so nothing worth talking about.
- A second business has a drop scheduled for Friday 21 Nov.
- Tikka runs in **page-claim mode** (`TIKKA_CLAIM_MODE=page`): Meta's business verification isn't done. **Everything in NOW must work in page-claim mode and must not depend on Meta.**

### The kill test (from the PRD, made measurable)
Judge after **10 businesses** have finished their free drop:

| Measure | Target |
|---|---|
| Claim rate = claims ÷ people who opened the link | **20%+** (PRD: 15–20%+) |
| Visit rate = Tikkas used at the counter ÷ claims | **30%+** |
| ₦ brought in per drop (bill amounts typed at the counter) | more than **5× the drop price** |
| Businesses paying for a second drop within 30 days of their free drop ending | **at least 3 of 10** |
| Businesses tapping "Get early access" on payments | **30%+** |

How to read the results:
- Claims low, visits fine: the offer or drop setup is weak (NOW items 3–5).
- Claims fine, visits low: rewards too weak to travel for, or Tikkas expire too soon. Deposits and paid Tikkas help.
- Claims and visits fine but under 3 of 10 pay: look at price, the report and the end-of-drop conversation. Studio or payments may be the product.
- Everything low: drops aren't the painkiller. Test bookings with deposits (Tikka Plus) as the pivot: "Bumpa for service businesses".

---

## 1. The offer and the prices (DECIDED)

### Free / paid split: three ways of paying that owners understand

**Free, always** (gets them in and puts the page in their bio):
- The business page (mini website for the Instagram and WhatsApp bio)
- Bookings on WhatsApp (the booking sheet: service, day, time)
- A listing on the marketplace
- The permanent QR poster
- Leads, reviews, the counter screen, staff logins
- **The first drop**

**Pay per drop** (the thing that brings customers in). Each paid drop includes:
- the drop, sized by the owner
- the results report ("This drop brought in ₦X")
- the guarantee
- the full portfolio and collections while it runs (a bonus, not the headline; rules unchanged from `lib/portfolio.ts`)

**A small fee only when you get paid** (payments, NEXT). Free to switch on. Paystack's normal fee + 1% to Tikka per payment. Owner-facing line: **"You only pay when you get paid."**

**Done for you: Tikka Studio.** Setup package and monthly retainer, by quote after a free audit (section 4).

**Later: Tikka Plus**, a monthly plan (section 7).

**The one-line offer** for the landing page and pricing FAQ:
> **Free to start. Pay for each drop. Deposits coming soon: a small fee only when customers pay you.**

### Prices

| | Public | Founding (first 20 businesses, for life) |
|---|---|---|
| First drop | Free | Free |
| Every drop after | **₦10,000** | **₦5,000** |
| Season pack (3 drops) | **₦25,000** | **₦12,000** |
| Payments (NEXT) | Paystack's fee + 1% to Tikka | same |

- **No numbers of Tikkas in any price or pricing copy**, the first drop included. The price is the same for 50 Tikkas or 1,000.
- **One quiet limit of 1,000 Tikkas per drop, for every drop (free or paid).** It's shown only when an owner types more: "For more than 1,000 Tikkas, talk to us." It protects Tikka from message costs (each WhatsApp claim will cost Tikka about ₦15–40 in Meta fees once WhatsApp claiming is live) and from abuse. Over 1,000 goes through Studio.
- **Guarantee:** a paid drop that brings **fewer than 10** confirmed redemptions earns a free drop, once per business (all other B5 guarantee conditions unchanged).
- **The two pilot businesses get the founding flag** (admin, `/admin` → Businesses). They never see a price rise.
- **Why ₦10,000:** less than one customer's bill at most service businesses; about what owners spend boosting an Instagram post for a few days, with no proof it worked; at the bottom of Bumpa's ₦5k–25k a month, but only paid when they run a drop.
- **Why Paystack + 1% and not an all-in %:** Paystack's fixed ₦100 makes small payments expensive, so a flat all-in "3%" loses Tikka money on small deposits. On a ₦5,000 deposit: Paystack ≈ ₦175, Tikka ₦50, business ≈ ₦4,775. **Check Paystack's current fee schedule before publishing.**

---

## 2. What's already built that this plan uses (BUILT)

- **Counter check** (`supabase/migrations/20261111120000_counter_check.sql`, `check_whatsapp_digits()`, `lib/redeem.ts` `checkDigits`, `components/redeem/RedeemScreen.tsx`): staff read the last **4** digits off the customer's WhatsApp; 3 wrong tries a day per Tikka; digits never stored.
- **One claim per typed number per drop**, one Tikka per browser per drop, rate limits per visitor and IP (`lib/rate-limit.ts`), an optional Turnstile bot check (`lib/turnstile.ts`, off until both keys are set).
- **Bill amount at redemption** (`confirm_redemption(p_bill_amount_kobo)`, the field on the redeem screen, summed in the drop report via `get_drop_report_data()` / `lib/stats-db.ts`).
- **Pricing by size:** `drop_tiers` (free 200, small 300 ₦5k, medium 1,000 ₦10k, large 3,000 ₦20k; `founding_price_kobo` currently **equals** `price_kobo`, so founding members get no discount today), `drop_packs` (small3 ₦12k, medium3 ₦25k, no founding price), `lib/pricing.ts` (`quote` picks the smallest paid tier that fits; upgrades charge the difference), vouchers per tier (`lib/vouchers.ts`), "Add Tikkas" (`components/drops/AddTikkas.tsx`), the guarantee per tier. Admin edits tier prices (`admin_save_tier`, `lib/admin-db.ts`); prices are cached under the `prices` tag.
- **The deck** (`private.build_deck()`): each reward's cards are spread evenly through the deck with random jitter, so every stretch gets its share of Legendary and Rare.
- **The reward mix:** 2% / 10% / 88% (`TEMPLATE_SHARES`, `shareCounts()` in `lib/templates.ts`; `mixCounts()` / `applyMix()` in `lib/drop.ts`). Ready-made offers live in `docs/drop-templates.md` → `scripts/seed-templates.ts` (`pnpm seed:templates`) → `drop_templates`; the demo copy is in `lib/mock/drop_templates.json`.
- **The booking sheet** on the business page (PRD, "Booking a time"): pick a service, a day and a time, then WhatsApp opens to the owner with a prefilled request. **Nothing is stored or paid.**
- **Early access** (`early_access` table, `join_early_access(p_feature, p_business)`; `feature` is checked to be `'spark'` only) and **teaser dismissals** (`teaser_dismissals`, teasers `'spark_builder'`, `'spark_dashboard'`).
- **Paystack** for drop payments and season packs (`lib/paystack.ts`, `lib/payments.ts`, `app/api/paystack/webhook`).
- **Tikka Studio** pages and enquiries (`/studio`, `submit_studio_enquiry()`).

---

## 3. NOW: build in this order (items 1–7)

General rules for every item:
- One commit per item, on the working branch.
- **Migration and database test before the UI** (`supabase/tests/`, `pnpm test:db`).
- `pnpm test`, `pnpm lint` and `pnpm typecheck` pass.
- Every screen checked at 375px.
- The demo store (`lib/data.ts` and its mirrors) behaves the same as the database.
- Published drops (the live one and Friday's) keep their price and setup.
- Database changes are applied to Supabase **before** the code that uses them is deployed.

### Open decisions: ask the owner before building the affected item
**Decided on 17 Nov 2026:** (1) the last 6 digits every time; (2) the Thank-you list is still to be shown before seeding; (3) the teaser is payments and deposits. The landing headline is option B (item 7): "Your posts get views. Tikka turns those views into customers who come in and spend."

1. **Item 1:** staff enter the **last 6 digits every time** (recommended), or 4 digits with 6 only when the ending repeats? (The 4-then-6 version lets a cheater through when they use the fake-number card first; see item 1.)
2. **Item 5:** draft new Thank-you rewards for all 36 ready-made offers and **show the full list to the owner before seeding**.
3. **Item 6:** the "coming soon" teaser is **payments and deposits** (recommended; businesses are asking for it), not Tikka Plus.

### Item 1. One used Tikka per WhatsApp per drop (the counter fix)

**The gap today (page-claim mode):** someone types several made-up numbers that all end in **their own** last 4 digits (from other browsers or private tabs), keeps the best card or uses them all, and every one passes the 4-digit check because their own WhatsApp really does end in those digits. One per browser and the rate limits slow this down; they don't stop it.

**Requirement:**
- At the counter, staff enter the **last 6 digits** shown on the customer's own WhatsApp profile (if decision 1 confirms 6-every-time).
- `check_whatsapp_digits()` passes only if:
  - the 6 digits match the end of this Tikka's number, **and**
  - **no other Tikka from the same drop has already been used** (redeemed) by a claim with a **different** phone number ending in the same 6 digits.
- If an earlier one was used, return a new kind, e.g. `used_by_this_whatsapp`. Staff see: "This WhatsApp has already used a Tikka from this drop." Record the check as not matched. Whether it counts against the day's 3 tries is your call, but keep it consistent.
- **Never blocked:** the customer's own next-visit (bounce-back) Tikka. It has the same phone, so it is excluded by "different phone number".
- Unchanged: digits are never stored or returned; 3 wrong tries a day per Tikka (WAT); no override for owners or staff; the check belongs to the Tikka; a next-visit Tikka inherits a pass; `confirm_redemption()` still refuses an unchecked Tikka (`needs_whatsapp_check`).
- **Why 6 every time and not 4-then-6:** with 4-then-6, a cheater who uses the fake-number card **first** only faces the 4-digit check, and their real card passes later because the fake's last 6 differ. Checking 6 digits every time against every used Tikka in the drop closes that in any order. Two honest customers sharing the last 6 digits in one drop is about one in a million.
- **Also:** the Turnstile bot check goes on (the owner adds `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in Vercel; see `lib/turnstile.ts`). No code needed beyond confirming it works on `/api/claim-page`.

**Build:**
- A new migration replacing `check_whatsapp_digits()` (accept 6 digits; the drop-wide check).
- A database test covering:
  - the cheater using fake-first, then real-first;
  - fakes that share only the last 4 digits;
  - fakes that share the last 6 digits;
  - an honest look-alike (same last 4, different last 6);
  - a bounce-back from the same drop;
  - tries and `closed_today`;
  - a Tikka already used.
- `lib/redeem.ts` `checkDigits` and its tests (`lib/counter-check.test.ts`, `lib/redeem.test.ts`).
- `RedeemScreen.tsx`: 6 boxes instead of 4, and the new message.
- `lib/team-db.ts`, `lib/data.ts`, `app/app/actions.ts`, `lib/claim.ts`.
- Every copy that says "4 digits" / "last 4": the claim page, claim sheet, card, help (`app/(site)/help/[slug]`, `content/help/redeem-a-tikka.json`), `CLAUDE.md`, `docs/PRD.md`, `docs/LAUNCH.md`.
- Admin's counter-check outcomes (`admin_counter_checks()`) count the new kind.

**Acceptance:**
- A person with WhatsApp ending …554521 who claimed 3 Tikkas with typed numbers ending 4521 or 554521 can use **one**, in any order.
- An honest second customer whose number ends …114521 uses theirs normally.
- A bounce-back is never blocked.
- The live drop is protected as soon as it's deployed.

### Item 2. Flat pricing

**Requirement:**
- **Tiers:**
  - One paid level, **"Drop"**: ₦10,000 public, ₦5,000 founding, guarantee at 10, up to 1,000 Tikkas.
  - The **free** first drop also goes up to 1,000 Tikkas.
  - **Small and Large are switched off, not deleted**: payments, vouchers and drops reference them. Add an `active` flag to `drop_tiers` (the packs already have one), or equivalent, so `quote` never picks them.
- **Packs:**
  - Add `founding_price_kobo` to `drop_packs`.
  - The 3-drop pack is ₦25,000 public, ₦12,000 founding.
  - Switch off the Small pack.
  - `lib/pricing.ts` currently says founding prices apply to single drops only, never to packs; **change that**.
- **Vouchers:** unused vouchers for Small or Large (season pack, guarantee, gifted, free) become vouchers for any drop, so nobody loses out.
- **"Add Tikkas"** (`AddTikkas.tsx`): within one price, adding Tikkas up to 1,000 costs nothing extra. Remove the upgrade-between-tiers charge, or make it unreachable.
- **The server still prices every drop** (rule 11). The browser never sends an amount.
- **Copy:** no Tikka counts in any price.
  - "600 Tikkas · Medium drop · ₦10,000" becomes "Drop · ₦10,000".
  - "Your first drop (up to 200 Tikkas)" becomes "Your first drop".
  - "Need more than 3,000…" becomes "For more than 1,000 Tikkas in one drop, talk to us" (shown in the builder only when they type over 1,000).
  - Places: `components/landing/Sections.tsx` (the pricing block and FAQs: "What does it cost?", "What if my drop doesn't bring customers?"), `components/dashboard/WelcomeTour.tsx`, `app/app/(shell)/pay/page.tsx`, `app/app/(shell)/settings/payments/page.tsx`, `app/app/drops/new/page.tsx`, `app/app/(shell)/drops/[id]/page.tsx`, the builder, `content/help/paying-for-drops.json` and the other help pages, `app/admin/page.tsx` (the price editor shows one paid level plus packs with founding prices).
- **The guarantee FAQ** reads "fewer than 10 customers".
- **The demo:** `lib/mock/drop_tiers.json`, `lib/mock/drop_packs.json`, `lib/mock/vouchers.json`.
- **Tests:** `lib/pricing.test.ts`, `lib/vouchers.test.ts`, `lib/drop-map.test.ts`, the database pricing test (`supabase/tests/002_pricing.sql`).
- **Docs:** `CLAUDE.md` intro ("first drop free (up to 200 Tikkas), then pays per drop by size" → the new wording), the PRD decisions table, B1 pricing, B5 guarantee, B10, `docs/TECH_PLAN.md` payments.

**Acceptance:**
- A non-founding business pays ₦10,000 for a 40-Tikka or a 900-Tikka drop.
- A founding business pays ₦5,000, and ₦12,000 for the pack.
- No screen shows Tikka numbers next to a price.
- Old payments and vouchers still display and work.
- The admin price editor saves and clears the `prices` cache tag.

### Item 3. The builder suggests a drop size from the owner's audience

**Requirement:**
- On the "how many and when" step (`components/drops/SimpleBuilder.tsx`, steps from `flowFor()` in `lib/drop.ts`), ask **"About how many people see your posts or status?"** as a number field.
- Suggest **half of that, rounded to the nearest 10, at least 20, at most 1,000**: "We suggest 40 Tikkas. A drop that runs out gets people moving."
- The owner can change it. Blank is allowed (keep today's default). Over 1,000 shows the "talk to us" line.
- Plain words, one decision on the screen, big tap targets.

**Build:**
- A pure function (e.g. `suggestDropSize(views)`) in `lib/drop.ts` with unit tests.
- The step UI; the demo builder.

**Why:** a drop that runs low ("12 of 40 left") creates urgency; "194 of 200 left" looks dead. In the first drop, 80 views gave 65 opens.

### Item 4. A better reward mix on small drops

**Requirement:** the share of each tier depends on the drop's size:

| Drop size | Legendary | Rare | Thank-you |
|---|---|---|---|
| Up to 100 | 4% | 16% | 80% |
| 101–300 | 3% | 12% | 85% |
| Over 300 | 2% | 10% | 88% (as today) |

- At least 1 Legendary and 1 Rare whenever the size allows (as today).
- On a 40 drop: 2 Legendary, 6 Rare, 32 Thank-you. With the deck's even spreading, roughly 1 in 5 claimers gets a Rare or Legendary early in the drop.
- The owner can still change the counts. The "Rare and Legendary need a purchase" rule (`docs/drop-templates.md`) is unchanged.

**Build:**
- `TEMPLATE_SHARES` / `shareCounts()` in `lib/templates.ts`, and `mixCounts()` / `applyMix()` in `lib/drop.ts`, take the size into account. Unit tests at 10, 20, 40, 100, 101, 300, 301, 1,000.
- `docs/drop-templates.md` "How every template works".
- The builder's mix line ("40 Tikkas · 2 legendary · 6 rare · 32 thank-you").
- **The guarantee and message costs are unaffected.**

### Item 5. A stronger Thank-you, and the bill amount at the counter

**Thank-you requirement:**
- Rewrite the **Thank-you** reward in all **36** ready-made offers (`docs/drop-templates.md`) from small percentages ("10% off any service") to a **free extra with a purchase** that makes a visit worth it. Examples: "Free hair wash with any service", "Free drink with any meal", "Free 10-minute head massage with any treatment".
- Keep within `LIMITS.reward` (44) and `LIMITS.terms` (40), and split into reward and condition (`splitCondition()`).
- No gambling words. ₦ only.
- **Show the full list to the owner and get approval before seeding** (decision 2).
- Then update `lib/mock/drop_templates.json`, run `pnpm seed:templates` against the live database (the owner runs it, or with their go-ahead), and keep the template IDs.

**Bill amount requirement:**
- The redeem screen's spend field (`RedeemScreen.tsx`, label "How much did they spend? (₦)") becomes clearer and more prominent: **"What did they spend? This adds to your drop's results."**
- Still optional; never blocks confirming.
- The drop report already sums it. Check the report says "This drop brought in ₦X" where it's shown (drop page and results). If only part of the redemptions have an amount, say so ("from 6 of 9 visits").

**Why:** almost 9 in 10 claimers get a Thank-you; if it's weak, most never come in. The ₦X number is what sells the second drop.

### Item 6. "Coming soon: payments and deposits" with early access

**Requirement** (if decision 3 confirms payments):
- **Pricing section** (`components/landing/Sections.tsx`): "Coming soon: take deposits when customers book, so no-shows don't cost you. A small fee only when customers pay you." Signed in, the button joins directly; signed out, it links to sign-up.
- **A dismissable card on the dashboard home:** the same copy with **Get early access**. "Joined. We'll tell you first." once tapped.
- It's a teaser only. Never shown as working: no fake checkout, no sample payments.
- **Admin** sees how many businesses joined and which ones (to call them first). Reuse the Spark early-access views in `/admin`.
- Spark teasers stay as they are.

**Build:**
- A migration allowing `feature = 'payments'` in `early_access` and the new teaser IDs in `teaser_dismissals` (e.g. `'payments_dashboard'`).
- Update `spark_state()` or add an equivalent read, `join_early_access()` and `dismiss_teaser()` checks.
- A database test, the components, the demo mirror, and the admin list.

### Item 7. The offer in one line (copy)

**Requirement:**
- The landing page hero or pricing intro, the pricing FAQ "What does it cost?" and `content/help/paying-for-drops.json` all use: **"Free to start. Pay for each drop. Deposits coming soon: a small fee only when customers pay you."**
- List what's free (page, bookings on WhatsApp, marketplace, QR poster, leads, reviews, counter screen, staff, first drop) and what a paid drop includes (the drop, the ₦ results report, the guarantee, the full portfolio while it runs).
- Studio stays in its strip ("Rather we do it for you?").
- Remove any wording that makes the marketplace or collections sound like the main product.

---

## 4. NOW: things the owner does (no code)

| What | Details |
|---|---|
| Founding flag | In `/admin`, mark the two pilot businesses as founding members (after item 2 ships, check they see ₦5,000) |
| Turnstile keys | Create the Cloudflare Turnstile site and add both keys in Vercel |
| Read link activity | On the live drop, see which step people quit at (tear → business front → claim sheet → number typed) and report back |
| Bill amount habit | Ask each business's staff to type what the customer spent at every redemption |
| End-of-drop sit-down | When a drop ends, show the owner "This drop brought in ₦X" and offer the next drop or the season pack right then |
| Studio setup package | Sell "We set up your page and run your first two drops", one-off, about ₦50,000–150,000 |
| Studio monthly retainer | Sell "We plan and run a drop for you every month and send you the results", a monthly fee: recurring income before Plus |
| Lawyer | Send the payment questions (section 5.5) now, so answers are ready when payments are built |
| Paystack | Finish KYC (roadmap 0.2); ask how **refunds work on split payments** (is the business's share taken back from its next payout?) and confirm current fees |
| Focus | No new features on the marketplace, Spark or collections until the kill test is answered |
| What to tell businesses asking for payments | "Yes, we're adding it. Soon you'll be able to take deposits when customers book on your Tikka page, so no-shows don't cost you. The money goes straight to your bank account. We'd like you to be one of the first. Which services would you want a deposit on, and how much?" Give no date until the lawyer and Paystack have answered |

---

## 5. NEXT: Payments (bookings with deposits, pay links)

**Why:** businesses are asking for it unprompted. It solves **no-shows** (someone who has paid a deposit turns up, or cancels in time), makes the free page a working storefront ("Bumpa for service businesses"), earns Tikka a cut of every payment, and is the base for gifts, paid Tikkas and Tikka Plus. **It's possible with what Tikka already has:** Paystack is integrated, the booking sheet exists, the counter screen checks codes, and the live dashboard feed exists. **It needs no Meta verification:** the customer messages the owner from their own WhatsApp, as booking works today.

**Not before:** the lawyer's answers (5.5) and Paystack's answer on refunds for split payments.

### 5.1 How the money moves (Tikka never holds it)
- **Paystack split payments with subaccounts.** When an owner adds their bank account, Paystack resolves the account name. Tikka checks it against the business and creates a Paystack **subaccount** for the business, saving its code.
- Each customer payment is split by Paystack: **the business's share goes to the business's bank** (usually the next working day), **Tikka's 1% goes to Tikka.** Decide who bears Paystack's fee (Paystack lets you choose); default to the business, with fees shown clearly.
- **The server works out every amount** from the service's deposit or the pay link (as rule 11 does for drops). The browser never sends an amount.
- **The existing Paystack webhook** (`app/api/paystack/webhook`) is extended to confirm booking and pay-link payments (signature checked, idempotent).
- **Only Verified businesses can take payments**, with a cap on deposit size at first. This stops a fake business collecting deposits and disappearing.

### 5.2 Phase 1: bank account and pay links
- **Owner:**
  - Settings → "Get paid": add a bank account, see the name check, done.
  - **"Send a pay link"** for any amount with a note (a balance, a custom job). Tikka makes a link the owner pastes into their own WhatsApp chat.
  - A **Money** screen: money in, fees, what's on its way to the bank, refunds.
- **Customer:** opens the link, pays by card, transfer or USSD (Paystack asks for an email, which also gets them a receipt), and sees a Tikka-style receipt.
- **Acceptance:** a ₦5,000 pay link pays out about ₦4,775 to the business's bank and ₦50 to Tikka (at the fees confirmed with Paystack). Nothing is ever held by Tikka.

### 5.3 Phase 2: deposits on bookings
- **Owner:**
  - Per service: a deposit as a fixed ₦ or a %, or off. Optional "pay in full" for services the owner wants paid ahead (e.g. bridal).
  - A cancellation rule chosen from presets, never written by the owner. Default: "Free cancellation up to 24 hours before; after that the deposit is kept."
- **Customer flow:**
  1. Picks a service, day and time on the booking sheet (as today).
  2. Sees: "Hold your slot with ₦5,000. Pay the rest (₦20,000) at the shop." and the cancellation rule **before** paying.
  3. Pays through Paystack.
  4. Gets a **booking pass**, ticket-shaped like a Tikka: "Booked · Sat 15 Nov, 2:00pm · ₦5,000 paid · ₦20,000 to pay at Glow Studio · BK-7X4QP" ("Paid securely through Tikka").
  5. Taps **"Tell Glow Studio"**: WhatsApp opens to the owner with "Hi, I've booked Signature facial for Sat 15 Nov, 2pm and paid the ₦5,000 deposit. Ref BK-7X4QP."
- **Bookings become stored records.** Today the booking sheet stores nothing. Statuses: waiting for payment → paid → confirmed → arrived / no-show / cancelled / refunded.
- **Owner's bookings list:** Confirm / Move / Cancel. After the time: Arrived or No-show. A new paid booking shows in the live feed (the existing Realtime broadcast) and by email.
- **Counter screen:** staff enter BK- codes on the same redeem screen as Tikka codes: "Deposit paid ₦5,000 · collect ₦20,000" → Arrived.
- **Protection rules:**
  - Business cancels → full refund, always.
  - Customer cancels in time → full refund.
  - Customer cancels late or doesn't come → the business keeps the deposit.
  - **The owner doesn't confirm within 24 hours → automatic refund.**
- **Known limit:** there's no full calendar yet, so two people could pay for the same slot. That's why the owner confirms each booking and the 24-hour auto-refund exists. Held slots come with Tikka Plus.
- **Deposit size guidance:** modest (about 10–30% of the service); too high and people won't book. Trust comes from the Verified mark, reviews from people who came in, and "Paid securely through Tikka".
- **Phone numbers:** the same privacy rules as leads (rule 4). Staff see the booking, the code and the amounts, never the phone number.

### 5.3a Bookings with free times (comes with deposits)
Decided on 17 Nov 2026: deposits and a proper booking calendar ship together, so nobody pays for a slot that's already taken.
- The owner sets opening hours and how many customers they can serve at once; each service's "How long" sets its length. Customers see only free times; a full day says so and offers the next free one.
- The customer gives their first name and WhatsApp number first. The booking is stored, the owner sees it live (with the number, owners only, rule 4) and can message them straight away.
- Per service, the owner picks "Book and pay" (deposit now) or "Ask first" (a request with no payment; the owner messages, then sends a pay link).
- "Block a time" lets the owner keep the calendar true for walk-ins and DM bookings.
- Booking stays free; Tikka earns from the 1% on deposits. A per-staff calendar, reminders and win-back stay in Tikka Plus.
- The calendar without money needs neither the lawyer nor Paystack, so it can be built first.

### 5.4 Data and code to add (outline)
- A business payout record (bank, resolved name, Paystack subaccount code, verified).
- Deposit settings on services.
- A `bookings` table (business, service, time, customer first name and phone, email, amounts, status, code, Paystack reference).
- `pay_links` (amount, note, status, reference).
- RPCs with owner/staff checks in SQL (not React).
- Webhook handling, refunds through Paystack's refund API, receipts and booking-pass pages, a Money screen, a bookings list (phone first, added to `components/dashboard/Nav.tsx` for both phone and desktop), and BK codes on the counter screen.
- Rate limits on the public payment endpoints.
- Database tests for every RPC.

### 5.5 Questions for the lawyer (send now)
The current terms (cleared 10 Nov 2026) cover businesses paying Tikka and customers getting free Tikkas. Taking money from the public for services someone else delivers needs:
1. **Refunds:** who refunds when the business closes or cancels, Tikka or the business? What the terms must say.
2. **Deposits kept on no-shows or late cancellation:** allowed under consumer protection law (FCCPC Act)? How clearly must the customer agree before paying?
3. **Gift expiry:** can a paid gift or paid Tikka expire, and does the buyer lose the money?
4. **Not holding money:** confirm that with Paystack split payments (money settled directly to the business) Tikka isn't treated as holding customers' funds, which could need a licence.
5. **Responsibility for the service:** the business, not Tikka. Wording for the customer and business terms.
6. **Business terms:** businesses that take payments accept the refund and cancellation rules.
7. **"Bring 3 friends" (section 6.3):** does "do something to get a better reward" count as a promotion needing approval? This is the same as the open roadmap question 0.3 about rewards that differ from card to card.
8. **Brand-funded drops (section 7):** a simple contract template for brands.

---

## 6. NEXT: gifts, friends, paid Tikkas

### 6.1 December gifting test (by hand, on pay links)
December 2026 is too close to build full gifting after payments and the lawyer. Instead, once pay links (5.2) work:
- A business sells a gift with a pay link.
- Tikka Studio makes a Tikka-style gift card for the buyer by hand.
- Run the social media stories around "Gift a Tikka this Christmas".
- Learn what people buy and at what price, then build the full feature for Valentine's.

### 6.2 Gifts (full feature, for Valentine's, 14 Feb 2027)
- **Owner:** switches on "Sell gifts" and picks what can be gifted (a service, e.g. "Couples massage", or an amount, e.g. "₦20,000 gift").
- **Buyer:**
  - Taps "Give as a gift" on the business page.
  - Picks the gift, types the recipient's first name and a short note, and pays (same payment system, Tikka's 1%).
  - Gets a **gift card link** in the Tikka ticket style ("For Adaeze, from Tunde: Couples massage at Glow Studio") and sends it on **their own WhatsApp** (no Meta needed).
- **Recipient:** opens it and books with it. Staff enter the code at the counter as with any Tikka.
- **Marketing:**
  - A "Valentine's gifts" section on the marketplace in early February.
  - Businesses share "Gift a spa day" on their status.
  - Also Mother's Day, birthdays, Christmas.
- **Why it's big:**
  - Full payment up front.
  - Almost no Nigerian salon or spa sells gift cards online.
  - The recipient is a new customer for the business.
- **Lawyer:** gift expiry and refunds (5.5).

### 6.3 Bring 3 friends, get a new Rare Tikka
**Why:** it breaks the "only as big as the owner's audience" limit, which is the weakest goal (new customers).

**Requirement:**
- **When it appears:** right after a **Thank-you** card flips: "Get 3 friends to claim and come in, and you'll get a Rare Tikka from {business}."
- **Sharing:** a share button with their personal link, and progress: "3 claimed · 1 came in."
- **It's a new card, not an upgrade of the old one.** When the 3rd friend uses their Tikka at the counter, Tikka issues a **new Rare Tikka with its own fresh expiry** (e.g. 14 days), like the next-visit (bounce-back) Tikka. This solves the problem of the original card expiring, or already being used, while the friends come in.
- **Only from the drop's real stock:** the Rare comes from Rares **held back for friends** when the drop is built, set by the builder, never more than the owner agreed (rules 1 and 2: the server decides, inside the database, atomically). When the held-back Rares run out, the offer disappears.
- **Legendary is never earned by sharing.** It stays the story.
- **Cheating locks** (all page mode):
  1. A friend counts **only after using their Tikka at the counter and passing the WhatsApp check**. Claiming alone doesn't count.
  2. A friend's typed number **can't end in the same digits** as the referrer's (refused at claim).
  3. Item 1's counter rule catches the referrer posing as a friend.
  4. Friends must be **new to the business** (not already on its lead list).
  5. **One friend-reward per person per drop.**
  6. A friend's claim from the referrer's own browser doesn't count; the rate limits apply.
- **Owner's report:** "Friends brought in: 9 · came in: 6." Tikka admin sees per-business patterns and can pause it on a drop.
- On by default as a built-in rule of the drop; owners don't have to set it up.
- **Rough effect:** if 30% of claimers bring 2 friends each, claims multiply by about 2.5.

### 6.4 Paid Tikkas inside drops
- A Legendary or Rare that locks with a small payment: "Pay ₦3,000 now, get 40% off your braids in December."
- Same payment system. Cash up front for the business, fewer no-shows, Tikka's 1%.
- Lawyer questions as 5.5.

### 6.5 Message costs before WhatsApp claiming goes live
- Once Meta is verified, each claim costs Tikka about ₦15–40 (utility templates around ₦14 each: the expiry reminder, the thank-you outside the 24-hour window, visit reminders; the card itself is free inside the 24-hour window).
- Marketing templates (drop-live alerts) cost about ₦70–84 each. An alert to 300 Notify-me subscribers costs more than a founding drop's price.
- **Before turning WhatsApp claiming on:** confirm Meta's rate card for Nigeria, and cap Tikka-paid alerts per drop or include them in the price.

---

## 7. LATER: only once the kill test passes

### Tikka Plus: the reason to use Tikka every day and pay monthly
Drops happen a few times a year; no-shows, booking chaos in DMs and regulars drifting away happen every week. **Drops fill the client book; Plus runs it.**
1. **Bookings** in a real calendar with slots per staff member (held slots, no double booking).
2. **Deposits** at booking (from section 5).
3. **Reminders** before the appointment.
4. **A client book:** every visit, spend and review per client (leads already hold most of this).
5. **Automatic win-back:** clients who haven't come back in 6 weeks get a private drop.
6. **Included:** one drop a month and the full portfolio and collections.

- **Price:** ₦10,000–15,000 a month (Bumpa charges product sellers about ₦5,000–25,000). Plus could lower the 1% payment fee for subscribers, which gives owners a reason to subscribe.
- **Build only if** at least 30% of owners joined payments early access and payments are used weekly.

### Joint drops
- Neighbouring businesses (e.g. a salon, a nail bar and a café in one area) share one drop and each other's audiences.
- Every business in it pays. It fixes the new-customers goal.

### Paid marketplace spots
- Businesses pay to be in the featured carousel, which already exists (today admin pins it via `marketplace_pins`).
- Only once the marketplace has real visitors.

### Brand-funded drops
- A hair-care or skincare brand pays for Legendary rewards across many salons ("Free treatment with Brand X products").
- Brands pay Tikka; salons get free drops.
- Needs 50+ businesses and a brand contract (5.5).

---

## 8. Where the money comes from, in order
1. **Now:** paid drops (₦10,000 / founding ₦5,000; season packs) and **Tikka Studio** (setup package and monthly retainer).
2. **Next:** **1% of every payment**: deposits, pay links, gifts (Valentine's and seasonal peaks), paid Tikkas.
3. **Later:** **Tikka Plus** monthly fees, **brand-funded drops**, paid marketplace spots.

Each later line is built only after the one before it shows owners are getting real results. The two pilot businesses' results (claims, visits, ₦ brought in) are the proof that sells everything else, so keep watching them while building.

---

## 9. Rules that still apply to everything here
All of `CLAUDE.md`'s "Rules that must never break" still hold. In particular:
- The server decides every card, atomically, inside the database (friend Rares included).
- One claim per number per drop.
- Phone numbers only reach owners (bookings and payments too: staff never see phone numbers).
- Checking a code never uses it.
- No gambling words (win, winner, luck, lucky, jackpot, odds, bet, stake, lottery, raffle, prize draw); say "You got a Tikka!", "Every Tikka holds something".
- ₦ always.
- Nationwide, times in WAT.
- **The server prices every drop and every payment.**
- Marketing messages only to people who ticked the future-drops box.
- One live drop plus one scheduled per business.
- Mobile-first at 375px, plain words for owners, colours only from `design/tokens.css`, and the claim page's JavaScript budget.
