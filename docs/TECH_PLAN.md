# Tikka technical plan (version one)

## 1. Architecture

```
Claimer / marketplace visitor ──> Next.js on Vercel ──> Supabase (Postgres, Auth, Storage, Realtime)
        │                                                  ▲
        └─ wa.me link ─> WhatsApp ─> Meta Cloud API webhook ┘ (claims, notify, STOP in; cards, alerts out)
Business / staff ──> dashboard (Supabase Auth) ──> Paystack checkout ─> Paystack webhook
Vercel Cron (every minute) ──> outbound message queue ──> Meta Cloud API
```

- Public pages (landing, marketplace, business pages, claim page, my card, review) are server-rendered and read through narrow RPCs or views. They never query base tables directly.
- Writes that matter (claim, redeem, publish and pay for a drop, review, notify) are Postgres functions called from route handlers with the service role. The browser never holds the service key.
- Row Level Security on every table.

### Routes

```
/                          landing page
/drops                     marketplace home
/drops/all, /drops/[category], /drops/search
/b/[business]              business page
/d/[business]/[drop]       claim page
/t/[token]                 a claimer's card
/t/[token]/review          review form
/q/[code]                  a business's permanent QR poster → the live drop, else the business page
/app/...                   dashboard: tour, setup, drops, drop dashboard, leads, reviews, settings
/app/redeem                counter screen (owner and staff)
/admin/...                 Tikka admin (is_admin only)
/api/whatsapp/webhook      Meta webhook
/api/paystack/webhook      Paystack webhook
/api/cron/outbound         sends queued WhatsApp messages
/api/og/*                  share and preview images
/api/posters/[id]/[format] print kit PDFs (A4 poster, A5 standee, table tent, sticker)
/api/cron/daily            owner daily summaries, seasonal nudges, guarantee checks
```

## 2. Auth and roles

- Supabase Auth with **Google** and **email + password** (email confirmation on, password reset by email).
- `profiles (user_id, display_name, is_admin bool default false)`.
- Roles per business in `business_members`: `owner` (everything) or `staff` (redeem only).
- Staff invites: `business_invites (id, business_id, email, role, token, invited_by, accepted_at, expires_at)`. Accepting signs them in (Google or email) and adds the membership.
- Middleware: `/app/*` needs a signed-in member; staff are redirected to `/app/redeem` from every other `/app` route; `/admin/*` needs `is_admin`.

## 3. Data model

All ids `uuid`, timestamps `timestamptz default now()`.

**businesses**
`id, name, slug unique, code_prefix char(2) unique, category, state, city, area, tagline, brand_color, on_brand_color, background_type ('color'|'pattern'|'photo'), background_value (pattern id or storage path), logo_path, video_path, video_poster_path, about, hours jsonb, services jsonb, actions jsonb (up to 4: type, label, value), verified bool, suspended bool, rating_avg numeric, rating_count int, tour_done bool, address text null, owner_whatsapp text (E.164, for alerts and the daily summary), daily_summary bool default true, founding_member bool default false, guarantee_used bool default false, created_at, is_demo bool default false (demo and sales-seed businesses: excluded from every public count, ticker, marketplace query and landing strip)`
`slug` is the business page address (usetikka.com/[slug]): lowercase letters, numbers and hyphens, 3–30 characters, unique, and not a reserved word (`lib/slug.ts`: drops, d, t, b, q, app, admin, api, og, login, signup, sign-in, sign-up, pricing, terms, privacy, help, about, settings and similar). `city` is required. A new business gets one 'signup' voucher (free tier) and one "Shop counter" poster.

**business_members** `(business_id, user_id, role)` PK (business_id, user_id).

**drops**
`id, business_id, slug (unique per business), title, goal ('new_customers'|'bring_back'|'quiet_days'), template_id null references drop_templates, total_cards int, finish ('matte'|'foil'|'holo'), eligibility ('once_per_drop'|'once_per_period'|'new_only'), period_days, new_reserved_pct int default 70, show_in_marketplace bool default true, marketplace_cap int null, starts_at, ends_at, validity_days int default 14 check (validity_days in (7,14,30)), valid_weekdays int[] null (1 = Monday … 7 = Sunday; quiet-day drops), bounce_back jsonb null (title, kind, value, min_spend_kobo, terms, validity_days default 30), audience_band text null (the builder's "how many see your status" answer), ignored_warnings text[] default '{}', status ('draft'|'published'|'ended_early'|'hidden'), published_at, copied_from uuid null, alerted_at null, tier_id text references drop_tiers, tier_max_cards int, paid_with ('voucher'|'payment') null, voucher_id null, payment_status ('free'|'pending'|'paid'), guarantee_checked_at null`
Constraints: `ends_at <= starts_at + interval '30 days'`. **One live plus one scheduled:** `publish_drop` refuses a drop when the business already has a live drop overlapping it and a scheduled one (checked in the function under a lock on the business row).

