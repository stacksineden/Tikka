# Drop templates

The ready-made offers on screen 2 of the drop builder ("Pick an offer"). This file is the source of truth: once it's approved, a seed script upserts these into `drop_templates` by ID, so you can edit this file and rerun the seed.

**36 templates:**
- Beauty & hair and Spa & wellness have 3 per goal (9 each).
- Fitness, Food & drinks, Fashion, Health & clinics, Education and Other services have 1 per goal (3 each).

## How every template works

- **Shares, by the drop's size** (docs/REVENUE_PLAN.md item 4; the column headers below show the large-drop shares):

  | Drop size | Legendary · very few | Rare · some | Thank-you · everyone else |
  |---|---|---|---|
  | Up to 100 | 4% | 16% | 80% |
  | 101–300 | 3% | 12% | 85% |
  | Over 300 | 2% | 10% | 88% |

  - At least 1 Legendary and 1 Rare whenever the size allows. The owner can still change the counts.
  - On a 40 drop that's 2 Legendary, 6 Rare and 32 Thank-you; on 200, 6 Legendary, 24 Rare and 170 Thank-you.
- **Rare and Legendary need a purchase** (a % or ₦ off, a minimum spend, or a free extra with a paid service), or are a taste of the main service.
  - Only a Legendary (2%) may be a free full service with no purchase. Those are marked **no purchase**.
- **Thank-you always names a real small benefit.** Nobody leaves with nothing.
- **"Any service"** is replaced in the builder by the business's own service names and prices where it helps (for example, "Free wash & style" becomes "Free knotless braids (shoulder length)"). The owner can change every amount.
- **Bounce-back:** the "next visit" Tikka sent after someone redeems. It's on by default and can be turned off. It lasts 30 days unless the table says otherwise.
- **Tikka lasts:** days after it's claimed (7, 14 or 30), even past the drop's end.
- **Quiet days:** codes only work on the listed days. The owner can change the days.
- **Business category → template category:**

  | Business category | Template category |
  | --- | --- |
  | Beauty | Beauty & hair |
  | Wellness | Spa & wellness |
  | Health | Health & clinics |
  | Education | Education |
  | Fitness | Fitness |
  | Food & drinks | Food & drinks |
  | Fashion | Fashion |
  | Events, Services | Other services |

---

## Beauty & hair (`beauty_hair`)

| ID | Goal | Name | Why it works | Legendary · 2% | Rare · 10% | Thank-you · 88% | Bounce-back | Tikka lasts | Days |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `beauty-new-1` | New customers | First visit treat | A sure discount gets first-timers in; a free style gets people talking. | Free wash & style (no purchase) | ₦3,000 off any service over ₦10,000 | Free hair wash with any service | 10% off your next visit | 14 | — |
| `beauty-new-2` | New customers | Try us for less | Simple percentages everyone understands, with a big one worth sharing. | 50% off any service | 25% off any service | Free nail polish change with any service | ₦2,000 off your next visit over ₦8,000 | 14 | — |
| `beauty-new-3` | New customers | Free extra on your first visit | People pay for the service they came for and leave with more than they expected. | Free pedicure with any service over ₦15,000 | Free deep-conditioning treatment with any styling | Free hair wash or nail polish with any service | 10% off your next visit | 14 | — |
| `beauty-back-1` | Bring customers back | We miss you | Reminds past clients you're here, with a treat for everyone who comes. | A second service free (up to ₦10,000) with any service over ₦10,000 | 20% off any service | Free scalp massage with any service | 10% off your next visit | 14 | — |
| `beauty-back-2` | Bring customers back | Loyal client treat | Rewards your regulars and nudges them towards a bigger booking. | 40% off any service over ₦20,000 | Free deep-conditioning treatment with any service | Free scalp massage or polish change with any service | 10% off your next visit | 14 | — |
| `beauty-back-3` | Bring customers back | Bring a friend | Every returning client brings someone new with them. | Free service for your friend (up to ₦10,000) when you book any service | 25% off for you and a friend | Free wash for you and a friend when you both book a service | ₦2,000 off your next visit over ₦8,000 | 14 | — |
| `beauty-quiet-1` | Fill quiet days | Midweek glow | Fills your slowest days with people who'd otherwise come at the weekend. | Free wash & style (no purchase) | 30% off any service | Free hair treatment with any service | 10% off your next visit | 14 | Mon–Wed |
| `beauty-quiet-2` | Fill quiet days | Quiet-day pamper | An extra on slow days costs you little and fills empty chairs. | Free manicure with any service over ₦15,000 | ₦5,000 off any service over ₦20,000 | Free hair wash or nail polish with any service | 10% off your next visit | 14 | Mon–Thu |
| `beauty-quiet-3` | Fill quiet days | Weekday special | A straight discount, only on the days you need it. | 50% off any service | 20% off any service | Free polish change with any service | 10% off your next visit | 14 | Tue–Thu |

