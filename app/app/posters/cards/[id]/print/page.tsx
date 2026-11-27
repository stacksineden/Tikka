import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CardFace } from "@/components/contact-cards/CardFace";
import { FitSheet, PrintBar } from "@/components/posters/PrintTools";
import { getBookingSetup } from "@/lib/bookings-data";
import { CARD_BLEED_MM, CARD_MM, cardQrColors, contactScanPath } from "@/lib/contact-cards";
import { getContactCard } from "@/lib/contact-cards-data";
import { qrSvg, SITE } from "@/lib/qr";
import { getOwnerUser } from "@/lib/session";
import { LoadingGrid } from "@/components/ui/Loading";

// The business card print kit (docs/BUSINESS_CARDS.md). Like the poster kit: a page at the exact
// paper size, so the browser's "Save as PDF" is print-ready.
// - For a printer: front and back on two pages, each card with 3 mm bleed and crop marks around it.
// - A4 sheet: 10 cards per page (2 × 5, edge to edge), fronts on page 1 and backs on page 2 with
//   the columns swapped, so they line up when printed two-sided and flipped on the long edge.

export const metadata: Metadata = { title: "Print your cards", robots: { index: false } };

const FORMATS = {
  printer: { label: "For a printer" },
  sheet: { label: "A4 sheet, 10 cards" },
} as const;
type Format = keyof typeof FORMATS;

/** Room around the bleed for crop marks on the printer's pages. */
const SLUG_MM = 8;
const A4 = { w: 210, h: 297 };
const MARK = "0.25mm";

