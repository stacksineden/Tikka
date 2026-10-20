Tikka turns people who see a business into contacts the business can follow up. A visitor claims a collectible card (a Tikka) with their WhatsApp number, flips it to see what they got, and shows it at the counter. The brand idea follows the product exactly: **a Tikka is your ticket to something good.** You claim it, keep it in WhatsApp, show it once, and it gets checked.

Personality: warm, playful, premium, honest. Tikka should feel like being handed a ticket to a good party, never like a betting slip and never like a coupon.

Tikka speaks to two audiences and the system serves both: **claimers** on a phone, often on mobile data, seeing a business's card on the night stage; and **business owners and staff** in a light, calm dashboard, counting leads and naira.

## Content fundamentals

**Vocabulary.** The card is a Tikka (plural Tikkas, capital T). A batch is a drop. People claim a Tikka, flip it, get something, and show it at the counter. Businesses run a drop, verify codes, unlock leads.

| Say | Never say |
| --- | --- |
| "You got a Tikka!" | "You won!", "Congratulations, winner" |
| "Every Tikka is a surprise." | "Try your luck", "Spin to win" |
| "Only 23 Tikkas left." | "Hurry!!! Last chance!!!" |
| "Claim your Tikka on WhatsApp." | "Submit your details" |
| "Show your Tikka at the counter." | "Redeem your voucher" |
| "This drop brought in ₦1.9M." | "Huge ROI!" |

- **No gambling words**, anywhere: win, winner, luck, lucky, jackpot, odds, bet, stake, lottery, raffle, prize draw. They worry businesses and regulators (the prize-promotion question is still open with a lawyer). A monthly draw on a thank-you card is described as "entry into Glow Studio's monthly draw", never as a chance to win.
- **Sentence case** for everything: buttons, headings, tabs. "Unlock lead", not "Unlock Lead".
- **You and your** to the reader. The business is named by its name ("Glow Studio just dropped 500 Tikkas"), never "the merchant".
- **Claimer copy is short and warm.** One idea per line, verbs first. Light Nigerian warmth is welcome in consumer marketing and WhatsApp messages ("Oya, your Tikka is waiting"); never in the dashboard, receipts, errors or legal text.
- **Business copy is plain and numeric.** Lead with the number, then what it means: "340 leads didn't come in. Unlock them to follow up."
- **Naira is always ₦**, never N or NGN in UI: ₦25,000 in tables, ₦1.9M in summaries. Every font in this system has the ₦ glyph; any font change must pass that test first.
- **Counts read "23 of 600 left"**, with the remaining number first. Serial numbers read "No. 0412 / 600".
- **Never make a modest card feel like a dud.** A thank-you card always names its small benefit: "Thank you for coming through. You get priority booking."
- **Emoji:** none in product UI. WhatsApp messages may open with one (🎟) and no more.
- **Blocks are friendly:** "This drop is for new customers. You're already on Glow Studio's list, so watch out for their next drop."

## Visual foundations

### Colour

Indigo is Tikka. Gold is the good thing inside. Everything else stays quiet.

