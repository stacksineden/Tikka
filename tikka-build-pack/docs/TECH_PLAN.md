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
- Writes that matter (claim, redeem, unlock, review, notify) are Postgres functions called from route handlers with the service role. The browser never holds the service key.
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
/app/...                   dashboard: tour, setup, drops, drop dashboard, leads, reviews, settings
/app/redeem                counter screen (owner and staff)
/admin/...                 Tikka admin (is_admin only)
/api/whatsapp/webhook      Meta webhook
/api/paystack/webhook      Paystack webhook
/api/cron/outbound         sends queued WhatsApp messages
/api/og/*                  share and preview images
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
`id, name, slug unique, code_prefix char(2) unique, category, area, tagline, brand_color, on_brand_color, background_type ('color'|'pattern'|'photo'), background_value (pattern id or storage path), logo_path, video_path, video_poster_path, about, hours jsonb, services jsonb, actions jsonb (up to 4: type, label, value), verified bool, suspended bool, free_unlocks_remaining int default 10, unlock_credits int default 0, rating_avg numeric, rating_count int, tour_done bool, created_at`

**business_members** `(business_id, user_id, role)` PK (business_id, user_id).

**drops**
`id, business_id, slug (unique per business), title, total_cards int, finish ('matte'|'foil'|'holo'), eligibility ('once_per_drop'|'once_per_period'|'new_only'), period_days, new_reserved_pct int default 70, show_in_marketplace bool default true, marketplace_cap int null, starts_at, ends_at, status ('draft'|'published'|'ended_early'|'hidden'), published_at, copied_from uuid null, alerted_at null`

The state shown to people is derived, not stored: `scheduled` (published, now < starts_at), `live`, `sold_out` (no available cards), `ended` (now > ends_at or ended_early).

**rewards**
`id, drop_id, tier ('common'|'rare'|'legendary', where 'common' is shown as "Thank-you" in the UI), kind ('percent_off'|'amount_off'|'free_item'|'perk'|'action'), value numeric null, title text, action_text text null, terms text null, quantity int`
Publishing requires `sum(quantity) = total_cards` and every reward to have a title. `action_text` is required when `kind = 'action'`.

**cards** (the shuffled deck)
`id, drop_id, reward_id, position int, serial int, status ('available'|'claimed'), claim_id null`
Unique (drop_id, position), (drop_id, serial). Index (drop_id, status, position).

**claim_intents**
`id, drop_id, token unique ('TK-' + 5), first_name, visitor_id, source ('wa'|'ig'|'qr'|'web'|'ads'|'market'|'direct'), status ('pending'|'claimed'|'duplicate'|'blocked_new_only'|'blocked_period'|'sold_out'|'market_sold_out'|'expired'), claim_id, phone, created_at, expires_at`

**leads**
`id, business_id, phone (E.164), first_name, wa_profile_name, first_seen_at, first_source, claims_count, redeemed_count, unlocked_at, unlock_source ('free'|'credit'|'redeemed'), opted_out bool`
Unique (business_id, phone).

**claims**
`id, drop_id, card_id unique, lead_id, phone, first_name, code unique, view_token unique, is_new_lead, source, claimed_at, redeemed_at, bill_amount_kobo, redeemed_by, action_confirmed bool`
Unique (drop_id, phone).

**reviews**
`id, claim_id unique, business_id, drop_id, rating smallint (1–5), body varchar(140), display_name ('Adaeze O.'), status ('visible'|'reported'|'hidden'), created_at`
Insert only through `submit_review()`; a trigger keeps `businesses.rating_avg` and `rating_count` up to date (visible reviews only).

**notify_intents** `id, token unique ('NT-' + 5), business_id, drop_id null, visitor_id, created_at, expires_at`

**notify_subscriptions**
`id, phone, business_id, drop_id null, status ('active'|'used'|'stopped'), created_at, notified_at`
Unique (phone, business_id, coalesce(drop_id, '00000000-0000-0000-0000-000000000000')).

**opt_outs** `phone, business_id null (null = all of Tikka), created_at`

**outbound_messages** (the queue)
`id, phone, kind ('card'|'resend'|'reply'|'thanks'|'notify_confirm'|'drop_live'), template_name null, payload jsonb, priority smallint, status ('queued'|'sending'|'sent'|'failed'), attempts, wa_message_id, error, scheduled_for, sent_at, cost_estimate_usd numeric`

**wa_messages** `id, direction, phone, wa_message_id unique, body jsonb, related_id, created_at` (audit log; inbound messages also set `last_inbound_at` per phone in `wa_contacts (phone pk, profile_name, last_inbound_at)` so we know whether the 24-hour window is open)

**credit_transactions** `id, business_id, delta, reason ('purchase'|'unlock'|'grant'), paystack_reference unique null, created_at`

**events** (link activity, anonymous)
`id, drop_id, business_id, type ('view'|'unwrap'|'claim_tap'|'claim_continue'|'claim_completed'|'redeemed'|'reviewed'|'sold_out_view'|'notify_subscribed'), visitor_hash, source, first_name null (only for claim_completed, redeemed, reviewed), amount_kobo null, tier null, created_at`
Indexes (drop_id, created_at), (business_id, created_at).

**reports** `id, target_type ('drop'|'review'), target_id, reason, reporter (visitor_hash or business_id), status, created_at`

## 4. Publishing a drop: the deck

On publish, in one transaction:
1. Validate rewards and dates (`ends_at > starts_at`, `ends_at > now`).
2. Build one entry per card from the rewards.
3. **Spread shuffle:** chunks of ~50; each chunk gets its proportional share of every reward (largest-remainder rounding, exact totals); shuffle inside each chunk with a crypto RNG; concatenate.
4. Insert `cards` with `position` = index and `serial` = a separate random permutation of 1..N.
5. `status = 'published'`, `published_at = now()`.

**Add more Tikkas** (live drop): append K cards in the same reward proportions, spread-shuffled, positions after the current maximum, new serials after N; `total_cards += K`; reward quantities increase to match.

`lib/deck.ts` with unit tests: exact totals per reward; each chunk within ±1 of its share; seeded RNG for deterministic tests; appending keeps the proportions.

**Quick-start mixes** are computed client-side from the total (Generous 5/25/70, Balanced 2/10/88, Mostly thank-you 1/4/95, rounding legendary and rare up to at least 1 when the total allows) and saved as plain reward rows.

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
| 7 | "Drop is live" alert | Out | Template `tikka_drop_live` (expect Meta to class it as marketing) | ~$0.06 |

Not used for: business sign-in, or businesses messaging their leads (that's `wa.me` from the business's own phone). Confirm current rates on Meta's pricing page before setting prices; record a `cost_estimate_usd` on every outbound message so the admin page shows real spend.

**Messaging limits:** Meta limits how many people a number can message with templates in a rolling 24 hours (replies inside an open window don't count). New numbers start low and the limit rises with use and good quality. So: verify the business early, send alerts through the queue with priority, and never let alerts delay claim replies.

### Webhook `POST /api/whatsapp/webhook`
1. GET: the verification handshake (`hub.verify_token`).
2. POST: verify `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the app secret). Reject on mismatch.
3. For each message: dedupe on `wa_message_id`; log to `wa_messages`; upsert `wa_contacts.last_inbound_at`.
4. Route by content:
   - `TK-XXXXX` → `claim_card()` (§6) → enqueue the card (priority 1) or the matching reply.
   - `NT-XXXXX` → `subscribe_notify()` → enqueue the confirmation.
   - `STOP` / `STOP ALL` → write `opt_outs`, stop matching subscriptions, mark leads `opted_out`, enqueue the confirmation.
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
- Takes queued rows by priority (1 card/resend/replies, 2 thank-you, 3 notify confirm, 4 drop-live alerts) with `for update skip locked`, sends, records the result, retries failures with backoff (max 3).
- Skips any phone in `opt_outs` for that business or for all of Tikka.
- Free-form messages are only sent if `last_inbound_at` is within 24 hours; otherwise the thank-you switches to its template, and other replies are dropped.

### Templates to submit to Meta before the notify milestone
- `tikka_drop_live`: "{{1}}'s drop is live. {{2}} Tikkas, {{3}} legendary. Claim yours: {{4}}" with a button to the claim page.
- `tikka_redeemed_thanks`: "Thanks for coming to {{1}}, {{2}}. How was it? Rate them here: {{3}}".

### Drop-live alerts
A cron step finds drops whose `starts_at` has passed and `alerted_at` is null (and businesses that just published a drop, for business-page subscribers), enqueues one `drop_live` message per active subscription (pilot cap: 1,000 per drop, oldest subscribers first), marks drop subscriptions `used`, and sets `alerted_at`.

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
9. Code (§7) and `view_token` (22+ url-safe chars); insert the claim; mark the card; bump `leads.claims_count`; mark the intent; insert a `claim_completed` event with first name and tier.

**Required concurrency test:** 100 cards with 1 legendary, 300 parallel claims from distinct phones → exactly 100 claims, no card twice, exactly 1 legendary, everyone else `sold_out`.

## 7. Codes
- Format: business prefix (2 letters) + `-` + 5 characters, e.g. `GS-7X4QP`.
- Alphabet (25): `ACDEFGHJKMNPQRTUVWXY34679` (no 0/O, 1/I/L, 2/Z, 5/S, 8/B).
- Characters 1–4 random (crypto RNG); character 5 a Luhn mod N check character over the prefix and the 4 characters (prefix letters outside the alphabet map through a fixed table).
- `lib/codes.ts`: `generate`, `normalize` (uppercase, strip spaces and dashes, reject characters outside the alphabet), `isWellFormed` (offline check). Tests: every single-character typo is caught, and every adjacent swap except the one pair Luhn mod N can't see (the first and last alphabet characters).
- The QR encodes the code only, not a URL.

## 8. Redemption
- `check_code(p_code)` (read-only, owner or staff of the code's business) → `valid` with first name + initial, reward, tier, expiry, `action_text` if an action card; or `already_used` (when) / `expired` / `wrong_business` / `unknown`.
- `confirm_redemption(p_code, p_bill_amount_kobo, p_action_confirmed)` → locks the claim, re-checks, requires `p_action_confirmed` for action cards, sets `redeemed_at`, amount, `redeemed_by`; bumps `leads.redeemed_count`; unlocks the lead free (`unlock_source = 'redeemed'`) if it wasn't; inserts a `redeemed` event; enqueues the thank-you + review link.
- Camera scanning with a small library (e.g. `qr-scanner`) loaded only on `/app/redeem`; typed fallback with the offline check.

## 9. Reviews
- `submit_review(p_view_token, p_rating, p_body)` → allowed only if the claim is redeemed, redeemed within 30 days, and has no review. Stores `display_name` as first name + last initial (from the WhatsApp profile name if available, else first name). Inserts a `reviewed` event.
- Business: `report_review(id, reason)` → `status = 'reported'` (still visible until admin decides) + a `reports` row.
- Public reads through `get_business_reviews(business, page)` (visible only).

## 10. Leads, masking and unlocking
- `get_leads(p_business, filters)` masks phone (`0803•••4521`) and name (first + initial) **in SQL** unless unlocked. Refuses staff.
- `unlock_lead(p_lead)` / `unlock_leads(p_drop)`: free unlocks first, then credits; `credit_transactions` rows; return `needs_credits` with the shortfall.
- `export_leads(p_business, filters)` (owner): unlocked leads only, as CSV.
- Test: call every lead-related endpoint and assert a locked lead's full number never appears.

## 11. Payments (Paystack)
- Credit packs (e.g. 50 unlocks for ₦5,000, to confirm). Initialize server-side with metadata `{business_id, pack}`, redirect to checkout.
- Webhook: verify `x-paystack-signature` (HMAC-SHA512 with the secret key); on `charge.success`, insert the `credit_transactions` row keyed by `reference` (unique, so repeats are harmless) and add credits.

## 12. Link activity and analytics
- Anonymous visitor id cookie (random, 1 year). `visitor_hash = sha256(visitor_id + daily salt)`. No names, numbers or raw IPs before a claim.
- Source from the link (`?c=wa|ig|qr|web|ads`); marketplace tiles add `c=market`; no parameter = `direct`.
- Events (§3) written from the server for `view` (once per visitor per drop per day; later views count in a separate `view_total` counter), and from small client beacons for `unwrap`, `claim_tap`, `claim_continue`.
- **Funnel:** counts per step from `events` + `claims` (B6). "Opened but didn't claim" = unique viewers without a `claim_completed` from the same visitor.
- **Live feed:** the dashboard subscribes to `events` for its business through Supabase Realtime (RLS limits rows to members); the client groups bursts of views ("14 people opened your link in the last 5 minutes").
- Suggested next size: unique viewers after sell-out × the drop's claim rate + claims, rounded up to the nearest 50.
- A nightly job rolls `events` into `drop_daily_stats` for fast charts.

## 13. Marketplace
- `marketplace_drops` view: live and scheduled drops with `show_in_marketplace`, business not suspended, drop not hidden; with business name, area, category, colours, logo, tier counts left, cards left, ends_at, claims in the last hour and 24 hours, published_at.
- Sections are queries on that view: trending (claims last hour desc), ending soon (`ends_at < now() + 24h`), most claimed (24h), legendary inside (legendary left > 0), new (published within 3 days), coming soon (scheduled, by starts_at).
- Claim counts for ranking come from a `drop_activity` table updated by the claim function (claims_last_hour is computed from `events` with an index; cache the home page for 60 seconds).
- Search: Postgres full-text over business name, category, area and drop title (`tsvector` column + GIN index), plus `ilike` fallback.
- Admin pins: `marketplace_pins (drop_id, section, position)`.
- Tiles render the mini sealed wrapper with CSS (no image per tile). The marketplace home must stay fast on 4G: server-render, paginate rows (8 tiles each), lazy-load logos.

## 14. Media
- Storage buckets: `logos` (resized to 256px WebP), `backgrounds` (1200×600 WebP), `videos` (MP4/MOV up to 20 MB and 30 s; duration checked in the browser before upload and from the file's metadata on the server), `posters` (a frame captured in the browser, 720px WebP).
- The video tab plays from storage with `preload="none"` and the poster. Transcoding is out of version one; ask for MP4 (H.264) where possible.
- Card patterns: 4 SVG patterns tinted with the brand colour in CSS.

## 15. Images
- `/api/og/card?claim=…&sig=…`: the revealed card (signed HMAC so it can't be enumerated), used in WhatsApp and "Share my Tikka".
- `/api/og/drop?drop=…`: the sealed wrapper with the business seal (link previews, marketplace sharing).
- `/api/og/status?drop=…`: 1080×1920 WhatsApp status image; `/api/og/square?drop=…`: 1080×1080 post.

## 16. Admin
- `/admin` behind `is_admin`: businesses (search, verify, suspend), the reports queue (hide or keep), marketplace pins and hides, platform numbers, and WhatsApp spend from `outbound_messages.cost_estimate_usd`.

## 17. Environment

```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET (in Supabase Auth settings)
WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_BUSINESS_ACCOUNT_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, TIKKA_WA_NUMBER
PAYSTACK_SECRET_KEY, NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY
OG_SIGNING_SECRET, ANALYTICS_SALT, CRON_SECRET
```

## 18. Testing priorities
1. `claim_card()` concurrency, eligibility, reserved share and marketplace cap (database tests).
2. Deck shuffle and "add more" proportions (unit).
3. Codes and typo detection (unit).
4. Webhook signature, dedupe and routing (TK, NT, STOP, other) with recorded payloads.
5. Masking: no locked number in any response.
6. Redemption: check never mutates; double confirm → one `already_used`; action cards need the tick.
7. Reviews: only redeemed claims, once, within 30 days.
8. Queue: priority order, opt-outs skipped, the 24-hour rule, retries.
