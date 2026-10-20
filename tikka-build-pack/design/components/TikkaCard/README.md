# TikkaCard

The collectible ticket a claimer gets: the business's face on the front, what they got on the back, the reward on the stub.

**Consumer provides:** `--biz` and `--on-biz` on `.tk-card` (the business colour and a text colour that holds 4.5:1 on it), the business's logo or initials, business name and drop name, the cards-left count and serial, and after the claim the rarity, reward, code and expiry from the server. Default width is 240px (`--card-w`); the claim page uses 280–320px.

**Structure:** `.tk-card > .tk-card__inner > .tk-card__face.tk-card__front` and `.tk-card__back`, each a `.tk-card__body` and a `.tk-card__stub`. Add `is-flipped` to reveal. Rarity is a modifier on the card: `tk-card--rare`, `tk-card--legendary` (common is the default).

**Motion:** add `tk-card--enter` on mount, `tk-card--shake` for 320ms after the claim succeeds, then `is-flipped`. Only transform and opacity animate; reduced motion turns the flip into a crossfade and stops the shine.

- Do keep the back hidden until the claim succeeds; the browser only ever receives the card just won.
- Do let the front carry the business's brand and nothing else from it: the stage, stub and rarity colours stay Tikka's.
- Don't put the code on the front, and don't show the reward before the claim.
- Don't call a thank-you card empty: its stub always names the small benefit.
- Give the card a text alternative that reads the front, then the reward and code after the flip.
