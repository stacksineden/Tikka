# Tikka build prompts for Claude Code

Paste one prompt at a time into Claude Code, in order. Don't start the next until the current one's "Done when" checks pass and you've tried it yourself. Each prompt assumes `CLAUDE.md`, `docs/` and `design/` are in the repo root.

Rough timing for one developer with Claude Code: about 4 weeks.
Week 1: M0–M3 · Week 2: M4–M5 · Week 3: M6–M8 · Week 4: M9–M10.

**Before M5:** Tikka's WhatsApp number, Meta Business verification and the Cloud API app must be ready.
**Before M9:** the four message templates in TECH_PLAN §5 (drop live, thanks, expiry reminder, owner daily) must be submitted to Meta; any not yet approved are skipped and logged.

**Studio track:** S1 (Tikka Studio) needs only M0, so it can be built at any point; it's built now, ahead of the remaining launch work.

**Plain language:** every dashboard screen is for owners who aren't tech-savvy. One decision per screen, big tap targets, no jargon (CLAUDE.md).

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

## S1 · Tikka Studio (Studio track)

```
Read PRD B11 and B12 and TECH_PLAN §19. Needs only M0 (tokens, fonts, light layout).
- studio_enquiries and early_access (and teaser_dismissals) with RLS: submit_studio_enquiry(), join_early_access(), the admin read and status functions; database tests first (inserts only through the functions, rate-limited, only admins read, signing up twice leaves one row).
- content/studio/: case studies (work/<slug>.json), our ad and content pieces (pieces.json), permitted testimonials and client names, from our agency's real work (never invented; empty fields left out). lib/studio.ts reads and checks them (schema unit test), with search synonyms. Media stays on Cloudinary (next/image remote host; videos preload="none" with posters).
- Pages under app/(studio)/studio/: the landing page (hero with our own ad work, featured work, What we do with anchors, How we work, clients and testimonials, close), /studio/work (grid with service and industry filters and search in the URL), /studio/work/[slug] (case study with its own metadata and Open Graph image, related work), /studio/contact (enquiry form, free business audit line, consent, success message; prefilled and linked when signed in). Studio header and footer.
- "Chat with us on WhatsApp": wa.me/<STUDIO_WA_NUMBER> with the PRD's message (naming the client on a case study).
- No sign of the former agency anywhere public: Tikka's brand, tokens and logo only.

Done when: /studio, /studio/work, a case study and /studio/contact work on a phone at 375px and load fast on 4G (server-rendered, lazy media); an enquiry saves and shows in admin; the WhatsApp button opens with the right message; lint, typecheck and tests pass.
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

## M2 · Welcome tour, card setup and the business page address

```
Build PRD B2 (welcome tour) and B3 (card setup), and the Settings profile and card-look pages (B10).
- Tour: 4 screens, skippable, shown once (businesses.tour_done), ending on "Set up your card". Screen 4: "Your business page is free. Your first drop is free. After that, pay per drop from ₦5,000, or save with a season pack. If a paid drop brings too few customers, your next one is free."
- Setup also asks for the owner's WhatsApp number (for alerts and the daily summary) and the address; on save it creates the 'signup' voucher and the "Shop counter" poster.
- Card setup with the required/optional split and a live card preview that flips. Required must take under 3 minutes on a phone. City is required.
- Brand colour picker with 8 swatches and the contrast check (white or ink text at 4.5:1, or suggest a darker shade).
- Card background: colour, one of 4 Tikka patterns tinted with the brand colour, or photo (cropped to the cover area).
- Page address (slug) suggested from the name, unique, reserved words rejected (lib/slug.ts with tests). After setup: "Your page is live: usetikka.com/[slug]. Put it in your Instagram and WhatsApp bio." with copy and QR.
- Uploads to Supabase Storage per TECH_PLAN §14: logo 256px WebP, background 1200x600 WebP, video up to 30 s and 20 MB with a poster frame, portfolio photos (up to 12, 1600px WebP + 400px thumbnail).
- Action buttons (up to 4), services (up to 12), hours, about, tagline, address, code prefix suggestion with uniqueness check.
- The dashboard shows a "Make your card richer" checklist for the optional parts and a "Put your page in your bio" card.

