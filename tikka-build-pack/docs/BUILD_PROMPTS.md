# Tikka build prompts for Claude Code

Paste one prompt at a time into Claude Code, in order. Don't start the next until the current one's "Done when" checks pass and you've tried it yourself. Each prompt assumes `CLAUDE.md`, `docs/` and `design/` are in the repo root.

Rough timing for one developer with Claude Code: about 4 weeks.
Week 1: M0–M3 · Week 2: M4–M5 · Week 3: M6–M8 · Week 4: M9–M10.

**Before M5:** Tikka's WhatsApp number, Meta Business verification and the Cloud API app must be ready.
**Before M9:** the two message templates in TECH_PLAN §5 must be approved by Meta.

---

## M0 · Foundations

```
Read CLAUDE.md, docs/PRD.md, docs/TECH_PLAN.md and design/BRAND.md first.

Set up the project:
- Next.js (App Router, TypeScript, pnpm), Tailwind, ESLint, Vitest.
- Supabase local dev (supabase init) and client helpers in lib/db (browser, server, service role).
- Load design/tokens.css globally and map the tokens into the Tailwind theme (colours, radius, spacing, shadows). Bricolage Grotesque and Space Mono via next/font/google with the latin-ext subset; check ₦ renders in both.
- Copy design/logos into public/brand; set favicon and app icons from tikka-favicon and tikka-app-icon.
- Layouts: dashboard (light, surface), public night stage (claim, card, review), public light (landing, marketplace, business pages).
- A dev-only /styleguide page with buttons, rarity badges, code chip, counter, lead row and redeem result built from the tokens, matching design/BRAND.md and design/components.

Done when: pnpm dev, lint, typecheck and test pass, and /styleguide matches the brand book in light and dark.
```

## M1 · Database, auth and roles

```
Implement TECH_PLAN §2 and §3 as Supabase migrations with RLS on every table.
- Auth: Continue with Google and email + password (email confirmation on, forgot password). Sign-in, sign-up, confirm-your-email and reset screens (PRD B1, sign-in part).
- profiles with is_admin; business_members with owner and staff roles; business_invites.
- Middleware: /app needs a member; staff are redirected to /app/redeem from every other /app route; /admin needs is_admin.
- Public reads only through RPCs or views (get_public_drop, get_business_page, marketplace_drops); write them now with the fields the PRD needs and nothing more.
- Database tests: a member of business A can't read B's drops, claims, leads or reviews; staff can't read leads; anonymous users can't read base tables.

Done when: migrations apply from zero, the RLS tests pass, and I can sign up with Google and with email, confirm, and land on an empty dashboard.
```

## M2 · Welcome tour and card setup

```
Build PRD B2 (welcome tour) and B3 (card setup), and the Settings profile and card-look pages (B10).
- Tour: 4 screens, skippable, shown once (businesses.tour_done), ending on "Set up your card". Use the real card components for the visuals.
- Card setup with the required/optional split and a live card preview that flips. Required must take under 3 minutes on a phone.
- Brand colour picker with 8 swatches and the contrast check (white or ink text at 4.5:1, or suggest a darker shade).
- Card background: colour, one of 4 Tikka patterns tinted with the brand colour, or photo (cropped to the cover area).
- Uploads to Supabase Storage per TECH_PLAN §14: logo 256px WebP, background 1200x600 WebP, video up to 30 s and 20 MB with a poster frame captured in the browser.
- Action buttons (up to 4), services (up to 12), hours, about, tagline, code prefix suggestion with uniqueness check.
- The dashboard shows a "Make your card richer" checklist for the optional parts.

Done when: I can sign up, take the tour, and set up Glow Studio with logo, colour, a pattern background and one WhatsApp button in under 3 minutes on my phone, then add services and a video later.
```

## M3 · Create a Tikka drop

