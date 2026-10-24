import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { clockTime } from "@/lib/format";
import { devConversation, devWhatsAppAllowed } from "@/lib/whatsapp/dev-outbox";
import { whatsappConfigured } from "@/lib/whatsapp/send";
import { sendTestMessage } from "./actions";

// DEMO (development only): a pretend phone for trying claims, Notify me and STOP before Meta is
// connected. What you send runs through the real webhook's code; Tikka's replies land here.

export const metadata: Metadata = { title: "Test phone", robots: { index: false, follow: false } };

const URL_SPLIT = /(https?:\/\/[^\s]+)/;
const IS_URL = /^https?:\/\//;

function Linked({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_SPLIT).map((part, i) =>
        IS_URL.test(part) ? (
          <a key={i} href={part.replace(/^https?:\/\/[^/]+/, "")} className="break-all font-semibold underline underline-offset-2">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

async function Phone({ searchParams }: { searchParams: PageProps<"/dev/whatsapp">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const digits = one(sp.phone).replace(/\D/g, "") || "2348010000001";
  const phone = `+${digits}`;
  const messages = devConversation(phone);
  return (
    <div className="mx-auto grid min-h-dvh max-w-md grid-rows-[auto_1fr_auto] bg-surface">
      <header className="border-b border-line bg-surface-raised px-4 py-3">
        <p className="text-label">Test phone · {phone}</p>
        <p className="text-caption text-ink-muted">
          Development only. {whatsappConfigured() ? "Meta is connected, so replies go to real WhatsApp, not here." : "Tikka's replies land here until Meta is connected."}
        </p>
      </header>
      <ol className="flex flex-col gap-2 overflow-y-auto px-4 py-4" aria-label="Messages">
        {messages.length === 0 && <li className="text-body text-ink-muted">No messages yet. Send the message from a Tikka page, or try STOP.</li>}
        {messages.map((m) => (
          <li
            key={m.id}
            className={`text-body max-w-[85%] whitespace-pre-wrap rounded-card px-3 py-2 ${m.direction === "in" ? "self-end bg-brand text-on-brand" : "self-start border border-line bg-surface-raised text-ink"}`}
          >
            {m.template && <span className="text-caption mb-1 block text-ink-muted">Template: {m.template}</span>}
            {m.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.image} alt="The card image" width={270} height={338} className="mb-2 block w-[270px] max-w-full rounded-md" />
            )}
            <Linked text={m.text} />
            <span className={`text-caption mt-1 block ${m.direction === "in" ? "text-on-brand/80" : "text-ink-muted"}`}>{clockTime(m.at)}</span>
          </li>
        ))}
      </ol>
      <form action={sendTestMessage} className="grid gap-2 border-t border-line bg-surface-raised p-3">
        {one(sp.error) && (
          <p role="alert" className="text-caption font-semibold text-danger">
            Add a phone number and a message.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <input name="phone" defaultValue={phone} className="input" aria-label="Your test number" inputMode="tel" />
          <input name="name" defaultValue={one(sp.name) || "Adaeze Okafor"} className="input" aria-label="Your WhatsApp name" />
        </div>
        <div className="flex gap-2">
          <input name="text" defaultValue={one(sp.text)} placeholder="Message" className="input min-w-0 flex-1" aria-label="Message" autoFocus />
          <button type="submit" className="btn min-h-11 shrink-0 px-4">
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

export default function TestPhonePage(props: PageProps<"/dev/whatsapp">) {
  if (!devWhatsAppAllowed) notFound();
  return (
    <Suspense fallback={<div className="min-h-dvh bg-surface" />}>
      <Phone searchParams={props.searchParams} />
    </Suspense>
  );
}
