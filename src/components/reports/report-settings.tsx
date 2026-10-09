"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveReportSettingsAction, type ReportSettingsState } from "@/lib/actions/report-actions";

// Settings › Reports. Only delivery methods Mairo can actually use are shown:
// in the app always, a text when this deployment can send them — and only
// switchable once the business has a verified number that agreed to texts.

export type ReportSettingsValues = {
  weeklyEnabled: boolean;
  deliveryDay: number;
  preferredMode: string;
  inApp: boolean;
  onlyWhenActive: boolean;
  brandName: string | null;
  brandLogoUrl: string | null;
  hideInternal: boolean;
  autoApprove: boolean;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function Toggle({ name, label, hint, defaultChecked, disabled = false }: { name: string; label: string; hint?: React.ReactNode; defaultChecked: boolean; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} className="mt-1 h-4 w-4 accent-[#7c5cff]" />
      <span>
        <span className="block text-[14px] text-white">{label}</span>
        {hint && <span className="mt-0.5 block text-[12.5px] text-faint">{hint}</span>}
      </span>
    </label>
  );
}

export function ReportSettings({
  values,
  text,
  agency,
}: {
  values: ReportSettingsValues;
  /** null when this deployment can't send texts at all — the option isn't shown. */
  text: { available: boolean; on: boolean } | null;
  /** Agency workspaces get branding and client-sharing options. */
  agency: boolean;
}) {
  const [state, action, pending] = useActionState<ReportSettingsState, FormData>(saveReportSettingsAction, { ok: false, error: null });
  return (
    <form action={action} className="space-y-5">
      <section className="rounded-2xl border border-white/[0.07] bg-field/80 p-5">
        <h2 className="text-[16px] font-semibold text-white">Weekly report</h2>
        <div className="mt-4 space-y-4">
          <Toggle name="weeklyEnabled" label="Send me a weekly report" hint="A summary of the previous 7 days: what happened, what Mairo changed and learned, and what's next." defaultChecked={values.weeklyEnabled} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[13px] text-white">Delivery day</span>
              <select name="deliveryDay" defaultValue={values.deliveryDay} className="mt-1.5 h-11 w-full rounded-lg border border-white/10 bg-field-2 px-3 text-[14px] text-white outline-none focus:border-violet/60">
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[13px] text-white">Open reports in</span>
              <select name="preferredMode" defaultValue={values.preferredMode} className="mt-1.5 h-11 w-full rounded-lg border border-white/10 bg-field-2 px-3 text-[14px] text-white outline-none focus:border-violet/60">
                <option value="simple">Simple</option>
                <option value="advanced">Advanced</option>
                <option value="profit">Profit First</option>
              </select>
            </label>
          </div>
          <Toggle name="onlyWhenActive" label="Only when campaigns are running" hint="Skip weeks with nothing live." defaultChecked={values.onlyWhenActive} />
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.07] bg-field/80 p-5">
        <h2 className="text-[16px] font-semibold text-white">How to tell you</h2>
        <div className="mt-4 space-y-4">
          <Toggle name="inApp" label="In the app" hint="A card in your notifications when the report is ready." defaultChecked={values.inApp} />
          {text && (
            <Toggle
              name="text"
              label="Text message"
              hint={
                text.available ? (
                  "A short text with the headline numbers and a link."
                ) : (
                  <>
                    Add and verify your number first in{" "}
                    <Link href="/dashboard/settings#assistant" className="text-violet-bright hover:text-white">
                      Settings
                    </Link>
                    .
                  </>
                )
              }
              defaultChecked={text.on}
              disabled={!text.available}
            />
          )}
        </div>
      </section>

      {agency && (
        <section className="rounded-2xl border border-white/[0.07] bg-field/80 p-5">
          <h2 className="text-[16px] font-semibold text-white">Client reports</h2>
          <p className="mt-1 text-[13px] text-muted">Each client gets their own weekly report. You review it, approve it, and share the link — Mairo never sends a client report by itself.</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[13px] text-white">Agency name</span>
              <input name="brandName" defaultValue={values.brandName ?? ""} maxLength={80} className="mt-1.5 h-11 w-full rounded-lg border border-white/10 bg-field-2 px-3 text-[14px] text-white outline-none focus:border-violet/60" />
            </label>
            <label className="block">
              <span className="text-[13px] text-white">Logo address</span>
              <input name="brandLogoUrl" defaultValue={values.brandLogoUrl ?? ""} placeholder="https://…" className="mt-1.5 h-11 w-full rounded-lg border border-white/10 bg-field-2 px-3 text-[14px] text-white outline-none placeholder:text-faint focus:border-violet/60" />
            </label>
          </div>
          <div className="mt-4 space-y-4">
            <Toggle name="hideInternal" label="Hide Mairo's internal notes in shared reports" hint="Leaves out what Mairo learned and who approved each change; clients see performance only." defaultChecked={values.hideInternal} />
            <Toggle name="autoApprove" label="Approve client reports automatically" hint="Creates the share link as soon as the report is written. It still isn't sent to anyone." defaultChecked={values.autoApprove} />
          </div>
        </section>
      )}

      {/* Checkboxes that are unticked don't submit, so these carry the values for sections that aren't shown. */}
      {!agency && (
        <>
          <input type="hidden" name="brandName" value={values.brandName ?? ""} />
          <input type="hidden" name="brandLogoUrl" value={values.brandLogoUrl ?? ""} />
          {values.hideInternal && <input type="hidden" name="hideInternal" value="on" />}
          {values.autoApprove && <input type="hidden" name="autoApprove" value="on" />}
        </>
      )}

      {state.error && <p className="rounded-lg bg-alert/10 px-3 py-2 text-[13px] text-alert">{state.error}</p>}
      {state.ok && <p className="rounded-lg bg-emerald-400/10 px-3 py-2 text-[13px] text-emerald-300">Saved.</p>}
      <button type="submit" disabled={pending} className="min-h-[44px] rounded-lg bg-[#7c5cff] px-5 text-[14px] font-medium text-white hover:brightness-110 disabled:opacity-60">
        {pending ? "Saving…" : "Save report settings"}
      </button>
    </form>
  );
}
