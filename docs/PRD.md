# Tikka version one: product requirements

**Goal:** let the first 15–20 businesses (Lagos first) run real drops end to end (set up, create from a template, share, claim, plan a visit, redeem, review, follow up) and fill a real marketplace, so we can test the kill criteria: a claim rate of 15–20%+, a meaningful share redeemed in store, and **at least 3 of 10 businesses paying for their second drop**.

The pitch: drops turn people who see a business into customers who come in, and contacts it can follow up. The business page (a mini website), the permanent QR poster and the marketplace support drops; they aren't the headline.

## Decisions this PRD assumes

| Area | Decision |
| --- | --- |
| Business sign-in | **Continue with Google**, or **email and password** with email verification and "forgot password" |
| Claimers | No account. Identity is their WhatsApp number; the claim sheet asks for first name only |
| Rarity | Three tiers: Thank-you ("everyone else"), Rare ("some"), Legendary ("very few") |
| Reward types | % off, ₦ off, free service or item, perk, and **action cards**. Rare and Legendary rewards should need a purchase or showcase the main service |
| Drop goal | Every drop has one: **Get new customers**, **Bring customers back** or **Fill quiet days** |
| Builder | Four plain-language screens, starting from ready-made offers for the business's category and goal. A first-time owner publishes in under 2 minutes |
| Drops | One live drop per business at a time, plus at most one scheduled next drop. At most 30 days long |
| Tikka expiry | Each Tikka lasts 7, 14 or 30 days after it's claimed (default 14), even past the drop's end: a claim on the last day gets its full time |
| Bounce-back | Optional: redeeming a Tikka issues a "next visit" Tikka automatically |
| Card look | Business sets logo, brand colour and card background (colour, pattern or photo). Card styles: Matte, Foil, Holo (Holo free during the pilot) |
| Business profile on the card | Overview, Services, **Reviews** and **Video** tabs, plus action buttons |
| Reviews | Only from people who redeemed a Tikka, collected after redemption |
| Marketplace | In version one, filtered by city (Lagos first). Kept as built during the pilot; no new features |
| Notify me | In version one. Tikka pays Meta's message cost during the pilot |
| Staff logins | In version one. Staff can only use the redeem screen |
| Leads | Owners see every claimer in full (first name, WhatsApp number, reward, status, visit plan), with no per-person fees. Export includes all leads |
| Consent | The claim sheet covers this drop only. Future drops on WhatsApp need a separate, unticked checkbox |
| Payments | Free first drop (up to 200 Tikkas). Then pay per drop by size, or buy a **season pack** of 3 drops. Paystack (card or transfer). No subscription |
| Founding price | The first 20 businesses (admin flag) keep founding prices for life |
| Guarantee | A paid drop that brings too few confirmed redemptions earns a free drop of the same size, once per business (B5) |
| Business page | Free mini website at usetikka.com/[slug], for the business's Instagram and WhatsApp bio. Always free |
| QR poster | One permanent QR per business that always leads to the current drop, with printable posters |
| Where | Businesses anywhere in Nigeria can sign up. The marketplace is filtered by city and launches with Lagos first |
| WhatsApp | Tikka's own number receives claims and sends cards, reminders, thank-yous and alerts. Businesses follow up from their own phones |
| Tikka Studio | Tikka's tailor-made, done-for-you service (our agency work, now sold under Tikka only). Ships in version one as its own landing site inside usetikka.com (`/studio`): services, past work and case studies. No prices or checkout: every enquiry starts with a free business audit, then a quote (B11) |
| Spark | Tikka's AI drop strategist. **Not built in version one.** It appears only as "Coming soon" teasers with "Get early access", which records interest. Never styled as a working feature (B12) |

---

## Part A: claimers and the public

### A1. Claim page `/d/[business]/[drop]`

The card experience is approved: build it to match `design/card-reference/` (look, copy, timings).

| Beat | What the claimer sees | Moves on when |
| --- | --- | --- |
| Sealed | The Tikka wrapper (never changes) with the business seal, "Limited drop · 600 Tikkas", the contents line ("10 legendary · 50 rare · 540 thank-you"), live counter "23 of 600 left", heading "A Tikka from Glow Studio", button "Tear to open" | Tap the wrapper or the button |
| Unwrap | The top tears off, the wrapper drops away, the business front rises (≈1.2s) | Animation ends |
| Business front | Card front (cover or background, logo, name, verified mark, category · area, rating, tagline, stub "Claim to see what's inside"). Under it: action buttons, "What's in this drop", tabs Overview · Services · Reviews · Video. Pinned gold button "Claim via WhatsApp" with "23 of 600 left · One per WhatsApp number". Quiet-day drops show "Use it Mon–Thu" | Tap Claim |
| Claim sheet | "Claim your Tikka", first name, consent line "Glow Studio will be able to message you on WhatsApp about this drop.", an **unticked** checkbox "Also send me Glow Studio's future drops on WhatsApp.", "Continue on WhatsApp", "Not now" | Continue opens WhatsApp with the prefilled message |
| Confirming | "Confirming on WhatsApp. Send the message WhatsApp opens with, then come straight back here." | The webhook confirms (the page updates live) |
| Ready | Card front with stub "Claimed by Adaeze · Hold to open", the hold button and ring | Press and hold 1.3s (releasing early cancels) |
| Flip | The card trembles, the light builds white then turns the rarity colour, the card flips (0.6s) | Flip ends |
| Revealed | Back: rarity badge, spark, "You got a Tikka!" (thank-you: "Thank you for coming through"), "from Glow Studio · Lekki", "Issued to Adaeze · No. 0412 / 600" printing in; stub: reward, code, "Use by Sun 15 Dec". **Action card:** the stub shows the reward and one line of instruction. Below: "Show this at the counter" with code and QR, "Also sent to your WhatsApp", then **"When will you come in?"**, business actions, "Share my Tikka" | — |

