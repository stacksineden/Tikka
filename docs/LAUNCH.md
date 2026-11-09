# Launch checklist

What has to happen before the first real claim (the pilot), in order. Items marked **You** need
your accounts, money or signature; the rest are commands or checks. Tick them off here.

The pilot runs on Supabase's **free plan** (a handful of businesses, a drop each). Section 8 says
what that means and what to watch; move to Pro before the public launch.

## 1. Accounts and plans (You)

- [ ] **Supabase:** the free plan is fine for the pilot (section 8). Note the project's region:
      the privacy policy names it. Move to Pro ($25/month) before the public launch.
- [ ] **Domain:** point `usetikka.com` at Vercel.
- [ ] **Vercel:** create the project from this repo. Node 22 (Supabase's library warns on 20).
      The free Hobby plan is meant for non-commercial use: check Vercel's terms for a paid pilot.
      The schedule doesn't depend on Vercel (it runs in Supabase, section 3b).
- [ ] **Email:** pick a provider (for example Resend, Postmark or SendGrid), add the domain, and
      put its SMTP details in Supabase → Authentication → Emails → SMTP. Then uncomment the
      `[auth.email.smtp]` and template blocks in `supabase/config.toml` and run
      `supabase config push` so sign-up, password reset and staff invite emails use Tikka's wording.
- [ ] **Supabase → Authentication → URL configuration:** Site URL `https://usetikka.com`, and add
      `https://usetikka.com/**` to the redirect URLs.
- [ ] **Google sign-in:** create the OAuth client in Google Cloud (redirect URI from Supabase →
      Authentication → Providers → Google) and switch the provider on. The sign-in page shows the
      Google button by itself once it's on.

## 2. Environment variables on Vercel (You)

Production values for everything in `.env.example`:

| Variable | Where it comes from |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Connect |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys (server only) |
| `NEXT_PUBLIC_SITE_URL` | `https://usetikka.com` (WhatsApp fetches card images from here) |
| `CRON_SECRET` | any long random string. **Required:** in production the cron routes refuse to run without it. The same value goes into Supabase Vault (section 3b) |
| `PAYSTACK_SECRET_KEY`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Paystack → Settings → API Keys (live) |
| `NEXT_PUBLIC_TIKKA_WHATSAPP` | Tikka's WhatsApp number, `+234…` |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` | Meta app → WhatsApp → API Setup; App Settings → Basic |
| `WHATSAPP_VERIFY_TOKEN` | any random string; the same one goes into Meta's webhook settings |
| `OG_SIGNING_SECRET` | optional; a long random string for card image links |
| `STUDIO_WA_NUMBER`, `STUDIO_EMAIL` | `+2348022211241` and `studio@usetikka.com` (Tikka Studio's WhatsApp and email). The email needs a mailbox that can receive mail (for example Google Workspace or Zoho); Resend only sends |
| `NEXT_PUBLIC_TIKKA_VIDEOS` | `off` for the free-plan pilot: owners can't add card or portfolio videos (photos are fine). Remove on Pro |
| `TIKKA_CLAIM_MODE` | `page` only while Tikka's WhatsApp number waits for Meta's business verification: customers claim on the page by typing their number instead of on WhatsApp (claims and new leads are marked "Number not confirmed", and Tikka never messages those numbers; Notify me is closed). Remove it and redeploy once WhatsApp works: claims go back to WhatsApp. Needs the `page_claims` and `review_asks` migrations |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Optional, for page claims: Cloudflare Turnstile (free) checks a page claim comes from a person, not a script. Cloudflare dashboard → Turnstile → Add widget (domain `usetikka.com`). Set both or neither; the check only runs when both are set |
| `TIKKA_PRELAUNCH` | `1` until the lawyer-checked privacy policy and terms are in (section 5). The site is online, but only Tikka admins and a business's own team can claim, and Notify me is closed, so no member of the public gives a WhatsApp number under the drafts. While it's on, the production build is allowed with draft legal pages. Remove it (and redeploy) to open claims: the build then fails until the legal pages are final |

Never set `TIKKA_SHOW_DEMO` in production unless you're running a sales demo.

## 3. WhatsApp (You, then one SQL line each)

- [ ] Meta Business verification, and the WhatsApp number added to the app.
- [ ] Webhook URL `https://usetikka.com/api/whatsapp/webhook`, verify token as above, subscribe
      to **messages**.
- [ ] Submit the four templates with the wording in `docs/TECH_PLAN.md` §5: `tikka_drop_live`,
      `tikka_redeemed_thanks`, `tikka_expiry_reminder`, `tikka_owner_daily`.
- [ ] When Meta approves one, mark it approved (until then Tikka holds those messages back and
      logs them; cards and replies to claimers don't need templates):

  ```sql
  update public.wa_templates set approved = true where name = 'tikka_drop_live';
  ```

## 3b. The schedule (one-time, in the Supabase SQL editor)

The WhatsApp queue runs every 5 minutes and the owners' summaries at 8:00 WAT, scheduled inside
Supabase. It does nothing until it knows where the site is and the cron secret. After the first
deploy, run these two lines with your real values (they're stored encrypted in Vault):

```sql
select vault.create_secret('https://usetikka.com', 'tikka_site_url');
select vault.create_secret('<the same CRON_SECRET as on Vercel>', 'tikka_cron_secret');
```

To check it's running, a few minutes later: `select status, return_message, start_time from
cron.job_run_details order by start_time desc limit 5;`, and Vercel's logs show
`/api/cron/outbound` every 5 minutes.

## 4. Payments (You)

- [ ] Paystack live keys (above), and the webhook URL `https://usetikka.com/api/paystack/webhook`.
- [ ] Pay for one small drop yourself and check it goes live and shows in `/admin` → Payments.

## 5. Legal (You and the lawyer)

- [ ] Until this section is done, keep `TIKKA_PRELAUNCH=1` on Vercel (section 2).
- [ ] Lawyer-checked text in `app/(site)/privacy/page.tsx` and `app/(site)/terms/page.tsx`. Fill
      every highlighted blank, remove the `LEGAL_PLACEHOLDER` comment and set `DRAFT` to false.
      The production build refuses to ship until both are done (unless `TIKKA_PRELAUNCH=1`).
- [ ] Then remove `TIKKA_PRELAUNCH` on Vercel and redeploy: claims and Notify me open to everyone.
- [ ] Ask whether rewards that differ from Tikka to Tikka need approval as a promotion (PRD C1).

## 6. Your admin account

Sign up with your own email, then in the Supabase SQL editor:

```sql
update public.profiles set is_admin = true
where user_id = (select id from auth.users where email = 'you@example.com');
```

## 7. Final checks (commands)

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:db
```

```bash
TIKKA_REQUIRE_LEGAL=1 pnpm build
```

```bash
pnpm test:concurrency
```

Then, on the live site with a real phone: set up a business, publish its free drop, claim it on
WhatsApp, redeem it at `/app/redeem`, leave a review from the thank-you message, and check the
card image arrived with the card. Delete that test business from `/admin` afterwards (suspend it,
or ask for it to be removed in SQL).

## 7b. Privacy requests

When someone asks what Tikka holds about them, or asks to be deleted (the privacy policy promises
both), go to `/admin` → Privacy requests, type their WhatsApp number and tap Find. To delete, tick
"This person asked us to delete their details" and tap Delete everything, then tell them it's done.
Each lookup and deletion is logged there with the number masked. Check it's really them first: ask
them to message Tikka's WhatsApp from that number.

## 8. Running the pilot on the free plan

- **Backups:** the free plan has none. Every week (and before any big change), run `pnpm backup`
  in Terminal and keep the file somewhere other than your laptop. One-time setup:
  `brew install libpq && brew link --force libpq`. It asks for the "Session pooler" connection
  string from Supabase → Connect, with your database password; nothing is saved.
- **Email:** set up your own email provider (section 1) before onboarding businesses; Supabase's
  built-in email sends only about 2 an hour.
- **Videos:** keep `NEXT_PUBLIC_TIKKA_VIDEOS=off`. Files are limited to 1 GB and about 5 GB served
  a month, and a few popular videos would use that up.
- **Pausing:** free projects pause after a week with no activity. The 5-minute schedule keeps it
  busy once the site is live; if it ever pauses, restore it from the Supabase dashboard.
- **Watch the usage:** Supabase → Project → Usage, weekly. Move to Pro when the database passes
  ~400 MB, files pass ~800 MB, or data served passes ~4 GB in a month, and in any case before the
  public launch.

## What's already in place

- Row-level security on every table; every security-definer function pins its search path;
  visitors can't write to any table directly (checked with a query over the whole schema).
- Secrets are only read in server-only code. Webhooks check Meta's and Paystack's signatures and
  refuse everything without them. Cron routes need `CRON_SECRET` in production.
- The demo business, the "Open the demo business" button, the test phone at `/dev/whatsapp` and
  the demo upload and claim routes are switched off in production.
