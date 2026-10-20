# Tikka version one: product requirements

**Goal:** let the first 15–20 Lagos businesses run real drops end to end (set up, create, share, claim, redeem, review, unlock, follow up) and fill a real marketplace, so we can test the kill criteria: a claim rate of 15–20%+, a meaningful share redeemed in store, and at least 3 of 10 businesses paying to unlock leads.

## Decisions this PRD assumes

| Area | Decision |
| --- | --- |
| Business sign-in | **Continue with Google**, or **email and password** with email verification and "forgot password" |
| Claimers | No account. Identity is their WhatsApp number; the claim sheet asks for first name only |
| Rarity | Three tiers in version one: Thank-you, Rare, Legendary |
| Reward types | % off, ₦ off, free service or item, perk, and **action cards** (do something, show it at the counter, get the reward) |
| Card look | Business sets logo, brand colour and card background (colour, pattern or photo). Finishes: Matte, Foil, Holo (Holo free during the pilot) |
| Business profile on the card | Overview, Services, **Reviews** and **Video** tabs, plus action buttons |
| Reviews | Only from people who redeemed a Tikka, collected after redemption |
| Marketplace | In version one, as a proper marketplace (not a single page) |
| Notify me | In version one. Tikka pays Meta's message cost during the pilot |
| Staff logins | In version one. Staff can only use the redeem screen |
| Leads | Visible live while a drop runs, masked until redeemed or unlocked. Export includes unlocked leads only |
| Payments | Unlock credits through Paystack. Subscriptions later |
| WhatsApp | Tikka's own number receives claims and sends cards, thank-yous and alerts. Businesses follow up from their own phones |

---

## Part A: claimers and the public

### A1. Claim page `/d/[business]/[drop]`

The card experience is approved: build it to match `design/card-reference/` (look, copy, timings).

| Beat | What the claimer sees | Moves on when |
| --- | --- | --- |
| Sealed | The Tikka wrapper (never changes) with the business seal, "Limited drop · 600 Tikkas", the contents line ("10 legendary · 50 rare · 540 thank-you"), live counter "23 of 600 left", heading "A Tikka from Glow Studio", button "Tear to open" | Tap the wrapper or the button |
| Unwrap | The top tears off, the wrapper drops away, the business front rises (≈1.2s) | Animation ends |
| Business front | Card front (cover or background, logo, name, verified mark, category · area, rating, tagline, stub "Claim to see what's inside"). Under it: action buttons, "What's in this drop", tabs Overview · Services · Reviews · Video. Pinned gold button "Claim via WhatsApp" with "23 of 600 left · One per WhatsApp number" | Tap Claim |
| Claim sheet | "Claim your Tikka", first name, consent line "Glow Studio will be able to message you on WhatsApp about this drop.", "Continue on WhatsApp", "Not now" | Continue opens WhatsApp with the prefilled message |
| Confirming | "Confirming on WhatsApp. Send the message WhatsApp opens with, then come straight back here." | The webhook confirms (the page updates live) |
| Ready | Card front with stub "Claimed by Adaeze · Hold to open", the hold button and ring | Press and hold 1.3s (releasing early cancels) |
| Flip | The card trembles, the light builds white then turns the rarity colour, the card flips (0.6s) | Flip ends |
| Revealed | Back: rarity badge, spark, "You got a Tikka!" (thank-you: "Thank you for coming through"), "from Glow Studio · Lekki", "Issued to Adaeze · No. 0412 / 600" printing in; stub: reward, code, expiry. **Action card:** the stub shows the reward and one line of instruction, e.g. "Follow @glowstudio on Instagram and show it at the counter". Below: "Show this at the counter" with code and QR, "Also sent to your WhatsApp", business actions, "Share my Tikka" | — |

