import type { Metadata } from "next";
import { Suspense } from "react";
import { StudioWhatsApp } from "@/components/studio/StudioChrome";
import { EnquiryForm } from "@/components/studio/EnquiryForm";
import { getBusiness, ownerNumber } from "@/lib/data";
import { getOwnerUser } from "@/lib/session";
import { formatNgPhone } from "@/lib/setup";
import { caseStudy, STUDIO_EMAIL } from "@/lib/studio";

export const metadata: Metadata = {
  title: { absolute: "Contact · Tikka Studio" },
  description: "Tell us what your business needs. It starts with a free business audit.",
};

/** The form, prefilled when an owner is signed in and naming the case study they came from. */
async function Form({ searchParams }: { searchParams: PageProps<"/studio/contact">["searchParams"] }) {
  const sp = await searchParams;
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const c = from ? caseStudy(from) : null;
  const owner = await getOwnerUser();
  const b = owner ? await getBusiness(owner) : null;
  const phone = b ? ownerNumber(b) : undefined;
  return (
    <EnquiryForm
      from={c?.slug}
      fromClient={c?.client}
      prefill={owner ? { name: owner.name || undefined, businessName: b?.name, phone: phone ? formatNgPhone(phone) : undefined } : undefined}
    />
  );
}

export default function ContactPage(props: PageProps<"/studio/contact">) {
  return (
    <div className="mx-auto grid max-w-3xl gap-6 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <div className="grid gap-3">
        <p className="text-serial font-mono uppercase text-brand">Tikka Studio</p>
        <h1 className="text-display-lg text-balance">Tell us what your business needs.</h1>
        <p className="text-body-lg text-ink-muted">It starts with a free business audit. We&apos;ll quote once we understand your business.</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <StudioWhatsApp className="btn btn-secondary min-h-11" />
          <p className="text-body text-ink-muted">
            or email <span className="select-all font-medium text-ink">{STUDIO_EMAIL}</span>
          </p>
        </div>
      </div>
      <Suspense fallback={<div className="h-[640px] rounded-card bg-surface-sunken" />}>
        <Form searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
