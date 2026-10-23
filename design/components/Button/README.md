# Button

Actions in the dashboard and the one big claim button on the night stage.

**Consumer provides:** the label, an optional leading 18px icon, and the variant: default (`brand` fill), `tk-btn--secondary` (outlined), `tk-btn--ghost` (text only), `tk-btn--claim` (gold, pill, 52px tall).

- Use `tk-btn--claim` once per claim page, for "Claim via WhatsApp", pinned to the bottom of the screen on phones. It's gold because the claim is the reward moment.
- In production the claim button carries WhatsApp's official glyph; the preview shows a placeholder bubble.
- One default (brand) button per view; pair it with secondary or ghost.
- Labels are sentence-case verbs: "Unlock lead", "Confirm redemption".