**Acceptance**
- First paint shows the sealed wrapper from server HTML, before any JavaScript.
- The counter is live. Under 10% left it turns gold.
- Holding works with touch, mouse and keyboard (Space or Enter held); releasing early resets the ring.
- Vibration on tear, claim confirmed and flip, where supported.
- Legendary: about 1.5s of confetti and a holo back.
- `prefers-reduced-motion`: no shine, tilt, shake or confetti; the flip becomes a 200ms crossfade.
- The video tab loads nothing until tapped (poster image first, `preload="none"`).
- Text alternatives on the card, before and after the reveal.
- The link preview (Open Graph image) is the sealed wrapper with the business seal.
- Every step is logged for link activity (B6).

**Edge cases**

| Case | What the claimer sees |
| --- | --- |
| Scheduled (not started) | Sealed wrapper; counter replaced by "Opens Sat 14 Dec, 9am"; buttons "Notify me" and "Tell a friend"; claim disabled |
| Sold out | The wrapper shown open and empty: "All 600 claimed. Get notified when Glow Studio drops again." with **Notify me** and the business actions |
| Ended | "This drop has ended." + Notify me + business actions |
| Already claimed (same phone) | The WhatsApp reply resends their card; the page shows their revealed card |
| This browser already claimed | Skips to their revealed card: "You already have a Tikka from this drop" |
| New customers only, and they're on the list | "This drop is for new customers. You're already on Glow Studio's list, so watch out for their next drop." |
| Once per period | "You've claimed a Glow Studio Tikka recently. Their next drop is yours." |
| Returning claimer, returning share used up | "New customers get first pick on this drop. Watch out for Glow Studio's next one." |
| Marketplace share used up (from the marketplace) | "The marketplace Tikkas for this drop are gone. Follow Glow Studio for the next one." |
| Message edited, no code | WhatsApp reply: "Tap Claim on the Tikka page again and send the message as it is." |
| Claim started 30+ min ago | "That took a while. Tap Claim again." |
| Desktop browser | The claim sheet shows a QR code to continue on a phone, plus the WhatsApp link |
| Never comes back to the browser | The WhatsApp reply's link opens their card (A2) |

### A2. My card `/t/[token]`
- First visit after claiming only in WhatsApp: Ready → hold → flip, as in A1.
- Later visits: the revealed card straight away, with code, QR, expiry, business actions and "Share my Tikka".
- **Redeemed:** stamp "Used on Fri 12 Dec". If they haven't reviewed yet: "How was Glow Studio?" with the star row (A4).
- **Expired:** "Expired Sun 31 Dec".
- No other claimer's data is reachable from here.

### A3. WhatsApp messages from Tikka

| Message | When | Copy |
| --- | --- | --- |
| Card delivered | A claim succeeds | Card image, then "🎟 You got a Tikka from Glow Studio! 20% off any service · Rare · Code GS-7X4QP · till Sun 31 Dec. Show this at the counter: usetikka.com/t/…" |
| Card resent | Repeat claim | "Here's your Tikka from Glow Studio again." + the same card |
| Blocked, sold out, help | As in A1 | The A1 copy |
| Thank-you + review | After redemption | "Thanks for coming to Glow Studio, Adaeze. How was it? Tap to rate: usetikka.com/t/…/review" (template if the 24-hour window has closed) |
| Notify me confirmed | They subscribe | "Done. We'll message you when Glow Studio's drop opens on Sat 14 Dec, 9am." |
| Drop is live | The drop opens (or the business drops again) | "Glow Studio's drop is live. 600 Tikkas, 10 legendary. Claim yours: usetikka.com/d/…" (template) |
| Stopped | They reply STOP | "You won't get Tikka messages about Glow Studio again." (STOP ALL: no Tikka messages at all) |

### A4. Review `/t/[token]/review`
- Opens only for a claim that was **redeemed**, within 30 days, and not yet reviewed.
- Five stars (required) and an optional line (max 140 characters). Shown as "Adaeze O. · Used a Tikka · Dec 2026".
- After sending: "Thanks. Your review is on Glow Studio's card now." and their card.
- One review per claim. Reviews can't be edited by the business; a business can report one (B9).

