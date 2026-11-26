# Tikka's new direction (decided 25 Nov 2026)

The handoff from the strategy conversation of 23–25 Nov 2026. Read this before planning or building anything new: it changes what Tikka leads with, who it's for, how it charges and what gets built next. Where it disagrees with docs/PRD.md or docs/REVENUE_PLAN.md, this file is newer; stop and ask before building against the older docs.

Living versions (Claude Docs, private to the owner until shared):
- Strategy: https://claude.ai/artifact/UyoBHdMu2eSoBYVPrZxa97
- Core offer and every feature: https://claude.ai/artifact/GS1TM9Jkqd2QkVDig3MU3j
- Onboarding playbook (still drops-first; to rewrite): https://claude.ai/artifact/UwWp9eEFNAztrfaiE7oWzJ
- Investor Q&A, drops-first: https://claude.ai/artifact/1ecJ1X1nHMtJkKpNkwNnxd
- Investor Q&A, new direction: https://claude.ai/artifact/DuuEDRhwpzTFiJZH5pXenA
- Owner journey prototype: https://claude.ai/artifact/7e6zdPfr7FKxWhUa2aN7gY (a copy is in `design/prototypes/owner-journey.html`)

## 1. Where the pilot stands (25 Nov 2026)

- About 3 weeks in. 2 businesses have run a drop, 2 are Verified, about 13 in the pipeline.
- **First business (makeup artist, the founding member):** her drop ended Mon 23 Nov. 21 claims out of 50, 8 came in (all new customers), about ₦208,000 recorded in 6 days (₦143,000 typed at the counter + ₦65,000 paid by link), rewards cost about ₦35,000. About 4 more customers are still due to come in. She'll run a paid drop in December at ₦10,000 and plans a video about her results around 1 Dec. About ₦150,000 has gone through Tikka pay links for her.
- **The website sells:** a customer who booked her for makeup saw hair installation on her Tikka page and paid for both.
- **Second business (Divora Beauty, Apete, Ibadan):** set up her own drop (40% off in December ×5, 20% off ×3, free toe-nail painting for everyone else, 50 Tikkas). 3 claims after 3 days. Weak offer (no "wow" reward, the bigger discount was the more common one, "in December" delays it) and little sharing.
- **Most businesses that contact us come for the free website, not drops.** Owners didn't understand "drop".

## 2. The decision

**Tikka is a free website and booking tool for Nigerian service businesses: customers see the work, book a time and pay a deposit straight to the owner's bank, and the owner runs the day from Tikka. Drops by Tikka bring in new customers when the business wants them.** Same product, different order: the website, bookings and deposits lead; drops are the extra that sets us apart.

