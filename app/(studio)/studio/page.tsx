import { ArrowRight, Code2, Megaphone, MessageSquareText, Sparkles, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StudioWhatsApp } from "@/components/studio/StudioChrome";
import { StudioVideo } from "@/components/studio/StudioMedia";
import { WorkCard } from "@/components/studio/WorkCard";
import { allWork, caseStudies, clients, pieces, testimonials } from "@/lib/studio";
import { STUDIO_CATEGORIES, type StudioCategory, type WorkItem } from "@/lib/studio-shared";

const TITLE = "Tikka Studio · Tailor-made solutions for your business";
const DESCRIPTION = "We build the websites, WhatsApp systems and ads that bring customers in and keep them coming back.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: "Tikka", type: "website" },
};

/** What we do (PRD B11), copy as agreed. */
const SERVICES: { id: StudioCategory; Icon: typeof Code2; line: string }[] = [
  { id: "websites", Icon: Code2, line: "A proper website for your business, from a simple page to a full booking site." },
  { id: "whatsapp", Icon: MessageSquareText, line: "Instant replies, reminders and follow-ups, so no lead goes cold." },
  { id: "follow_up", Icon: Users, line: "Every new contact tracked from first message to repeat customer." },
  { id: "ads", Icon: Megaphone, line: "Ad creative, status images, reels and posts that make people stop and act." },
  { id: "drops", Icon: Sparkles, line: "We plan the offer, design the drop and launch it with you." },
];

const STEPS = [
  { title: "Talk", line: "Tell us about your business on WhatsApp. It starts with a free business audit." },
  { title: "Plan", line: "We agree what to build and quote once we understand your business." },
  { title: "Build", line: "We make it and check it with you at every step." },
  { title: "Run and report", line: "We launch it with you and show you what it brought in." },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-serial font-mono uppercase text-brand">{children}</p>;
}

function EnquiryButtons() {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <StudioWhatsApp className="btn btn-lg" />
      <Link href="/studio/contact" className="btn btn-lg btn-secondary">
        Send us your details
      </Link>
    </div>
  );
}

