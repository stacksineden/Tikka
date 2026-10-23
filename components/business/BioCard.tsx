import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { qrSvg, SITE } from "@/lib/qr";
import { ShareLink } from "./ShareLink";

/** "Put your page in your bio": the free business page link, copy, QR, and a way to look at it. */
export async function BioCard({ slug, name, title = "Put your page in your bio" }: { slug: string; name: string; title?: string }) {
  const url = `${SITE}/${slug}`;
  const qr = await qrSvg(`${url}?c=qr`);
  return (
    <section className="rounded-card border border-line bg-surface-raised p-4 sm:p-5" aria-labelledby="bio-h">
      <h2 id="bio-h" className="text-title text-[17px] leading-6">
        {title}
      </h2>
      <p className="text-body mt-1 text-ink-muted">Your free page shows your services, photos, reviews and live drop. Add it to your Instagram and WhatsApp bio.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
        <div
          className="mx-auto size-28 rounded-md bg-surface-raised p-1.5 ring-1 ring-line sm:mx-0 [&_svg]:size-full"
          role="img"
          aria-label={`QR code for ${name}'s page`}
          dangerouslySetInnerHTML={{ __html: qr }}
        />
        <div className="grid gap-2">
          <ShareLink url={url} title={name} />
          <Link href={`/${slug}`} target="_blank" className="text-label inline-flex min-h-11 items-center gap-1.5 text-brand">
            View your page
            <ExternalLink size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
