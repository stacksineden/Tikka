import { isSocial, socialHref } from "@/lib/social";
import type { ActionKind } from "@/lib/types";

// The card's action buttons: icons (inline SVG, as in design/card-reference), short labels and links.
// Shared by the claim page, the setup preview and the business page; safe on the server.

const stroke = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function ActionIcon({ kind }: { kind: ActionKind }) {
  switch (kind) {
    case "whatsapp":
      return (
        <svg {...stroke}>
          <path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.5z" />
        </svg>
      );
    case "call":
      return (
        <svg {...stroke}>
          <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
        </svg>
      );
    case "directions":
      return (
        <svg {...stroke}>
          <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
      );
    case "book":
      return (
        <svg {...stroke}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...stroke}>
          <rect x="4" y="4" width="16" height="16" rx="5" />
          <circle cx="12" cy="12" r="3.5" />
          <path d="M16.5 7.5h.01" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...stroke}>
          <path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5" />
          <path d="M14 4c.4 2.6 2.2 4.2 5 4.4" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...stroke}>
          <path d="M16 3.5h-2.5A3.5 3.5 0 0 0 10 7v3H7.5v3.5H10v7h3.5v-7H16l.5-3.5h-3V7.5a1 1 0 0 1 1-1H16z" />
        </svg>
      );
    case "x":
      return (
        <svg {...stroke}>
          <path d="M4.5 4h4l11 16h-4z" />
          <path d="M19.5 4l-6.2 7M10.7 13l-6.2 7" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...stroke}>
          <rect x="3" y="6" width="18" height="12" rx="4" />
          <path d="M10.5 9.5v5l4-2.5z" />
        </svg>
      );
    case "services":
      return (
        <svg {...stroke}>
          <path d="M9 6h11M9 12h11M9 18h11" />
          <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
        </svg>
      );
  }
}

export const ACTION_LABEL: Record<ActionKind, string> = {
  whatsapp: "Chat",
  call: "Call",
  directions: "Directions",
  book: "Book",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  x: "X",
  youtube: "YouTube",
  services: "Services",
};

export function actionHref(kind: ActionKind, value: string): string | undefined {
  switch (kind) {
    case "whatsapp":
      return `https://wa.me/${value.replace(/\D/g, "")}`;
    case "call":
      return `tel:${value}`;
    case "directions":
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`;
    case "instagram":
    case "tiktok":
    case "facebook":
    case "x":
    case "youtube":
      return isSocial(kind) ? socialHref(kind, value) : undefined;
    case "book":
      return value;
    case "services":
      return undefined;
  }
}
