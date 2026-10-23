# LeadRow

One person in a business's lead list, in one of three states: locked, redeemed (free) or unlocked (paid).

**Consumer provides:** name (first name and initial while locked), phone (masked as `0803•••4521` while locked), status, reward, whether they're a new lead or a returning claimer, and the amount spent when redeemed.

- Locked rows prove real people claimed without letting the business contact them: show "Unlock", never the full number.
- Redeemed rows are always unlocked free and show what they spent in naira.
- Unlocked rows get "Message on WhatsApp", which opens a chat from the business's own phone.
- Tag new leads in `gold-soft`; the list leads with them.