### A5. Marketplace `usetikka.com/drops`

A proper marketplace, server-rendered and fast on phones.

**Home**
- Header: search (businesses, areas, categories) and an area picker (Lagos areas; remembered).
- Category chips: Beauty, Wellness, Fitness, Food & drinks, Fashion, Health, Education, Events, Services.
- Sections, each a horizontal row of drop tiles with "See all":
  - **Live now** (default sort: trending = claims in the last hour)
  - **Ending soon** (under 24 hours left)
  - **Most claimed** (last 24 hours)
  - **Legendary inside** (drops with legendary Tikkas still left)
  - **New drops** (published in the last 3 days)
  - **Coming soon** (scheduled), each with Notify me
- Drop tile: a mini sealed wrapper in the business's colours with the seal, business name, area, category, "10 legendary · 50 rare", "23 of 600 left" or "Opens Sat 9am", time left. Tap → the claim page (tagged as a marketplace visit).

**See all / category / search results:** a grid of tiles with filters (area, category, live or coming soon, has legendary) and sorts (trending, ending soon, newest, most left).

**Business page `/b/[business]`:** the business profile (as on the card: cover, logo, rating, Overview, Services, Reviews, Video, actions), its live drop, its coming-soon drop, past drops count ("8 drops · 3,400 Tikkas claimed"), and **Notify me about their next drop**.

**Rules**
- A drop appears when it's published with "Show on the marketplace" on (default), unless Tikka has hidden it.
- Sold-out and ended drops leave the main sections but stay on the business page as past drops.
- "Report this drop" on every drop page (goes to the admin queue, C2).
- Empty states never look dead: a section with fewer than 3 drops is hidden; if the area has none, show Lagos-wide.

### A6. Notify me
- On a scheduled drop, a sold-out or ended drop, and a business page.
- Tap → WhatsApp opens with "Notify me about Glow Studio NT-7KQ4A" to Tikka's number → the webhook saves the subscription (phone + business, and the drop if there is one) → confirmation (A3).
- When the drop opens, or the business publishes its next drop: one "Drop is live" alert per subscriber, then the subscription is used up (a business-page subscription stays until STOP).
- Subscribers are **not leads**. The business sees only a count ("142 people are waiting for this drop"), never numbers.
- Pilot cap: up to 1,000 alerts per drop (Tikka pays). Alerts go out in a queue (TECH_PLAN §5).

---

## Part B: businesses

### B1. Landing page and sign-in
**Landing page `usetikka.com`:**
- Hero: the sealed Tikka tearing open and flipping (the real component, looping), headline "Turn people who see your business into customers you can follow up.", button "Start free".
- How it works in 4 steps (set up your card, drop Tikkas, people claim on WhatsApp, redeem and follow up).
- Who it's for (salons, spas, gyms, clinics, food spots, tutors), example results (the ₦1.9M salon example, labelled as an example), pricing (free to start, pay to unlock leads), FAQs, a strip of live marketplace drops.

**Sign-in:** Continue with Google, or email and password. Email sign-ups confirm by link before the dashboard opens. Forgot password by email. Staff invited by email sign in the same way.

### B2. Welcome tour
Four short screens, skippable, shown once:
1. "This is a Tikka": the wrapper tearing open.
2. "Every Tikka holds something": the three tiers as real cards (Thank-you, Rare, Legendary) with an example reward each.
3. "How it works": claim on WhatsApp → show at the counter → you see every lead.
4. "What it costs": free to run drops and redeem; pay only to unlock people who didn't come in.
Ends with "Set up your card".

### B3. Card setup (the business profile)
Done once, editable any time in Settings. A live card preview beside (desktop) or above (phone) the form, flipping between front and back.

