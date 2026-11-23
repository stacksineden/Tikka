"use client";

import { Camera, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { submitKycAction } from "@/app/app/payout-actions";
import { ID_TYPES, REGISTERED, type IdType, type Registered } from "@/lib/kyc";
import { uploadKycPhoto } from "@/lib/media-client";

/**
 * Get paid, before the bank account: the owner's ID, then whether the business is registered (with
 * its CAC certificate if so). Two screens, one decision each. The photos go straight to the owner's
 * own private folder; only Tikka's review team can open them.
 */
export function KycForm({ again = false }: { again?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [idType, setIdType] = useState<IdType | "">("");
  const [name, setName] = useState("");
  const [idPhoto, setIdPhoto] = useState("");
  const [registered, setRegistered] = useState<Registered | "">("");
  const [cac, setCac] = useState("");
  const [cacPhoto, setCacPhoto] = useState("");
  const [uploading, setUploading] = useState<"id" | "cac" | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  async function pick(kind: "id" | "cac", file: File | undefined) {
    if (!file) return;
    setError("");
    setUploading(kind);
    try {
      const path = await uploadKycPhoto(file, kind);
      if (kind === "id") setIdPhoto(path);
      else setCacPhoto(path);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(null);
    }
  }

  function next() {
    if (!idType) return setError("Pick the type of ID.");
    if (name.trim().length < 3) return setError("Type your full name as it is on the ID.");
    if (!idPhoto) return setError("Add a photo of the front of your ID.");
    setError("");
    setStep(2);
  }

  function send() {
    if (!registered) return setError("Pick one.");
    if (registered !== "no" && (!cac.trim() || !cacPhoto)) return setError("Add your CAC number and certificate, or pick Not registered yet.");
    setError("");
    start(async () => {
      const r = await submitKycAction({ idType, idName: name, idPhoto, registered, cacNumber: cac, cacPhoto });
      if (r.kind === "submitted") return router.refresh();
      setError(
        r.kind === "missing_file"
          ? "We couldn't find your photo. Add it again."
          : r.kind === "already_verified"
            ? "Your business is already verified."
            : (r.message ?? "That didn't go through. Try again."),
      );
    });
  }

  return (
    <section className="rounded-card border border-line bg-surface-raised p-4 sm:p-5" aria-labelledby="kyc-h">
      <p className="text-caption text-ink-muted">Step {step} of 2</p>
      {step === 1 ? (
        <>
          <h2 id="kyc-h" className="text-title mt-1 text-[17px] leading-6">
            {again ? "Your ID again" : "Your ID"}
          </h2>
          <p className="text-body mt-1 text-ink-muted">The owner&apos;s ID. Pick one.</p>
          <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Type of ID">
            {ID_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={idType === t.id}
                onClick={() => (setIdType(t.id), setError(""))}
                className={`min-h-12 rounded-md border px-3 text-left text-body ${idType === t.id ? "border-brand bg-brand-soft font-semibold" : "border-line"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label htmlFor="kyc-name" className="text-label mt-4 block">
            Full name, as on the ID
          </label>
          <input id="kyc-name" className="input mt-1.5 w-full" value={name} maxLength={120} autoComplete="name" onChange={(e) => (setName(e.target.value), setError(""))} />
          <PhotoPick label="Photo of the front" done={!!idPhoto} busy={uploading === "id"} onPick={(f) => pick("id", f)} />
          {error && (
            <p role="alert" className="text-caption mt-2 font-semibold text-danger">
              {error}
            </p>
          )}
          <button type="button" className="btn btn-lg mt-4 w-full" onClick={next} disabled={!!uploading}>
            Next
          </button>
        </>
      ) : (
        <>
          <h2 id="kyc-h" className="text-title mt-1 text-[17px] leading-6">
            Is your business registered?
          </h2>
          <p className="text-body mt-1 text-ink-muted">Not registered is fine: you can still take payments.</p>
          <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Registered with CAC">
            {REGISTERED.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={registered === r.id}
                onClick={() => (setRegistered(r.id), setError(""))}
                className={`min-h-12 rounded-md border px-3 text-left text-body ${registered === r.id ? "border-brand bg-brand-soft font-semibold" : "border-line"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {(registered === "bn" || registered === "rc") && (
            <>
              <label htmlFor="kyc-cac" className="text-label mt-4 block">
                {registered === "bn" ? "BN number" : "RC number"}
              </label>
              <input id="kyc-cac" className="input mt-1.5 w-full" inputMode="numeric" value={cac} maxLength={14} placeholder={registered === "bn" ? "BN 1234567" : "RC 1234567"} onChange={(e) => (setCac(e.target.value), setError(""))} />
              <PhotoPick label="Your CAC certificate" done={!!cacPhoto} busy={uploading === "cac"} onPick={(f) => pick("cac", f)} />
            </>
          )}
          {error && (
            <p role="alert" className="text-caption mt-2 font-semibold text-danger">
              {error}
            </p>
          )}
          <button type="button" className="btn btn-lg mt-4 w-full" onClick={send} disabled={pending || !!uploading}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {pending ? "Sending…" : "Send for review"}
          </button>
          <button type="button" className="text-label mt-1 min-h-11 w-full text-ink-muted" onClick={() => (setStep(1), setError(""))}>
            Back
          </button>
        </>
      )}
      <p className="text-caption mt-3 text-ink-muted">Only Tikka&apos;s review team sees your documents, never your customers or staff.</p>
    </section>
  );
}

function PhotoPick({ label, done, busy, onPick }: { label: string; done: boolean; busy: boolean; onPick: (f: File | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className={`mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-md border px-3 text-body ${done ? "border-success bg-success-soft font-semibold text-success" : "border-dashed border-line-strong text-ink-muted"}`}
      >
        {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : done ? <Check size={18} aria-hidden="true" /> : <Camera size={18} aria-hidden="true" />}
        {busy ? "Adding…" : done ? `${label} added · change` : label}
      </button>
      <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => (onPick(e.target.files?.[0]), (e.target.value = ""))} />
    </>
  );
}
