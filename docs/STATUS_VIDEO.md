# The WhatsApp status video

A 59-second, 9:16 (1080×1920) explainer made for WhatsApp status: problem, Tikka, how it works, the
result, the offer. Built as a dev-only page from the real card, pack and brand tokens, so it matches
the product. Words stay in the middle of the frame because WhatsApp covers the top (name, progress
bar) and bottom (reply box) of a status.

- Page: `app/dev/status-video/` (dev only; `notFound()` in production)
- Photos: `public/dev/explainer/` (AI-made stand-ins: the owner, five customers, the salon chair)
- Sound effects: `scripts/status-video-sfx.py` (synthesised, no licences)
- Render: `scripts/render-explainer.cjs`

## Make it

```bash
pnpm dev
node scripts/render-explainer.cjs tikka-status-silent.mp4 --url http://localhost:3000/dev/status-video
python3 scripts/status-video-sfx.py sfx.wav
ffmpeg -i tikka-status-silent.mp4 -i sfx.wav -c:v copy -c:a aac -b:a 160k -shortest tikka-status.mp4
```

Change a scene's timing in the page and the matching cue times in the SFX script together.

## Script (voice lines to record; the same words are on screen)

| Time | Scene | Voice |
|---|---|---|
| 0:00–0:05 | Owner in a circle, Instagram/TikTok/WhatsApp messages around her. "1.2k views. 0 customers." | Your posts get views. Likes. "How much?" |
| 0:05–0:09 | The empty salon chair | But the chair stays empty. |
| 0:09–0:13 | "See you 2pm!", the clock runs to 2:30 | And the ones who book… don't show. |
| 0:13–0:16 | The Tikka logo | Meet Tikka. |
| 0:16–0:21 | The sealed Tikka, one link flowing to Instagram, TikTok, WhatsApp and the QR poster | Share a limited reward worth coming in for. One link, everywhere you post. |
| 0:21–0:28 | The Tikka opens (Rare, 20% off any service), then lands in the WhatsApp chat | People claim it on WhatsApp in seconds. |
| 0:28–0:35 | Booking: Sat 13 · 2:00pm, ₦5,000 deposit, ₦15,000 at the shop, Pay, booked | They pick a time and pay a deposit to hold it. So a no-show doesn't cost you. |
| 0:35–0:40 | The customer arrives in the chair; the counter: Valid, deposit paid, collect ₦15,000 | They walk in, show their code, and you get paid. |
| 0:40–0:46 | Leads list, then customers orbiting the smiling owner | And everyone who claims is yours: their name and WhatsApp number, to follow up. |
| 0:46–0:51 | 76 came in, ₦1,940,000 | One drop. Real customers. Counted in naira. |
| 0:51–0:59 | The headline, then the end card: Get your first drop free · usetikka.com | Your posts get views. Tikka turns them into customers who show up and pay. Get your first drop free at usetikka.com. |

The example numbers (600 Tikkas, 577 claimed, 76 came in, ₦1,940,000) match the landing page's
example results.