function Mark({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return <span aria-hidden="true" style={{ position: "absolute", left: `${x}mm`, top: `${y}mm`, width: w ? `${w}mm` : MARK, height: h ? `${h}mm` : MARK, background: "var(--ink)" }} />;
}

async function Kit({ params, searchParams }: PageProps<"/app/posters/cards/[id]/print">) {
  const user = await getOwnerUser();
  if (!user) redirect("/app/redeem");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [found, setup] = await Promise.all([getContactCard(user, id), getBookingSetup(user)]);
  if (!found) notFound();
  const { business: b, card } = found;
  const format: Format = sp.format === "sheet" ? "sheet" : "printer";
  const bookingsOn = !!setup?.enabled;
  const qr = await qrSvg(`${SITE}${contactScanPath(card.code)}`, cardQrColors(b));

  const formats = (Object.keys(FORMATS) as Format[]).map((k) => ({ id: k, label: FORMATS[k].label, href: `/app/posters/cards/${card.id}/print?format=${k}` }));
  const back = "/app/posters/cards";

  if (format === "printer") {
    const page = { w: CARD_MM.w + 2 * SLUG_MM, h: CARD_MM.h + 2 * SLUG_MM };
    const inset = SLUG_MM - CARD_BLEED_MM;
    const trim = { x0: SLUG_MM, x1: SLUG_MM + CARD_MM.w, y0: SLUG_MM, y1: SLUG_MM + CARD_MM.h };
    const len = inset - 1; // marks stop 1 mm short of the bleed
    const marks = (
      <>
        {[trim.x0, trim.x1].map((x) => (
          <span key={`v${x}`}>
            <Mark x={x} y={0} w={0} h={len} />
            <Mark x={x} y={page.h - len} w={0} h={len} />
          </span>
        ))}
        {[trim.y0, trim.y1].map((y) => (
          <span key={`h${y}`}>
            <Mark x={0} y={y} w={len} h={0} />
            <Mark x={page.w - len} y={y} w={len} h={0} />
          </span>
        ))}
      </>
    );
    return (
      <>
        <style>{`@page { size: ${page.w}mm ${page.h}mm; margin: 0; } .print-sheet { break-after: page; } .print-sheet:last-child { break-after: auto; } @media screen { .print-sheet + .print-sheet { margin-top: 6mm; } }`}</style>
        <PrintBar
          back={back}
          backLabel="Back to business cards"
          current={format}
          formats={formats}
          tip={`For any printer: two pages (front, then back), 85 × 55 mm with 3 mm bleed and crop marks. Ask for 400–450gsm card, matte or soft-touch. Choose "Save as PDF", margins none, scale 100%, and turn on background graphics.`}
        />
        <div className="print-stage gap-4">
          <FitSheet widthMm={page.w}>
            {(["front", "back"] as const).map((side) => (
              <div key={side} data-theme="light" className="print-sheet" style={{ position: "relative", width: `${page.w}mm`, height: `${page.h}mm`, background: "white", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: `${inset}mm`, top: `${inset}mm` }}>
                  <CardFace b={b} card={card} side={side} qr={qr} bookingsOn={bookingsOn} bleed />
                </div>
                {marks}
              </div>
            ))}
          </FitSheet>
        </div>
      </>
    );
  }

  // A4 sheet: 2 × 5 cards edge to edge, centred, crop marks in the margins.
  const cols = 2;
  const rows = 5;
  const ox = (A4.w - cols * CARD_MM.w) / 2;
  const oy = (A4.h - rows * CARD_MM.h) / 2;
  const flat = { ...card, rounded: false };
  const xs = Array.from({ length: cols + 1 }, (_, i) => ox + i * CARD_MM.w);
  const ys = Array.from({ length: rows + 1 }, (_, i) => oy + i * CARD_MM.h);
  const sheetMarks = (
    <>
      {xs.map((x) => (
        <span key={`v${x}`}>
          <Mark x={x} y={oy - 9} w={0} h={7} />
          <Mark x={x} y={oy + rows * CARD_MM.h + 2} w={0} h={7} />
        </span>
      ))}
      {ys.map((y) => (
        <span key={`h${y}`}>
          <Mark x={ox - 14} y={y} w={12} h={0} />
          <Mark x={ox + cols * CARD_MM.w + 2} y={y} w={12} h={0} />
        </span>
      ))}
    </>
  );
  return (
    <>
      <style>{`@page { size: ${A4.w}mm ${A4.h}mm; margin: 0; } .print-sheet { break-after: page; } .print-sheet:last-child { break-after: auto; } @media screen { .print-sheet + .print-sheet { margin-top: 6mm; } }`}</style>
      <PrintBar
        back={back}
        backLabel="Back to business cards"
        current={format}
        formats={formats}
        tip={`A4, 10 cards. Print both pages two-sided on one sheet (flip on the long edge), then cut along the marks. Use thick paper (250gsm or more) if your printer takes it. Choose "Save as PDF" or print, margins none, scale 100%, background graphics on.`}
      />
      <div className="print-stage gap-4">
        <FitSheet widthMm={A4.w}>
          {(["front", "back"] as const).map((side) => (
            <div key={side} data-theme="light" className="print-sheet" style={{ position: "relative", width: `${A4.w}mm`, height: `${A4.h}mm`, background: "white", overflow: "hidden" }}>
              {Array.from({ length: rows * cols }, (_, i) => {
                const r = Math.floor(i / cols);
                // Backs swap columns so each lines up behind its front when flipped on the long edge.
                const c = side === "front" ? i % cols : cols - 1 - (i % cols);
                return (
                  <div key={i} style={{ position: "absolute", left: `${ox + c * CARD_MM.w}mm`, top: `${oy + r * CARD_MM.h}mm` }}>
                    <CardFace b={b} card={flat} side={side} qr={qr} bookingsOn={bookingsOn} />
                  </div>
                );
              })}
              {sheetMarks}
            </div>
          ))}
        </FitSheet>
      </div>
    </>
  );
}

export default function CardPrintPage(props: PageProps<"/app/posters/cards/[id]/print">) {
  return (
    <div className="min-h-dvh bg-surface-sunken">
      <Suspense fallback={<LoadingGrid tiles={2} />}>
        <Kit {...props} />
      </Suspense>
    </div>
  );
}
