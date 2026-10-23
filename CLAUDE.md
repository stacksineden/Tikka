# Tikka

Tikka turns people who see a business into contacts the business can follow up. A business sets up its card once, then runs **drops**: limited batches of collectible cards (**Tikkas**) in three tiers (thank-you, rare, legendary) behind one link and on the Tikka marketplace. A visitor opens the link, tears open a sealed Tikka, sees the business, claims with WhatsApp, holds to open, and flips the card to see what they got. The card lands in WhatsApp with a code they show at the counter. The business redeems codes for free (staff can do it), collects reviews from people who redeemed, and watches link activity live. Every claimer becomes a lead the owner sees in full, with no per-person fee, and can follow up on WhatsApp. Every business gets a free business page (a mini website for its Instagram and WhatsApp bio) and its first drop free (up to 200 Tikkas), then pays per drop by size, or buys a season pack of 3 drops. Each drop has a goal (new customers, bring customers back, fill quiet days) and starts from a ready-made offer for the business's category. People can browse drops on the marketplace, scan a business's permanent QR poster, and ask to be notified when a drop opens.

Read these before building anything:
- `docs/PRD.md` — what version one does, screen by screen, with edge cases and acceptance criteria.
- `docs/TECH_PLAN.md` — data model, the claim function, WhatsApp flow, codes, payments, analytics.
- `docs/BUILD_PROMPTS.md` — the milestones, in order. Build one at a time.
- `design/BRAND.md` — the brand book: colour roles, type, the ticket shape, motion, voice.
- `design/card-reference/` — the approved card prototype (wrapper, unwrap, hold, flip). Port its look and timings; don't redesign it.

## Stack