## Photography (`photography`)

For photographers and photo studios. A shoot takes the photographer's time, so the extras are mostly time-light: extra edited photos, a backdrop change, rush delivery.

| ID | Goal | Name | Why it works | Legendary · 2% | Rare · 10% | Thank-you · 88% | Bounce-back | Tikka lasts | Days |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `photo-new-1` | New customers | First shoot treat | A sure saving gets first-timers to book; a free mini shoot gets people talking. | Free 30-minute mini shoot (no purchase) | ₦10,000 off any shoot over ₦40,000 | 2 extra edited photos with any shoot | 10% off your next shoot | 14 | — |
| `photo-new-2` | New customers | Try our studio | A big saving for a few, and a little extra on every first shoot. | 50% off any studio session | 20% off any shoot | Free backdrop change with any shoot | ₦5,000 off your next shoot over ₦30,000 | 14 | — |
| `photo-back-1` | Bring customers back | Back in front of the camera | Past clients come back for their next birthday, anniversary or family photo. | Free extra outfit change with any shoot | 25% off any shoot | 3 extra edited photos with any shoot | 10% off your next shoot | 14 | — |
| `photo-back-2` | Bring customers back | Bring a friend | Every returning client brings someone new to the studio. | Free shoot for your friend (up to ₦30,000) when you book a shoot | 20% off for you and a friend | Free group photo when you both book a shoot | 10% off your next shoot | 14 | — |
| `photo-quiet-1` | Fill quiet days | Weekday mini sessions | Short weekday sessions fill the days the studio sits empty. | Free 30-minute mini shoot (no purchase) | 30% off any weekday shoot | 2 extra edited photos with any shoot | 10% off your next shoot | 14 | Mon–Thu |
| `photo-quiet-2` | Fill quiet days | Midweek studio | Puts midweek studio time to work with extras that cost you little. | 50% off any studio session | Free rush delivery with any shoot | Free backdrop change with any shoot | 10% off your next shoot | 14 | Tue–Thu |

## Spa & wellness (`spa_wellness`)