```
Build PRD B4 (drops list) and B5 (the drop builder) and TECH_PLAN §4.
- Step 1: name, number of Tikkas (with the sizing hint), start now or scheduled, end date.
- Step 2: quick-start mixes (Generous, Balanced, Mostly thank-you, Custom); the three tier rows with how many and what they get; reward types % off, ₦ off, free item, perk, action card (action text + reward); "+ Add another reward" inside a tier; thank-you fills the rest and must name a benefit; the live summary with percentages.
- Step 3: finish (matte, foil, holo) with live preview; who can claim; reserved share and marketplace limit under "More options"; show on marketplace (on by default).
- Step 4: phone-frame preview of the real claim page with a sample reveal; publish warning; after publishing: link, QR PNG, channel links (?c=wa, ig, qr, web, ads), share images placeholder.
- Drafts save at each step. "Run it again" prefills the builder from a past drop.
- lib/deck.ts spread shuffle with unit tests (exact totals, chunks within ±1, seeded RNG), used by the publish transaction.

Done when: I can create a 600-Tikka Balanced drop with a rare action card, schedule it for tomorrow, publish it, see 600 card rows with the right totals, and "Run it again" from it.
```

## M4 · The claim page and link activity (no WhatsApp yet)

```
Build PRD A1 by porting design/card-reference exactly: sealed wrapper, tear and unwrap, the business front with background and finish, action buttons, What's in this drop, the Overview, Services, Reviews and Video tabs, the claim sheet (first name only), the hold ring, tremble and rarity glow, flip, spark burst, name printing, legendary confetti, and the revealed panel (including the action-card instruction line).
- Server-render the wrapper and front; client JS only for animation and state; no animation libraries; video tab loads nothing until tapped.
- All edge-case screens from the PRD A1 table that don't need WhatsApp: scheduled (with Notify me and Tell a friend buttons, Notify wired in M9), sold out, ended, this browser already claimed.
- Fake the claim for now: "Continue on WhatsApp" waits 1.5 s then moves to Ready with a sample reward from a dev-only endpoint.
- Link activity events per TECH_PLAN §12: view (server), unwrap, claim_tap, claim_continue (beacons), with source from ?c= and the anonymous visitor id.
- /api/og/drop (sealed wrapper with the business seal) as the Open Graph image.

Done when: on a mid-range Android phone the page first paints in under 2 s on 4G, the flow feels like the reference, client JS for the route is under 100 KB gzipped, and events appear in the events table with the right source.
```

## M5 · WhatsApp click-to-claim and the claimer's card

```
Implement TECH_PLAN §5 (webhook, click-to-claim, the outbound queue, the 24-hour rule), §6 (claim_card with the required concurrency test), §7 (codes) and PRD A2 and A3 (card messages, resend, blocked, sold out, help).
- Claim intents with 30-minute expiry; the Confirming state subscribes via Supabase Realtime with 2 s polling fallback; the reveal endpoint returns only this claimer's card to the visitor that created the intent.
- Webhook: verification handshake, X-Hub-Signature-256 check, dedupe, routing (TK- now; NT- and STOP stubs that reply "coming soon" until M9), wa_contacts.last_inbound_at.
- Outbound queue with priorities, retries, opt-out skipping, a kick after each webhook so cards arrive within seconds, and /api/cron/outbound on Vercel Cron.
- /api/og/card signed image; the card message with image, reward, code, expiry and the /t/[token] link.
- /t/[token]: first-visit hold and flip, then revealed, redeemed and expired states.
- Desktop claim sheet shows a QR to continue on a phone.
- lib/codes.ts with the typo tests.

Done when: I can claim a live drop through WhatsApp on my phone, come back, hold, flip and get the card in WhatsApp within seconds; claiming again resends the same card; the concurrency test passes.
```

## M6 · Redeem, staff and reviews

```
Implement PRD B7, B10 Team, A4 and B9, and TECH_PLAN §8 and §9.
- check_code (read-only) and confirm_redemption (locks, re-checks, needs the action tick for action cards, unlocks the lead free, inserts the redeemed event, enqueues the thank-you with the review link) with tests: check never mutates; two simultaneous confirms give one success.
- /app/redeem: camera scanner loaded only on this route, typed fallback with the offline check, valid and not-valid panels, action-card checkbox, optional bill amount, done state.
- Staff: invite by email, accept (Google or email), staff see only /app/redeem; owners can remove staff.
- Thank-you message: free-form if the 24-hour window is open, otherwise the tikka_redeemed_thanks template (if not yet approved, skip and log).
- /t/[token]/review and submit_review (redeemed, within 30 days, once); rating trigger on businesses; the Reviews tab on the claim page and the business's Reviews page with Report.

Done when: a staff account can scan and confirm a code in under 5 seconds on Android; the claimer gets the thank-you, leaves a 5-star review, and it shows on the card's Reviews tab and in the dashboard.
```

