# RedeemResult

The answer staff see after scanning or typing a code at the counter: valid with the details, or not valid with the reason.

**Consumer provides:** the result from the server. Valid: first name and initial, reward, tier, expiry. Not valid: the code and one reason (already used with when, expired, another business's code, or unknown).

- Checking never uses a code: the valid panel always needs "Confirm redemption" (optionally with the bill amount) before the code dies.
- Valid is a light `success-soft` panel; not valid is a dark `danger` panel, so they differ in lightness, word and icon, not hue alone.
- Show the claimer's name so staff can check transferability.
- Never show the phone number here; staff accounts don't see leads.