**When will you come in?** (after the reveal panel appears)
- Chips: Today · Tomorrow · This weekend · Pick a day. After a day: Morning · Afternoon · Evening. A "Not sure yet" link skips it.
- Only days before the Tikka's expiry (and on the drop's valid weekdays for quiet-day drops) are offered.
- Saved on the claim; editable from the my-card page. The business sees "Plans to come Sat morning" on the lead.

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
- The future-drops checkbox is never ticked by default.

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
- Later visits: the revealed card straight away, with code, QR, "Use by", business actions, the visit plan (editable) and "Share my Tikka".
- **Redeemed:** stamp "Used on Fri 12 Dec". If they haven't reviewed yet: "How was Glow Studio?" with the star row (A4).
- **Bounce-back:** after redemption, a second card "Your next-visit Tikka" with its own code and expiry.
- **Expired:** "Expired Sun 15 Dec".
- No other claimer's data is reachable from here.

### A3. WhatsApp messages from Tikka

| Message | When | Copy |
| --- | --- | --- |
| Card delivered | A claim succeeds | Card image, then "🎟 You got a Tikka from Glow Studio! 20% off any service · Rare · Code GS-7X4QP · use by Sun 15 Dec. Show this at the counter: usetikka.com/t/…" |
| Card resent | Repeat claim | "Here's your Tikka from Glow Studio again." + the same card |
| Blocked, sold out, help | As in A1 | The A1 copy |
| Expiry reminder | Once per Tikka, at 8:00 on the planned visit day, or 3 days before it expires (10:00), whichever is earlier. Not if redeemed, expired or opted out | Template `tikka_expiry_reminder`: "Your 20% off any service at Glow Studio ends Sun 15 Dec. Show this at the counter: usetikka.com/t/…" |
| Thank-you (+ bounce-back) + review | After redemption | "Thanks for coming to Glow Studio, Adaeze. Here's 10% off your next visit, valid till 20 Jan: usetikka.com/t/… How was it? Tap to rate: usetikka.com/t/…/review" (template if the 24-hour window has closed) |
| Notify me confirmed | They subscribe | "Done. We'll message you when Glow Studio's drop opens on Sat 14 Dec, 9am." |
| Drop is live | The drop opens (or the business drops again) | "Glow Studio's drop is live. 600 Tikkas, 10 legendary. Claim yours: usetikka.com/d/…" (template). To Notify-me subscribers, and to past claimers **only if they ticked the future-drops box** |
| Owner daily summary | Each morning, to the owner's WhatsApp number (on by default, can be turned off) | Template `tikka_owner_daily`: "Glow Studio today: 12 new claims, 3 planning to come tomorrow, 5 Tikkas expiring soon. Open your list: …" |
| Stopped | They reply STOP | "You won't get Tikka messages about Glow Studio again." (STOP ALL: no Tikka messages at all). STOP also clears the future-drops box |

### A4. Review `/t/[token]/review`
- Opens only for a claim that was **redeemed**, within 30 days, and not yet reviewed.
- Five stars (required) and an optional line (max 140 characters). Shown as "Adaeze O. · Used a Tikka · Dec 2026".
- After sending: "Thanks. Your review is on Glow Studio's card now." and their card.
- One review per claim. Reviews can't be edited by the business; a business can report one (B9).

### A5. Marketplace `usetikka.com/drops`

Server-rendered and fast on phones. Built as a busy, live marketplace; during the pilot it stays as built (no new features).

**Home**
- A live strip of recent claims with **no names or anything about the person** ("A Rare Tikka was just claimed at Glow Studio · Lekki, Lagos"; the place is the business's, since claimers can be anywhere), headline numbers (drops live, Tikkas claimed today, legendary left, people waiting, cities), and a featured carousel of pinned drops (admin pins) with countdowns.
- Search (business name, category, city, area and drop title) and the city picker: All Nigeria, Lagos, Abuja, Port Harcourt, Ibadan, Other cities (remembered). The default is the visitor's chosen city, **Lagos** if none.
- "Top drops today" ranking (Trending, Most claimed, Ending soon, Newest); rows: Hot right now, Legendary hunt, Coming soon (with Notify me and how many are waiting); browse by category; Just claimed, Top cities and Top businesses.
- Drop tile: a mini sealed wrapper in the business's colours with the seal, business name, area and city ("Lekki, Lagos"), category, "10 legendary · 50 rare", "23 of 600 left" or "Opens Sat 9am", time left, % claimed. Tap → the claim page (tagged as a marketplace visit).
- A small city never looks empty: lists that are thin locally show Nigeria-wide, and say so.

**See all / category / search results:** a grid of tiles with filters (city, area, category, live or coming soon, has legendary) and sorts (trending, ending soon, newest, most left).

**Business page `usetikka.com/[slug]`: a one-page website, free always**
Part of the package: every business gets a sleek one-page website for its Instagram and WhatsApp bio. Live as soon as the required card setup is done; it never needs a paid drop. `/b/[slug]` redirects to it. **One fixed layout for everyone**, filled with the business's own content and brand colour (Tikka's fonts); sections appear in a fixed order, and **any section with no content hides itself completely**.
1. **Hero:** one full-width photo (a focal point chosen when cropping keeps it right on phones) under a dark overlay; logo; a bold headline (suggested from the category, e.g. "Hair and beauty in Lekki"); one short line (location, or "Serves all of Nigeria" / "We come to you"); verified mark and rating; buttons "Book on WhatsApp" and "See services". With no photo, the brand colour. No background video in version one.
2. **Live drop band:** a slim strip, "Live now: October Glow · 23 Tikkas left · Claim yours", or the scheduled drop with Notify me; otherwise a small "Get notified about our next drop". Promotions on the page only ever come from Tikka drops, here.
3. **About:** a paragraph or two, with an optional photo.
4. **Services:** cards with an optional photo, name, short description, price ("₦25,000", "From ₦15,000" or "Ask for price") and optional duration, each with "Book on WhatsApp" (opens WhatsApp with "Hi Glow Studio, I'd like to book Knotless braids (₦25,000)"). A grid on desktop, a swipeable row on phones. Optional groups ("Hair", "Nails") shown as tabs, only when the business has created more than one group.
5. **Portfolio:** photos and short videos with a full-screen viewer and optional captions.
6. **Reviews** from people who redeemed, with the rating.
7. **Team** (optional, switched on in Your page): photo, name and role.
8. **FAQs** (optional): question and answer pairs.
9. **A text section** (optional): a title and one short block (about 600 characters).
10. **Hours and location:** opening hours, address, "Directions" to Maps. Hidden for online and come-to-you businesses.
11. **Final call to action:** "Ready to book?" with WhatsApp, Call and Instagram.
12. **Footer:** "Made with Tikka", linking to the Tikka landing page, with "Get a free page for your business". No marketplace link.
Optional sections are switched on or off, never reordered.

