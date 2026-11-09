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
- A schedule in Supabase (pg_cron + pg_net, calling `/api/cron/*` with `CRON_SECRET` from Vault) for the outbound WhatsApp queue, drop-live alerts and the daily summary.
- Tailwind CSS, with the Tikka tokens from `design/tokens.css` as CSS variables. No component library on the public claim page.
- WhatsApp Business Platform (Cloud API): receive claim, Notify me and STOP messages; send cards, replies, thank-yous and drop-live alerts through a queue (TECH_PLAN §5).
- Paystack for drop payments and season packs (card or bank transfer). Drops are paid for with a voucher (the free first drop, a season pack, the guarantee, an admin grant) or a payment at publish, priced by size.
- `@vercel/og` for the card share image and the image sent in WhatsApp.

## Current phase: UI first, on dummy data

We're building the screens before the database so the UI shows what the API needs to be. Until M1 lands:
- Data comes from `lib/mock/*.json` through `lib/data.ts`. Pages only call `lib/data.ts`; swap its internals for Supabase RPCs later and keep the signatures. `DEMO_NOW` freezes "now" for the mock data.
- Sign-in is real Supabase Auth (`lib/session.ts`, `lib/supabase/`, `app/(auth)/actions.ts`, `app/auth/callback`). For real accounts the business itself (card, page, services, portfolio, team, FAQs, owner alerts, posters) lives in Supabase (`lib/business-db.ts`, mapped by `lib/business-map.ts`), and so do drops, payments and drops-without-paying (`lib/drop-db.ts`, `lib/drop-map.ts`) and a real drop's claim page: claim codes, the wait for WhatsApp, the card and link activity (`lib/claim-db.ts`, `lib/claim-map.ts`, `/api/claim-intent`), the card link from WhatsApp, and WhatsApp itself: the webhook (`app/api/whatsapp/webhook`, `lib/whatsapp/inbound.ts`), the sender (`lib/whatsapp/send.ts`, wording in `lib/wa-text.ts`) and the cron. Until Meta is connected, development sends go to the test phone at `/dev/whatsapp` (DEMO, development only). Redeeming and staff are real too (`lib/team-db.ts`: check, confirm, invites, the team), and so are leads, "Message today", follow-up taps and the CSV export (`lib/leads-db.ts`, `get_leads()` owner-only). So is the drop dashboard: its numbers, sources, posters, rewards left and results (`lib/stats-db.ts`, `get_drop_stats()` and `get_drop_report_data()` owner-only) and its live feed, which hears a bare signal on the drop's private Realtime Broadcast channel (`drop:<id>`, team only) and refetches. Reviews are real too (`lib/reviews-db.ts`): the review page from the card link (`review_page()` and `submit_review()`, server only), the owner's Reviews screen with reporting (it also lists the ones Tikka hid), and the reviews on the business page, claim page and card link (`get_business_reviews()`). The marketplace lists real businesses' open and upcoming drops (`lib/market-db.ts`, `marketplace_drops()`: counts only, never demo or suspended businesses) next to the demo ones; Notify me gets a real NT-XXXXX code (`/api/notify`, `create_notify_intent()`) and opens WhatsApp (the test phone in development), the webhook subscribes them, and drop-live alerts go out through the queue as the `tikka_drop_live` template once Meta approves it; "Report this drop" lands in the reports queue (`report_drop()`). Tikka admin (`/admin`, `lib/admin-db.ts`) is real for accounts with `profiles.is_admin`: platform numbers and WhatsApp spend, the moderation queue (hide or keep reported drops and reviews), hiding and pinning drops (`marketplace_pins`, the featured carousel), businesses (search, Verified, suspend, founding member, gifted drops), prices and payments, Studio enquiries and the Spark early-access list; every `admin_*` function checks `is_admin()`. Tikka Studio (`/studio`, PRD B11) reads its work from JSON in `content/studio/` (`lib/studio.ts`, pure helpers in `lib/studio-shared.ts`; media stays on Cloudinary links) and saves enquiries through `submit_studio_enquiry()` (`lib/studio-db.ts`). Spark (PRD B12) is only "coming soon" teasers and an early-access list (`early_access`, `spark_state()`, `dismiss_teaser()`); Spark itself isn't built. Prices everywhere read `drop_tiers` and `drop_packs`. The revealed card has an image (`/api/og/card?c=<claim>&s=<sig>`, `cardImage` in `lib/og-art.tsx`, signed by `lib/og-sign.ts`, data from `card_image()`): it never shows the code (masked as "BB-•••••"), goes out as the WhatsApp card message's picture with the code in the caption, and "Share my Tikka" shares it as a file where the phone can (`/api/card-image?t=<view token>` redirects to it). The owner's daily summary is real too: `/api/cron/daily` (8:00 WAT) reads `daily_summary_rows()` (server only: counts, the owner's alert number or else the Chat on WhatsApp number, the last finished drop), adds the seasonal "Run it again" line (`lib/nudges.ts`) and queues one `owner_daily` message per business per day (`lib/summary-db.ts`), skipping days with nothing to say; it goes as the `tikka_owner_daily` template. The privacy policy and terms (`/privacy`, `/terms`, `components/site/LegalPage.tsx`) are first drafts marked `LEGAL_PLACEHOLDER`, with facts still to fill in written as `<Blank>…</Blank>`; `scripts/check-legal.ts` fails a production build while either is left. The claim sheet, sign-up, Notify me and the footer link to them. Real businesses use the real clock (`leadsNow()`); the demo stays frozen at `DEMO_NOW`. The demo business (and the demo admin) still read the demo store through `lib/data.ts`, keyed by the signed-in user's id. Real ids are uuids (`isDbId`); demo businesses keep their demo ids. In development only, "Open the demo business" on the sign-in page opens the Glow Studio demo data without an account (`DEMO` in `lib/session.ts` and `proxy.ts`); it goes with the demo store.
- Before the pilot: `docs/LAUNCH.md` is the checklist (accounts, env vars, WhatsApp templates, Paystack, legal, the admin flag, final checks). In production the cron routes need `CRON_SECRET` (`lib/cron-auth.ts`), and the demo routes, demo sign-in and test phone are off. Visit plans (`set_visit_plan()`), the "just claimed" prompt (`new_claims_since()`) and the landing page's live numbers (`platform_stats()`) read the database for real accounts. Prices are cached (`"use cache"`, tag `prices`); admin price saves clear the tag. The pilot runs on Supabase's free plan: `pnpm backup` (scripts/backup-db.sh) makes the weekly copy, and `NEXT_PUBLIC_TIKKA_VIDEOS=off` (`lib/features.ts`) stops new videos. Privacy requests are handled in `/admin` (`components/admin/PrivacyRequests.tsx`): `admin_person_lookup()` shows what Tikka holds for a WhatsApp number and `admin_forget_person()` deletes it all (claims, reviews, leads, Notify me, opt-outs, messages, their names in live feeds; the cards stay used), each logged in `privacy_requests` with the number masked. The daily job removes stored files nothing points at any more, a week after upload (`orphan_media()`, `lib/media-cleanup.ts`). Public endpoints (claim codes, Notify me, reports, link activity, visit plans) are rate-limited per visitor and per IP, both hashed (`rate_hit()`, `lib/rate-limit.ts`, limits in `LIMITS`); the limiter lets requests through if it fails. Pre-launch mode (`TIKKA_PRELAUNCH=1`, `lib/launch.ts`) puts the site online before the legal text is final: `/api/claim-intent` and `/api/notify` refuse everyone but Tikka admins (and, for claims, the business's own team), and `scripts/check-legal.ts` lets the production build through with the drafts; removing it brings the legal check back. Page-claim mode (`TIKKA_CLAIM_MODE=page`, `lib/claim-mode.ts`) is a temporary bridge while Tikka's WhatsApp number waits for Meta's business verification: the claim sheet takes a typed Nigerian mobile number and `/api/claim-page` claims through `claim_on_page()`, which calls `claim_card()` (rules 1–3 unchanged), marks the claim and any new lead `phone_confirmed = false`, never shows a card to someone typing a number that already claimed, and allows one Tikka per browser per drop. `enqueue_message()` never queues a WhatsApp message for an unconfirmed claim, drop alerts skip unconfirmed leads, and Notify me is closed in this mode. An optional Cloudflare Turnstile check (`lib/turnstile.ts`) runs when both its keys are set. Removing the setting sends claims back to WhatsApp; nothing in the WhatsApp path changed.
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
  (studio)/studio/            Tikka Studio: landing, /work, /work/[slug] case studies, /contact (PRD B11)
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
content/studio/               Tikka Studio content: case studies, our ad and content pieces, testimonials, client names (JSON)
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
