"use client";

import { RotateCw } from "lucide-react";
import { useState } from "react";
import { SoloCard } from "@/components/tikka/SoloCard";
import type { CardFace } from "@/components/tikka/TikkaCard";

/** The live card on the night stage, flipping between front and a sample back. */
export function CardPreview({ face, prefix, compact = false }: { face: CardFace; prefix: string; compact?: boolean }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className={`stage flex flex-col items-center bg-night ${compact ? "gap-2 px-4 pb-3 pt-4" : "gap-4 rounded-card p-8"}`}>
      <div className={compact ? "card-preview-compact" : "card-preview-full"}>
        <SoloCard
          face={face}
          total={500}
          finish="foil"
          flipped={flipped}
          reveal={{ tier: "rare", reward: "20% off any service", code: `${prefix || "XX"}-7X4QP`, expiry: "31 Dec", serial: "0412", claimer: "Adaeze" }}
          label={`Preview of ${face.name || "your"} Tikka card${flipped ? ", back" : ""}`}
        />
      </div>
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="text-label inline-flex min-h-11 items-center gap-2 rounded-pill px-4 text-on-night hover:bg-night-raised"
        aria-pressed={flipped}
      >
        <RotateCw size={16} aria-hidden="true" />
        {flipped ? "Show the front" : "Flip to see the back"}
      </button>
    </div>
  );
}
