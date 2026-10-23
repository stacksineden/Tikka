import type { Metadata } from "next";
import { Printer, QrCode } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PosterFace } from "@/components/posters/PosterFace";
import { AddPoster, HookLine } from "@/components/posters/PosterForms";
import { bestRewardNow, getBusiness, getPosters } from "@/lib/data";
import { count } from "@/lib/format";
import { DEFAULT_HOOK, FORMATS, rewardHook, spacedCode, type PrintFormat } from "@/lib/posters";
import { qrSvg, SITE } from "@/lib/qr";
import { getOwnerUser } from "@/lib/session";

export const metadata: Metadata = { title: "Posters" };

async function Posters() {
  const user = await getOwnerUser();
  if (!user) redirect("/app/redeem");
  const [b, posters, best] = await Promise.all([getBusiness(user), getPosters(user), bestRewardNow(user)]);
  if (!b) redirect("/app/setup");
  const qrs = await Promise.all(posters.map((p) => qrSvg(`${SITE}/q/${p.code}`)));
  const suggestion = rewardHook(best);

  return (
    <div className="grid gap-5">
      {posters.map((p, i) => (
        <section key={p.id} className="grid gap-4 rounded-card border border-line bg-surface-raised p-4 sm:p-6 lg:grid-cols-[minmax(0,260px)_1fr]" aria-labelledby={`p-${p.id}`}>
          {/* A real preview of the A5 face, scaled down. */}
          <div className="mx-auto overflow-hidden rounded-md shadow-raised" style={{ width: "calc(148mm * 0.45)", height: "calc(210mm * 0.45)" }} aria-hidden="true">
            <div data-theme="light" style={{ zoom: 0.45 }}>
              <PosterFace b={b} code={p.code} qr={qrs[i]} hook={p.hookLine ?? DEFAULT_HOOK} />
            </div>
          </div>
          <div className="grid content-start gap-4">
            <div>
              <h2 id={`p-${p.id}`} className="text-title flex items-center gap-2">
                <QrCode size={20} className="text-brand" aria-hidden="true" />
                {p.label}
              </h2>
              <p className="text-body mt-1 text-ink-muted">
                Code <span className="font-mono font-bold text-ink">{spacedCode(p.code)}</span> · usetikka.com/q/{p.code}
              </p>
              <p className="text-caption mt-1 text-ink-muted">
                {count(p.scans)} scan{p.scans === 1 ? "" : "s"} · {count(p.claims)} claim{p.claims === 1 ? "" : "s"}. It always opens your live drop, or your page when nothing is live.
              </p>
            </div>
            <HookLine posterId={p.id} hook={p.hookLine} suggestion={suggestion} />
            <div className="grid gap-2">
              <span className="text-label">Print</span>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {(Object.keys(FORMATS) as PrintFormat[]).map((k) => (
                  <Link key={k} href={`/app/posters/${p.id}/print?format=${k}`} className="btn btn-secondary min-h-11 px-3 text-label">
                    <Printer />
                    {FORMATS[k].label.replace(/ \(.*\)$/, "")}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      ))}
      <AddPoster />
    </div>
  );
}

export default function PostersPage() {
  return (
    <div className="mx-auto grid max-w-5xl gap-5 px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-8">
      <div>
        <h1 className="text-heading">Posters</h1>
        <p className="text-body mt-1 text-ink-muted">Print once, keep up for good. People scan it and see whatever you&apos;re running.</p>
      </div>
      <Suspense fallback={<div className="h-96 rounded-card bg-surface-sunken" />}>
        <Posters />
      </Suspense>
    </div>
  );
}
