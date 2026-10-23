import "@/components/tikka/tikka.css";

// The claim side of Tikka: always on the night stage, the same indigo in both themes.
export default function ClaimLayout({ children }: LayoutProps<"/">) {
  return (
    <main data-theme="light" className="tk-claim min-h-dvh">
      {children}
    </main>
  );
}
