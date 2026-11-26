# Moving the new direction onto the real database

Status: **a plan for Samuel to agree. Nothing here has been built or pushed.** Written 26 Nov 2026.

Everything built on `new-direction/demo` since 25 Nov (the new setup, Today, Calendar, Customers, Money, pay links from New sale, receipts, gap time, the waitlist, the new booking sheet, money alerts) keeps its data in memory and loses it on restart. This plan moves it into Supabase without changing anything the 7 real businesses already have.

## 1. What's in the live database today (read-only look, 26 Nov)

Only counts were read. No customer names or numbers were looked at.

| Business | Where | State on Tikka | What they use |
|---|---|---|---|
| Maril kay | Ogbomoso, Oyo | Verified | **The real user.** 10 services, 12 photos, bookings on, 18 bookings (3 with a deposit paid), 28 leads, 1 drop, 14 pay links in live mode (8 paid), live payout account |
| Divora Beauty | Ibadan, Oyo | Verified | 12 services, 16 photos, bookings on, 1 drop, 3 leads, live payout account |
| Tikka studio | Ibadan, Oyo | Verified | Our own test business: Photography style, 4 paid live pay links |
| Glam by Dee | Ibadan, Oyo | | 4 services, 5 photos, nothing else yet |
| Marvel Beauty Hub | Ogbomoso, Oyo | | 2 services, 8 photos |
| Tifé Fashion Signature | Ota, Ogun | | Signed up, nothing set up |
| Enkay Apparel | Enugu, Enugu | Suspended | 1 drop, 4 leads |

Also: 31 services (22 with a length in minutes, 4 with their own deposit), 35 leads (26 typed-in numbers not yet confirmed), 1 time blocked off, 5 business cards, 7 reviews, 5 phones with lead alerts on, no drop payments yet. Every business has `serve_mode = in_store`.

**What this means for the plan:** Maril kay's bookings, deposits, pay links and leads are real money and real customers. Each migration only adds things. Existing rows keep working exactly as they do now, and an empty new column means "behave as today".

## 2. What the demo keeps that has no table yet

| Demo data | Lives in (demo) | Goes to |
|---|---|---|
| Trades, where you work, travel fee and reach, booking rules, gap times | `Business` fields | new columns on `businesses` (or `booking_settings` for the booking ones) |
| Service options, extras, event days, per person, questions, a service's own gap | `ServiceItem` fields | new columns on `business_services` |
| A booking's choices, home visit address, people, answers, event day | `Booking.detail`, `homeArea` | new columns on `bookings` |
| Sales at the counter, part payments, cash / transfer / card | `lib/ledger-data.ts` | new `sales` and `sale_payments` |
| What the owner spent, once or every week / month | `lib/ledger-data.ts` | new `expenses` and `regular_costs` |
| Receipts | worked out from a sale, demo token | a `receipt_token` on `sales`; still worked out each time it's opened |
| Customer notes and birthdays | `lib/clients-data.ts` | new `client_notes`, one per business per number |
| The customer list itself | worked out from bookings, sales and Tikkas | stays worked out (no new table), from `leads`, `bookings`, `sales` and `claims` joined by number |
| Waitlist | `lib/bookings-data.ts` | new `waitlist` |
| Pay links for a balance, a Tikka or something else | `lib/paylinks-demo.ts` (pretend payment) | the real `pay_links` table plus `sale_id`; real Paystack, as Maril kay already uses |
| Money alert phones | in memory | `push_subscriptions` plus a column for which alerts that phone gets |

## 3. The steps, in order

Each step is a migration with its database test written first (CLAUDE.md, "How to work"), then the code that uses it. You approve each `db push` before it runs, because local development shares the live database.

1. **Business and service fields.** Add the columns, and teach `save_*` to keep them. Nobody's page changes until they fill them in. Setup (`/app/start`) then writes to Supabase for real accounts instead of refusing them.
2. **Booking with choices.** A new `book_time()` that takes the choices, home visit, people, answers and event day, and **prices it in Postgres** from the service, the same way `deposit_for()` does now. The browser never sends an amount. Gap time goes into the free-time check. The current `book_time()` versions stay for code already deployed. Deposits go through the real Paystack path Maril kay uses now, not the pretend one. "Move or cancel" on the pass (24 hours' notice, the deposit is kept, no refund) becomes a server-only function.
3. **Waitlist.** A table, a rate-limited endpoint, and the owner's view on Calendar.
4. **Sales and money.** Add `sales`, `sale_payments`, `expenses` and `regular_costs`, all owner-only. Deposits and paid pay links are **read** from `bookings` and `pay_links`, never copied, so Money can't count them twice. Receipts open by token, server-only.
5. **Customers.** Add `client_notes`, owner-only. A `get_clients()` function joins everything by number. Staff never see it (rule 4).
6. **Pay links for a balance.** Add `sale_id` to `pay_links`. Paying settles that sale's balance inside `complete_pay_link()`.
7. **Money alerts.** Phones say which alerts they want. `/api/cron/money` reads the database (hourly, as now).
8. **Everyone on the new tabs.** The new tabs, Today and Money for every business (decided, section 5), with a short "finish setting up" for existing businesses.

**Privacy, alongside steps 4 and 5:** sales, notes, birthdays and waitlist entries hold customers' personal data. `admin_forget_person()` and `admin_person_lookup()` must cover them in the same migration that creates them.

## 4. Things to watch

- `bookings.minutes` allows at most 600 (10 hours). An event day blocks the whole date, so it needs its own rule rather than raising that limit for everyone.
- `deposit_percent` already allows any value from 5 to 100, so "owners type any percentage" needs no change.
- The demo still lets a customer be saved without a number (`name:<name>`). Real accounts require a number, so that path stays demo-only.
- Real accounts stay on the old tabs until step 8. Steps 1 to 7 can land without any owner noticing, as long as the code stays off `main`.
- **The code still has to reach `main` for real businesses to use it.** The migrations reach the live database straight away, but `new-direction/demo` isn't merged, so production keeps running the old code until you decide to merge. Because every migration only adds things, the old code keeps working on top of them.

## 5. Decided

- **Everyone gets the new tabs and the new experience** (Samuel, 26 Nov 2026). New sign-ups and the existing businesses alike, Maril kay included; the businesses have already been told a new version is coming. So the new tabs stop depending on `business.trades`, and `/app/start` is the setup for every new sign-up. Existing businesses already have a page and services: they keep them, and get a short "finish setting up" for what's new (trade, where you work, booking rules) instead of going through setup again. Their trade is suggested from their category.

## 6. Still open

- **Merging to `main`:** after step 2 (so booking with choices reaches real customers), or only once all 8 steps are done? Since everyone switches, step 8 has to be done before the merge either way.
