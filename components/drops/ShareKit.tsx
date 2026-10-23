"use client";

import { Check, Copy, Download, QrCode, Share2 } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1800);
    } catch {}
  }
  return { copied, copy };
}

const noop = () => () => {};

/**
 * Link, native share, the counter poster, and the WhatsApp status and square images. The QR for
 * this drop alone is a small link (it stops working when the drop ends). Per-channel links live in
 * "By source".
 */
export function ShareKit({
  url,
  qrSvg,
  title,
  fileName,
  images,
  poster,
}: {
  url: string;
  qrSvg: string;
  title: string;
  fileName: string;
  images: { status: string; square: string };
  /** The business's permanent counter poster (PosterNudge): what to print, instead of this drop's QR. */
  poster?: ReactNode;
}) {
  const { copied, copy } = useCopy();
  const canShare = useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);

  async function share() {
    try {
      await navigator.share({ title, text: `${title}: claim a Tikka`, url });
    } catch {}
  }

  async function downloadPng() {
    const svg = new Blob([qrSvg], { type: "image/svg+xml" });
    const src = URL.createObjectURL(svg);
    const img = new Image();
    img.onload = () => {
      const size = 1024;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, size, size);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${fileName}-qr.png`;
      a.click();
      URL.revokeObjectURL(src);
    };
    img.src = src;
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <div className="flex min-w-0 items-center gap-2 rounded-md border border-line bg-surface-sunken py-1 pl-3 pr-1">
          <span className="text-code min-w-0 flex-1 truncate font-mono font-normal">{url.replace(/^https:\/\//, "")}</span>
          <button type="button" className="btn btn-secondary min-h-10 shrink-0 px-3 text-label" onClick={() => copy("main", url)}>
            {copied === "main" ? <Check /> : <Copy />}
            <span aria-live="polite">{copied === "main" ? "Copied" : "Copy"}</span>
          </button>
        </div>
        {canShare && (
          <button type="button" className="btn btn-lg w-full sm:w-auto" onClick={share}>
            <Share2 />
            Share link
          </button>
        )}
      </div>

      {poster}

      <div className="grid gap-4">
        <div className="grid gap-2">
          <h3 className="text-label">Images to post</h3>
          <p className="text-caption -mt-1 text-ink-muted">Your drop, ready for a WhatsApp status or an Instagram post. Put the link in the caption.</p>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["status", "WhatsApp status", images.status, "aspect-[9/16]"],
                ["square", "Square post", images.square, "aspect-square"],
              ] as const
            ).map(([key, label, src, ratio]) => (
              <a key={key} href={`${src}&download=1`} download className="group grid content-start gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`${label} image for ${title}`} loading="lazy" className={`${ratio} w-full rounded-md bg-night object-cover ring-1 ring-line`} />
                <span className="text-label inline-flex items-center gap-1.5 text-brand">
                  <Download size={16} aria-hidden="true" />
                  {label}
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-0.5 border-t border-line pt-3">
        <button type="button" className="text-label inline-flex min-h-11 items-center gap-2 justify-self-start text-brand hover:underline" onClick={downloadPng}>
          <QrCode size={18} aria-hidden="true" />
          QR for this drop only (for flyers)
        </button>
        <p className="text-caption text-ink-muted">It stops working when this drop ends. For your counter or door, print your poster instead.</p>
      </div>
    </div>
  );
}
