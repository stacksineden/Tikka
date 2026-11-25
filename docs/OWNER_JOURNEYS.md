# Owner and customer journeys (agreed 25 Nov 2026)

Step by step, what owners and customers see and do in the new direction (docs/NEW_DIRECTION.md, section 12). These come before the clickable prototypes, and the prototypes come before any code. Planning only: nothing here is built yet.

**How every screen works:** one question per screen, already filled in for their trade where it can be, plain words, big tap targets, and the owner sees the result (her page) as she goes. Designed for a 375px phone first.

## Decisions (25 Nov 2026)

1. **Deposit amount:** setup suggests one for the trade (e.g. 30%), and the owner can change it. This replaces today's rule that nothing is picked for her.
2. **Booking rules:** filled in for her trade by default; she can change any line.
3. **Home service travel fee:** one fixed amount by default, already filled in, with a fee per area as an option. *(Read from "yes to all"; confirm.)*
4. **Tabs:** Today · Calendar · Customers · Money · More. Checking a code (drops, Gift Tikka) is a button on Today; Drops, Your page, Posters & cards, Team and Settings move into More.
5. **Starting prices:** the filled-in prices differ by city (Lagos is pricier than Ibadan), not one national guide. *(Read from "yes to all"; confirm.)*

---

## Journey 1: A new hair stylist sets up her page and takes deposits

Goal: from sign-up to "customers can book and pay a deposit", without our help.

1. **Sign up** with Google or email.
2. **"What do you do?"** Big tiles with pictures: Hair, Makeup, Nails, Lashes & brows, Barber, Spa, Gele, Photography, Videography. She can pick more than one (many makeup artists also do hair).
3. **"What's your business called?"** Name and Instagram handle.
4. **"Where are you?"** State, city, area.
5. **"Where do you work?"** "Customers come to me", "I go to customers", or "Both". If she goes to customers: "How far will you go?" and "Travel fee" (filled in).
6. **"Your services."** A list filled in for hair, with typical prices for her city. She ticks what she does and changes the prices.
   - Services with choices show them already: "Knotless braids: short / medium / long", each with its price and time.
   - Suggested extras, not ticked: "Add wash ₦2,000", "Bring your own hair: −₦5,000".
7. **"Add your work."** At least 3 photos from her phone. Her page fills in as she goes.
8. **"When do you work?"** Filled in with Mon–Sat, 9am–6pm; tap a day to change it. Then: **"How many customers can you do at the same time?"** Default 1, with a picture of one chair.
9. **"Your page is live!"** Her link and a preview, with **Share on WhatsApp** and **Copy for Instagram bio**. Customers can book from now.
10. **"Stop no-shows: take a deposit."** One line on why, then "Money goes straight to your bank. Tikka never holds it." She adds her ID and bank account (the name comes from the bank) and checks the suggested deposit.
11. **"Your booking rules."** Filled in for her trade, e.g. "More than 30 minutes late: the deposit stays with us." She can change any line.
12. **Done.** Her checklist is full, and she lands on Today.

If things go wrong:
- While her ID is being checked, bookings work without a deposit. Today says "Deposits start once we check your ID (usually same day)".
- If she stops halfway, Tikka picks up where she left off next time.

## Journey 2: A customer books a hair appointment with a deposit

1. She taps the link in the stylist's Instagram bio, sees the photos, and taps **Book** on "Knotless braids".
2. **Picks a length:** short, medium or long, each with its price and time.
3. **Ticks extras** if she wants them ("Add wash").
4. **If the stylist does home service:** "At the salon" or "At my place". At my place asks for her area and address and adds the travel fee.
5. **Picks a day, then a free time.** Only free times show.
6. **Answers a question** if the stylist set one ("Any allergies?").
7. **Sees the total:** "₦35,000 total · ₦10,000 deposit now · ₦25,000 at the appointment", the booking rules and the not-refundable line. She taps **Pay deposit**.
8. **Pays with Paystack** (card or transfer).
9. **Gets her booking pass:** date, time, address (or "the stylist comes to you"), what's left to pay, Message on WhatsApp, and Move or cancel within the rules.

## Journey 3: A bride books her makeup artist for the wedding day

1. On the artist's page she taps **Book** on "Bridal makeup", a service marked as an event day.
2. **Picks the date** (she sees which days are free), **then the call time** (e.g. 6am).
3. **"Where's the event?"** Venue or address; the travel fee is added.
4. **"Who's getting ready?"** Bride, plus the number of bridesmaids and family, each with its own price. Extras: "Gele for the bride", "Touch-up artist stays all day".
5. **Questions:** "Skin type or allergies?", "Wedding colours?"
6. **Total and deposit** (usually bigger for events, e.g. 50%) and the rules. She pays.
7. **Gets her pass** with every detail. The date is blocked on the artist's calendar.

## Journey 4: The owner's morning

1. She opens Tikka and lands on **Today**:
   - Top line: "4 customers today · ₦32,000 to collect".
   - The day in order: "10:00 Ada · Knotless braids, long · deposit paid ₦10,000 · collect ₦25,000". Home visits show the area and **Directions**.
2. **Next to each person:** **Remind** (opens her own WhatsApp with the message ready: "Hi Ada, see you at 10…"), **Message**, **Move**.
3. **When they arrive:** **Arrived**. When they leave: **Paid**, then cash, transfer or pay link. The balance clears.
4. **At the bottom:** "Tomorrow: 3 customers" and "2 people still owe you ₦15,000".
5. **One big button:** **+ New sale**, for walk-ins.

## Journey 5: A walk-in pays cash

1. On Today, **+ New sale**.
2. **"What did they do?"** Pick from her services, with option and extras.
3. **"Who?"** Type a name or pick a regular. A number is optional.
4. **"How much did they pay?"** The full price is filled in; she changes it if they paid part. Cash, transfer or card.
5. **Done.** It shows on Today and in Money; a part payment shows under "still owes".

## Journey 6: End of the week, "Am I making money?"

1. **Sunday evening, a phone alert:** "This week: ₦184,000 in, ₦52,000 spent, you kept ₦132,000".
2. **She taps it and opens Money:** money in (deposits, cash, transfers), money out, what she kept; best service, busiest day, top customer.
3. **+ Add expense:** type (products, rent, transport, helper, data), amount, done.
4. **"Still owed to you: ₦15,000"**, with each person and **Remind**.

---

## Next

Clickable phone prototypes of Journey 1 (setup) and Journey 4 (Today and the new tabs), shown to the makeup artist and Divora before anything is built.
