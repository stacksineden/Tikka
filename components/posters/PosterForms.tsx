"use client";

import { Check, Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { addPosterAction, savePosterHookAction } from "@/app/app/actions";
import { DEFAULT_HOOK, HOOK_MAX, LABEL_MAX } from "@/lib/posters";

export function AddPoster() {
  const [state, action, pending] = useActionState(addPosterAction, undefined);
  return (
    <form action={action} className="grid gap-2 rounded-card border border-dashed border-line-strong bg-surface-raised p-4">
      <label htmlFor="poster-label" className="text-label">
        Add a poster for another spot
      </label>
      <div className="flex gap-2">
        <input id="poster-label" name="label" maxLength={LABEL_MAX} placeholder="e.g. Mall, Gym next door" className="input min-w-0 flex-1" aria-invalid={!!state?.error} />
        <button type="submit" className="btn min-h-11 shrink-0 px-4" disabled={pending}>
          <Plus />
          Add
        </button>
      </div>
      {state?.error ? (
        <p role="alert" className="text-caption font-semibold text-danger">
          {state.error}
        </p>
      ) : (
        <p className="text-caption text-ink-muted">Each poster gets its own code, so you can see which spot brings people in.</p>
      )}
    </form>
  );
}

/** The editable line under "Scan to get your Tikka". Evergreen by default; the drop's best reward is one tap away. */
export function HookLine({ posterId, hook, suggestion }: { posterId: string; hook?: string; suggestion: string | null }) {
  const [state, action, pending] = useActionState(savePosterHookAction.bind(null, posterId), undefined);
  const [text, setText] = useState(hook ?? DEFAULT_HOOK);
  return (
    <form action={action} className="grid gap-2">
      <label htmlFor={`hook-${posterId}`} className="text-label">
        Line under the headline
      </label>
      <textarea
        id={`hook-${posterId}`}
        name="hook"
        value={text}
        maxLength={HOOK_MAX}
        onChange={(e) => setText(e.target.value.replace(/\n/g, " "))}
        className="input min-h-11 resize-none py-2.5 leading-6 [field-sizing:content]"
        aria-invalid={!!state?.error}
      />
      <div className="flex flex-wrap gap-1.5">
        {[DEFAULT_HOOK, suggestion].filter((x): x is string => !!x && x !== text).map((s) => (
          <button key={s} type="button" onClick={() => setText(s)} className="text-caption min-h-9 rounded-pill bg-surface-sunken px-3 text-left text-ink">
            {s === DEFAULT_HOOK ? "Use the everyday line" : `Use: ${s}`}
          </button>
        ))}
      </div>
      {state?.error && (
        <p role="alert" className="text-caption font-semibold text-danger">
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-secondary min-h-11 px-4 text-label" disabled={pending}>
          Save line
        </button>
        {state?.saved && !pending && (
          <span className="text-label flex items-center gap-1 text-success" role="status">
            <Check size={16} aria-hidden="true" /> Saved
          </span>
        )}
      </div>
      <p className="text-caption text-ink-muted">Your poster stays up for every drop, so the everyday line never goes out of date.</p>
    </form>
  );
}
