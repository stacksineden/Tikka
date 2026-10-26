"use client";

import { Play } from "lucide-react";
import { useState } from "react";

/** Shows the poster; the video loads and plays only after a tap, then has its own controls. */
export function PlayVideo({ src, poster, alt, className = "", priority = false }: { src: string; poster: string; alt: string; className?: string; priority?: boolean }) {
  const [playing, setPlaying] = useState(false);
  if (playing) {
    return <video src={src} poster={poster} className={className} controls autoPlay playsInline preload="none" aria-label={alt} />;
  }
  return (
    <button type="button" onClick={() => setPlaying(true)} className={`group relative block overflow-hidden ${className}`} aria-label={`Play: ${alt}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={poster} alt="" loading={priority ? "eager" : "lazy"} decoding="async" className="size-full object-cover" />
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid size-14 place-items-center rounded-pill bg-night/70 text-on-night transition-transform group-hover:scale-105">
          <Play size={24} className="translate-x-0.5" fill="currentColor" aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}