## M7 · Leads, unlocking, export and credits

```
Implement PRD B8 and TECH_PLAN §10 and §11.
- get_leads masks numbers and names in SQL for locked leads; the masking test covering every lead endpoint.
- Live lead list with tabs, filters (drop, source), search, tags (New, From marketplace).
- unlock_lead and unlock_leads (free unlocks first, then credits; cost shown before confirming); "Message on WhatsApp" with the prefilled follow-up.
- Export CSV (owner only) of unlocked leads, with the "34 leads are locked" prompt.
- Paystack credit packs: initialize server-side, redirect, webhook with signature check, idempotent on reference; credits page with history.

Done when: a redeemed lead is unlocked for free, a locked lead unlocks with a free unlock, a test-mode credit purchase adds credits once even if the webhook repeats, and export includes only unlocked leads.
```

## M8 · Drop dashboard and live activity

```
Implement PRD B6 and TECH_PLAN §12 (funnel, live feed, sources, suggested size) and §15 (share images).
- Headline numbers, the 7-step funnel with % of the previous step, opened-but-didn't-claim, new vs returning, opened after sell-out with the suggested next size, notify subscribers waiting (count only).
- Live activity feed via Supabase Realtime on events, grouping bursts of views, first names only after a claim.
- By-source table with copy link and QR per channel.
- Cards left by reward; extend end date; add more Tikkas (append to the deck in the same proportions); end early.
- Share kit images: WhatsApp status 1080x1920 and square 1080x1080.
- drop_daily_stats nightly rollup.

Done when: during a test drop, opening the link on another phone shows up in the feed within a few seconds, and every dashboard number matches a direct SQL count.
```

## M9 · Marketplace, business pages and Notify me

```
Implement PRD A5 and A6 and TECH_PLAN §13 and the notify parts of §5.
- /drops home with search, area picker (remembered), category chips and the sections (Live now trending, Ending soon, Most claimed, Legendary inside, New, Coming soon); sections with fewer than 3 drops hidden; Lagos-wide fallback.
- /drops/all, /drops/[category], /drops/search with filters and sorts; drop tiles as CSS mini wrappers in the business's colours; tiles link to the claim page with c=market.
- /b/[business] business page with profile, reviews, live and coming-soon drops, past drops count, Notify me.
- Full-text search (tsvector + GIN). Cache the home for 60 s. Fast on 4G.
- Notify me: notify_intents, NT- routing in the webhook, subscribe_notify, confirmation message, STOP and STOP ALL, drop-live alerts by cron with the tikka_drop_live template, pilot cap 1,000 per drop, priority below card replies.
- Report this drop.

Done when: with 5 seeded businesses and drops the marketplace looks full and loads fast on a phone; tapping Notify me on a scheduled drop sends the confirmation, and when the drop opens the alert arrives and links to the claim page tagged as marketplace.
```

## M10 · Landing page, admin and launch readiness

```
- Landing page (PRD B1): looping real card hero, how it works, who it's for, the example results (labelled as an example), pricing, FAQs, a strip of live marketplace drops, Start free.
- /admin (PRD C2, TECH_PLAN §16): businesses (verify, suspend), reports queue, marketplace pins and hides, platform numbers, WhatsApp spend.
- Privacy policy and terms (PRD C1) linked from the claim sheet, footer and sign-up.
- Error and empty states everywhere; friendly 404s.
- Accessibility pass: focus rings, labels, contrast from the tokens, reduced motion.
- Load test: 500 claims in 60 s against a staging drop with no double cards and webhook p95 under 1 s; 2,000 marketplace page views in 5 minutes.
- Error tracking and an uptime check on the webhook.
- Seed a demo business and drop for sales conversations.

Done when: I can onboard a real Lagos business, they publish a drop that appears on the marketplace, and real customers claim, redeem and review.
```