The rule behind it (the founder's): a real problem, a solution already proven elsewhere (Fresha, Booksy, Pixieset, Bumpa), built properly for an underserved market. Every plan has to pass three tests: the problem is real, the solution is proven, the business adds up.

## 3. Who it's for

- **Mega-niche: "Look good and celebrate".** Everyday looks (hair, makeup, nails, lashes and brows, barbers, spas) and big days (bridal makeup, gele, photographers and videographers; later tailors for aso ebi, decorators, cakes), plus content studios (added 26 Nov 2026: reels, product and brand shoots, studio hire, podcasts; they sell to brands and creators, book time slots and days, and use the photographers' page styles). Same customer, they refer each other, and a bride books several of them for one date.
- **Every size:** solo artists come for the free website and deposits; salons with staff and a front desk switch because Tikka is cheaper, built for naira and WhatsApp, and easy to move to. Most businesses still run on DMs and notebooks.
- **Order:** beauty and photography (with content studios) now; gele, bridal and videographers next; tailors, decorators and cakes once **Orders** exists (they sell orders with a due date, not time slots).
- **The trades and their ready-made services** are in `lib/presets.ts` (`TRADES`, `SERVICES`, `EXTRAS`): ten trades, each with a full list to tick and the three most common ticked. Wig making, tailoring and cakes are made to order and wait for Orders.
- **Not ours:** online product sellers (Bumpa's market; they may still run drops). Restaurants can use drops only.

## 4. What makes Tikka different

1. Built for every size, starting small, and **simple enough for anyone who can use WhatsApp** (one job per screen, pre-filled for their trade, voice input later, Nigerian languages later, run the day from WhatsApp once Meta approves).
2. Free to start, no subscription.
3. New customers on demand (Drops by Tikka). Botglam and Splice only manage existing customers.
4. A website that sells: portfolio, collections, photography gallery.
5. Built around WhatsApp and naira; deposits straight to the owner's bank through Paystack.
6. Trust: reviews only from real visitors, Verified, staff never see phone numbers.

## 5. What to build, in order

**Replaced by section 12 (agreed 25 Nov 2026).** Kept here for the history.

1. **Today screen** (who's coming, deposits paid, balances to collect) and the **daily/weekly money report in the app and as a web push** (the WhatsApp version is built and waits on Meta; Splice's customers rate this their favourite feature).
2. **Record every sale**, including walk-ins, cash and transfers; balances owed.
3. **Marketplace, Airbnb-style:** search by service, area and date; result cards with cover, rating, "from ₦", next free time; tap through to the page, pick a time, pay the deposit; top businesses and "Offers near you" (drops) as sections; a page per service and area for Google; a quality bar (photos, prices and bookings on). No fees to businesses until it sends real customers. Today `/drops` lists drops only.
4. **A calendar for each staff member** and **easy moving in** (import clients and services; free setup help for businesses switching tools).
5. **One-tap reminders** from the owner's own WhatsApp; **add-ons at booking** ("Add gele").
6. **Client book**: every visit, spend, notes, birthdays; follow-ups.
7. **Ready-made content per trade** (headline, services, prices, deposit) at sign-up; open the gallery style to more categories.
8. **Orders** (job, price, deposit, balance, due date, status, measurements) for tailors, cakes and decorators, with **aso ebi group orders** (one link, everyone pays their own deposit).
9. **AI, only after the daily tools:** set up the page from Instagram first; then captions and posts; then a WhatsApp assistant for DMs (after Meta); then weekly advice; then photo touch-ups.

Not building: paid website styles, per-staff fees, subscriptions with saved cards, AI before the daily tools.

## 6. How Tikka charges (no subscriptions)

- **Free forever:** website (any style), bookings, deposits, pay links, customer list, reviews.
- **1% of payments** (deposits, pay links, later gift cards and packages). Live. The main income.
- **Drops by Tikka:** ₦10,000 per drop, ₦25,000 for 3. Live. Possible test: ₦1,000 per new customer who comes in.
- **Plus bundle**, bought like a data bundle, no saved card, no auto-renew: about ₦6,000 for 30 days or ₦15,000 for 90. Client book, automatic win-back, half-price drops, bigger portfolio, own web address, AI tools when built. When it runs out the extras pause; nothing is deleted.
- **Message credits** for automatic reminders and messages (e.g. ₦2,000 for 100), so WhatsApp costs never land on Tikka.
- **Later, at scale:** marketplace fee on new clients it sends, featured spots, brand-funded drops, working-capital loans through a partner.
- Benchmarks: Bumpa ₦15,000–₦30,000 a quarter (quarterly billing, no free plan); Botglam ₦5,000–₦15,000 a month; Fresha takes payment fees and has charged 20% of a new client's first booking.

**Founding members pay the standard price now** (₦10,000 a drop, ₦25,000 a pack); founding membership keeps collections and other extras. Done in code (help page; the "founding member price" labels only show when it's actually lower). **Still to do in /admin → Prices:** set the Drop's founding price to ₦10,000 and the pack's to ₦25,000, or the founding business is charged ₦5,000 for her December drop. The terms still promise founding prices; reword at the next legal update.

## 7. Numbers (working assumptions, replace with real ones)

Per active business per month: careful ≈ ₦2,000, middle ≈ ₦3,800, hopeful ≈ ₦7,600 (1% of ₦100k–₦300k in payments, drops from 1 in 5 to every business each quarter, 5–20% buying Plus). A salon with staff can bring 5–10× a solo artist. Middle case: ₦3.8 million a month at 1,000 active businesses; the team breaks even at roughly 500. Upgrade Paystack from Starter (₦8,000,000 collection limit, tracked in /admin) once CAC registration is done.

## 8. Competitors

- **Botglam:** calendar, booking page with its own URL, client CRM, lead pipeline, payments, reports, WhatsApp confirmation, AI assistant (headline feature). Beauty. ₦5,000–₦15,000 a month.
- **Splice** (Layo): bookings, payments, deposits, loyalty, reminders, staff scheduling, CRM, email campaigns, daily/weekly reports; "the electronic front desk" for established salons, clinics, barbers in Lagos. Public since Oct 2024. Price unknown.
- **Fresha:** global, lists Lagos salons, marketplace. Unknown how naira payouts work for Nigerian salons: ask some.
- Also Blyssbook, Bookyo, Beauty Butler, Ásá, Tiro Beauty. And "doing it by hand", the real competitor.
- To do: book Botglam's and Splice's demos; interview 10 owners about their week.

## 9. Selling it

- **Pitch:** "Get a free website for your Instagram bio. Customers see your work and prices, book a time and pay a deposit, so no more no-shows, and the money goes straight to your bank. When you want more customers, Tikka brings them in."
- **Proof:** the makeup-and-hair story; for drops, "8 new customers and ₦208,000 in 6 days". Quote only real numbers, never guesses (not ₦250,000); update when her last customers have come in.
- **Words:** with owners say "discount" with "free extras" (never "drop", "Tikka", "gift", "promo" or "claim" when explaining); with customers lead with the real rewards ("20% off, a free lash fix, a free full glam"). Simple English; no questions as headings in customer posts.
- **Onboarding:** owners set up the website and bookings themselves; every setup ends with deposits on; drops are set up with the owner, only once they take bookings, and they're paid. The onboarding playbook (Claude Doc) is still drops-first and needs rewriting website-first.

## 10. The next 8 weeks and the scoreboard

Pitch 30 beauty and photography businesses on "free website + deposits"; move the 13 in the pipeline onto it; build in the order of section 5; sell paid drops to businesses already taking bookings.

Every Friday: pages live; businesses with deposits on; money through Tikka this week; businesses that took a booking or payment this week; customers who dropped off at the deposit step; pages set up without our help; paid drops; where each new business came from. Raise only after 8 weeks of these going up.

## 11. Open items

- Who owns sales and onboarding (the team isn't carrying it; the founder is).
- Plus bundle price and contents; whether to test ₦1,000 per new customer for drops.
- When to charge for marketplace customers.
- **Product wording, proposed and not yet done:** the claim link preview says "A Tikka from {business} … limited drop of 50 Tikkas … Tear it open", and the share message says "I got a Tikka… Every Tikka holds something". Strangers in WhatsApp groups don't understand it. Proposed: "Free gift from {business}" / "{business} in {place} is giving away {n} free gifts, like {top reward}. Open yours, get it on WhatsApp, use it in the shop within {days} days." (`app/(claim)/d/[business]/[drop]/page.tsx`, `lib/og-art.tsx`, `components/claim/ClaimFlow.tsx`). Revisit with the "discount" wording decision.
- **Shared-link tracking:** "Share my Tikka" links carry no source, so shares show as "direct". Add a share source so the sharing loop can be measured.
- **Landing page** (`components/landing/Sections.tsx`): lead with the website and deposits; show the real result once she agrees; fewer Tikka-only words above the fold.
- **Owner feedback after each drop** (designed, on hold): a 3-question card when a drop ends, a fuller one when its Tikkas run out, voice notes, an admin Feedback page.
- **Verified badge criteria** (proposed): spoken to the owner; the business clearly exists (3+ month old social account with their own work, a visible address, or CAC); an honest page; no open complaints. Remove it on unhonoured Tikkas or stolen photos.

## 12. The feature plan (agreed 25 Nov 2026)

Decided in the planning conversation of 25 Nov 2026. Replaces section 5. Planning only: nothing here is being built yet, and drop fixes are paused until the direction work is finished.

### Decisions behind it

- **Who it's for now:** businesses run by one person or a lean team, from solo artists to businesses with a big customer base and few staff. Anything that needs more than one person running the business (staff calendars, front desk, branches) is version 2.
- **We build all of it, then measure.** Every feature records how often it's used from day one. We pitch with what matters (a free website, deposits, running your day) and show the rest as extras; usage tells us which features keep businesses on Tikka.
- **A drop is only a drop.** Paying for a drop no longer opens collections, a bigger portfolio or anything else. Collections belong to the website, so every business gets a full website. What costs us money is storage (mostly videos), so any limit is on uploads, not on collections. Proposed: collections free for everyone, photos generous, videos limited; more space from Plus or unlocked by taking payments. Businesses that already have collections keep them; founding members keep what they have.

### The main features

✓ = we have it. **New** = to build.

**1. Website** (the business's own page)
- ✓ Page with services, prices, photos, reviews, FAQs, WhatsApp button
- ✓ Portfolio, collections, photography gallery
- ✓ Posters and business cards that link to the page
- **New** Ready-made setup for each trade: a new hair stylist's page comes already filled with typical hair services, prices and a deposit; she changes what's different

**2. Bookings** (customers book a time)
- ✓ Customers pick a free time; the owner moves, cancels and adds bookings
- **New** Service options: one service with choices that change the price and time ("Knotless braids: short ₦25,000 / long ₦35,000")
- **New** Add-ons: extras the customer ticks when booking ("Makeup + add gele ₦5,000")
- **New** Home service: the artist goes to the customer, with a travel fee
- **New** Event-day bookings: weddings and shoots, a date with a call time and venue
- **New** Questions at booking ("Any allergies?", "How many bridesmaids?")
- **New** Booking rules on the page: lateness, cancelling, no-shows
- **New** Customers move or cancel their own booking
- **New** Repeat bookings ("every 2 weeks")
- **New** Waitlist for full days
- **New** Gap time between bookings (clean-up or travel)
- **New** Calendar view

**3. Payments** (customers pay the business)
- ✓ Deposits when booking
- ✓ Pay links
- ✓ Money straight to the owner's bank
- **New** Gift Tikka: someone buys a gift for a friend to use at the business (the customer may read "A gift from {business}"; wording to decide)
- **New** Packages: pay once for several visits
- **New** Receipts

**4. Daily records** (running the day at the shop)
- ✓ Counter screen and helpers (they never see phone numbers)
- **New** Today screen: who's coming, who paid, who still owes
- **New** Record every sale: walk-ins, cash, transfers, balances owed
- **New** Works on bad network

**5. Money** (how the business is doing)
- ✓ Money screen for payments through Tikka
- **New** Daily and weekly money report, on the phone
- **New** Expenses and profit: "You made ₦X, spent ₦Y, kept ₦Z" (owners have said not knowing this is hurting their business)
- **New** Insights: best services, busiest days, top customers

**6. Customers** (knowing and keeping them)
- ✓ Customer list, follow-ups, reviews from real visitors
- **New** Client book: every visit, what they spent, notes, birthdays
- **New** One-tap reminders from the owner's WhatsApp
- **New** Loyalty ("every 5th visit free"; drops bring people back once, loyalty rewards regulars all the time)
- **New** Flag customers who don't show up or don't pay
- **New** Reply to reviews
- **New** Moving in: bring customers over from a notebook or phone contacts

**7. Drops** (bringing in new customers)
- ✓ Built. No changes; drops stay as they are.

**8. Marketplace** (customers finding businesses)
- ✓ Lists drops today
- **New** Search by service, area and date, see businesses and book

### Build order

0. Design the owner experience first, on paper and in prototypes: the bookings overhaul and the new home and tabs (Today · Calendar · Customers · Money · More), for owners who aren't tech-savvy.
1. **Website and Bookings:** setup for each trade, service options, add-ons, home service, gap time, event-day bookings, questions, booking rules, customers moving or cancelling.
2. **Daily records:** Today screen, record sales and balances, reminders, calendar view, receipts, bad network.
3. **Money:** money report with insights, expenses and profit.
4. **Customers:** client book with flags, moving in, repeat bookings, loyalty, reply to reviews.
5. **Payments extras:** Gift Tikka, packages, waitlist.
6. **Marketplace** for bookings, last: it's only as good as the pages in it. Drops stay in it as "Offers near you".

### Version 2 (more than one person running the business)

Staff calendars and customers choosing a stylist, front desk role, branches, commission, stock, memberships, payroll.

### Later

- Orders and aso ebi group orders
- AI (only after the daily tools)
- Automatic reminders, campaigns, running the day from WhatsApp (need Meta)
- Plus bundle and message credits
- Voice input and Nigerian languages
- A Book button inside Instagram (Meta's partner program)
- Marketplace fees (once it sends real customers)
- Google Calendar sync, customer accounts, tips, discount codes (drops do this), card terminals

### Where this leaves us against competitors

With all of the above built, Tikka matches Botglam and Splice on running the day and beats them on the website, new customers (drops), price (free + 1%) and payouts straight to the owner's bank. Splice and Fresha keep salons with several stylists until version 2. The practice investor Q&A of 25 Nov found the product and direction strong; weak points were traction, money per business, how we get businesses, retention, the length of the feature list and who owns sales. Fixes: the 8-week scoreboard, usage data per feature, someone owning sales, the competitor demos and owner interviews, real revenue per business from the pilot.