Done when: I can sign up, take the tour, and set up Glow Studio with logo, colour, a pattern background and one WhatsApp button in under 3 minutes on my phone, see "Your page is live", then add services, portfolio photos and a video later.
```

## M3 · Create a Tikka drop (the simple builder, with pricing)

```
Build PRD B4 (drops list) and B5 (the simple builder) and TECH_PLAN §4 and the pricing half of §11.
- drop_tiers, drop_packs, drop_vouchers (sign-up voucher), drop_templates (36, from docs/drop-templates.md after review; rerunnable seed), drops.goal / template_id / validity_days / valid_weekdays / bounce_back / audience_band / ignored_warnings / tier fields, rewards.min_spend_kobo / requires_purchase / cost_kobo, the 30-day constraint; quote_drop; lib/pricing.ts and lib/vouchers.ts with tests.
- Screen 1 "What do you want this drop to do?": Get new customers, Bring customers back, Fill quiet days.
- Screen 2 "Pick an offer": templates for the business's category and goal as mini cards; tap to adjust amounts, services (prefilled from the business's services) and minimum spend; "Make my own" opens the full tier editor; bounce-back toggle and fields; weekday chips for quiet-day drops.
- Screen 3 "How big, and for how long?": audience question → suggested size; size cards with prices ("Covered by your season pack" when a voucher applies); runs for 7, 14 or 30 days; "More options" (start date, each Tikka lasts, card style, who can claim, reserved share, marketplace).
- Screen 4 "Check and publish": phone-frame preview; the drop check (lib/dropCheck.ts, one-tap fixes, ignored warnings stored); price and guarantee line; "Publish free" / "Publish with your season pack" / "Pay ₦10,000 and publish" (owner only). Voucher drops publish now; paid drops wait for M7's payments (until then, a dev-only "complete payment" step).
- One question per screen, progress bar, autosave, Back keeps answers. One live plus one scheduled drop per business.
- "Run it again" opens Screen 4 prefilled with an updated size suggestion.
- lib/deck.ts spread shuffle with unit tests.
- Spark teaser (PRD B12) beside the quick-start mixes: "Not sure what to offer? Spark will help. Coming soon." with Get early access (one tap; "You're on the list" after), dismissible per business. Never a working feature.

