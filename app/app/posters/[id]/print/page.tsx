import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PosterFace, StickerFace } from "@/components/posters/PosterFace";
import { FitSheet, PrintBar } from "@/components/posters/PrintTools";
import { getPosterForPrint } from "@/lib/data";
import { BLEED_MM, DEFAULT_HOOK, FORMATS, type PrintFormat } from "@/lib/posters";
import { qrSvg, SITE } from "@/lib/qr";
import { getOwnerUser } from "@/lib/session";

export const metadata: Metadata = { title: "Print kit", robots: { index: false } };

const A5 = { w: 148, h: 210 };

async function Sheet({ params, searchParams }: PageProps<"/app/posters/[id]/print">) {
  const user = await getOwnerUser();
  if (!user) redirect("/app/redeem");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const found = await getPosterForPrint(user, id);
  if (!found) notFound();
  const { business: b, poster } = found;
  const format: PrintFormat = typeof sp.format === "string" && sp.format in FORMATS ? (sp.format as PrintFormat) : "a4";
  const f = FORMATS[format];
  const page = { w: f.w + 2 * BLEED_MM, h: f.h + 2 * BLEED_MM };
  const qr = await qrSvg(`${SITE}/q/${poster.code}`);
  const hook = poster.hookLine ?? DEFAULT_HOOK;
  const face = <PosterFace b={b} code={poster.code} qr={qr} hook={hook} />;

  // The trim area sits 3 mm in from the page edge; the brand colour runs into the bleed.
  const trim = (child: React.ReactNode, at: { x: number; y: number }, zoom = 1) => (
    <div style={{ position: "absolute", left: `${at.x}mm`, top: `${at.y}mm`, zoom }}>{child}</div>
  );

  return (
    <>
      {/* The browser's PDF uses this exact paper size, so "Save as PDF" is print-ready with bleed. */}
      <style>{`@page { size: ${page.w}mm ${page.h}mm; margin: 0; }`}</style>
      <PrintBar
        back="/app/posters"
        current={format}
        formats={(Object.keys(FORMATS) as PrintFormat[]).map((k) => ({ id: k, label: FORMATS[k].label, href: `/app/posters/${poster.id}/print?format=${k}` }))}
        tip={`${f.label}: ${f.w} × ${f.h} mm with 3 mm bleed (${page.w} × ${page.h} mm). Choose "Save as PDF", margins none, scale 100%, and turn on background graphics.${format === "tent" ? " Fold down the middle and stand it up." : ""}`}
      />
      <div className="print-stage">
        <FitSheet widthMm={page.w}>
          <div
            data-theme="light"
            className="print-sheet"
            style={{ position: "relative", width: `${page.w}mm`, height: `${page.h}mm`, background: b.brandColor, overflow: "hidden", borderRadius: format === "sticker" ? "6mm" : 0 }}
          >
            {format === "a4" && trim(face, { x: BLEED_MM, y: BLEED_MM }, f.h / A5.h)}
            {format === "a5" && trim(face, { x: BLEED_MM, y: BLEED_MM })}
            {format === "tent" && (
              <>
                {trim(face, { x: BLEED_MM, y: BLEED_MM }, f.h / A5.h)}
                {trim(face, { x: BLEED_MM + f.w / 2, y: BLEED_MM }, f.h / A5.h)}
                {/* Fold marks, in the bleed only. */}
                {[0, page.h - 2].map((y) => (
                  <span key={y} style={{ position: "absolute", left: `${page.w / 2}mm`, top: `${y}mm`, width: "0.3mm", height: "2mm", background: b.onBrandColor }} />
                ))}
              </>
            )}
            {format === "sticker" && trim(<StickerFace b={b} code={poster.code} qr={qr} />, { x: BLEED_MM, y: BLEED_MM })}
          </div>
        </FitSheet>
      </div>
    </>
  );
}

export default function PrintPage(props: PageProps<"/app/posters/[id]/print">) {
  return (
    <div className="min-h-dvh bg-surface-sunken">
      <Suspense fallback={<div className="h-96" />}>
        <Sheet {...props} />
      </Suspense>
    </div>
  );
}
