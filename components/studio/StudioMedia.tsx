import { IMAGE_WIDTHS, imageAt, posterFor, videoAt } from "@/lib/studio-shared";
import { PlayVideo } from "./PlayVideo";

/**
 * A Studio image at the size the screen needs, straight from Cloudinary (auto format and quality),
 * so Vercel's image allowance isn't spent on it. Lazy unless it's in the first screen.
 */
export function StudioImage({
  src,
  alt,
  sizes,
  className = "",
  priority = false,
}: {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  const cloud = src.includes("res.cloudinary.com");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageAt(src, 720)}
      srcSet={cloud ? IMAGE_WIDTHS.map((w) => `${imageAt(src, w)} ${w}w`).join(", ") : undefined}
      sizes={cloud ? sizes : undefined}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={className}
    />
  );
}

/** A video: its poster only, and nothing more loads until it's tapped (preload="none"). */
export function StudioVideo({ src, alt, className = "", priority = false }: { src: string; alt: string; className?: string; priority?: boolean }) {
  return <PlayVideo src={videoAt(src)} poster={posterFor(src)} alt={alt} className={className} priority={priority} />;
}
