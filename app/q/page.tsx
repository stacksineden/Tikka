import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/site/Logo";
import { normalizePosterCode, POSTER_CODE_LENGTH } from "@/lib/posters";

export const metadata: Metadata = { title: "Enter a poster code" };

// usetikka.com/q: the typed fallback printed on every poster, for when a camera won't scan.
async function Entry({ searchParams }: { searchParams: PageProps<"/q">["searchParams"] }) {
  const sp = await searchParams;
  const typed = typeof sp.code === "string" ? sp.code : "";
  const code = typed ? normalizePosterCode(typed) : null;
  if (code && sp.missing !== "1") redirect(`/q/${code}`);
  const error = typed ? (code ? "We couldn't find that code. Check the poster and try again." : `Poster codes have ${POSTER_CODE_LENGTH} letters and numbers, like K7M 2QP.`) : null;

  return (
    <form method="get" action="/q" className="grid gap-3">
      <label htmlFor="code" className="text-title text-on-night">
        Enter the code on the poster
      </label>
      <input
        id="code"
        name="code"
        defaultValue={typed}
        autoFocus
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        maxLength={9}
        placeholder="K7M 2QP"
        aria-invalid={!!error}
        aria-describedby={error ? "code-err" : "code-hint"}
        size={1}
        className="h-16 w-full min-w-0 rounded-md border-2 border-on-night-muted/40 bg-night-raised px-4 text-center font-mono text-[28px] uppercase tracking-[0.2em] text-on-night outline-none focus:border-gold"
      />
      {error ? (
        <p id="code-err" role="alert" className="text-label text-danger">
          {error}
        </p>
      ) : (
        <p id="code-hint" className="text-caption text-on-night-muted">
          It&apos;s printed under the QR code, next to usetikka.com/q.
        </p>
      )}
      <button type="submit" className="btn btn-lg mt-2 w-full bg-gold text-on-gold">
        Open
      </button>
    </form>
  );
}

export default function PosterCodePage(props: PageProps<"/q">) {
  return (
    <div data-theme="dark" className="stage min-h-dvh bg-night px-4 py-8">
      <div className="mx-auto grid max-w-sm gap-10">
        <Logo />
        <div>
          <h1 className="text-heading text-on-night">Scan didn&apos;t work?</h1>
          <p className="text-body mt-2 text-on-night-muted">Type the code from the poster and we&apos;ll take you to the business&apos;s Tikkas.</p>
        </div>
        <Suspense fallback={<div className="h-48" />}>
          <Entry searchParams={props.searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
