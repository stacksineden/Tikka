// Switches set per deployment.

/**
 * Card and portfolio videos. Set NEXT_PUBLIC_TIKKA_VIDEOS=off on the free Supabase plan (1 GB of
 * files, ~5 GB served a month): owners can't add new videos, and videos already added still play
 * and can be removed. Photos are unaffected.
 */
export const VIDEO_UPLOADS = process.env.NEXT_PUBLIC_TIKKA_VIDEOS !== "off";