**Look and motion:** editorial and premium (reference: the Lunaria beauty-studio site): huge uppercase headings, each with a small numbered label above it ("01 — ABOUT US", "02 — WHAT WE OFFER", numbered over the sections the page shows; never inside the heading, where visitors read it as a mistake), the business name in giant type across the hero over a dark scrim so its lines read on any photo, square corners and thin rules, outlined service-group boxes that fill with a photo when chosen. Motion is light: words rise into place, photos ease in as you scroll, the hero photo settles, the live-drop band runs as a ticker. CSS plus one IntersectionObserver; only transform and opacity animate; `prefers-reduced-motion` turns it all off; nothing is hidden without JavaScript.

**Your page** (`/app/page`, in the nav): a list of the sections; each opens a simple form (photo, text, add a service). "View page" opens the live page; changes go live when saved, with no separate publish step. Limits: 12 services, 12 portfolio items (of which at most 3 videos, each up to 15 seconds and 15 MB), 10 FAQs, 8 team members; photos are compressed in the browser before upload (WebP).

Server-rendered and fast on 4G (thumbnails first, lazy-loaded). Indexable, with the title "Glow Studio · Lekki, Lagos · Tikka", a description from the hero line or about, and an Open Graph image of the hero.

**Rules**
- A drop appears when it's published with "Show on the marketplace" on (default), unless Tikka has hidden it.
- Sold-out and ended drops leave the main sections but stay on the business page as past drops.
- "Report this drop" on every drop page (goes to the admin queue, C2).
- Empty states never look dead: if a city has no drops, say so and offer Lagos.

### A6. Notify me
- On a scheduled drop, a sold-out or ended drop, a business page, and the QR poster's landing when nothing is live.
- Tap → WhatsApp opens with "Notify me about Glow Studio NT-7KQ4A" to Tikka's number → the webhook saves the subscription (phone + business, and the drop if there is one) → confirmation (A3).
- When the drop opens, or the business publishes its next drop: one "Drop is live" alert per subscriber, then the subscription is used up (a business-page subscription stays until STOP).
- Subscribers are **not leads**. The business sees only a count ("142 people are waiting for this drop"), never numbers.
- Pilot cap: up to 1,000 alerts per drop (Tikka pays). Alerts go out in a queue (TECH_PLAN §5).

