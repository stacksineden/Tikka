# Bookings with free times

Agreed with the owner on 18 Nov 2026. Built 18 Nov 2026 (migrations `20261120100000_bookings.sql` and `20261120110000_bookings_part2.sql`, database tests 046 and 047); deposits are not built yet. Step 1 of the payments build (docs/REVENUE_PLAN.md 5.5, 5.9). This file is the requirement; deposits (marked 💳) come in step 4 and are written here so the calendar is built to take them.

## Decisions
- **Picking a free time = booked.** No request, no accept step. The owner moves or cancels if needed.
- **Cancelling or moving frees the time straight away.** Any money is settled between the owner and the customer on WhatsApp; Tikka never refunds (REVENUE_PLAN 5.2).
- **Bookings has its own page.** Phone tab bar: Home · Bookings · Redeem · Leads · More (Drops moves into More). Desktop: in the sidebar next to Leads. Home keeps every card it has; a **Today** card sits under the numbers row, above the live drop, and also shows on the getting-started Home.
- **Someone who books becomes a lead.** One person, one lead. Leads shows where they came from: "Booked on your page", "Claimed a Tikka · {drop}", "Booked by you", or several. A filter: All · From drops · From bookings. Future-offers tick on the booking sheet, as on the claim sheet (rule 12).
- **Notice and reach:** at least 2 hours' notice, up to 3 months ahead (owner can change both under More options).
- **Staff** see Bookings (time, first name, service; never the phone number, rule 4) and mark Arrived / No-show and use BK codes on Redeem. **Only the owner** moves, cancels, adds or blocks.
- **At most 3 upcoming bookings per number per business.** Rate limits per visitor and IP, as on claims.
- **A Tikka claimer books a real time.** If the business has bookings set up, the card's "When will you come in?" becomes the booking calendar (days up to the Tikka's use-by), connected to the Tikka. Without bookings set up it stays as today (a day plan). A booking from a Tikka never takes a deposit automatically; the owner may send a pay link.
- **Changing hours or a service length never changes existing bookings**, only new times.
- 💳 **Deposits:** one switch for all services, on once the owner adds a bank account; she picks the amount herself (20/30/40/50/60%, another %, or a fixed ₦); services without a set price can only take a fixed ₦; any service can differ under More options. The customer sees the exact deposit on the business page ("Price on request · ₦10,000 deposit to book"), on the sheet before paying, and on the pass. "This deposit counts towards your bill" by default (owner can switch it off per service).
- **Not in this build:** working in another city for a day, a calendar per staff member, reminders, win-back (Tikka Plus).

## How free times are worked out
- The owner sets opening hours (already on the business page), **how many customers at the same time** (capacity), and **how long each service takes** (30 min, 1 hr, 1½ hrs, 2, 3, 4 hrs). A service with no length set counts as 1 hour.
- Start times are every 30 minutes. A time is free when, for every moment of the service's length, fewer than capacity bookings overlap, nothing blocked overlaps, the service ends by closing time, and the start is at least the notice ahead.
- 💳 A time being paid for is held for 10 minutes, then released if unpaid.

## Journeys
0. **Setup** (first time on Bookings): opening hours (prefilled), how many at once, how long each service takes. More options: notice, how far ahead.
1. **Book (no deposit):** Book on a service → day (full/closed days greyed) → free time → first name, WhatsApp number, future-offers tick → Book → booked; booking pass "Booked · Braids · Sat 15 Nov, 2:00pm · Glow Studio, Lekki · BK-7X4QP" with "Message {business}" (prefilled with the booking and ref). Tikka sends the customer no messages.
2. 💳 **Book with a deposit:** as 1, then "Hold your time with ₦5,000. Pay the rest (₦20,000) at Glow Studio." and the not-refundable line → pay → booked. Unpaid after 10 minutes → released.
3. **No free time:** a full day says "Full · next free time: …"; nothing in 3 months → "Message {business} to find a time".
4. **Customer wants to change:** messages the owner from the pass. Customers can't move or cancel in Tikka.
5. **Owner gets a booking:** a lead alert ("New booking: Ada · Braids · Sat 2pm"), the Today card, the live feed, a WhatsApp button on the booking.
6. **Move:** pick a new day and time (free times; the owner may override) → "Tell Ada on WhatsApp". The pass shows the new time.
7. **Cancel:** confirm → time freed → "Tell Ada on WhatsApp" (💳 with "Ada paid ₦5,000. Refund her yourself if you've agreed to."). The pass shows "Cancelled by {business}".
8. **Add a booking** (from WhatsApp, DM, phone): service, day, time, name, number optional → time taken; with a number, a lead "Booked by you".
9. **Block a time:** day, whole day or from–to. Bookings already in it are named; blocking never cancels anyone.
10. **The day:** Arrived (Bookings or BK code on Redeem; 💳 "Deposit paid ₦5,000 · collect ₦20,000"), optional "What did they spend?"; No-show after the time; unmarked ones show under "Did they come?".
11. **Tikka claimers:** (a) the owner taps "Book her in" on a lead → booking connected to the Tikka; (b) the claimer books from their card page ("Book a time to use it"), details prefilled, days up to the Tikka's use-by.
12. **Staff:** see above.
13. **Leads:** one lead per person; sources; filter; the next booking on the lead; Book her in; everything already there.
14. **Protection:** 3 upcoming per number per business; rate limits; existing bookings never change when settings do.