- Next.js (App Router, TypeScript, server actions and route handlers), deployed on Vercel.
- Supabase: Postgres, Auth (business owners, staff and admins only; Google and email + password), Storage (logos, backgrounds, videos), Realtime (the claim page waits for the WhatsApp confirmation; the dashboard's live activity feed).
- Vercel Cron for the outbound WhatsApp queue and drop-live alerts.
- Tailwind CSS, with the Tikka tokens from `design/tokens.css` as CSS variables. No component library on the public claim page.
- WhatsApp Business Platform (Cloud API): receive claim, Notify me and STOP messages; send cards, replies, thank-yous and drop-live alerts through a queue (TECH_PLAN §5).
- Paystack for drop payments and season packs (card or bank transfer). Drops are paid for with a voucher (the free first drop, a season pack, the guarantee, an admin grant) or a payment at publish, priced by size.
- `@vercel/og` for the card share image and the image sent in WhatsApp.

## Current phase: UI first, on dummy data

We're building the screens before the database so the UI shows what the API needs to be. Until M1 lands:
- Data comes from `lib/mock/*.json` through `lib/data.ts`. Pages only call `lib/data.ts`; swap its internals for Supabase RPCs later and keep the signatures. `DEMO_NOW` freezes "now" for the mock data.
- Sign-in is real Supabase Auth (`lib/session.ts`, `lib/supabase/`, `app/(auth)/actions.ts`, `app/auth/callback`). Screens still read the demo store through `lib/data.ts`, keyed by the signed-in user's id. In development only, "Open the demo business" on the sign-in page opens the Glow Studio demo data without an account (`DEMO` in `lib/session.ts` and `proxy.ts`); it goes with the demo store.
- Next.js 16: `proxy.ts` replaces middleware, and `cacheComponents` is on, so session reads go inside `<Suspense>`. Read `node_modules/next/dist/docs/` before using an unfamiliar API (see AGENTS.md).
- Card visuals live in `components/tikka/` (ported from `design/card-reference/`). A `.tk-stage` or `.tk-solo` always carries `data-theme="light"` so the night stage stays the same indigo in both themes.

## Commands

- `pnpm dev` — run locally
- `pnpm test` — unit tests (Vitest)
- `pnpm test:db` — database tests against a local Supabase (`supabase start`)
- `pnpm lint` and `pnpm typecheck` — must pass before a milestone is done

## Structure

```
app/
  (site)/                     landing page, and the free business page at /[slug] (/b/[slug] redirects)
  (market)/drops/             marketplace home, all, [category], search
  (market)/b/[business]/      business page
  (claim)/d/[business]/[drop]/ claim page: sealed → unwrap → profile → claim → hold → flip
  (claim)/t/[token]/          a claimer's card (linked from WhatsApp), and /review
  q/[code]/                   a business's permanent QR poster: the live drop, else the business page
  app/                        dashboard: tour, card setup, drops, drop builder, drop report, leads, reviews, posters, settings
  app/redeem/                 the counter screen (owners and staff)
  admin/                      Tikka admin (is_admin only)
  api/whatsapp/webhook/       Meta webhook: claims, Notify me, STOP
  api/cron/outbound/          sends the WhatsApp queue and drop-live alerts
  api/paystack/webhook/       payment confirmation
  api/og/                     card, drop, status and square images; poster print kit PDFs
lib/                          db clients, codes, deck, pricing, vouchers, payments, templates, drop check, slugs, whatsapp, queue, paystack, analytics
supabase/migrations/          tables, RLS, claim_card, redemption, reviews, notify, pricing, vouchers, payments, guarantee, reminders
design/                       tokens, brand book, logos, component references, card reference
```

## Rules that must never break

1. **The server decides every card.** The browser never receives the deck, the reward mix order or any card that wasn't just won. Card assignment only happens inside the `claim_card()` Postgres function.
2. **Claims are atomic.** Two people never get the same card, and a drop never gives out more of a reward than it has. Use `FOR UPDATE SKIP LOCKED` inside the function. There is a concurrency test; keep it passing.
3. **One claim per WhatsApp number per drop.** A repeat claim returns the same card and resends it. It is not an error.
4. **Phone numbers only reach owners.** Staff never see the lead list or any phone number. Anonymous visitors never see claimers' details. Notify-me subscribers are not leads: businesses only ever see a count. Keep these checks in SQL/RPCs, not in React.
5. **Checking a code never uses it.** Redemption is check, then confirm. Action cards need the staff tick before confirming.
6. **Only people who redeemed can review**, once per claim, within 30 days. Businesses can report reviews, never edit or delete them.
7. **Card replies come first.** Drop-live alerts and other bulk messages go through the queue at lower priority, never ahead of a claimer waiting for their card. Respect opt-outs and the 24-hour rule (TECH_PLAN §5).
8. **No gambling words** in any copy: win, winner, luck, lucky, jackpot, odds, bet, stake, lottery, raffle, prize draw. Say "You got a Tikka!", "Every Tikka holds something".
9. **Naira is always ₦**, never N or NGN in the UI.
10. **Tikka is nationwide, not Lagos-only.** Businesses anywhere in Nigeria; locations are state, city and area, shown as "Lekki, Lagos" (`place()` in `lib/format.ts`). People can claim a drop from another city and redeem it in person before it expires, so never assume the claimer is local. Times are West Africa Time (`WAT`; its IANA name happens to be `Africa/Lagos`).
11. **The server prices every drop.** The browser never sends an amount. Prices come from `drop_tiers` and `drop_packs` (founding prices for founding members); vouchers are checked on the server.
12. **Marketing messages to past claimers only go to people who ticked the future-drops box.** The card, the expiry reminder and the thank-you (with its bounce-back) belong to the claim and don't need it. STOP clears the box.
13. **One live drop per business at a time**, plus at most one scheduled next drop. Drops last at most 30 days; every Tikka lasts a set number of days after it's claimed (7, 14 or 30), even past the drop's end, so a claim on the last day still gets its full time.

## Brand in code

- Colours come only from the tokens in `design/tokens.css` (`--brand`, `--gold`, `--night`, `--ink`, `--surface`, rarity colours…). Never hard-code another hex. Never use WhatsApp green (#25D366) as a Tikka colour.
- Gold is scarce: the claim button, rewards, the rare tier and the logo stub only.
- Fonts: Bricolage Grotesque (everything) and Space Mono (codes, serials, counters), from Google Fonts with the `latin-ext` subset so ₦ renders.
- The claim page is always on the night stage (`--night`). The dashboard is light by default.

## Plain language for business owners

Many owners aren't tech-savvy. One decision per screen, big tap targets, no jargon. In the UI say "Who can claim" (not eligibility), "Card style" (not finish), "Legendary · very few", "Rare · some", "Thank-you · everyone else". Advanced settings go under "More options", collapsed.

## The dashboard is mobile-first

Most businesses run Tikka from their phones, on the go. Design and build every dashboard screen for a phone first (375px wide), then widen it for desktop. A screen isn't done until it has been checked at 375px.
- Phones use the bottom tab bar (Home · Drops · Redeem · Leads · More) and the "More" sheet (Reviews, Your page, Posters, Payments, Team, Settings, sign out). Desktop uses the sidebar. Every page must be reachable from both. When you add a page, add it to `components/dashboard/Nav.tsx` for both.
- Main actions sit within thumb reach. Tap targets are at least 44px. No hover-only controls. Tables become stacked rows on phones.
- Keep it light on data and JavaScript: businesses are often on mobile data too.
- Logos are in `design/logos/`. Never recolour or redraw them.

## The claim page budget

Most claimers are on Android phones on mobile data.
- Animate only `transform` and `opacity`. Respect `prefers-reduced-motion` (flip becomes a 200ms crossfade; no shine, tilt, shake or confetti).
- Keep the claim page's client JavaScript small (aim for under 100 KB gzipped). No animation libraries; CSS and a few lines of JS, as in the reference.
- Server-render the sealed wrapper and business front so the first paint is fast. Images through `next/image`, covers at most ~150 KB.
- Tap targets at least 44px; the claim button 52px+.

## How to work

- Build one milestone from `docs/BUILD_PROMPTS.md` at a time. Finish its acceptance checks before starting the next.
- Write the migration and its database test before the UI that depends on it.
- When the PRD and this file disagree, stop and ask.
