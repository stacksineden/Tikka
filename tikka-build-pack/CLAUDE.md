# Tikka

Tikka turns people who see a business into contacts the business can follow up. A business sets up its card once, then runs **drops**: limited batches of collectible cards (**Tikkas**) in three tiers (thank-you, rare, legendary) behind one link and on the Tikka marketplace. A visitor opens the link, tears open a sealed Tikka, sees the business, claims with WhatsApp, holds to open, and flips the card to see what they got. The card lands in WhatsApp with a code they show at the counter. The business redeems codes for free (staff can do it), collects reviews from people who redeemed, watches link activity live, and pays to unlock the contact details of people who claimed but didn't come in. People can browse drops on the marketplace and ask to be notified when a drop opens.

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
- Paystack for unlock credits.
- `@vercel/og` for the card share image and the image sent in WhatsApp.

## Commands

- `pnpm dev` — run locally
- `pnpm test` — unit tests (Vitest)
- `pnpm test:db` — database tests against a local Supabase (`supabase start`)
- `pnpm lint` and `pnpm typecheck` — must pass before a milestone is done

## Structure

```
app/
  (site)/                     landing page
  (market)/drops/             marketplace home, all, [category], search
  (market)/b/[business]/      business page
  (claim)/d/[business]/[drop]/ claim page: sealed → unwrap → profile → claim → hold → flip
  (claim)/t/[token]/          a claimer's card (linked from WhatsApp), and /review
  app/                        dashboard: tour, card setup, drops, drop builder, drop dashboard, leads, reviews, settings
  app/redeem/                 the counter screen (owners and staff)
  admin/                      Tikka admin (is_admin only)
  api/whatsapp/webhook/       Meta webhook: claims, Notify me, STOP
  api/cron/outbound/          sends the WhatsApp queue and drop-live alerts
  api/paystack/webhook/       payment confirmation
  api/og/                     card, drop, status and square images
lib/                          db clients, codes, deck, masking, whatsapp, queue, paystack, analytics
supabase/migrations/          tables, RLS, claim_card, redemption, reviews, notify, unlock functions
design/                       tokens, brand book, logos, component references, card reference
```

## Rules that must never break

1. **The server decides every card.** The browser never receives the deck, the reward mix order or any card that wasn't just won. Card assignment only happens inside the `claim_card()` Postgres function.
2. **Claims are atomic.** Two people never get the same card, and a drop never gives out more of a reward than it has. Use `FOR UPDATE SKIP LOCKED` inside the function. There is a concurrency test; keep it passing.
3. **One claim per WhatsApp number per drop.** A repeat claim returns the same card and resends it. It is not an error.
4. **Locked phone numbers never leave the server.** Mask them in SQL (a view or RPC), not in React. Staff accounts never see the lead list. Notify-me subscribers are not leads: businesses only ever see a count.
5. **Checking a code never uses it.** Redemption is check, then confirm. Action cards need the staff tick before confirming.
6. **Only people who redeemed can review**, once per claim, within 30 days. Businesses can report reviews, never edit or delete them.
7. **Card replies come first.** Drop-live alerts and other bulk messages go through the queue at lower priority, never ahead of a claimer waiting for their card. Respect opt-outs and the 24-hour rule (TECH_PLAN §5).
8. **No gambling words** in any copy: win, winner, luck, lucky, jackpot, odds, bet, stake, lottery, raffle, prize draw. Say "You got a Tikka!", "Every Tikka holds something".
9. **Naira is always ₦**, never N or NGN in the UI.

## Brand in code

- Colours come only from the tokens in `design/tokens.css` (`--brand`, `--gold`, `--night`, `--ink`, `--surface`, rarity colours…). Never hard-code another hex. Never use WhatsApp green (#25D366) as a Tikka colour.
- Gold is scarce: the claim button, rewards, the rare tier and the logo stub only.
- Fonts: Bricolage Grotesque (everything) and Space Mono (codes, serials, counters), from Google Fonts with the `latin-ext` subset so ₦ renders.
- The claim page is always on the night stage (`--night`). The dashboard is light by default.
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
