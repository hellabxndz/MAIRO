"use client";

import { useActionState } from "react";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { addBusinessAction, removeBusinessAction, type BrandActionState } from "@/lib/actions/brand-actions";

// The two forms on Settings › Your businesses. The server actions check the
// plan, the role and the business again; these only show what they say.

export function AddBusinessForm() {
  const [state, action, pending] = useActionState<BrandActionState, FormData>(addBusinessAction, undefined);
  return (
    <form action={action} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <label className="block text-[13px] text-muted">
        Business or brand name
        <input name="name" required maxLength={120} className={`${inputClass} mt-1`} placeholder="e.g. Northside Bakery" />
      </label>
      <label className="block text-[13px] text-muted">
        Website <span className="text-faint">(optional)</span>
        <input name="website" maxLength={200} className={`${inputClass} mt-1`} placeholder="northsidebakery.com" />
      </label>
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "Adding…" : "Add business"}
      </button>
      {state?.error && <p role="alert" className="text-[12.5px] text-red-300 sm:col-span-3">{state.error}</p>}
    </form>
  );
}

export function RemoveBusinessForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<BrandActionState, FormData>(removeBusinessAction, undefined);
  return (
    <details className="mt-3 text-[13px]">
      <summary className="cursor-pointer text-muted hover:text-white">Remove {name}</summary>
      <form action={action} className="mt-3 space-y-2">
        <input type="hidden" name="organizationId" value={id} />
        <p className="text-[12.5px] leading-relaxed text-muted">
          Removes {name} from MAIRO with its campaigns&rsquo; records, ads, plan and its Meta connection. Its ads in Meta aren&rsquo;t deleted. Campaigns still running must be paused first. Type <strong className="text-white">{name}</strong> to confirm.
        </p>
        <input name="confirm" className={inputClass} autoComplete="off" aria-label={`Type ${name} to confirm`} />
        <button type="submit" disabled={pending} className={secondaryButtonClass}>
          {pending ? "Removing…" : "Remove business"}
        </button>
        {state?.error && <p role="alert" className="text-[12.5px] text-red-300">{state.error}</p>}
      </form>
    </details>
  );
}