export default function StudioPage() {
  const cases = caseStudies();
  const all = pieces();
  const reel = all.find((p) => p.hero === "reel");
  const fan = all.filter((p) => p.hero === "fan").slice(0, 2);
  const featured: WorkItem[] = cases.filter((c) => c.featured).slice(0, 6).map((item) => ({ kind: "case", item }));
  const names = clients();
  const quotes = testimonials();
  const work = allWork();
  const related = (id: StudioCategory) => work.filter((w) => w.item.categories.includes(id)).slice(0, 3);

  return (
    <>
      {/* 1. Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-20 lg:pt-16">
        <div className="grid gap-5">
          <Eyebrow>Tikka Studio</Eyebrow>
          <h1 className="text-[40px] font-extrabold leading-[42px] tracking-[-0.03em] text-balance sm:text-display-xl">Tailor-made solutions for your business.</h1>
          <p className="text-body-lg max-w-xl text-ink-muted">We build the websites, WhatsApp systems and ads that bring customers in and keep them coming back.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <StudioWhatsApp className="btn btn-lg" />
            <Link href="/studio/work" className="btn btn-lg btn-secondary">
              See our work
            </Link>
          </div>
        </div>
        {reel && (
          <div className="relative mx-auto flex w-full max-w-md items-end justify-center gap-3" aria-label="Some of our ad work">
            {fan[0] && <StudioVideo src={fan[0].src} alt={fan[0].title} className="hidden aspect-[9/16] w-[30%] -rotate-3 rounded-card shadow-raised sm:block" />}
            <StudioVideo src={reel.src} alt={reel.title} priority className="aspect-[9/16] w-[62%] rounded-card shadow-raised sm:w-[40%]" />
            {fan[1] && <StudioVideo src={fan[1].src} alt={fan[1].title} className="hidden aspect-[9/16] w-[30%] rotate-3 rounded-card shadow-raised sm:block" />}
          </div>
        )}
      </section>

      {/* 2. Featured work */}
      {featured.length > 0 && (
        <section aria-labelledby="featured-h" className="bg-surface-sunken py-14 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="featured-h" className="text-heading">Featured work</h2>
              <Link href="/studio/work" className="text-label inline-flex min-h-11 items-center gap-1 text-brand">
                See all work <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((w) => (
                <WorkCard key={w.kind === "case" ? w.item.slug : w.item.key} work={w} />
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 3. What we do */}
      <section id="services" aria-labelledby="services-h" className="mx-auto grid max-w-6xl scroll-mt-20 gap-6 px-4 py-14 sm:px-6 sm:py-20">
        <h2 id="services-h" className="text-heading">What we do</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map(({ id, Icon, line }) => (
            <li key={id}>
              <a href={`#${id}`} className="grid h-full gap-3 rounded-card border border-line bg-surface-raised p-5 hover:border-brand">
                <span className="grid size-11 place-items-center rounded-md bg-brand-soft text-brand">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <h3 className="text-title">{STUDIO_CATEGORIES.find((c) => c.id === id)?.label}</h3>
                <p className="text-body text-ink-muted">{line}</p>
              </a>
            </li>
          ))}
        </ul>

        {/* Each service in more detail, with the work that shows it. */}
        <div className="mt-6 grid gap-12">
          {SERVICES.map(({ id, line }) => {
            const label = STUDIO_CATEGORIES.find((c) => c.id === id)?.label;
            const items = related(id);
            return (
              <section key={id} id={id} aria-labelledby={`${id}-h`} className="grid scroll-mt-20 gap-4 border-t border-line pt-8">
                <div className="grid gap-1">
                  <h3 id={`${id}-h`} className="text-title">{label}</h3>
                  <p className="text-body max-w-2xl text-ink-muted">{line}</p>
                </div>
                {items.length > 0 ? (
                  <>
                    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((w) => (
                        <WorkCard key={w.kind === "case" ? w.item.slug : w.item.key} work={w} />
                      ))}
                    </ul>
                    <Link href={`/studio/work?category=${id}`} className="text-label inline-flex min-h-11 items-center gap-1 justify-self-start text-brand">
                      More {label?.toLowerCase()} <ArrowRight size={18} aria-hidden="true" />
                    </Link>
                  </>
                ) : (
                  <p className="text-body text-ink-muted">
                    Ask us about this on WhatsApp, and we&apos;ll show you how it would work for your business.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      </section>

      {/* 4. How we work */}
      <section id="how-we-work" aria-labelledby="how-h" className="scroll-mt-20 bg-surface-sunken py-14 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6">
          <h2 id="how-h" className="text-heading">How we work</h2>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid content-start gap-2 rounded-card border border-line bg-surface-raised p-5">
                <span className="text-serial font-mono text-brand">Step {i + 1}</span>
                <h3 className="text-title">{s.title}</h3>
                <p className="text-body text-ink-muted">{s.line}</p>
              </li>
            ))}
          </ol>
          <p className="text-body max-w-2xl">Today our Studio team plans drops by hand. Spark will bring that know-how to every Tikka dashboard.</p>
        </div>
      </section>

      {/* 5. Clients and testimonials: each part only when there's something to show. */}
      {(names.length > 0 || quotes.length > 0) && (
        <section aria-labelledby="clients-h" className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:px-6 sm:py-20">
          <h2 id="clients-h" className="text-heading">Businesses we&apos;ve worked with</h2>
          {names.length > 0 && (
            <ul className="flex flex-wrap gap-x-8 gap-y-3" aria-label="Clients">
              {names.map((n) => (
                <li key={n} className="text-title text-ink-muted">
                  {n}
                </li>
              ))}
            </ul>
          )}
          {quotes.length > 0 && (
            <ul className="grid gap-4 md:grid-cols-2">
              {quotes.map((t) => (
                <li key={t.id}>
                  <figure className="grid h-full gap-4 rounded-card border border-line bg-surface-raised p-6">
                    <blockquote className="text-body-lg">&ldquo;{t.quote}&rdquo;</blockquote>
                    <figcaption className="text-body text-ink-muted">
                      <span className="font-semibold text-ink">{t.name}</span>
                      {t.role ? `, ${t.role}` : ""}, {t.business}
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 6. Close */}
      <section aria-labelledby="close-h" className="bg-surface-sunken py-14 sm:py-20">
        <div className="mx-auto grid max-w-3xl justify-items-start gap-5 px-4 sm:px-6">
          <h2 id="close-h" className="text-heading">Tell us what your business needs.</h2>
          <EnquiryButtons />
          <p className="text-body text-ink-muted">
            Prefer to do it yourself?{" "}
            <Link href="/sign-up" className="font-semibold text-brand underline">
              Start free on Tikka.
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