**Required (target: under 3 minutes)**
- Business name, category, area.
- Logo (square, at least 256px).
- Brand colour (colour picker + 8 suggested swatches). Tikka checks contrast and picks white or ink text; if neither reaches 4.5:1 it suggests a darker shade.
- Card background: **Colour** (the brand colour), **Pattern** (4 Tikka patterns tinted with the brand colour) or **Photo** (upload; cropped to the cover area; no text on photos is advised).
- At least one action button with its number or link: Chat on WhatsApp, Call, Directions, Book, Instagram, Menu (up to 4).
- Code prefix: two letters suggested from the name, editable, unique.

**Optional ("Make your card richer", shown as a checklist on the dashboard)**
- Tagline (max 60 characters).
- About (max 280) and opening hours.
- Services and prices (up to 12).
- Video: one clip, up to 30 seconds and 20 MB (MP4 or MOV), with a poster frame picked from the clip.

### B4. Drops list
Each drop: status (Draft, Scheduled, Live, Sold out, Ended), dates, cards left, claims, redeemed, revenue. Buttons: "Create a drop", and on each past drop "Run it again".

### B5. Create a Tikka drop
Business details are never asked again. "Run it again" opens this builder prefilled from the chosen drop.

**Step 1 · How many and how long**
- Drop name (e.g. "December Glow").
- Number of Tikkas, with a hint: "Make a few more than you expect claims; running out turns people away." After a past drop, suggest a size from its numbers.
- Starts: now, or a date and time (scheduled drops show as Coming soon on the marketplace).
- Ends: a date and time. Every Tikka in the drop expires then.

**Step 2 · What's inside**
- Quick start: **Generous** (5% legendary · 25% rare · 70% thank-you), **Balanced** (2% · 10% · 88%), **Mostly thank-you** (1% · 4% · 95%), or **Custom**.
- Three tier rows: Legendary, Rare, Thank-you. Each row: how many (number or % of the total) and **what they get**:
  - reward type: % off, ₦ off, free service or item, perk, or **action card**;
  - the details (e.g. "20" + "% off any service"; for an action card: the action, e.g. "Follow @glowstudio on Instagram", and the reward after it);
  - optional terms (one line, e.g. "Weekdays only").
- A tier can be split into more than one reward ("+ Add another reward"), e.g. Rare: 30 × 20% off and 20 × free brow tint.
- Thank-you fills whatever's left automatically and must name a small benefit (suggestions: priority booking, free consultation, early access to the next drop).
- Live summary: "600 Tikkas · 10 legendary (1.7%) · 50 rare (8.3%) · 540 thank-you (90%)".

**Step 3 · Look and rules**
- Finish: Matte, Foil, Holo (live preview).
- Who can claim: Once per drop (default) · Once every [N] days · New customers only. Share reserved for new customers (default 70%, under "More options").
- Marketplace: "Show on the marketplace" (on by default) and, under "More options", "Limit marketplace Tikkas to [N]".

**Step 4 · Preview and publish**
- The real claim page in a phone frame with a sample reveal.
- Publish warns: "After publishing you can extend the end date, add more Tikkas or end the drop early, but not change the rewards."
- After publishing: the drop link, QR code (PNG), channel links, WhatsApp status image and square post image, and "Your drop is on the marketplace".

Drafts save at every step.