The state shown to people is derived, not stored: `scheduled` (published, now < starts_at), `live`, `sold_out` (no available cards), `ended` (now > ends_at or ended_early).

**rewards**
`id, drop_id, tier ('common'|'rare'|'legendary', where 'common' is shown as "Thank-you" in the UI), kind ('percent_off'|'amount_off'|'free_item'|'perk'|'action'), value numeric null, title text, action_text text null, terms text null, quantity int, min_spend_kobo int null, requires_purchase bool default false, cost_kobo int null (the business's own cost of a free item, for the report)`
Publishing requires `sum(quantity) = total_cards` and every reward to have a title. `action_text` is required when `kind = 'action'`.

**cards** (the shuffled deck)
`id, drop_id, reward_id, position int, serial int, status ('available'|'claimed'), claim_id null`
Unique (drop_id, position), (drop_id, serial). Index (drop_id, status, position).

**claim_intents**
`id, drop_id, token unique ('TK-' + 5), first_name, future_drops bool, visitor_id, source ('wa'|'ig'|'qr'|'web'|'ads'|'market'|'direct'), poster_id null, status ('pending'|'claimed'|'duplicate'|'blocked_new_only'|'blocked_period'|'sold_out'|'market_sold_out'|'expired'), claim_id, phone, created_at, expires_at`

**leads**
`id, business_id, phone (E.164), first_name, wa_profile_name, first_seen_at, first_source, claims_count, redeemed_count, last_followup_at null, opted_out bool, marketing_opt_in bool default false, marketing_opt_in_at null`
`marketing_opt_in` is set only from the claim sheet's future-drops checkbox; STOP clears it.
Unique (business_id, phone).