| ID | Goal | Name | Why it works | Legendary · 2% | Rare · 10% | Thank-you · 88% | Bounce-back | Tikka lasts | Days |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `spa-new-1` | New customers | First massage | A free massage gets attention; everyone else gets a reason to book. | Free 60-minute massage (no purchase) | 30% off any massage | Free 10-minute foot or head massage with any treatment | 10% off your next visit | 14 | — |
| `spa-new-2` | New customers | Try a facial | Brings in massage clients and introduces them to another treatment. | Free facial with any massage | ₦5,000 off any treatment over ₦20,000 | Free 10-minute head massage with any treatment | 10% off your next visit | 14 | — |
| `spa-new-3` | New customers | Spa day for less | Makes your bigger packages feel within reach for first-timers. | 50% off any spa package | Free steam or sauna session with any treatment | Free foot soak with any treatment | ₦3,000 off your next visit over ₦15,000 | 14 | — |
| `spa-back-1` | Bring customers back | Welcome back | A thank-you to past clients that gets them booking again. | Free 30-minute massage with any treatment over ₦20,000 | 20% off any treatment | Free aromatherapy upgrade with any massage | 10% off your next visit | 14 | — |
| `spa-back-2` | Bring customers back | Couples treat | Each returning client brings a partner or friend. | Second massage free when you book a couples massage | 25% off a couples massage | Free aromatherapy upgrade with any massage | 10% off your next visit | 14 | — |
| `spa-back-3` | Bring customers back | Package taster | Turns one-off visitors into regulars with a package. | 40% off any 3-session package | Free body scrub with any massage | Free 10-minute foot massage with any treatment | 10% off your next visit | 14 | — |
| `spa-quiet-1` | Fill quiet days | Midweek unwind | Midweek is quiet for spas; this fills it. | Free 60-minute massage (no purchase) | 30% off any treatment | Free steam session with any treatment | 10% off your next visit | 14 | Mon–Wed |
| `spa-quiet-2` | Fill quiet days | Quiet-day upgrade | Longer treatments on slow days cost you little and feel generous. | Free upgrade from 60 to 90 minutes on any massage | Free foot massage with any treatment | Free steam session with any treatment | 10% off your next visit | 14 | Mon–Thu |
| `spa-quiet-3` | Fill quiet days | Weekday express | Short visits that fit around work, on your quietest days. | Free express facial with any massage | ₦4,000 off any treatment over ₦15,000 | Free herbal tea and foot soak with any treatment | 10% off your next visit | 14 | Tue–Thu |

## Fitness (`fitness`)

| ID | Goal | Name | Why it works | Legendary · 2% | Rare · 10% | Thank-you · 88% | Bounce-back | Tikka lasts | Days |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fitness-new-1` | New customers | Try us out | A free day lets people feel the place; a free month is worth sharing. | Free 1-month membership (no purchase) | 50% off your first month | Free day pass | 15% off any monthly plan | 14 | — |
| `fitness-back-1` | Bring customers back | Come back strong | Gets lapsed members back with a reason to sign up again. | 2 months for the price of 1 | Free personal training session with any monthly plan | Free class for a friend with any plan | 10% off your next plan | 14 | — |
| `fitness-quiet-1` | Fill quiet days | Off-peak training | Brings people in when the floor is empty. | Free personal training session (no purchase) | 30% off any class pack | Free class for a friend when you book a class | 10% off your next plan | 14 | Fri–Sun |

## Food & drinks (`food_drinks`)

| ID | Goal | Name | Why it works | Legendary · 2% | Rare · 10% | Thank-you · 88% | Bounce-back | Tikka lasts | Days |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `food-new-1` | New customers | First taste | Everyone gets something off their first order; a free meal gets shared. | Free meal for two, up to ₦15,000 (no purchase) | Free drink with any meal | Free soft drink with any meal | ₦1,000 off your next order over ₦5,000 | 7 | — |
| `food-back-1` | Bring customers back | Your table's waiting | A treat with the meal brings regulars back sooner. | 50% off your bill (up to ₦10,000) | Free dessert with any meal over ₦8,000 | Free soft drink with any meal | ₦1,000 off your next order over ₦5,000 | 7 | — |
| `food-quiet-1` | Fill quiet days | Slow-day feast | Fills tables on the days the kitchen is quiet. | Second meal free (up to ₦8,000) with any meal | 25% off your bill | Free side with any main | ₦1,000 off your next order over ₦5,000 | 7 | Mon–Wed |

## Fashion (`fashion`)

| ID | Goal | Name | Why it works | Legendary · 2% | Rare · 10% | Thank-you · 88% | Bounce-back | Tikka lasts | Days |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fashion-new-1` | New customers | First outfit | A useful extra on every first purchase; a big saving on a bigger order. | ₦20,000 off orders over ₦50,000 | 20% off any item | Free alterations on any purchase | 10% off your next purchase | 14 | — |
| `fashion-back-1` | Bring customers back | New season, old friends | Brings past buyers back to see what's new. | Free accessory (up to ₦10,000) with any outfit over ₦30,000 | 15% off any item | Free alterations on any purchase | 10% off your next purchase | 14 | — |
| `fashion-quiet-1` | Fill quiet days | Midweek style | Gets shoppers in on your slow days. | 40% off any one item | Free styling session with any purchase | Free gift wrapping on any purchase | 10% off your next purchase | 14 | Mon–Wed |