Done when: a first-time owner publishes a free drop from a template in under 2 minutes on a phone without help; the Spark teaser records early access once and stays dismissed for that business; template drops publish with correct reward rows for 200, 300 and 1,000 Tikkas; a second drop of 600 shows ₦10,000; staff can't create or publish drops.
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
- /t/[token]: first-visit hold and flip, then revealed, redeemed and expired states; the visit plan (editable); the bounce-back card.
- Claim sheet: the unticked future-drops checkbox (claim_intents.future_drops → leads.marketing_opt_in).
- claims.expires_at = claimed_at + validity_days (full validity, even past the drop's end); "When will you come in?" after the reveal (only days before expiry, and on valid weekdays).
- Expiry reminders (one per claim, lib/reminders.ts, template tikka_expiry_reminder, priority 3).
- Desktop claim sheet shows a QR to continue on a phone.
- lib/codes.ts with the typo tests.

Done when: I can claim a live drop through WhatsApp on my phone, come back, hold, flip and get the card in WhatsApp within seconds; claiming again resends the same card; the concurrency test passes.
```

## M6 · Redeem, staff and reviews

```
Implement PRD B7, B10 Team, A4 and B9, and TECH_PLAN §8 and §9.
- check_code (read-only) and confirm_redemption (row-locks the claim, re-checks, needs the action tick for action cards, inserts the redeemed event, enqueues the thank-you with the review link) with tests: check never mutates; two simultaneous confirms give one success.
- /app/redeem: camera scanner loaded only on this route, typed fallback with the offline check, valid and not-valid panels (incl. "Valid Mon–Thu only"), action-card checkbox, New customer / Been here before (preselected), "How much did they spend? (₦)", done state.
- Bounce-back: confirm_redemption creates the next-visit claim once per drop redemption (partial unique index); the thank-you includes it.
- Staff: invite by email, accept (Google or email), staff see only /app/redeem; owners can remove staff.
- Thank-you message: free-form if the 24-hour window is open, otherwise the tikka_redeemed_thanks template (if not yet approved, skip and log).
- /t/[token]/review and submit_review (redeemed, within 30 days, once); rating trigger on businesses; the Reviews tab on the claim page and the business's Reviews page with Report.

Done when: a staff account can scan and confirm a code in under 5 seconds on Android; the claimer gets the thank-you, leaves a 5-star review, and it shows on the card's Reviews tab and in the dashboard.
```

## M7 · Leads, follow-up, export, payments and vouchers

```
Implement PRD B8 and B10 Payments, and TECH_PLAN §10 and §11.
- get_leads: full details to owners only; staff and anonymous callers get an error (in SQL).
- Leads page: "Message today" (just claimed, coming today, ending in 2 days, expired and never came) with editable prewritten messages; the full list with tabs, filters, search, visit plans and "Message on WhatsApp" (logs followup_tap); live "Message her now?" prompt on new claims; export CSV (owner only).
- payments with RLS; publish_drop (voucher → deck now; else pending payment); buy_pack; complete_payment (idempotent, amount check: publishes, appends or creates vouchers); add_tikkas; evaluate_guarantee; abandoned after 1 hour.
- Paystack: initialize server-side (card and transfer), webhook with signature check, callback page with polling and the verify fallback after 10 s.
- Settings › Payments: drops you can publish without paying, season packs to buy, payment history.
- Owner daily summary (tikka_owner_daily) with the on/off setting.
- The database tests in TECH_PLAN §18 (5, 9–11, 14).

Done when: in Paystack test mode a new business publishes a 200-Tikka drop free; its second drop of 600 Tikkas costs ₦10,000, pays by card or transfer and publishes; a season pack creates 3 vouchers that publish drops without payment; replaying the webhook changes nothing; the leads page shows every claimer in full to the owner and nothing to staff.
```

## M8 · Drop dashboard and live activity

```
Implement PRD B6 and TECH_PLAN §12 (funnel, live feed, sources, suggested size) and §15 (share images).
- The drop report: headline by goal, customers who came in (new / returning), recorded sales, estimated reward cost, Tikka fee, cost per customer, spent beyond the reward, came back (lib/report.ts with tests; numbers match SQL).
- The 7-step funnel with % of the previous step (step 7 "Followed up"), opened-but-didn't-claim, new vs returning, opened after sell-out with the suggested next size, notify subscribers waiting (count only).
- Results card with "Run it again" when a drop ends; seasonal nudges (Black Friday, December, Valentine's).
- Live activity feed via Supabase Realtime on events, grouping bursts of views, first names only after a claim.
- By-source table with copy link and QR per channel; QR split by poster.
- Cards left by reward; extend end date; add more Tikkas (append to the deck in the same proportions); end early.
- Share kit images: WhatsApp status 1080x1920 and square 1080x1080.
- drop_daily_stats nightly rollup.
- Spark card (PRD B12): "Spark's read on this drop. Coming soon: what worked, what didn't and what to try next." with Get early access, dismissible per business.

Done when: the Spark card shows "You're on the list" once the business has signed up; during a test drop, opening the link on another phone shows up in the feed within a few seconds, and every dashboard number matches a direct SQL count.
```

## M9 · Marketplace, business pages and Notify me

```
Implement PRD A5 and A6 and TECH_PLAN §13 and the notify parts of §5.
- /drops home as built (live strip, headline numbers, featured pins, rankings, rows, categories, cities, businesses) with search and the city picker (All Nigeria, Lagos, Abuja, Port Harcourt, Ibadan, Other cities; remembered; Lagos by default); a city with none says so and offers Lagos. No new marketplace features during the pilot.
- /drops/all, /drops/[category], /drops/search with filters (city, area, category, live or coming soon, has legendary) and sorts; search over business name, category, city, area and drop title; drop tiles as CSS mini wrappers in the business's colours; tiles link to the claim page with c=market.
- The business page at /[slug] (free mini website; /b/[slug] redirects) per PRD A5: profile, actions, live and upcoming drops with Notify me, about and hours, services, portfolio gallery, reviews, past drops, location, share. get_business_page RPC; server-rendered; indexable with metadata and an OG image.
- Full-text search (tsvector + GIN). Cache the home for 60 s. Fast on 4G.
- Notify me: notify_intents, NT- routing in the webhook, subscribe_notify, confirmation message, STOP and STOP ALL, drop-live alerts by cron with the tikka_drop_live template, pilot cap 1,000 per drop, priority below card replies.
- Report this drop.
- Posters: /q/[code] routing (live drop, else the business page with Notify me), poster_scan events with poster ids, Settings › Posters (add with a label), print kit PDFs (A4 poster, A5 standee, table tent, 5 cm sticker, 3 mm bleed, editable hook line).
- Drop-live alerts to past claimers only when marketing_opt_in; STOP clears it.

Done when: with 5 seeded businesses and drops the marketplace looks full and loads fast on a phone; usetikka.com/glowstudio shows the full business page with portfolio, services, live drop and reviews; tapping Notify me on a scheduled drop sends the confirmation, and when the drop opens the alert arrives and links to the claim page tagged as marketplace.
```

## M10 · Landing page, admin and launch readiness

```
- Landing page (PRD B1): looping real card hero, how it works ("Posts scroll away. A Tikka drop keeps working."), who it's for, the example results (labelled as an example), pricing (Start free · Pay per drop with tiers from drop_tiers, season packs from drop_packs and the guarantee line), FAQs, a strip of live marketplace drops, Start free.
- /admin (PRD C2, TECH_PLAN §16): businesses (verify, suspend, founding member), reports queue, marketplace pins and hides, platform numbers, WhatsApp spend, payments and revenue, grant vouchers, guarantee vouchers issued, edit tier, founding and pack prices.
- Privacy policy and terms (PRD C1) linked from the claim sheet, footer and sign-up. Privacy policy and terms must be live before the first real claim; the claim sheet links to them for consent. The production build fails while they're still placeholders (scripts/check-legal.ts).
- Landing page shows no made-up numbers: demo businesses (businesses.is_demo) are excluded from every public count, ticker and strip, and each block only shows above its threshold (PRD B1).
- Error and empty states everywhere; friendly 404s.
- Accessibility pass: focus rings, labels, contrast from the tokens, reduced motion.
- Load test: 500 claims in 60 s against a staging drop with no double cards and webhook p95 under 1 s; 2,000 marketplace page views in 5 minutes.
- Error tracking and an uptime check on the webhook.
- Seed a demo business and drop for sales conversations.
- Landing page: the Spark section and "Does Tikka use AI?" FAQ (PRD B12; signed-out early access by email or WhatsApp), the Tikka Studio strip, and "Studio" in the nav and footer (PRD B11). Studio links in the drops-list empty state and Settings.
- /admin: Studio enquiries (status new / contacted / converted / closed) and the Spark early-access count and list.

Done when: a signed-out visitor can join Spark's early access once (a second try changes nothing) and an admin sees it with the Studio enquiries; I can onboard a real Lagos business, they publish a drop that appears on the marketplace, and real customers claim, redeem and review.
```