### B6. Drop dashboard and link activity
**Headline numbers:** "This drop brought in ₦1.9M" (once there's a redemption), claims, cards left, time left.

**Link funnel** (where people drop off), each with counts and % of the step before:
1. Opened the link (views and unique visitors)
2. Tore open the wrapper
3. Tapped Claim
4. Continued to WhatsApp
5. Claimed
6. Redeemed
7. Unlocked by you
Plus: "Opened but didn't claim", new vs returning claimers, "Opened after it sold out" with a suggested next size, and Notify-me subscribers waiting.

**Live activity feed** (updates in real time):
- "Someone opened your link · via Instagram · 2 min ago" (views from many people group into "14 people opened your link in the last 5 minutes")
- "Adaeze claimed a Rare Tikka · just now"
- "Tunde redeemed · ₦25,000"
- "Kemi left a 5-star review"
Visitors before claiming are anonymous; first names appear only after a claim.

**By source:** a table of opens, claims and claim rate for each channel link (WhatsApp status, Instagram, QR code, website, ads, marketplace), with copy-link and QR for each.

**Cards left by reward** ("Legendary 7 of 10 left").

**Actions:** share kit, extend the end date, **add more Tikkas** (same mix, appended to the deck), end early.

### B7. Redeem screen `/app/redeem`
For owners and staff, on a phone at the counter.
- Opens to the camera scanner, with "Type the code" below. Typed codes are checked offline first ("That code has a typo").
- **Valid** (light panel): first name + initial, reward, tier, expiry; for an action card, a checkbox "They followed @glowstudio" that must be ticked; optional bill amount (₦); "Confirm redemption".
- **Not valid** (dark panel) with one reason: already used (when), expired (when), from another business, not a Tikka code. "Scan another code".
- After confirming: "Done. Adaeze's Tikka is used." and back to the scanner.
- Never shows phone numbers.
- Scan to confirmed in under 5 seconds on a mid-range Android phone; two staff confirming at once give one success.

### B8. Leads
- Live while a drop runs. Tabs: All, New, Redeemed, Locked, Unlocked. Filter by drop and source; search by name.
- Row: name (first name + initial if locked), phone (masked if locked), tags (Locked, Redeemed, Unlocked, New, From marketplace), reward, claim date, amount spent if redeemed.
- Locked: "Unlock". Unlocked: "Message on WhatsApp" (opens WhatsApp from the business's phone with "Hi Tunde, your 20% off at Glow Studio is still waiting. It ends Sunday.").
- Header: "7 free unlocks left · 0 credits · Buy credits". "Unlock all locked from this drop (34)" with the cost shown before confirming.
- **Export** (owner only): CSV of unlocked leads. If some are locked: "34 leads are locked. Unlock them to include them (34 credits)."
- Out of credits: credit packs → Paystack checkout → back with credits added.
- Staff can't open this page.

### B9. Reviews
- Average rating, count, and the list (newest first) with drop and date.
- "Report" on a review (goes to the admin queue). Businesses can't edit or delete reviews.
- Reviews appear on the card's Reviews tab and the business page.

### B10. Settings
- Business profile (B3), card look.
- **Team:** invite staff by email; staff can use Redeem only; remove staff.
- Credits: balance, history, buy credits.
- Account: email, password, sign out.

---

## Part C: trust, admin and legal

### C1. Legal (before the pilot)
- Privacy policy and terms (Nigeria Data Protection Act): what's collected (first name, WhatsApp number, claims, redemptions, reviews, notify subscriptions), who sees it (the business, after redemption or unlock; never notify-only subscribers), anonymous view counting, how to ask for deletion.
- Consent line in the claim sheet; sending the WhatsApp message is the opt-in. STOP handling (A3).
- Before public launch, ask a lawyer whether random rewards count as a prize promotion needing approval.

### C2. Tikka admin `/admin` (internal)
- Businesses: search, view, **grant the Verified badge**, suspend.
- Moderation queue: reported drops and reviews; hide or keep.
- Marketplace: hide a drop, pin a drop to a section (for launch).
- Platform numbers: businesses, live drops, claims today, redemptions, WhatsApp messages sent and their cost.

---

## Out of version one
Tasks that need proof uploads, automated expiry reminders, subscriptions (Pro, Business), multiple locations, reserve-at-booking, bring-a-friend, timed release, website widget, consumer wallet, partner programme, paid featured drops, phone-tilt holo (finger tilt only).

## Copy rules
No gambling words (win, winner, luck, lucky, jackpot, odds, bet, stake, lottery, raffle, prize draw). Sentence case. ₦ always. "Tikka" with a capital T in text. Counts read "23 of 600 left". A thank-you card always names its benefit.
