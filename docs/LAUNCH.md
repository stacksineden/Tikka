# Launch checklist

What has to happen before the first real claim (the pilot), in order. Items marked **You** need
your accounts, money or signature; the rest are commands or checks. Tick them off here.

## 1. Accounts and plans (You)

- [ ] **Supabase:** move the project to a paid plan (backups, no pausing). Note its region: the
      privacy policy names it.
- [ ] **Domain:** point `usetikka.com` at Vercel.
- [ ] **Vercel:** create the project from this repo. Node 22 (Supabase's library warns on 20).
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
| `CRON_SECRET` | any long random string. **Required:** in production the cron routes refuse to run without it |
| `PAYSTACK_SECRET_KEY`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Paystack → Settings → API Keys (live) |
| `NEXT_PUBLIC_TIKKA_WHATSAPP` | Tikka's WhatsApp number, `+234…` |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` | Meta app → WhatsApp → API Setup; App Settings → Basic |
| `WHATSAPP_VERIFY_TOKEN` | any random string; the same one goes into Meta's webhook settings |
| `OG_SIGNING_SECRET` | optional; a long random string for card image links |

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

## 4. Payments (You)

- [ ] Paystack live keys (above), and the webhook URL `https://usetikka.com/api/paystack/webhook`.
- [ ] Pay for one small drop yourself and check it goes live and shows in `/admin` → Payments.

## 5. Legal (You and the lawyer)

- [ ] Lawyer-checked text in `app/(site)/privacy/page.tsx` and `app/(site)/terms/page.tsx`. Fill
      every highlighted blank, remove the `LEGAL_PLACEHOLDER` comment and set `DRAFT` to false.
      The production build refuses to ship until both are done.
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

## What's already in place

- Row-level security on every table; every security-definer function pins its search path;
  visitors can't write to any table directly (checked with a query over the whole schema).
- Secrets are only read in server-only code. Webhooks check Meta's and Paystack's signatures and
  refuse everything without them. Cron routes need `CRON_SECRET` in production.
- The demo business, the "Open the demo business" button, the test phone at `/dev/whatsapp` and
  the demo upload and claim routes are switched off in production.
