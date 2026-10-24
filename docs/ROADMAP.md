# Roadmap to launch

Who does what, in order. **You** = needs your accounts, money, signature or phone. **Claude** = code
and checks I do here. Each phase lists what it's waiting on. The detailed how-to for each "You"
step is in `docs/LAUNCH.md` (section numbers in brackets).

Tick items as they're done.

---

## Phase 0 · Start today (nothing blocks these; do them side by side)

The slow ones first: they take days to come back.

**You**
- [ ] 0.1 **Meta / WhatsApp Business verification.** Start it now; it's the longest wait. Business Manager → Business settings → verify the business. Get a phone number for Tikka's WhatsApp (one not already on WhatsApp). [§3]
- [ ] 0.2 **Paystack:** open the account and finish business verification (KYC), so live keys are ready later. [§4]
- [ ] 0.3 **Lawyer:** send `/privacy` and `/terms` (the drafts) plus the question "do rewards that differ from Tikka to Tikka need approval as a promotion?". [§5]
- [ ] 0.4 **Domain:** confirm you own `usetikka.com` and can edit its DNS.
- [ ] 0.5 **Google sign-in:** Google Cloud project, consent screen (Testing, add your Gmail as a test user), Web client with Supabase's callback URL, Client ID and secret into Supabase → Providers → Google. Test at `localhost:3000/sign-in`. [§1]
- [ ] 0.6 **Email (Resend):** account, add `usetikka.com`, add its DNS records, wait for "Verified", make an API key, put the SMTP details into Supabase → Authentication → Emails. [§1]
- [ ] 0.7 **Vercel:** create an account (check whether the free Hobby plan allows a paid pilot).
- [ ] 0.8 **Say yes to pushing the code to GitHub** (34 commits are only on your laptop; Vercel deploys from GitHub).

**Claude**
- [ ] 0.9 Push the code to GitHub (after 0.8).
- [ ] 0.10 Check the claim page's speed budget (under 100 KB of JavaScript for Android on mobile data) and trim it if it's over.
- [ ] 0.11 Admin switches for WhatsApp templates, so you mark each one approved with a tap instead of SQL.
- [ ] 0.12 Pin Node 22 (`.nvmrc` and `engines`), so your laptop and Vercel match.
- [ ] 0.13 After 0.6: switch on Tikka's own wording for the sign-up and password emails (and set the site address so nothing points at `localhost`).

---

## Phase 1 · Put the site online
**Waiting on:** 0.4 domain, 0.7 Vercel, 0.9 code on GitHub.

**You**
- [ ] 1.1 Vercel → New Project → import `stacksineden/Tikka`, Node 22.
- [ ] 1.2 Add the environment variables (the table in §2). Leave Paystack and WhatsApp ones empty until Phase 2; set `CRON_SECRET` and `NEXT_PUBLIC_TIKKA_VIDEOS=off` now.
- [ ] 1.3 Point `usetikka.com` at Vercel (Vercel shows the DNS records).
- [ ] 1.4 Supabase → Authentication → URL Configuration: Site URL `https://usetikka.com`, redirect URL `https://usetikka.com/**`.
- [ ] 1.5 Supabase SQL editor: the two Vault lines that switch on the schedule. [§3b]
- [ ] 1.6 Sign up on the live site with your own email; run the admin SQL line. [§6]

**Claude**
- [ ] 1.7 Check the deploy: build logs, the schedule running every 5 minutes, card images loading from the live address, admin working for you.
- [ ] 1.8 A live run-through in the browser: set up a test business, publish its free drop, check the claim page and marketplace on a phone-sized screen.

---

## Phase 2 · WhatsApp, payments, email for real
**Waiting on:** Phase 1, and 0.1 Meta, 0.2 Paystack, 0.6 Resend coming back.

**You**
- [ ] 2.1 Meta app: add the number, set the webhook to `https://usetikka.com/api/whatsapp/webhook` with your verify token, subscribe to messages. [§3]
- [ ] 2.2 Submit the four templates (wording in `docs/TECH_PLAN.md` §5).
- [ ] 2.3 Add the WhatsApp env vars on Vercel and redeploy.
- [ ] 2.4 Paystack live keys on Vercel; webhook `https://usetikka.com/api/paystack/webhook`. [§4]
- [ ] 2.5 Google sign-in: add `usetikka.com` to the consent screen, with the homepage, privacy and terms links.

**Claude**
- [ ] 2.6 With you on your phone: claim a Tikka on real WhatsApp (card with picture, code, reminder), redeem it, get the thank-you, leave a review.
- [ ] 2.7 Mark each template approved as Meta approves it (with 0.11's switches), and check drop-live alerts and the daily summary arrive.
- [ ] 2.8 Pay for one small drop with a real card and check it goes live and shows in admin; check the sign-up and reset emails arrive with Tikka's wording.

---

## Phase 3 · Legal sign-off
**Waiting on:** 0.3 the lawyer.

**You**
- [ ] 3.1 Final privacy and terms text from the lawyer, with every blank filled (company name, address, emails, data location, retention, minimum age, refunds, liability…).

**Claude**
- [ ] 3.2 Put the text in the pages, remove the draft marker, and run the production build check (it refuses to ship otherwise).

---

## Phase 4 · Dress rehearsal (the day before the first business)
**Waiting on:** Phases 1–3.

**Both**
- [ ] 4.1 One full run on real phones: a business signs up, sets up its card, publishes a drop; three people claim (one from a QR poster), one redeems and reviews; the owner sees leads and the dashboard; a staff member redeems at the counter.
- [ ] 4.2 Delete the test business and its claimers (admin → Privacy requests for the claimers; suspend or remove the business).
- [ ] 4.3 First backup: `pnpm backup` (one-time: `brew install libpq && brew link --force libpq`). [§8]

---

## Phase 5 · The pilot

**You**
- [ ] 5.1 Onboard the first businesses (sit with each owner for the card setup and first drop).
- [ ] 5.2 Weekly: `pnpm backup`, and Supabase → Usage (move to Pro near the limits in §8).
- [ ] 5.3 Answer privacy requests from admin. [§7b]

**Claude**
- [ ] 5.4 Fix what the pilot turns up; watch errors and usage with you.

---

## Phase 6 · Before the public launch

- [ ] 6.1 **You:** Supabase Pro ($25/month): backups, no pausing, more room.
- [ ] 6.2 **You:** Vercel plan for commercial use if the pilot ran on Hobby.
- [ ] 6.3 **You:** publish the Google consent screen (and verify the branding if Google asks).
- [ ] 6.4 **You:** optional: Supabase custom domain, so Google's sign-in says usetikka.com.
- [ ] 6.5 **Claude:** turn videos back on (remove `NEXT_PUBLIC_TIKKA_VIDEOS`), remove the demo business and demo store, live "Tikkas left" counter on the claim page.
