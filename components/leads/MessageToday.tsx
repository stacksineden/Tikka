"use client";

import { Check, MessageCircle } from "lucide-react";
import { useState } from "react";
import { FOLLOWUP_LABEL, type Followup } from "@/lib/followups";
import { waLink } from "@/lib/leads";

const SHOW = 4;

function logTap(leadId: string) {
  const body = JSON.stringify({ leadId });
  try {
    if (navigator.sendBeacon?.("/api/leads/followup", new Blob([body], { type: "application/json" }))) return;
  } catch {}
  fetch("/api/leads/followup", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
}

/** "Message today" (PRD B8): who to message now, each with a message they can change before WhatsApp opens. */
export function MessageToday({ items }: { items: Followup[] }) {
  const [all, setAll] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const shown = all ? items : items.slice(0, SHOW);
  return (
    <section className="grid gap-3 rounded-card border border-line bg-surface-raised p-4 sm:p-5" aria-labelledby="today-h">
      <div>
        <h2 id="today-h" className="text-title text-[17px] leading-6">
          Message today · {items.length}
        </h2>
        <p className="text-caption text-ink-muted">A short message now brings people in. Change it if you like, then send it from your WhatsApp.</p>
      </div>
      <ul className="grid gap-3 lg:grid-cols-2">
        {shown.map((f) => (
          <Item key={f.lead.id} f={f} done={done.has(f.lead.id)} onSent={() => setDone((d) => new Set(d).add(f.lead.id))} />
        ))}
      </ul>
      {items.length > SHOW && (
        <button type="button" className="btn btn-secondary min-h-11 justify-self-start px-3 text-label" onClick={() => setAll((a) => !a)}>
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}

function Item({ f, done, onSent }: { f: Followup; done: boolean; onSent: () => void }) {
  const [text, setText] = useState(f.message);
  const href = waLink(f.lead.phone, text);
  const first = f.lead.name.split(" ")[0];
  return (
    <li className="grid gap-2 rounded-md border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-body font-semibold">{f.lead.name}</span>
        <span className="text-caption rounded-pill bg-surface-sunken px-2 py-0.5 font-semibold text-ink-muted">{FOLLOWUP_LABEL[f.kind]}</span>
      </div>
      <label className="sr-only" htmlFor={`msg-${f.lead.id}`}>
        Message to {first}
      </label>
      <textarea
        id={`msg-${f.lead.id}`}
        className="input min-h-20 resize-y py-2.5 leading-6 [field-sizing:content]"
        value={text}
        maxLength={500}
        onChange={(e) => setText(e.target.value)}
      />
      {done ? (
        <p className="text-label flex min-h-11 items-center gap-1.5 text-success">
          <Check size={18} aria-hidden="true" /> Opened in WhatsApp
        </p>
      ) : (
        href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="btn min-h-11 justify-self-start px-4 text-label"
            onClick={() => {
              logTap(f.lead.id);
              onSent();
            }}
          >
            <MessageCircle />
            Message {first} on WhatsApp
          </a>
        )
      )}
    </li>
  );
}