### A7. QR poster `usetikka.com/q/[code]`
- Every business has one permanent QR poster (created at setup, labelled "Shop counter") and can add more ("Mall", "Gym next door"). Each has its own 6-character code (the Tikka code alphabet, e.g. K7M2QP). The poster never needs reprinting: it's the business's permanent "see what's running now" point.
- Scanning (or typing the code at `usetikka.com/q`) goes to the live drop's claim page, tagged as a QR visit from that poster (`?c=qr&p=<poster id>`). With nothing live: the business page, showing the scheduled drop with Notify me, or "Notify me about our next drop". More than one live drop (shouldn't happen): the business page.
- **`usetikka.com/q`**: "Enter the code on the poster" with one field; a wrong code says so plainly. This is the fallback for when a camera won't scan.
- **The printables explain themselves.** A QR alone tells people nothing, so every print kit format carries:
  - the business's logo (or initials) in its brand colour, name, and "Lekki, Lagos";
  - a big headline, "Scan to get your Tikka", and the hook line (editable; the default is evergreen, "Every Tikka holds something. See what's inside this week.", with the current drop's best reward offered as a one-tap alternative);
  - the QR inside the Tikka ticket shape (notches and perforation);
  - three steps: "Scan with your phone camera" · "Claim it on WhatsApp" · "Show your Tikka at the counter";
  - the typed fallback: "Camera not working? Go to usetikka.com/q and enter K7M2QP";
  - "No app needed" and the Tikka logo with usetikka.com.
  No dates or drop-specific wording, so the poster stays right as drops change. No gambling words.
- **Print kit** per poster: A4 window poster, A5 counter standee, table tent (folds from A4 into two A5 faces) and a 5 cm sticker (QR, code and name only), each at its exact print size with 3 mm bleed.
- The drop dashboard's by-source table breaks QR visits down by poster label.

---

## Part B: businesses

Plain language everywhere: one decision per screen, big buttons, no jargon.

### B1. Landing page and sign-in
**Landing page `usetikka.com`.** Sentence case, no gambling words, ₦ always. **No made-up numbers:** real visitors never see a figure that isn't real.

**Positioning:** lead with the outcome (people walking in, a list to follow up, knowing what it brought in); the drop is the mechanism. Prefer "customers", "people who claimed" or "your list" over "leads" on this page.

**Order:** hero → problem line → three outcomes → How it works (+ brings them back) → Every Tikka holds something → Who it's for → Example → Live on Tikka strip (only above its threshold) → Pricing → FAQs → final call to action → footer.

- **Page title and meta** (and Open Graph): "Tikka · Turn people who see your business into customers who walk in" / "Share a Tikka drop behind one link. People claim on WhatsApp, come in to use it, and you see every name, number and naira it brought in."
- **Hero:** headline "Turn people who see your business into customers who walk in." Subheading "Share a Tikka drop, a collectible reward behind one link. People claim it on WhatsApp and come in to use it. You get every name and number, and see exactly what it brought in, in naira." Buttons "Start free" (primary) and "See how it works" (scrolls to How it works). Badges "First drop free" · "Customers need no app" · "Set up in minutes". The hero card animation (tear, claim, hold, flip, with a small "Example" label) stays as it is.
- **Live on Tikka** band, from real production data only (demo businesses, `businesses.is_demo`, are excluded from every public count, ticker, marketplace query and landing strip). Each block shows only above a threshold and is hidden entirely otherwise:
  - Stats bar (Tikkas claimed, Businesses on Tikka, Drops live now, Recorded sales for businesses): at least 20 real businesses and 10 live drops.
  - Live ticker (no names): at least 1 real claim in the last 24 hours.
  - The stats bar and the marketplace strip use the same live-drop count.
- **Problem line** (centred, muted): "Most people who see your business never come in, and you never find out who they were."
- **Three outcomes** (three columns on desktop, stacked on phones, icon + bold title + one line): **More people through your door.** "A reason to come in this week, not someday." · **A list you can follow up.** "Everyone who claimed, with their WhatsApp number, even if they didn't come." · **Know what your promo made you.** "Customers, sales and cost per customer, in naira."
- **How it works:** title "One link. More people through your door.", subtitle "Posts scroll away. A Tikka drop keeps working." Four steps with their visuals:
  1. **Pick an offer.** "Ready-made for your business. Change the details and you're done in minutes." (the drop's tiers)
  2. **Share one link.** "Your status, your Instagram bio, an ad, a flyer, or the QR at your counter." (an "Example" Glow Studio card, no rating line)
  3. **They claim on WhatsApp.** "You get their name and number the moment they claim."
  4. **They come in.** "Check their code at the counter and record what they spent." The preview shows what the real redeem screen shows and never a phone number: Valid, "Tunde A.", "20% off any service · Rare", "Till Sat 31 Oct", the New customer / Been here before toggle, "How much did they spend? (₦)" and Confirm.
  - Then a block "Then Tikka brings them back": "Ready-made offers for your business. Pick one and go." · "Tikka reminds them on WhatsApp before their Tikka runs out." · "When they come in, they get a reason to come back." · "See what each customer cost you."
  - One line under the steps: "Print your Tikka QR for your counter. It always opens your latest drop."
- **Every Tikka holds something:** the three tiers on "Example" cards (no rating line).
- **Who it's for** (salons, spas, gyms, clinics, food spots, tutors): "…a Tikka gives them a reason to come in this week, and gives you their number the moment they claim."
- **Example results**, labelled "Example" with "An illustration of how a drop works, not a promise of results.": the funnel (with "People to follow up"), "Spent by the 76 who came in", then "Tikka cost · ₦10,000 (Medium drop)" (from `drop_tiers`).
- **Live on Tikka now** marketplace strip: real live drops only, shown when there are at least 6.
- **Pricing** (amounts from `drop_tiers` and `drop_packs`, never hard-coded):
  - **Start free:** ₦0. "Your business page and your first drop (up to 200 Tikkas)." Bullets: a free page for your bio; your first drop free; ready-made offers for your business; redeem at the counter with staff logins; live link activity; listed on the Tikka marketplace; every person who claims is yours to follow up. Button "Start free".
  - **Pay per drop:** from the cheapest tier, the tiers listed. Under it: "Season pack: 3 drops from ₦12,000. Use them for Black Friday, December and Valentine's." and "If a paid drop brings fewer customers than we promise, your next one is free." with a "How it works" link to the guarantee FAQ.
  - Footnote: "Pay by card or transfer. No subscription. During the pilot, Tikka pays for every WhatsApp message."
- **FAQs** (answers match the product; amounts and thresholds from the database): no app needed; how people claim; one per number; what a thank-you gives; other cities; staff; business page; **What does it cost?**; **What if my drop doesn't bring customers?** (the guarantee: fewer than 5 / 10 / 20 customers through the door, shared in at least 3 places, once per business); **How long do Tikkas last?** (usually 14 days from claiming, or 7 or 30; the full time even if the drop ends first); **Who sees my customers' numbers?** (only the owner; staff never); **Can I message people about my next drop?** (about their Tikka, anyone who claimed; about future drops, only people who ticked "Send me future drops"); **What's the QR poster?**
- **Final call to action:** "Your first drop can be live today." / "Pick an offer, share one link, and see who walks in. Free to start." / "Start free".
- **Footer:** links to the privacy policy and terms (drafts until C1 is signed off), and "Studio".
- **Tikka Studio strip** and **Spark section** (B11, B12), and "Does Tikka use AI?" among the FAQs.

**Sign-in:** Continue with Google, or email and password. Email sign-ups confirm by link before the dashboard opens. Forgot password by email. Staff invited by email sign in the same way.

### B2. Welcome tour
Four short screens, skippable, shown once:
1. "This is a Tikka": the wrapper tearing open.
2. "Every Tikka holds something": the three tiers as real cards with an example reward each.
3. "How it works": claim on WhatsApp → come in and show it → you see every lead.
4. "What it costs": "Your business page is free. Your first drop is free. After that, pay per drop from ₦5,000, or save with a season pack. If a paid drop brings too few customers, your next one is free."
Ends with "Set up your card".

### B3. Card setup (the business profile)
Done once, editable any time in Settings. A live card preview beside (desktop) or above (phone) the form.

**Required (target: under 3 minutes)**
- Business name, category, and location: state, city (required) and area. Shown everywhere as "Lekki, Lagos". Address (for Directions and the page's map link) is asked here too, optional.
- **Owner WhatsApp number** for Tikka's alerts and the daily summary (prefilled from the Chat on WhatsApp button).
- Page address (slug), suggested from the name: usetikka.com/glowstudio. Unique; words that clash with Tikka's own pages are reserved.
- Logo (square, at least 256px).
- Brand colour (colour picker + 8 suggested swatches), with the contrast check.
- Card background: Colour, Pattern or Photo.
- At least one action button: Chat on WhatsApp, Call, Directions, Book, Instagram, Services (up to 4).
- Code prefix: two letters suggested from the name, editable, unique.
- **How do customers use their Tikka?** "They come to us" (default) · "Online, anywhere in Nigeria" · "We come to them". Online and come-to-you businesses have no Hours and location section or Directions on their page; the hero line says "Serves all of Nigeria" or "We come to you" instead.

**Optional: "Finish your page"** (a checklist with progress on the dashboard; never blocks a drop): add a hero photo, write your about, add 3 services with prices, add 4 portfolio photos. Everything is edited in **Your page** (`/app/page`, see A5).

**After setup:** "Your page is live: usetikka.com/glowstudio. Put it in your Instagram and WhatsApp bio." with copy and QR, and the shop-counter QR poster is created. The dashboard keeps a "Put your page in your bio" card.

### B4. Drops list
Each drop: status (Draft, Scheduled, Live, Sold out, Ended), goal, dates, cards left, claims, redeemed, recorded sales. "Create a drop" (disabled with a reason when there's already a live drop and a scheduled one), and on each past drop "Run it again".

### B5. Create a Tikka drop (the simple builder)
**Target: a first-time owner publishes a drop from a template in under 2 minutes, without help.** One question per screen, a progress bar, big buttons, a draft saved at every step, Back keeps answers. Business details are never asked again.

**Screen 1 · "What do you want this drop to do?"** Three big cards:
- **Get new customers** · "Bring in people who've never been to you." (Who can claim: new customers only; 70% kept for new customers.)
- **Bring customers back** · "Remind past customers you're here." (Once per drop.)
- **Fill quiet days** · "Get people in on your slow days." (Adds "Which days can people use it?" on screen 2; codes only work on those days.)

**Screen 2 · "Pick an offer"**
- Ready-made offers for the business's category and goal (three each for Beauty & hair and Spa & wellness, one each for the other categories; reviewed in `docs/drop-templates.md` before seeding), each shown as real mini cards (all three tiers and the bounce-back at a glance) with one line on why it works.
- Tapping one opens it in plain fields: amounts, service names (prefilled from the business's services), minimum spend.
- "Make my own" opens the full tier editor (Legendary · very few, Rare · some, Thank-you · everyone else; % off, ₦ off, free item, perk, action card; more than one reward per tier).
- Bounce-back: "When they come in, send them a reason to come back" with the template's default ("10% off your next visit within 30 days"), a toggle and the fields.
- Quiet-day drops: Mon–Sun chips.
- Template rules: Rare and Legendary need a purchase (minimum spend, or a free extra with a paid service) or are a taste of the main service; Thank-you always names a real small benefit; no free full main service with no purchase, except a Legendary limited to 2% or less.

**Screen 3 · "How big, and for how long?"**
- "About how many people see what you post, on WhatsApp, Instagram or anywhere else?" Under 300 · 300–1,000 · 1,000–5,000 · More than 5,000 → a suggested size (about 1 Tikka per 3 viewers, rounded to a tier). After a past drop, suggest from its real numbers.
- **First drop:** "Free · your first drop · up to 200 (recommended)" is preselected; the paid sizes still show underneath with "With your audience, a bigger drop could fill." If the business pays for a bigger first drop, the free drop stays for later.
- Size as big cards with the price: "Free · your first drop · up to 200", "Small · up to 300 · ₦5,000", "Medium · up to 1,000 · ₦10,000", "Large · up to 3,000 · ₦20,000"; "Covered by your season pack" when a voucher applies. "Exact number" for a custom size. Over 3,000: "Talk to us".
- "Drop runs for": 7, 14 or 30 days (default 14).
- **More options** (collapsed): starts now or on a date; "Each Tikka lasts" 7, 14 or 30 days after it's claimed (default 14); card style; who can claim; share kept for new customers; marketplace on/off and limit.

**Screen 4 · "Check and publish"**
- The real claim page in a phone frame with a sample reveal.
- **The drop check**, friendly warnings, each with a one-tap fix (never blocking):
  - No Rare or Legendary reward needs a purchase → "You may attract people who only want freebies." Fix: add a minimum spend.
  - Each Tikka lasts 30 days → "Shorter deadlines get more people through the door." Fix: change to 14.
  - Thank-you benefit is empty → "People may feel disappointed." Fix: pick a suggested benefit.
  - Size much bigger than the audience answer → "You may not fill this drop." Fix: use the suggested size.
  - No bounce-back → "Give people a reason to come back." Fix: turn on the template's bounce-back.
  - Legendary above 10% → "This could cost you a lot." Fix: reduce.
- The price, and for paid sizes the guarantee: "If this drop brings fewer than 10 customers, your next one is free."
- One button: **"Publish free"**, **"Publish with your season pack"** or **"Pay ₦10,000 and publish"** (owner only). Paid drops go to Paystack and stay a draft until the payment completes.
- After publishing: the drop link, the counter poster ("Your counter poster now opens this drop", a preview, Print, and one tap to put this drop's best reward on it, offered only when no other drop is live), the status and square images, a small "QR for this drop only (for flyers)" link, channel links, and "Your drop is on the marketplace". No poster to create per drop.

| Size | Up to | Price | Guarantee (confirmed redemptions) |
| --- | --- | --- | --- |
| First drop | 200 | Free (one voucher at sign-up) | — |
| Small | 300 | ₦5,000 | 5 |
| Medium | 1,000 | ₦10,000 | 10 |
| Large | 3,000 | ₦20,000 | 20 |

Season packs: 3 Small drops ₦12,000; 3 Medium drops ₦25,000. Pack drops can be used for 12 months after purchase. Founding members keep founding prices for life on single drops (packs are the normal price). Prices live in `drop_tiers` and `drop_packs`; nothing hard-codes them in the UI.

**Never say "voucher" in the UI.** Say "Your first drop is free", "Drops left in your season pack: 2 Small", "You've earned a free Medium drop", "Tikka gave you a free Small drop".

**The guarantee:** when a paid drop (not one covered by a free, pack, earned or gifted drop) brings fewer confirmed redemptions than its size promises (every redeemed Tikka from the drop, all tiers including thank-you; bounce-backs don't count), checked once the last Tikka from the drop can no longer be redeemed (or earlier, when every claimed Tikka is already used or expired), and the business hasn't used the guarantee, and the drop had views from at least 3 different sources (link sources and posters), and it was published from a template or with no ignored drop-check warnings → a free drop voucher of the same size, once per business: "Your drop brought fewer customers than we promised. Your next Medium drop is on us."

**Run it again** opens Screen 4 prefilled from the old drop, with an updated size suggestion. It's a new drop, priced normally.

**Rules:** one live drop and at most one scheduled next drop; at most 30 days; staff can't create, pay for or publish drops. After publishing you can extend the end date, add more Tikkas or end early, but not change the rewards. Ending early doesn't refund the drop.

### B6. Drop report and link activity
**Headline by goal:**
- Get new customers: "18 new customers · ₦360,000 recorded"
- Bring customers back: "22 customers came back · ₦410,000 recorded"
- Fill quiet days: "30 customers on Mon–Thu · ₦480,000 recorded"

**Results card:** customers who came in (new / returning, as marked at the counter); recorded sales (sum of bill amounts, "recorded", never "earned"); estimated reward cost (% off × bill, ₦ off value, or the business's cost for free items; labelled "estimated"); Tikka fee (or "Free drop" / "Season pack"); cost per customer = (estimated reward cost + Tikka fee) ÷ customers who came in (per new customer for new-customer drops); spent beyond the reward; came back (bounce-back Tikkas redeemed).

**Link funnel** (counts and % of the step before): opened the link · tore open the wrapper · tapped Claim · continued to WhatsApp · claimed · redeemed · followed up. Plus "Opened but didn't claim", new vs returning claimers, "Opened after it sold out" with a suggested next size, and Notify-me subscribers waiting.

**Live activity feed** (updates in real time): opens (grouped bursts), claims, redemptions with amounts, reviews. First names only after a claim.

**By source:** opens, claims and claim rate per channel (WhatsApp status, Instagram, QR, website, ads, marketplace), QR broken down by poster, with copy link and QR for each.

**Cards left by reward.**

**Actions:** share kit; extend the end date (up to 30 days after it started); add more Tikkas (free within the tier, otherwise an upgrade payment for the difference; a voucher drop upgrading pays the full price of the new tier); end early (no refund); Run it again.

**Nudges:** when a drop ends, a results card on the dashboard with "Run it again". Two weeks before Black Friday, from 1 December and from 1 February, a banner: "December is coming. Your last drop brought 30 customers. Run it again?" (also a line in the daily summary).

### B7. Redeem screen `/app/redeem`
For owners and staff, on a phone at the counter.
- Opens to the camera scanner, with "Type the code" below. Typed codes are checked offline first ("That code has a typo").
- **Valid** (light panel): first name + initial, reward, tier, "Use by"; for an action card, the staff tick; **"New customer" / "Been here before"** (preselected from the lead's history); **"How much did they spend? (₦)"** shown prominently (optional); "Confirm redemption".
- **Not valid** (dark panel) with one reason: already used (when), expired (when), not valid today ("Valid Mon–Thu only"), from another business, not a Tikka code. "Scan another code".
- After confirming: "Done. Adaeze's Tikka is used." Tikka sends the thank-you, with the bounce-back if the drop has one.
- Never shows phone numbers. Scan to confirmed in under 5 seconds; two staff confirming at once give one success.

### B8. Leads
Every person who claims is the owner's to follow up, in full, with no per-person fees.
- **Message today** at the top, each with a prewritten message (editable before WhatsApp opens):
  - Just claimed (last 24 h): "Hi Adaeze, welcome! Your 20% off at Glow Studio is ready. Want to book a slot this week?"
  - Planning to come today: "Hi Adaeze, see you today! Your 20% off is ready at the counter."
  - Ending in 2 days, not redeemed: "Hi Adaeze, your 20% off ends Sunday. Shall we book you in?"
  - Expired, never came: "Hi Adaeze, we missed you! Our next drop is coming soon."
- A live "Adaeze just claimed a Rare Tikka. Message her now?" prompt on the dashboard when a claim completes.
- The full list: tabs All, New, Redeemed, Not yet redeemed; filter by drop, source and tier; search by name. Row: full name, WhatsApp number, tier, reward, status, visit plan ("Plans to come Sat morning"), tags (New, From marketplace), claim date, amount spent, and "Message on WhatsApp". Each tap logs a `followup_tap`.
- **Export** (owner only): CSV of all leads for the chosen drop or all drops.
- Staff can't open this page and never see a phone number.

### B9. Reviews
- Average rating, count, and the list (newest first) with drop and date.
- "Report" on a review (goes to the admin queue). Businesses can't edit or delete reviews.

### B10. Settings
- Business profile (B3), card look, owner WhatsApp number, daily summary on/off.
- **Posters** (`/app/posters`, in the nav): the shop-counter poster and any others, each with its code, a preview and how many scans it brought; add a poster with a label; edit the hook line; print each one's kit (A4 window poster, A5 counter standee, table tent, 5 cm sticker).
- **Team:** invite staff by email; staff can use Redeem only; remove staff.
- **Payments:** drops you can publish without paying (free drop, season pack drops, guarantee drops), season packs to buy, and the payment history (date, what for, amount, Paystack reference, status).
- Account: email, password, sign out.

### B11. Tikka Studio `/studio`
Tikka Studio is Tikka's tailor-made, done-for-you service: websites, WhatsApp systems, lead follow-up, ads and content, and drops run for a business. It is our agency's work, now under the Tikka brand only: the former agency's name, logo, colours and links never appear (its old domain has lapsed, so there are no redirects). Studio uses Tikka's tokens, fonts and light layout. Public, server-rendered, no sign-in, fast on 4G.

**Routes:** `/studio` (landing), `/studio/work` (all work), `/studio/work/[slug]` (a case study), `/studio/contact` (enquiry form; reachable from every Studio page).

**Header:** the Tikka logo (from `design/logos`, never redrawn or recoloured) followed by "Studio" in Bricolage Grotesque; links Work · Services · How we work · Contact; primary button "Chat with us on WhatsApp"; a quiet link "Try Tikka" back to the product. **Footer:** the same links plus Tikka, Marketplace, Privacy and Terms, and the Studio email (studio@usetikka.com).

**`/studio`, in order:**
1. **Hero:** eyebrow "Tikka Studio", heading "Tailor-made solutions for your business.", body "We build the websites, WhatsApp systems and ads that bring customers in and keep them coming back.", buttons "Chat with us on WhatsApp" and "See our work". Visual: our own ad work (the reel and UGC videos), never stock imagery.
2. **Featured work:** 3–6 case study cards (cover image or video poster, client, category, one-line result where there's a real one), "See all work".
3. **What we do,** one card each, linking to an anchor with more detail and related work:
   - Websites: "A proper website for your business, from a simple page to a full booking site."
   - WhatsApp automations: "Instant replies, reminders and follow-ups, so no lead goes cold."
   - Lead follow-up systems: "Every new contact tracked from first message to repeat customer."
   - Ads and content: "Ad creative, status images, reels and posts that make people stop and act."
   - Drops, done for you: "We plan the offer, design the drop and launch it with you."
4. **How we work:** Talk → Plan → Build → Run and report. Under it: "Today our Studio team plans drops by hand. Spark will bring that know-how to every Tikka dashboard."
5. **Clients and testimonials:** the names of businesses we've worked with, as a text strip (we have no logo files, and never draw a client's logo ourselves); then only quotes the client gave permission for, with the person's name and business. Each part is hidden when it has no content.
6. **Close:** "Tell us what your business needs." with both enquiry buttons, then "Prefer to do it yourself? Start free on Tikka."

**`/studio/work`:** a grid of all work: case studies and our ad and content pieces. Filters by service (Websites, WhatsApp automations, Ads and content, Drops) and industry (Beauty, Food, Fashion, Health, Skincare, Home…), kept in the URL (`?category=`, `?industry=`, `?search=`) so a filtered view can be shared; search understands synonyms ("skin care" finds skincare). Videos show a poster and load nothing until tapped. A client name appears only on work we really did for that client; other pieces show as Tikka Studio's ad creative, named by what they advertise.

**`/studio/work/[slug]` (case study):** client, category, services, cover, "The challenge", "What we did", "The result" (numbers only from the client's own data; omitted when we have none), media gallery, the client's quote if permitted, then "Want something like this?" with both enquiry buttons and 3 related pieces. Each has its own title, description and Open Graph image. Fields we don't have yet are left out, never filled with placeholder text.

**Enquiries:**
- "Chat with us on WhatsApp" opens `wa.me/<STUDIO_WA_NUMBER>` (the Studio team's own WhatsApp, separate from Tikka's claim number) with "Hi Tikka Studio, I'd like help with my business." On a case study: "Hi Tikka Studio, I saw your work for <client> and I'd like something similar."
- `/studio/contact`: "It starts with a free business audit. We'll quote once we understand your business." Fields: name, business name, WhatsApp number, what they need (checkboxes matching the services), rough budget (optional), note (optional), and the case study they came from, if any. Consent line "Tikka Studio will contact you on WhatsApp about your enquiry." Success: "Thanks. We'll message you on WhatsApp within one working day." Saved as a Studio enquiry; prefilled and linked to the business when the person is signed in.
- No prices or checkout in version one.

**Studio across the product:**
- Landing page strip: "Rather we do it for you?" / "Tikka Studio builds websites, WhatsApp follow-up systems and ads, and runs your drops for you." / "See Tikka Studio".
- Main site nav and footer: "Studio".
- Drops list empty state: "Want us to plan and launch it for you? Talk to Tikka Studio."
- Settings: "Get help from Tikka Studio".

### B12. Spark (coming soon)
Spark is Tikka's AI drop strategist. **Not built in version one.** It shows only as teasers: a Spark mark in the brand purple (never gold) with a "Coming soon" badge, and a "Get early access" button. Never an input box, a sample answer or anything that looks like it works.

**Teasers (copy exactly):**
- Landing section: "Coming soon" / "Meet Spark, your drop strategist." / "Spark looks at your business and what's working for businesses like yours, then tells you what to offer, how many Tikkas to drop and where to share them." / [Get early access]
- Landing FAQ: "Does Tikka use AI?" → "Spark, our drop strategist, is coming soon. It will suggest offers, sizes and timing based on what works for businesses like yours."
- Drop builder, Screen 2, beside the quick-start mixes: "Not sure what to offer? Spark will help. Coming soon." [Get early access]
- Drop dashboard card: "Spark's read on this drop. Coming soon: what worked, what didn't and what to try next." [Get early access]

**Early access:** signed in, one tap records it for the business, and the button reads "You're on the list" everywhere. Signed out (the landing page), a short email-or-WhatsApp field. Signing up twice changes nothing. The two dashboard teasers can be dismissed, per business.

---

## Part C: trust, admin and legal

### C1. Legal (before the pilot)
- Privacy policy and terms (Nigeria Data Protection Act): what's collected (first name, WhatsApp number, claims, visit plans, redemptions, reviews, notify subscriptions, future-drops consent, Tikka Studio enquiries, Spark early-access sign-ups), who sees it (the business owner, for everyone who claimed; never notify-only subscribers), anonymous view counting, how to ask for deletion.
- Consent line in the claim sheet covers this drop; future drops need the separate checkbox. STOP handling (A3).
- Before public launch, ask a lawyer whether random rewards count as a prize promotion needing approval.
- **Privacy policy and terms must be live before the first real claim; the claim sheet links to them for consent.** A build-time check fails the production build while those pages are still placeholders.

### C2. Tikka admin `/admin` (internal)
- Businesses: search, view, grant the Verified badge, suspend, **set founding member**.
- Moderation queue: reported drops and reviews; hide or keep.
- Marketplace: hide a drop, pin a drop to a section (featured carousel).
- Platform numbers: businesses, live drops, claims today, redemptions, WhatsApp messages sent and their cost.
- **Studio enquiries:** the list, newest first, with each one's status (new, contacted, converted, closed), changed by an admin.
- **Spark early access:** how many signed up, and the list.
- Money: **grant free drops** of a chosen size (pilot and done-for-you businesses; optional expiry date), view payments and revenue (drops, upgrades, packs), edit tier prices, founding prices and pack prices, see guarantee vouchers issued.

---

## Out of version one
Tasks that need proof uploads, subscriptions, multiple locations, reserve-at-booking, bring-a-friend, timed release, website widget, consumer wallet, partner programme, phone-tilt holo (finger tilt only), more than one automated reminder per Tikka.
- **Pro extras:** own domain, removing Tikka branding from the business page, subdomains.
- **Marketplace boosts** and paid featured drops.
- **AI tools tied to drops:** status image and Instagram post for a drop, suggested reward mix and size from past drops, follow-up message drafts, drop covers from portfolio photos.
- **Spark itself** (the AI drop strategist): only its "Coming soon" teasers and early-access sign-ups ship (B12).
- **Tikka Studio prices and checkout:** Studio quotes after a free business audit (B11).

## Risks
| Risk | Mitigation |
| --- | --- |
| Free drop used, business leaves | The report shows customers and cost per customer in naira; the free page and QR poster keep them on Tikka; "Run it again" is one tap; seasonal nudges |
| Drops attract freebie hunters | Templates need a purchase for Rare and Legendary; the drop check warns; bounce-backs reward a second visit |
| People claim but never come in | Visit plan, one expiry reminder, short default expiry, "Message today" prompts with prewritten messages |
| Business owners find setup hard | Templates by category and goal, one question per screen, under 2 minutes to publish |
| Guarantee abused | Once per business, paid drops only, needs 3+ sources and a template or no ignored warnings |
| WhatsApp cost grows | One reminder per Tikka, marketing only to opted-in claimers, per-drop alert cap, cost recorded per message |

## Copy rules
No gambling words (win, winner, luck, lucky, jackpot, odds, bet, stake, lottery, raffle, prize draw). Sentence case. ₦ always. "Tikka" with a capital T in text, and likewise "Tikka Studio" and "Spark". In version one Spark is always "coming soon": never described as available. Counts read "23 of 600 left". A thank-you card always names its benefit. Say "recorded" for sales, never "earned"; label estimates as estimated.
