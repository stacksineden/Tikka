import type { ComponentProps } from "react";
import { TikkaCard } from "./TikkaCard";

/** A TikkaCard outside the claim stage, scaled with `zoom` (0.5 = 140×196).
 *  `flipped` shows the back without motion. */
export function SoloCard({
  zoom = 1,
  flipped = false,
  label,
  ...card
}: ComponentProps<typeof TikkaCard> & { zoom?: number; flipped?: boolean; label: string }) {
  return (
    <div
      data-theme="light"
      role="img"
      aria-label={label}
      className={`tk-solo shrink-0 ${flipped ? "is-flipped" : ""}`}
      style={{ zoom }}
    >
      <div aria-hidden="true">
        <TikkaCard {...card} />
      </div>
    </div>
  );
}
