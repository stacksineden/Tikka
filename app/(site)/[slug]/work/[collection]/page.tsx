import "@/components/business/site.css";
import type { Metadata } from "next";
import { ArrowLeft, CalendarDays } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { redirectIfMoved } from "@/lib/moved";
import { Suspense } from "react";
import { bizSerif } from "@/components/business/fonts";
import { Gallery } from "@/components/business/Gallery";
import { PhotoCollection } from "@/components/business/photo/PhotoCollection";
import { ShareButton } from "@/components/business/ShareButton";
import { Logo } from "@/components/site/Logo";
import { getBusinessBySlug } from "@/lib/data";
import { place } from "@/lib/format";
import { pageStyle, priceText, showsLocation, whereLine } from "@/lib/page";
import { collectionBookingLink, collectionLine, portfolioView } from "@/lib/portfolio";
import { SITE } from "@/lib/qr";
import { LoadingGrid } from "@/components/ui/Loading";
import { hasPlus } from "@/lib/plus";

// One portfolio collection on its own page (PRD A5): usetikka.com/<business>/work/<collection>.
// The link a business shares to show only that work ("our bridal looks"), with a Book button for
// the service it's tied to. It stays up when collections are locked; only editing stops.

type Props = PageProps<"/[slug]/work/[collection]">;

async function find(params: Props["params"]) {
  const { slug, collection } = await params;
  const found = await getBusinessBySlug(slug);
  if (!found) return null;
  const b = found.business;
  const all = portfolioView(b).collections;
  const c = all.find((x) => x.slug === collection.toLowerCase());
  return c ? { b, c, others: all.filter((x) => x.id !== c.id) } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await find(params);
  if (!found) return { title: "Page not found" };
  const { b, c } = found;
  const title = `${c.name} · ${b.name} · Tikka`;
  const description = `${c.name} by ${b.name}, ${showsLocation(b) ? place(b.area, b.city) : whereLine(b)}. ${collectionLine(c)}.`;
  const url = `${SITE}/${b.slug}/work/${c.slug}`;
  const image = c.cover.kind === "video" ? c.cover.thumbUrl : c.cover.url;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", images: [image] },
    robots: { index: true, follow: true },
  };
}

async function CollectionPage({ params }: { params: Props["params"] }) {
  const found = await find(params);
  if (!found) {
    const { slug, collection } = await params;
    await redirectIfMoved(slug, (to) => `/${to}/work/${encodeURIComponent(collection)}`);
    notFound();
  }
  const { b, c, others } = found;
  // The owner's own booking link wins, as on the business page; else WhatsApp with this collection named.
  const book = b.actions.find((a) => a.kind === "book")?.value.trim() || collectionBookingLink(b, c);
  const bookLabel = c.service ? `Book ${c.service.name}` : "Book on WhatsApp";
  const style = { "--biz": b.brandColor, "--on-biz": b.onBrandColor } as React.CSSProperties;
  const url = `${SITE}/${b.slug}/work/${c.slug}`;
  // Collection pages: the gallery for photographers' styles, the editorial page for the rest.
  if (["photography", "portfolio", "film"].includes(pageStyle(b))) {
    return (
      <div className={bizSerif.variable}>
        <PhotoCollection b={b} c={c} others={others} book={book} bookLabel={bookLabel} url={url} where={showsLocation(b) ? place(b.area, b.city) : whereLine(b)} />
      </div>
    );
  }

  return (
    <div data-theme="light" className={`biz ${bizSerif.variable}`} style={style}>
      <header className="px-4 pt-5 sm:px-8 sm:pt-8">
        <div className="mx-auto max-w-7xl">
          <Link href={`/${b.slug}#work`} className="inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-ink">
            <ArrowLeft size={18} aria-hidden="true" />
            {b.name}
          </Link>
        </div>
      </header>

      <section className="px-4 pb-16 pt-8 sm:px-8 sm:pb-24 sm:pt-12" aria-labelledby="coll-h">
        <div className="mx-auto max-w-7xl">
          <p className="biz-label">
            <span className="biz-label-rule" aria-hidden="true" />
            Our work
          </p>
          <h1 id="coll-h" className="biz-display mt-4 text-[clamp(44px,9vw,120px)]">
            {c.name}
          </h1>
          <p className="mt-3 text-[15px] text-ink-muted">
            {c.photos.length} {c.photos.length === 1 ? "photo" : "photos"} · {showsLocation(b) ? place(b.area, b.city) : whereLine(b)}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3 border-y py-4" style={{ borderColor: "var(--biz-rule)" }}>
            {c.service && (
              <p className="mr-auto min-w-0 text-[15px]">
                <span className="font-semibold">{c.service.name}</span>
                <span className="text-ink-muted"> · {priceText(c.service)}</span>
              </p>
            )}
            {/* Phones book from the bar pinned to the bottom. */}
            {book && (
              <span className="hidden sm:block">
                <a href={book} target="_blank" rel="noopener noreferrer" className="biz-btn bg-ink text-surface-raised">
                  <CalendarDays size={18} aria-hidden="true" />
                  {bookLabel}
                </a>
              </span>
            )}
            <ShareButton url={url} title={`${c.name} · ${b.name}`} className="biz-btn border border-ink bg-transparent text-ink" />
          </div>

          <div className="mt-8">
            <Gallery photos={c.photos} businessName={b.name} editorial showAll />
          </div>

          {others.length > 0 && (
            <nav aria-label="More collections" className="mt-16">
              <p className="biz-label">
                <span className="biz-label-rule" aria-hidden="true" />
                More from {b.name}
              </p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {others.map((o) => (
                  <li key={o.id}>
                    <Link href={`/${b.slug}/work/${o.slug}`} className="biz-btn border border-ink bg-transparent text-ink">
                      {o.name}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href={`/${b.slug}`} className="biz-btn bg-transparent text-ink underline">
                    See the full page
                  </Link>
                </li>
              </ul>
            </nav>
          )}
        </div>
      </section>

      <footer className="px-4 pb-28 pt-8 sm:px-8 sm:pb-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <p className="text-caption text-ink-muted">
            © {b.name} · {showsLocation(b) ? place(b.area, b.city) : whereLine(b)}
          </p>
          {!hasPlus(b) && (
            <Link href="/" className="text-caption flex items-center gap-2 text-ink-muted hover:text-ink">
              Made with
              <Logo height={18} />
              <span>· Get a free page for your business</span>
            </Link>
          )}
        </div>
      </footer>

      {/* Phones: booking stays one tap away. */}
      {book && (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-surface-raised/95 px-4 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 backdrop-blur sm:hidden">
          <a href={book} target="_blank" rel="noopener noreferrer" className="biz-btn w-full bg-ink text-surface-raised">
            <CalendarDays size={18} aria-hidden="true" />
            {bookLabel}
          </a>
        </div>
      )}
    </div>
  );
}

export default function Page(props: Props) {
  return (
    <main className="min-h-dvh bg-surface-raised">
      <Suspense fallback={<LoadingGrid className="mx-auto max-w-5xl px-4 py-8" />}>
        <CollectionPage params={props.params} />
      </Suspense>
    </main>
  );
}
