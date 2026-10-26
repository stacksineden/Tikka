import { StudioFooter, StudioHeader } from "@/components/studio/StudioChrome";

/** Tikka Studio (PRD B11): its own header and footer, Tikka's light layout. */
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-ink">
      <StudioHeader />
      <main className="flex-1">{children}</main>
      <StudioFooter />
    </div>
  );
}
