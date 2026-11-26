import { Camera, Clapperboard, Crown, Eye, Flower2, Hand, Scissors, Sparkles, UserRound, Video, type LucideIcon } from "lucide-react";
import type { TradeId } from "@/lib/presets";

/** One icon per trade, the same as the new setup's (components/start/StartFlow.tsx). */
export const TRADE_ICONS: Record<TradeId, LucideIcon> = {
  hair: Scissors,
  makeup: Sparkles,
  nails: Hand,
  lashes: Eye,
  barber: UserRound,
  spa: Flower2,
  gele: Crown,
  photo: Camera,
  video: Video,
  content: Clapperboard,
};
