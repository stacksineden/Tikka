import type { CSSProperties } from "react";
import { xsOf } from "./media-path";

// Photos that arrive softly: the photo's box shows its tiny blurred copy (or its main colour) at
// once, and the photo sharpens in when it has fully loaded, instead of drawing itself in from the
// top. No wrapper and no JavaScript of its own: spread these props on the <img>; a few lines in the
// root layout mark it loaded (data-loaded) and globals.css does the rest (img[data-blur]).

/** Props for an <img>: its blurred copy behind it, and the marker. `style` is merged in. */
export function blurProps(url: string | undefined | null, opts: { tone?: string; style?: CSSProperties } = {}) {
  const xs = xsOf(url);
  return {
    "data-blur": "",
    suppressHydrationWarning: true,
    style: {
      ...(xs ? { backgroundImage: `url("${xs}")` } : {}),
      ...(opts.tone ? { backgroundColor: opts.tone } : {}),
      ...opts.style,
    } as CSSProperties,
  };
}

/**
 * For a box that already fades its own photo in (the gallery pages' .pg-ph): the blurred copy as the
 * box's background, under the photo, merged with the box's own style.
 */
export function blurBox(url: string | undefined | null, style: CSSProperties = {}): CSSProperties {
  const xs = xsOf(url);
  return xs ? { ...style, backgroundImage: `url("${xs}")`, backgroundSize: "cover", backgroundPosition: "center" } : style;
}

/**
 * Runs before the page's own code (next/script, beforeInteractive): marks a blurred photo loaded (or
 * failed) as soon as it is, and any that finished before it ran.
 */
export const BLUR_SCRIPT =
  "(function(){function k(t){if(t&&t.tagName==='IMG'&&t.hasAttribute('data-blur'))t.setAttribute('data-loaded','')}function m(e){k(e.target)}document.addEventListener('load',m,true);document.addEventListener('error',m,true);function s(){document.querySelectorAll('img[data-blur]').forEach(function(i){if(i.complete)k(i)})}s();document.addEventListener('DOMContentLoaded',s)})();";
