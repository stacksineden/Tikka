import { ExternalLink } from "lucide-react";
import { adminReviewKycAction } from "@/app/app/actions";
import { naira, place, shortDate } from "@/lib/format";
import { graceDay, idTypeLabel, kycStanding, STANDING_LABEL, suggestLimitKobo, type KycStanding } from "@/lib/kyc";
import type { KycQueueRow } from "@/lib/payouts-db";

const TONE: Record<KycStanding, string> = {
  verified: "bg-success-soft text-success",
  waiting: "bg-brand-soft text-brand",
  asked_again: "bg-gold-soft text-gold-text",
  id_missing: "bg-gold-soft text-gold-text",
  paused: "bg-danger-soft text-danger",
};

const REASONS = [
  "The ID photo is blurry. Take it again in good light.",
  "The name on the ID doesn't match your bank account. Payments must go to your own account or your business's.",
  "Your CAC number doesn't match your business name.",
  "That ID has expired. Send a valid one.",
];

/** Normalised for comparing: "ADA  OBI" and "Ada Obi" match. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");

/**
 * /admin → ID checks: every business that sent an ID, and every business taking payments without
 * one. The documents open from short-lived links. Approve marks it Verified, switches payments on
 * and sets its maximum (suggested from its own prices); Ask again sends the owner a reason.
 */
export function KycReview({ rows, now }: { rows: KycQueueRow[]; now: Date }) {
  if (!rows.length) return <p className="text-body text-ink-muted">No ID checks yet.</p>;
  return (
    <ul className="grid gap-3">
      {rows.map((r) => {
        const standing = kycStanding({ kyc: r.kyc, enabled: r.enabled, graceUntil: r.graceUntil }, now);
        const suggested = suggestLimitKobo({ topDepositKobo: r.topDepositKobo, topPriceKobo: r.topService?.priceKobo });
        const match = r.kyc && r.bank ? norm(r.kyc.idName) === norm(r.bank.accountName) : null;
        const wa = r.whatsapp?.replace(/\D/g, "");
        return (
          <li key={r.businessId} className="grid gap-3 rounded-card border border-line bg-surface-raised p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-body font-semibold">{r.name}</p>
                <p className="text-caption text-ink-muted">
                  {place(r.area, r.city)} · {r.category} · joined {shortDate(r.createdAt)}
                  {r.kyc ? ` · sent ${shortDate(r.kyc.submittedAt)}` : ""}
                </p>
              </div>
              <span className={`tag ${TONE[standing]}`}>{STANDING_LABEL[standing]}</span>
            </div>

            {r.kyc ? (
              <>
                <dl className="text-body grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <dt className="text-ink-muted">ID</dt>
                  <dd>{idTypeLabel(r.kyc.idType)}</dd>
                  <dt className="text-ink-muted">Name on ID</dt>
                  <dd className="font-semibold">{r.kyc.idName}</dd>
                  <dt className="text-ink-muted">Bank account</dt>
                  <dd>{r.bank ? `${r.bank.accountName} · ${r.bank.name} ••••${r.bank.last4}` : "Not added yet"}</dd>
                  <dt className="text-ink-muted">Names match</dt>
                  <dd className={match === null ? "text-ink-muted" : match ? "text-success" : "font-semibold text-danger"}>
                    {match === null ? "Can't tell yet" : match ? "Yes" : "No: check before approving"}
                  </dd>
                  <dt className="text-ink-muted">Registered</dt>
                  <dd>
                    {r.kyc.registered === "no" ? (
                      "Not yet"
                    ) : (
                      <a
                        href="https://search.cac.gov.ng/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 underline"
                      >
                        {r.kyc.cacNumber} <ExternalLink size={14} aria-hidden="true" />
                      </a>
                    )}
                  </dd>
                </dl>
                <div className="grid grid-cols-2 gap-2">
                  {r.idPhotoUrl ? (
                    <a href={r.idPhotoUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary min-h-11 text-label">
                      Open ID photo
                    </a>
                  ) : (
                    <span className="text-caption text-ink-muted">ID photo unavailable</span>
                  )}
                  {r.cacPhotoUrl && (
                    <a href={r.cacPhotoUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary min-h-11 text-label">
                      Open CAC certificate
                    </a>
                  )}
                </div>
                {r.kyc.status === "again" && r.kyc.note && <p className="text-caption text-ink-muted">Asked: {r.kyc.note}</p>}
              </>
            ) : (
              <p className="text-body text-ink-muted">
                Takes payments without an ID{r.graceUntil && standing === "id_missing" ? `: until ${graceDay(r.graceUntil)}` : ""}.
              </p>
            )}

            {r.kyc && r.kyc.status !== "approved" && (
              <form action={adminReviewKycAction.bind(null, r.businessId)} className="grid gap-3 rounded-md bg-surface-sunken p-3">
                <p className="text-caption text-ink-muted">
                  Highest service: {r.topService ? `${r.topService.name} · ${naira(r.topService.priceKobo / 100)}` : "no prices yet"}
                  {r.topDepositKobo > 0 ? ` · highest deposit ${naira(r.topDepositKobo / 100)}` : ""}. Suggested limit {naira(suggested / 100)}.
                </p>
                <label className="grid gap-1">
                  <span className="text-label">Max per payment (₦)</span>
                  <input name="limit" inputMode="numeric" defaultValue={(suggested / 100).toLocaleString("en-NG")} className="input min-h-11" />
                </label>
                <button type="submit" name="decision" value="approve" className="btn min-h-11 text-label">
                  Approve: Verified and payments on
                </button>
                <label className="grid gap-1">
                  <span className="text-label">Or ask again (the owner sees this)</span>
                  <input name="note" list={`kyc-reasons-${r.businessId}`} maxLength={200} placeholder="The ID photo is blurry…" className="input min-h-11" />
                  <datalist id={`kyc-reasons-${r.businessId}`}>
                    {REASONS.map((x) => (
                      <option key={x} value={x} />
                    ))}
                  </datalist>
                </label>
                <button type="submit" name="decision" value="again" className="btn btn-secondary min-h-11 text-label">
                  Ask again
                </button>
              </form>
            )}

            {!r.kyc && wa && (
              <a
                href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi ${r.name}, Paystack now needs us to check the ID of every business that takes payments on Tikka. Please add your ID in Settings → Get paid${r.graceUntil ? ` by ${graceDay(r.graceUntil)}` : ""}. It takes about 3 minutes.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary min-h-11 text-label"
              >
                Remind on WhatsApp
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
