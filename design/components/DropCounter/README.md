# DropCounter

Live count of Tikkas left in a drop, shown on the card front and above the claim button.

**Consumer provides:** remaining and total counts. Switch to `tk-counter--low` when 10% or fewer remain, and to `tk-counter--out` (text "All 600 claimed") when none do.

- Write "23 of 600 left": remaining first, total second, in `serial` caps.
- The pulsing dot is the only animation; it stops under reduced motion.
- Don't fake urgency: never round down or show a count that isn't live.