- **Tikka chrome** (nav, links, primary buttons, selected states) uses `brand` with `on-brand` text, tinted with `brand-soft`.
- **Gold is scarce on purpose.** Use `gold` only for the claim button, rewards, the rare tier and the logo stub. Text on gold is `on-gold`. Gold as text on light grounds is `gold-text`; behind reward summaries use `gold-soft`.
- **The card stage is `night`.** The claim page background and the back of every Tikka sit on `night`, with `night-raised` for pills and panels on it, and `on-night` / `on-night-muted` for text. It is the same deep indigo in both themes so a card always looks premium.
- **Rarity colours are Tikka's, never the business's**, so rare always looks rare in every drop: `rarity-common` (calm lilac) for common and thank-you cards, `rarity-rare` (gold) for rare, `rarity-legendary` (zobo pink) for legendary. Text on any rarity fill is `on-gold`. Rarity always carries its word and pips too, never colour alone.
- **Status** uses `success` / `success-soft` and `danger` / `danger-soft`, always with a word and an icon. The valid panel is a light `success-soft` fill and the invalid panel a dark `danger` fill, so they differ in lightness, not just hue.
- **Never use WhatsApp green** (#25D366) as a Tikka colour. `success` is deliberately deeper and bluer. WhatsApp's own glyph appears only in its official form, per WhatsApp's brand guidelines.
- Page grounds are `surface` (warm paper) with `surface-raised` for cards and rows and `surface-sunken` for wells. Body text is `ink`; secondary text is `ink-muted`. Hairlines are `line`; input and control borders are `line-strong`.
- **Both themes** are defined. The dashboard defaults to light; the claim page always uses the night stage regardless of theme.

### The business's brand on a Tikka

A Tikka is co-branded: the business owns the face, Tikka owns the frame.

- **The business provides** its logo, name and one brand colour (`--biz` in components), plus a text colour for it (`--on-biz`). Compute `--on-biz` as white or `ink`, whichever gives 4.5:1 on `--biz`; if neither does, darken `--biz` until one does.
- **Tikka keeps** the ticket shape, notches, perforation, stub, shine, rarity colours, counter and the night stage. Never tint the stage or the stub with the business colour.
- The card front is `--biz`; the back is `night-raised` (so it stands off the night stage); the stub on the back takes the rarity colour.
- On the Free plan the front stub carries a small "Tikka" lockup and the claim page footer reads "Create Tikkas for your business".

### Type

- **Bricolage Grotesque** for everything except codes: `display-xl` for the reveal headline ("You got a Tikka!"), `display-lg` for reward values and result numbers, `heading` and `title` for structure, `body-lg` on the claim page, `body` in the dashboard, `label` for buttons and table headers, `caption` for metadata. It is a variable font with an optical-size axis: let `opsz` follow the size so small text stays open and large text gets tight and characterful.
- **Space Mono** for codes and serials only: `code-lg` on the card and redeem screen, `code` in tables and WhatsApp previews, `serial` in caps for "No. 0412 / 600" and the counter. It reads like a printed ticket.
- Load both from Google Fonts with the `latin-ext` subset, which carries ₦.
- Redeem codes use only the characters `ACDEFGHJKMNPQRTUVWXY34679` (no 0/O, 1/I/L, 2/Z, 5/S, 8/B) and are written as a two-letter business prefix, a hyphen and five characters: `GS-7X4QP`, the last one a check character.

### Shape: the ticket

- The Tikka card is portrait, **5:7**, with `radius-card` corners. A perforation crosses it at 72% of its height, with half-circle notches of `radius-md` cut into both edges. Below the perforation is the stub.
- The notch-and-perforation is Tikka's signature: reuse it sparingly elsewhere (the redeem panel, receipts, the WhatsApp card image), never as decoration on ordinary panels.
- Buttons and panels use `radius-md`; inputs and badges `radius-sm`; counters, badges and the claim button on phones `radius-pill`.
- Only the card gets `shadow-card`. Panels use `shadow-raised` or a `line` border, not both.

### Spacing and layout

- A 4px base: `space-1` to `space-16`. Phone gutters are `space-4`; panels pad `space-6`.
- The claim page is a single centred column, at most 420px wide, card first, then "What's in this drop", then the claim button pinned to the bottom of the screen on phones.
- The dashboard leads with new leads and money, in that order.
- Keep the claim page tiny: no images beyond the business logo, one font request, no web fonts beyond the two families.

### Motion

The card's motion is the product's signature. About two seconds end to end.

| Beat | Token | What happens |
| --- | --- | --- |
| Entrance | `dur-enter`, `ease-settle` | Rises 24px and settles with a slight overshoot. |
| Idle | `dur-shine`, `ease-out` | One diagonal shine sweep, then a 3s pause; tilt follows finger or phone motion, at most 8°. |
| Anticipation | `dur-shake`, `ease-out` | A short shake (±3°) after the claim succeeds. |
| Flip | `dur-flip`, `ease-flip` | Rotates 180° on Y to the back; the stub's rarity colour lands last. Short vibration where supported. |
| Legendary only | — | Gold and zobo confetti for one second after the flip. |

- Animate **only transform and opacity**, so it stays smooth on low-end Android.
- With `prefers-reduced-motion: reduce`: no shine, tilt, shake or confetti; the flip becomes a 200ms crossfade.
- Dashboard motion is functional only: `dur-quick` with `ease-out` for hover, press and focus.

### States

- Hover darkens a fill by stepping toward `ink`; press scales to 0.98.
- Focus is a solid 2px `focus-ring` with a 2px offset on light grounds, and a 2px `on-night` ring on the night stage.
- Disabled controls drop to 40% opacity and keep their label.

## Logo

- **The mark** is a slim portrait ticket tilted −12° (top leaning left): an indigo body with a large, symmetrical gold four-point spark tilted with the ticket, and a gold stub below. Small half-circle notches and a dashed perforation sit exactly on the join, at 72% of the height. **The wordmark** is "tikka" in lowercase Bricolage Grotesque ExtraBold, with the i's dot replaced by the same spark, tilted to match.
- Use `tikka-lockup.svg` (mark + wordmark) by default. Use `tikka-lockup-stacked.svg` in square spaces (social posts, merch, packaging), `tikka-mark.svg` alone where space is square, and `tikka-favicon.svg` at 16–32px (no perforation, bigger notches and spark). Use `tikka-app-icon.svg` for app icons and the WhatsApp Business profile photo; it survives a circular crop.
- On `night` or any dark ground use the `-reversed` files: a paper-white body with an indigo spark.
- Where only one colour is possible (rubber stamps, thermal receipts, embossing, over photos) use `tikka-lockup-mono-ink.svg` or `tikka-lockup-mono-white.svg`; the spark is cut out of the ticket.
- Clear space around the logo is at least the height of the stub. Minimum sizes: favicon 16px, mark 24px, lockup 24px tall.
- Don't recolour the mark, untilt it, outline it, add effects, or put it on the business's colour. Don't set "tikka" in another font, and never show a normal dot on the i as well as the spark.
- In running text the name is "Tikka", capital T; the lowercase form belongs to the logo only.

## Iconography

- Use **Lucide** icons (open source, ISC licence) at 20px with a 1.75px stroke, coloured with the text they sit next to. The component previews draw a few simple placeholders in the same style.
- The four-point spark from the logo is Tikka's one custom glyph: use it for rewards and reveals, in `gold`.
- WhatsApp actions show WhatsApp's official glyph, unmodified, per its brand guidelines.
- No emoji in product UI.

## Accessibility

- Every text token's usage note names the grounds it is legible on; those pairs hold at least 4.5:1 in both themes.
- Rarity and status never rely on colour alone: rarity carries its word and 1–3 pips, status carries a word and an icon.
- The claim button is at least 52px tall; tap targets are at least 44px.
- The card has a text alternative: "Glow Studio Tikka. 23 of 600 left." and, after the flip, "You got 20% off any service. Code GS-7X4QP."
