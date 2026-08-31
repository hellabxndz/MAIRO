"use client";

import { useActionState } from "react";
import { createCampaignAction } from "@/lib/actions/campaign-actions";
import { inputClass, primaryButtonClass } from "@/components/ui";

const OBJECTIVES = [
  { value: "LEADS", label: "Leads" },
  { value: "SALES", label: "Sales" },
  { value: "AWARENESS", label: "Awareness" },
  { value: "TRAFFIC", label: "Traffic" },
  { value: "APP_PROMOTION", label: "App promotion" },
];

export function NewCampaignForm() {
  const [state, formAction, pending] = useActionState(createCampaignAction, undefined);

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <div className="space-y-1">
        <label className="text-xs font-medium text-neutral-400">Campaign name</label>
        <input name="name" required className={inputClass} placeholder="Fall lead gen" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-neutral-400">Objective</label>
        <select name="objective" required className={inputClass}>
          {OBJECTIVES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-neutral-400">Daily budget (USD)</label>
        <input
          name="dailyBudget"
          type="number"
          min={1}
          step={1}
          required
          defaultValue={20}
          className={inputClass}
        />
      </div>
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "Creating..." : "Create campaign"}
      </button>
      {state?.error && <p className="sm:col-span-4 text-sm text-red-400">{state.error}</p>}
    </form>
  );
}
