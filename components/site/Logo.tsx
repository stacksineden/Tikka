import Image from "next/image";

/** The Tikka lockup for theme-following grounds: ink on light, reversed on dark.
 *  Both are rendered; CSS in globals.css shows the one that matches the theme.
 *  On the night stage (always dark), use tikka-lockup-reversed.svg directly. */
export function Logo({ height = 28, priority = false }: { height?: number; priority?: boolean }) {
  const width = Math.round((height * 218) / 64);
  return (
    <>
      <Image className="logo-on-light" src="/brand/tikka-lockup.svg" alt="Tikka" width={width} height={height} priority={priority} />
      <Image className="logo-on-dark" src="/brand/tikka-lockup-reversed.svg" alt="Tikka" width={width} height={height} priority={priority} />
    </>
  );
}
