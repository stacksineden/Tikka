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

Two chapters with two different customers, so the free reward and the deposit never meet: a drop is
free to claim (it brings new people in); a deposit is for booking a time on the business page (it
makes bookings show up).

| Time | Scene | Voice |
|---|---|---|
| 0:00–0:05 | Owner in a circle, Instagram/TikTok/WhatsApp messages around her. "1.2k views. 0 customers." | Your posts get views. Likes. "How much?" But no one comes in. |
| 0:05–0:09 | Empty chair, "See you 2pm!", the clock runs to 2:30 | And the ones who book… don't show. |
| 0:09–0:12 | The Tikka logo. "Tikka fixes both." | Tikka fixes both. |
| 0:12–0:13.5 | Chapter 01 · Bring new customers in | — |
| 0:13.5–0:18 | The sealed Tikka, one link to Instagram, TikTok, WhatsApp and the QR. "Free to claim." | Share a limited reward on one link, everywhere you post. |
| 0:18–0:23 | It opens (Rare · 20% off) and lands in WhatsApp. "No payment." | People claim it free on WhatsApp. Just a reason to come in. |
| 0:23–0:27 | Adaeze arrives in the chair; the counter says Valid; the Leads list fills | They come in, show the code, and you keep every name and number. |
| 0:27–0:28.5 | Chapter 02 · Make bookings show up | — |
| 0:28.5–0:34 | The free business page in an Instagram bio: services and prices with deposits, work photos, reviews | Get a free website for your bio: services, prices, photos and reviews. |
| 0:34–0:40 | Zainab (found you on Instagram) picks Sat 13 · 2:00pm, pays the ₦5,000 deposit, booked | Customers pick a free time and pay a deposit to hold it. |
| 0:40–0:45 | The owner's bookings with deposits paid; Money: ₦18,000 to your bank next working day | If they don't show, the deposit's already yours, straight to your bank. |
| 0:45–0:50 | The smiling owner, customers orbiting; "76 new customers", "₦5,000 on every booking" | More people in. Fewer empty chairs. |
| 0:50–0:59 | The headline, then the end card: Get your first drop free · usetikka.com | Your posts get views. Tikka turns them into customers who show up and pay. Get your first drop free at usetikka.com. |