## Health & clinics (`health_clinics`)

| ID | Goal | Name | Why it works | Legendary · 2% | Rare · 10% | Thank-you · 88% | Bounce-back | Tikka lasts | Days |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `health-new-1` | New customers | First check-up | A quick free check gets people through the door who keep putting it off. | Free full check-up (no purchase) | 30% off any test or treatment | Free blood pressure and sugar check | 10% off your next visit | 14 | — |
| `health-back-1` | Bring customers back | Time for your check-up | Reminds past patients to come back before something goes wrong. | Free follow-up consultation with any treatment | 20% off any test or treatment | Free blood pressure check with any visit | 10% off your next visit | 14 | — |
| `health-quiet-1` | Fill quiet days | Midweek health day | Fills quieter clinic days with planned visits. | 50% off any check-up package | Free eye test with any treatment | Free sugar check with any consultation | 10% off your next visit | 14 | Tue–Thu |

## Education (`education`)

| ID | Goal | Name | Why it works | Legendary · 2% | Rare · 10% | Thank-you · 88% | Bounce-back | Tikka lasts | Days |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `education-new-1` | New customers | Try a class | A free class lets parents and students see how you teach. | Free first month of lessons (no purchase) | 30% off your first month | Free trial class | 10% off your next month | 14 | — |
| `education-back-1` | Bring customers back | Back to class | Brings past students back for the next term or level. | 50% off your next term | Free extra class with any monthly plan | Free study pack with any course | 10% off your next month | 14 | — |
| `education-quiet-1` | Fill quiet days | Weekday classes | Fills the class slots that usually sit empty. | Free one-on-one session (no purchase) | 25% off any class pack | Free extra class with any class pack | 10% off your next month | 14 | Mon–Wed |

## Other services (`other_services`)

For events, laundry, car wash, printing, repairs and other services.

| ID | Goal | Name | Why it works | Legendary · 2% | Rare · 10% | Thank-you · 88% | Bounce-back | Tikka lasts | Days |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `services-new-1` | New customers | First job on us (almost) | A sure discount on the first order; a free job for a very few gets people talking. | Free service up to ₦10,000 (no purchase) | 20% off any service over ₦10,000 | Free pickup or delivery with any order | 10% off your next order | 14 | — |
| `services-back-1` | Bring customers back | Good to see you again | Brings past customers back for their next job. | ₦10,000 off any job over ₦30,000 | 15% off any service | Free pickup or delivery with any order | 10% off your next order | 14 | — |
| `services-quiet-1` | Fill quiet days | Slow-day savings | Moves work onto the days you have time for it. | 50% off any service (up to ₦15,000) | 25% off any service | Free pickup or delivery with any order | 10% off your next order | 14 | Mon–Wed |

---

## Questions for your review

1. **Shares:** every template uses 2% / 10% / 88%. Should some vary? For example, Food & drinks at 5% Rare to keep costs down.
2. **Tikka lasts:** Food & drinks is 7 days and everything else is 14. Fitness and Education could be 30 days, but the drop check warns at 30.
3. **Fitness quiet days** are set to Fri–Sun, assuming gyms are busiest early in the week. The owner can change them.
4. **Health & clinics:** "Free full check-up" as a Legendary with no purchase. Is that fine for clinics and pharmacies, or should it be a discount?