**claims**
`id, drop_id, kind ('drop'|'bounce_back') default 'drop', parent_claim_id null, card_id unique null (null for bounce-backs), lead_id, phone, first_name, code unique, view_token unique, is_new_lead, source, poster_id null, claimed_at, expires_at, planned_visit_date date null, planned_visit_part ('morning'|'afternoon'|'evening') null, reminder_sent_at null, redeemed_at, bill_amount_kobo, customer_status ('new'|'returning') null, redeemed_by, action_confirmed bool`
Partial unique index (drop_id, phone) **where kind = 'drop'** (one Tikka per number per drop; bounce-backs don't count).

**reviews**
`id, claim_id unique, business_id, drop_id, rating smallint (1–5), body varchar(140), display_name ('Adaeze O.'), status ('visible'|'reported'|'hidden'), created_at`
Insert only through `submit_review()`; a trigger keeps `businesses.rating_avg` and `rating_count` up to date (every review on show: visible or reported, not hidden).

**notify_intents** `id, token unique ('NT-' + 5), business_id, drop_id null, visitor_id, created_at, expires_at`

**notify_subscriptions**
`id, phone, business_id, drop_id null, status ('active'|'used'|'stopped'), created_at, notified_at`
Unique (phone, business_id, coalesce(drop_id, '00000000-0000-0000-0000-000000000000')).

**opt_outs** `phone, business_id null (null = all of Tikka), created_at`

**outbound_messages** (the queue)
`id, phone, kind ('card'|'resend'|'reply'|'thanks'|'notify_confirm'|'expiry_reminder'|'owner_daily'|'drop_live'), template_name null, payload jsonb, priority smallint, status ('queued'|'sending'|'sent'|'failed'), attempts, wa_message_id, error, scheduled_for, sent_at, cost_estimate_usd numeric`

**wa_messages** `id, direction, phone, wa_message_id unique, body jsonb, related_id, created_at` (audit log; inbound messages also set `last_inbound_at` per phone in `wa_contacts (phone pk, profile_name, last_inbound_at)` so we know whether the 24-hour window is open)

**drop_tiers** `id text pk, label, max_cards int, price_kobo int, founding_price_kobo int, guarantee_min_redemptions int null, sort` (seeded; admin can edit prices)
| id | label | max_cards | price_kobo | founding_price_kobo | guarantee_min_redemptions |
| --- | --- | --- | --- | --- | --- |
| free | First drop | 200 | 0 | 0 | null |
| small | Small drop | 300 | 500000 (₦5,000) | 500000 | 5 |
| medium | Medium drop | 1000 | 1000000 (₦10,000) | 1000000 | 10 |
| large | Large drop | 3000 | 2000000 (₦20,000) | 2000000 | 20 |
Over 3,000 Tikkas can't self-publish ("Talk to us").

**drop_packs** `id text pk, tier_id references drop_tiers, drops int, price_kobo int, active bool` (seeded: small × 3 · 1200000; medium × 3 · 2500000)

**drop_vouchers** `id, business_id, tier_id references drop_tiers, source ('signup'|'pack'|'guarantee'|'admin'), pack_payment_id null, used_by_drop_id null, expires_at null, created_at, used_at`
A voucher pays for one drop up to its tier's size. Sign-up creates one 'free' voucher. One table covers the free first drop, season packs, guarantee refunds and admin grants. Expiry: pack vouchers 12 months after purchase; sign-up and guarantee vouchers never; admin grants never unless an expiry date is set when granting. Expired vouchers are never used. **The UI never says "voucher"** (`lib/vouchers.ts` holds the wording).

**payments** `id, business_id, kind ('drop'|'upgrade'|'pack'), drop_id null, pack_id null, from_tier null, to_tier null, extra_cards int null, amount_kobo, paystack_reference text unique, status ('pending'|'paid'|'failed'|'abandoned'), created_by, created_at, paid_at`
RLS: owners of the business read theirs; staff and anonymous users can't. Writes only through the functions in §11.

**drop_templates** `id, category ('beauty_hair'|'spa_wellness'|'fitness'|'food_drinks'|'fashion'|'health_clinics'|'education'|'other_services'), goal, name, why_line, rewards jsonb (tier, share of the drop, kind, value, title, min_spend_kobo, requires_purchase), bounce_back jsonb, default_validity_days, valid_weekdays int[] null (quiet-day templates), sort, active`
36 templates: three per goal for beauty_hair and spa_wellness, one per goal for the other six. The source of truth is `docs/drop-templates.md` (reviewed by a person); `pnpm seed:templates` (scripts/seed-templates.ts) checks the template rules and writes `supabase/seed/drop_templates.sql`, an upsert by template id, so it can be rerun after edits.
Shares scale to any size (legendary 2%, rare 10%, thank-you the rest), rounded with largest remainder and at least 1 legendary and rare when the size allows. Business categories map to template categories: Beauty → beauty_hair, Wellness → spa_wellness, Health → health_clinics, Education → education, Fitness, Food & drinks and Fashion as named, Events and Services → other_services. Seed at least 3 per category.

**posters** `id, business_id, code char(6) unique (the code alphabet, §7), label, hook_line null, created_at`

**business_portfolio** `id, business_id, kind ('photo'|'video'), image_path (photo: 1600px WebP; video: the MP4), thumb_path (400px WebP; for videos a captured frame), caption varchar(80) null, duration_s numeric null, position` (max 12 per business and 3 videos of up to 15 s / 15 MB, enforced in the insert function).

**business_page** (one row per business, the one-page website, PRD A5): `business_id pk, hero_image_path null, hero_focal_x numeric default 0.5, hero_focal_y numeric default 0.5, headline varchar(60) null, subline varchar(100) null, about_image_path null, show_team bool default false, show_faqs bool default false, show_text bool default false, text_title varchar(40) null, text_body varchar(600) null, updated_at`.
**business_services** `id, business_id, group_name varchar(30) null, name varchar(40), description varchar(140) null, price_kobo int null, price_kind ('fixed'|'from'|'ask'), duration varchar(20) null, image_path null, position` (max 12; replaces the `services` jsonb on businesses).
**business_team** `id, business_id, name varchar(40), role varchar(40) null, photo_path null, position` (max 8). **business_faqs** `id, business_id, question varchar(120), answer varchar(400), position` (max 10).
`businesses.serve_mode ('in_store'|'online'|'come_to_you') default 'in_store'`: online and come-to-you businesses have no hours, location or Directions on the page.

**events** (link activity, anonymous)
`id, drop_id null, business_id, type ('view'|'unwrap'|'claim_tap'|'claim_continue'|'claim_completed'|'redeemed'|'reviewed'|'sold_out_view'|'notify_subscribed'|'followup_tap'|'poster_scan'), visitor_hash, source, poster_id null, first_name null (only for claim_completed, redeemed, reviewed), amount_kobo null, tier null, created_at`
Indexes (drop_id, created_at), (business_id, created_at).

**reports** `id, target_type ('drop'|'review'), target_id, reason, reporter_business_id null, reporter_visitor_hash null, status ('open'|'kept'|'hidden'), decided_at, decided_by, created_at`

## 4. Publishing a drop: the deck

Publishing goes through `publish_drop` (§11): drops covered by a voucher publish at once; paid drops publish when their payment completes. Either way, in one transaction:
1. Validate rewards and dates (`ends_at > starts_at`, `ends_at > now`, `ends_at <= starts_at + 30 days`), and the one-live-plus-one-scheduled rule.
2. Build one entry per card from the rewards.
3. **Spread shuffle:** chunks of ~50; each chunk gets its proportional share of every reward (largest-remainder rounding, exact totals); shuffle inside each chunk with a crypto RNG; concatenate.
4. Insert `cards` with `position` = index and `serial` = a separate random permutation of 1..N.
5. `status = 'published'`, `published_at = now()`.

**Add more Tikkas** (live drop): append K cards in the same reward proportions, spread-shuffled, positions after the current maximum, new serials after N; `total_cards += K`; reward quantities increase to match. Free while the new total fits `tier_max_cards`; otherwise only after an 'upgrade' payment (§11).

**Extend end date:** up to `starts_at + 30 days`. **End early:** allowed, no refund.

`lib/deck.ts` with unit tests: exact totals per reward; each chunk within ±1 of its share; seeded RNG for deterministic tests; appending keeps the proportions.

**Templates** (`drop_templates`) are applied on the server at save: shares × total, largest-remainder rounding, legendary and rare at least 1 when the total allows; the result is saved as plain reward rows. "Make my own" uses the full tier editor; its quick-start mixes (Generous 5/25/70, Balanced 2/10/88, Mostly thank-you 1/4/95) work the same way.

**The drop check** (`lib/dropCheck.ts`, shared by the builder and `publish_drop`): non-blocking warnings with ids — `no_purchase_needed`, `long_validity`, `empty_thank_you`, `bigger_than_audience`, `no_bounce_back`, `legendary_heavy`. Warnings still showing at publish are stored in `drops.ignored_warnings`.

## 5. WhatsApp (Cloud API)

### What it's used for

| # | Use | Direction | Message type | Cost from 1 Oct 2026 (Nigeria, reported) |
| --- | --- | --- | --- | --- |
| 1 | Receive claim messages (proves the number, consent, profile name) | In | — | Free |
| 2 | Send the card (image, reward, code, link) | Out | Free-form inside the 24h window | ~$0.01 |
| 3 | Resend, blocked, sold out, help replies | Out | Free-form inside the window | ~$0.01 |
| 4 | Thank-you + review link after redemption | Out | Free-form if the window is open, else utility template `tikka_redeemed_thanks` | ~$0.01 |
| 5 | Receive Notify me and STOP | In | — | Free |
| 6 | Confirm Notify me | Out | Free-form inside the window | ~$0.01 |
| 7 | "Drop is live" alert (Notify-me subscribers, and past claimers with `marketing_opt_in`) | Out | Template `tikka_drop_live` (expect Meta to class it as marketing) | ~$0.06 |
| 8 | Expiry reminder, one per Tikka | Out | Template `tikka_expiry_reminder` (utility) | ~$0.01 |
| 9 | Owner daily summary | Out | Template `tikka_owner_daily` (utility), to `businesses.owner_whatsapp` | ~$0.01 |

Not used for: business sign-in, or businesses messaging their leads (that's `wa.me` from the business's own phone). Confirm current rates on Meta's pricing page before setting prices; record a `cost_estimate_usd` on every outbound message so the admin page shows real spend.

**Messaging limits:** Meta limits how many people a number can message with templates in a rolling 24 hours (replies inside an open window don't count). New numbers start low and the limit rises with use and good quality. So: verify the business early, send alerts through the queue with priority, and never let alerts delay claim replies.

### Webhook `POST /api/whatsapp/webhook`
1. GET: the verification handshake (`hub.verify_token`).
2. POST: verify `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the app secret). Reject on mismatch.
3. For each message: dedupe on `wa_message_id`; log to `wa_messages`; upsert `wa_contacts.last_inbound_at`.
4. Route by content:
   - `TK-XXXXX` → `claim_card()` (§6) → enqueue the card (priority 1) or the matching reply.
   - `NT-XXXXX` → `subscribe_notify()` → enqueue the confirmation.
   - `STOP` / `STOP ALL` → write `opt_outs`, stop matching subscriptions, mark leads `opted_out` and clear `marketing_opt_in`, enqueue the confirmation.
   - Anything else → a short help reply (at most once per hour per phone).
5. Respond 200 within a second; sending happens from the queue.

Status webhooks (sent, delivered, failed) update `outbound_messages`.

### Click-to-claim
1. Claim sheet (first name) → server creates a `claim_intent` (30-minute expiry) → the page opens `https://wa.me/<TIKKA_NUMBER>?text=Claim%20my%20Tikka%20TK-4821K%20from%20Glow%20Studio`.
2. The page subscribes to the intent (Supabase Realtime; 2s polling fallback) and shows Confirming.
3. The webhook claims and enqueues the card; the intent becomes `claimed`; the page moves to Ready.
4. The reveal endpoint returns only this claimer's reward, tier, code, serial and name, and only to the visitor id that created the intent.

### The outbound queue
- `/api/cron/outbound` runs every minute (Vercel Cron) and also gets a direct kick after each webhook so card replies leave within seconds.
- Takes queued rows by priority (1 card/resend/replies, 2 thank-you, 3 notify confirm, expiry reminders and owner summaries, 4 drop-live alerts) with `for update skip locked`, sends, records the result, retries failures with backoff (max 3).
- Skips any phone in `opt_outs` for that business or for all of Tikka.
- Free-form messages are only sent if `last_inbound_at` is within 24 hours; otherwise the thank-you switches to its template, and other replies are dropped.

### Templates to submit to Meta before the notify milestone
- `tikka_drop_live`: "{{1}}'s drop is live. {{2}} Tikkas, {{3}} legendary. Claim yours: {{4}}" with a button to the claim page.
- `tikka_redeemed_thanks`: "Thanks for coming to {{1}}, {{2}}. {{3}} How was it? Rate them here: {{4}}" ({{3}} is the bounce-back line, or empty).
- `tikka_expiry_reminder`: "Your {{1}} at {{2}} ends {{3}}. Show this at the counter: {{4}}".
- `tikka_owner_daily`: "{{1}} today: {{2}} new claims, {{3}} planning to come tomorrow, {{4}} Tikkas expiring soon. Open your list: {{5}}".
If a template isn't approved yet, skip that message and log it.

### Expiry reminders
One per claim (`claims.reminder_sent_at`). Due at the earlier of 08:00 WAT on `planned_visit_date`, or 10:00 WAT three days before `expires_at`. The per-minute cron enqueues due reminders (priority 3) and skips claims that are redeemed, expired, or whose phone has opted out. `lib/reminders.ts` computes the due time (unit-tested).

### Owner daily summary
Each morning (`/api/cron/daily`), for businesses with `daily_summary` and an `owner_whatsapp`: new claims since yesterday, claims planning to come tomorrow, Tikkas expiring in the next 3 days, and in the seasonal windows one "Run it again" line.

### Drop-live alerts
A cron step finds drops whose `starts_at` has passed and `alerted_at` is null (and businesses that just published a drop, for business-page subscribers and opted-in past claimers), enqueues one `drop_live` message per active subscription or opted-in lead (deduped by phone) (pilot cap: 1,000 per drop, oldest subscribers first), marks drop subscriptions `used`, and sets `alerted_at`.

## 6. The claim function

```sql
claim_card(p_intent_token text, p_phone text, p_wa_name text)
returns table (result text, claim_id uuid, view_token text)
-- 'claimed' | 'duplicate' | 'blocked_new_only' | 'blocked_period' | 'sold_out' | 'market_sold_out' | 'expired' | 'invalid'
```

One transaction:
1. Lock the intent (`for update`). Missing → `invalid`. Not pending → return its stored result (webhooks can repeat).
2. Load the drop. Not live (scheduled, ended, hidden) → `expired`.
3. Existing claim for (drop, phone) → `duplicate` with that claim.
4. Upsert the lead; `is_new_lead` = the lead didn't exist before (record `first_source`).
5. Eligibility: `new_only` + existing lead → `blocked_new_only`; `once_per_period` + a claim at this business within `period_days` → `blocked_period`; lead opted out of this business → still allow the claim (they chose to claim) but clear `opted_out`.
6. Reserved share: returning claimer and `returning_claims >= floor(total_cards * (100 - new_reserved_pct) / 100)` → `sold_out`.
7. Marketplace cap: `source = 'market'` and `marketplace_cap` set and marketplace claims ≥ cap → `market_sold_out`.
8. Next card: `select … from cards where drop_id = … and status = 'available' order by position limit 1 for update skip locked`. None → `sold_out`.
9. Code (§7) and `view_token` (22+ url-safe chars); `expires_at = now() + drop.validity_days` (the full validity, even past the drop's end); insert the claim; mark the card; bump `leads.claims_count`; if the intent asked for future drops, set `marketing_opt_in` and its time; mark the intent; insert a `claim_completed` event with first name and tier.

**Required concurrency test:** 100 cards with 1 legendary, 300 parallel claims from distinct phones → exactly 100 claims, no card twice, exactly 1 legendary, everyone else `sold_out`.

## 7. Codes
- Format: business prefix (2 letters) + `-` + 5 characters, e.g. `GS-7X4QP`.
- Alphabet (25): `ACDEFGHJKMNPQRTUVWXY34679` (no 0/O, 1/I/L, 2/Z, 5/S, 8/B).
- Characters 1–4 random (crypto RNG); character 5 a check character: a weighted sum mod 25 over the prefix and the 4 characters, weights 2, 1, 2, 1… from the right (prefix letters outside the alphabet map through a fixed table). Luhn mod N needs an even alphabet size, so it isn't used.
- `lib/codes.ts`: `generate`, `normalize` (uppercase, strip spaces and dashes, reject characters outside the alphabet), `isWellFormed` (offline check). Tests: every single-character typo and every adjacent swap is caught.
- The QR encodes the code only, not a URL.

## 8. Redemption
- `check_code(p_business, p_code)` (read-only; the caller must be an owner or staff of `p_business`, the business the counter screen is open for) → `valid` with first name + initial, reward, tier, `expires_at`, `action_text` if an action card, and `suggested_status` ('new' if the lead has no earlier redemption at this business, else 'returning'); or `already_used` (when) / `expired` (the claim's `expires_at`) / `wrong_day` (quiet-day drops outside `valid_weekdays`: "Valid Mon–Thu only") / `wrong_business` / `unknown`.
- `confirm_redemption(p_business, p_code, p_bill_amount_kobo, p_action_confirmed, p_customer_status)` → takes a row lock on the claim (`for update`), re-checks, requires `p_action_confirmed` for action cards, sets `redeemed_at`, amount, `customer_status`, `redeemed_by`; bumps `leads.redeemed_count`; inserts a `redeemed` event; **if the drop has a bounce-back and this claim is kind 'drop', creates a bounce-back claim** for the same lead (new code and view token, `expires_at = now() + bounce_back.validity_days`); enqueues the thank-you with the bounce-back line and the review link (until the outbound queue lands, it returns the bounce-back and the route handler sends it). Redeeming a bounce-back never creates another. Tikkas, bounce-backs included, last until 23:59 WAT on their last day (`private.last_day`, matching `claimExpiry` in `lib/visit.ts`).
- Camera scanning with a small library (e.g. `qr-scanner`) loaded only on `/app/redeem`; typed fallback with the offline check.

## 9. Reviews
- `submit_review(p_view_token, p_rating, p_body)` → allowed only if the claim is redeemed, redeemed within 30 days, and has no review. Stores `display_name` as first name + last initial (from the WhatsApp profile name if available, else first name). Inserts a `reviewed` event.
- Business: `report_review(id, reason)` (owners only; staff can't) → `status = 'reported'` (still visible until admin decides) + a `reports` row. Reporting again is a no-op.
- Admin: `decide_review_report(id, hide)` → `hidden`, or back to `visible`; closes the open reports.
- Public reads through `get_business_reviews(business, page)` (visible only).

## 10. Leads
- Every claimer is a lead the owner sees in full: first name, WhatsApp number, reward, tier, status (claimed, redeemed), source, claim date, amount spent.
- `get_leads(p_business, filters)`: owners only. Staff and anonymous callers get an error. The check lives in SQL (RLS + the function), never in React.
- "Message on WhatsApp" opens `wa.me` from the owner's phone and logs a `followup_tap` event (for the funnel's "Followed up" step and `leads.last_followup_at`).
- `export_leads(p_business, filters)` (owner): all leads for the chosen drop or all drops, as CSV.
- **Message today** (`get_followups(p_business)`, owners only): just claimed (last 24 h), planning to come today, expiring within 2 days and not redeemed, expired and never came; each with the prewritten message (`lib/followups.ts`).
- The dashboard subscribes to `claim_completed` events (Realtime) and shows "Adaeze just claimed a Rare Tikka. Message her now?".
- Test: owners get full numbers; staff and anonymous callers get none from any endpoint.

## 11. Pricing, vouchers and payments (Paystack)
**The server prices every drop**: the browser never sends an amount. `lib/pricing.ts` reads `drop_tiers` and `drop_packs` (cached); nothing hard-codes prices in the UI. Founding members pay `founding_price_kobo` for single drops; season packs are the same price for everyone.

**Functions** (security definer, owner only unless noted):
- `quote_drop(p_business, p_total_cards)` → the smallest tier whose `max_cards` fits, its price (founding price for founding members), and the smallest unused voucher whose tier fits, if any. Over 3,000 → `contact_us`.
- `publish_drop(p_drop)` → checks the one-live-plus-one-scheduled rule and the 30-day maximum; if a voucher covers it, marks the voucher used, builds the deck (§4) and publishes (one transaction, `paid_with = 'voucher'`); otherwise creates a pending `payments` row (kind 'drop') and returns it; the drop stays a draft.
- `buy_pack(p_business, p_pack)` → a pending payment (kind 'pack').
- `complete_payment(p_reference, p_amount_kobo)` → called only by the webhook and the verify fallback (service role); one transaction; idempotent. Unknown or already settled → no change. Amount ≠ payment amount → mark failed, publish nothing. 'drop' → build the deck and publish (`paid_with = 'payment'`). 'upgrade' → raise `tier_max_cards` and append the extra Tikkas. 'pack' → create one voucher per drop in the pack.
- `add_tikkas(p_drop, p_extra)` → free if the new total fits `tier_max_cards`; otherwise an 'upgrade' payment for (new tier price − current tier price); a voucher drop upgrading pays the full price of the new tier. Append only after payment.
- `evaluate_guarantee(p_drop)` (cron; sets `guarantee_checked_at`) runs once the last Tikka from the drop can no longer be redeemed: after the drop has ended and the latest `claims.expires_at` has passed, or earlier once the drop has ended and every claimed Tikka is redeemed or expired. It creates a 'guarantee' voucher for the same tier and sets `businesses.guarantee_used` when **all** hold: the drop was paid (`paid_with = 'payment'`); the business hasn't used the guarantee; redeemed claims of kind 'drop' (all tiers; bounce-backs excluded) < the tier's `guarantee_min_redemptions`; views came from at least 3 different sources (counting each poster as a source); and the drop has a `template_id` or no `ignored_warnings`. Shows "Your drop brought fewer customers than we promised. Your next Medium drop is on us."
- Pending payments older than 1 hour become 'abandoned' (in the per-minute cron).

**Paystack**
- Initialize server-side with the payment's `amount_kobo`, currency NGN, a new unique `reference` saved on the payment, metadata `{ payment_id, business_id }`, channels card and bank transfer, `callback_url` `/app/pay/confirm?payment=<id>`.
- Webhook `/api/paystack/webhook`: verify `x-paystack-signature` (HMAC-SHA512 of the raw body with the secret key); on `charge.success` call `complete_payment(reference, amount)`. Repeats are harmless.
- Callback: "Confirming payment…" while watching the payment (Realtime, or 2 s polling). Still pending after 10 s → Paystack's verify-transaction endpoint, server-side, into `complete_payment`. Then the publish success screen, the pack's vouchers, or the upgraded drop.

## 12. Link activity and analytics
- Anonymous visitor id cookie (random, 1 year). `visitor_hash = sha256(visitor_id + daily salt)`. No names, numbers or raw IPs before a claim.
- Source from the link (`?c=wa|ig|qr|web|ads`); marketplace tiles add `c=market`; no parameter = `direct`.
- Events (§3) written from the server for `view` (once per visitor per drop per day; later views count in a separate `view_total` counter), and from small client beacons for `unwrap`, `claim_tap`, `claim_continue`.
- **Funnel:** counts per step from `events` + `claims` (B6). "Opened but didn't claim" = unique viewers without a `claim_completed` from the same visitor.
- **Live feed:** the dashboard subscribes to `events` for its business through Supabase Realtime (RLS limits rows to members); the client groups bursts of views ("14 people opened your link in the last 5 minutes").
- Suggested next size: unique viewers after sell-out × the drop's claim rate + claims, rounded up to the nearest 50. The builder's size suggestion: about 1 Tikka per 3 viewers from the audience answer, rounded to a tier. For a business that still has its free first drop, the free size (200) is preselected and the paid sizes show underneath; paying for a bigger first drop leaves the free drop unused.
- **Drop report** (`get_drop_report(p_drop)`, owners only; `lib/report.ts` for the maths): customers who came in (new / returning from `customer_status`), recorded sales (sum of `bill_amount_kobo`), estimated reward cost (percent_off × bill, amount_off value, or `cost_kobo` for free items), Tikka fee (payment amount, or "Free drop" / "Season pack"), cost per customer and per new customer, customers who spent beyond the reward, and bounce-backs redeemed ("came back"). Headline by goal.
- QR visits carry `poster_id`; the by-source table splits QR by poster label.
- A nightly job rolls `events` into `drop_daily_stats` for fast charts.

## 13. Marketplace
- `marketplace_drops` view: live and scheduled drops with `show_in_marketplace`, business not suspended, drop not hidden; with business name, slug, state, city, area, category, colours, logo, tier counts left, cards left, ends_at, claims in the last hour and 24 hours, published_at.
- The home filters by the visitor's chosen city (remembered in a cookie; Lagos by default). If a city has no drops, say so and offer Lagos.
- Sections are queries on that view: trending (claims last hour desc), ending soon (`ends_at < now() + 24h`), most claimed (24h), legendary inside (legendary left > 0), new (published within 3 days), coming soon (scheduled, by starts_at).
- Claim counts for ranking come from a `drop_activity` table updated by the claim function (claims_last_hour is computed from `events` with an index; cache the home page for 60 seconds).
- Search: Postgres full-text over business name, category, city, area and drop title (`tsvector` column + GIN index), plus `ilike` fallback.
- Admin pins: `marketplace_pins (drop_id, section, position)`.
- **Business page** `/[slug]` (`/b/[slug]` redirects): one RPC `get_business_page(slug)` returning the profile, `business_page`, services (with groups), portfolio (photos and videos), team, FAQs, actions, live and upcoming drops, visible reviews, hours and address (omitted for online and come-to-you businesses). Edited in `/app/page` (owners only; RLS on every table). Server-rendered and cached briefly; indexable, with `generateMetadata` (title "Glow Studio · Lekki, Lagos · Tikka", description from tagline or about, Open Graph image of the cover and logo). Live as soon as the required card setup is done; free, always.
- **Posters** `/q/[code]`: server-side redirect. One live drop → its claim page with `?c=qr&p=<poster id>`; more than one → the business page; none → the business page (scheduled drop with Notify me, or "Notify me about our next drop"). Records a `poster_scan` event. Print kit PDFs (A4 poster, A5 standee, A5 table tent, 5 cm sticker; 3 mm bleed) with the ticket shape, brand colours, business name and logo, the QR, an editable hook line (default from the current or last drop's best reward) and "usetikka.com".
- Tiles render the mini sealed wrapper with CSS (no image per tile). The marketplace home must stay fast on 4G: server-render, paginate rows (8 tiles each), lazy-load logos.

## 14. Media
- Storage buckets: `logos` (resized to 256px WebP), `backgrounds` (1200×600 WebP), `videos` (MP4/MOV up to 20 MB and 30 s; duration checked in the browser before upload and from the file's metadata on the server), `posters` (a frame captured in the browser, 720px WebP), `portfolio` (photos 1600px WebP plus a 400px thumbnail; videos up to 15 s and 15 MB with a captured frame; up to 12 items and 3 videos per business; the gallery lazy-loads thumbnails first), `page` (hero 1920px WebP, about, service and team photos, all compressed in the browser).
- **Plan:** the Supabase free tier (1 GB storage, projects pause when idle, no backups) is fine while building; **move to a paid Supabase plan before the pilot** (before the first real claim). Cloudinary for images and video is an option to discuss later.
- The video tab plays from storage with `preload="none"` and the poster. Transcoding is out of version one; ask for MP4 (H.264) where possible.
- Card patterns: 4 SVG patterns tinted with the brand colour in CSS.

## 15. Images
- `/api/og/card?claim=…&sig=…`: the revealed card (signed HMAC so it can't be enumerated), used in WhatsApp and "Share my Tikka".
- `/api/og/drop?drop=…`: the sealed wrapper with the business seal (link previews, marketplace sharing).
- `/api/og/status?drop=…`: 1080×1920 WhatsApp status image; `/api/og/square?drop=…`: 1080×1080 post.

## 16. Admin
- `/admin` behind `is_admin`: businesses (search, verify, suspend, founding member), the reports queue (hide or keep), marketplace pins and hides, platform numbers, WhatsApp spend from `outbound_messages.cost_estimate_usd`, payments and revenue (`payments` where `status = 'paid'`, by kind), granting vouchers, guarantee vouchers issued, and editing tier prices, founding prices and pack prices.

## 17. Environment

```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET (in Supabase Auth settings)
WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_BUSINESS_ACCOUNT_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, TIKKA_WA_NUMBER
PAYSTACK_SECRET_KEY, NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY
OG_SIGNING_SECRET, ANALYTICS_SALT, CRON_SECRET
NEXT_PUBLIC_SITE_URL (https://usetikka.com; absolute link-preview URLs)
```

## 18. Testing priorities
1. `claim_card()` concurrency, eligibility, reserved share and marketplace cap (database tests).
2. Deck shuffle and "add more" proportions (unit).
3. Codes and typo detection (unit).
4. Webhook signature, dedupe and routing (TK, NT, STOP, other) with recorded payloads.
5. Leads: owners get full numbers; staff and anonymous callers get none from any endpoint.
6. Redemption: check never mutates; double confirm → one `already_used`; action cards need the tick; `customer_status` stored; staff see no phone numbers.
7. Reviews: only redeemed claims, once, within 30 days.
8. Queue: priority order, opt-outs skipped, the 24-hour rule, retries.
9. Pricing and vouchers: a new business has one free voucher; the quote uses the smallest fitting voucher; founding prices apply; packs create the right vouchers; over 3,000 can't self-publish.
10. Publish and payments: voucher publish builds the deck; paid publish waits for payment; repeat webhooks change nothing; amount mismatch publishes nothing; upgrade appends only after payment; one-live-plus-one-scheduled enforced; 30-day maximum enforced.
11. Guarantee: granted only when every condition holds; once per business; never for voucher drops; counts redeemed drop claims of every tier and not bounce-backs; evaluated only once nothing from the drop can still be redeemed (including a claim on the last day redeemed after the drop ends).
12. Expiry: `claims.expires_at` is claim time plus validity, even past the drop's end; `check_code` rejects expired and wrong-weekday codes.
13. Reminders: one per claim; skipped when redeemed, expired or opted out; due at the right time.
14. Consent: drop-live alerts to past claimers only reach opted-in leads; STOP clears opt-in.
15. Bounce-back: created once per drop redemption, never from a bounce-back; the partial unique index allows it.
16. Report numbers match direct SQL counts.
17. Posters: `/q` routing for live, scheduled and no drop; poster ids recorded on events.
18. Business page: reserved slugs rejected; renders with only required setup; portfolio capped at 12.
19. Builder: a template drop publishes with correct reward rows for 200, 300 and 1,000 Tikkas.
20. Staff can't create, pay for or publish drops, or read `payments`.
