# Card reference: the approved claim experience

These two files are the clickable prototype Samuel approved (Tikka claim experience, built on the Claude design canvas). They are a **reference to port**, not code to import: `Main.dc.html` uses the canvas's own component format (`<x-dc>`, `<sc-if>`, `{{holes}}`, a `DCLogic` class), so rebuild it as React components in the app.

What to take from them exactly:
- **claim.css**: every visual value and animation: the wrapper (`.tk-pack*`), unwrap keyframes (`tkTearOff`, `tkDrop`, `tkRise`), the ticket mask with notches at 72%, finishes (`.tk-holo`, `.tk-foil`), the hold ring (`tkRing`, 1.3s), tremble, white-then-rarity glow (`tkGlowW`, `tkGlowR`), flip (0.6s, cubic-bezier(.65,0,.35,1)), spark burst (`tkRay`), name printing (`tkPrint`), confetti (`tkFall`), reduced-motion rules.
- **Main.dc.html, the script at the bottom**: the beat state machine and timings:
  `sealed → opening (1.25s) → front → claim → verifying → ready → [hold 1.3s] → flipping (0.7s) → revealed`.
  Releasing the hold early cancels it. Vibration patterns: tear 15ms, confirmed 20ms, hold start 10ms, flip [30, 50, 80].
- **Main.dc.html, the markup**: the structure and copy of each beat (sealed wrapper with seal, odds line and "Tear to open"; business front; profile; claim sheet; confirming; hold; revealed panel).

What changes in the real product:
- The claim sheet asks for **first name only** (the number comes from WhatsApp).
- "Verifying" waits for the real webhook instead of a timer.
- Rarity, reward, code, serial and name come from the reveal endpoint.
- Business colour, logo, cover, tagline, actions and services come from the business profile.
