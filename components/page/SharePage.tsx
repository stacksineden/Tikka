"use client";

import { Check, Copy, Download, Share2 } from "lucide-react";
import { useState } from "react";

// "Tell your customers": a ready-made WhatsApp status and Instagram post for a business that now
// takes bookings (app/api/og/booking), plus the words to go with it. Business first: the post is
// about them and their link, never about Tikka (customers don't need to know what Tikka is).

export function SharePage({ slug, name, compact = false }: { slug: string; name: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState("");
  const link = `https://usetikka.com/${slug}`;
  const words = `We now take bookings! See our prices and pick a free time: ${link}`;
  const img = (f: "status" | "square", download = false) => `/api/og/booking?b=${encodeURIComponent(slug)}&f=${f}${download ? "&download=1" : ""}`;

  /** The phone's own share sheet with the picture (WhatsApp status, Instagram), else WhatsApp with the words. */
  async function share() {
    setProblem("");
    try {
      const blob = await (await fetch(img("status"))).blob();
      const file = new File([blob], `${slug}-bookings.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: words });
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(words)}`, "_blank", "noopener");
  }

  return (
    <section className="grid gap-3 rounded-card border border-line bg-surface-raised p-4">
      <div>
        <h2 className="text-title">Tell your customers</h2>
        <p className="text-caption mt-1 text-ink-muted">A ready-made status and post with your photo and link. Share it so people start booking.</p>
      </div>
      <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-[140px_1fr] sm:items-start"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img("status")} alt={`${name}: now taking bookings`} width={140} height={249} loading="lazy" className="w-[140px] justify-self-center rounded-md border border-line bg-surface-sunken" />
        <div className="grid gap-2">
          <button type="button" onClick={share} className="btn min-h-12 rounded-pill">
            <Share2 aria-hidden="true" /> Share to your status
          </button>
          <a href={img("status", true)} className="btn btn-secondary min-h-12 rounded-pill">
            <Download aria-hidden="true" /> Save the status picture
          </a>
          <a href={img("square", true)} className="btn btn-secondary min-h-12 rounded-pill">
            <Download aria-hidden="true" /> Save an Instagram post
          </a>
          <button
            type="button"
            onClick={() =>
              navigator.clipboard
                ?.writeText(words)
                .then(() => setCopied(true))
                .catch(() => setProblem("Couldn't copy. Press and hold the words below to copy them."))
            }
            className="btn btn-ghost min-h-12 rounded-pill"
          >
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copied ? "Words copied" : "Copy the words"}
          </button>
          <p className="text-caption rounded-md bg-surface-sunken px-3 py-2 text-ink-muted">{words}</p>
          {problem && (
            <p role="alert" className="text-caption text-danger">
              {problem}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
