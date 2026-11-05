import { Mail } from "lucide-react";

/** The end of every Help page: a person to ask. */
export function StillStuck() {
  return (
    <section aria-labelledby="stuck-h" className="mt-12 rounded-card border border-line bg-surface-raised p-5">
      <h2 id="stuck-h" className="text-title">
        Still stuck?
      </h2>
      <p className="text-body mt-1 text-ink-muted">Tell us what you were trying to do. A person from Tikka will get back to you.</p>
      <a href="mailto:hello@usetikka.com?subject=Help%20with%20Tikka" className="btn btn-secondary mt-4 min-h-11 px-4">
        <Mail aria-hidden="true" />
        Email hello@usetikka.com
      </a>
    </section>
  );
}
