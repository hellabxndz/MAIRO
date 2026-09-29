"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { saveProfitSettingsAction, type ProfitSettingsState } from "@/lib/actions/intelligence-actions";

// Edit Profit Settings: the numbers that turn revenue into estimated profit.
// Everything is optional; the one that matters most is the margin, and the
// form says so.

export type ProfitSettingsValues = {
  averageMarginPercent: number | null;
  sellingPriceCents: number | null;
  productCostCents: number | null;
  averageOrderValueCents: number | null;
  shippingCostCents: number;
  paymentFeePercent: number;
  paymentFeeFixedCents: number;
  otherMonthlyCostsCents: number;
  brainMarginPercent: number | null;
};

const dollars = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(/\.00$/, ""));

function Field({ name, label, hint, defaultValue, prefix, suffix }: { name: string; label: string; hint?: string; defaultValue: string; prefix?: string; suffix?: string }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-white">{label}</span>
      {hint && <span className="mt-0.5 block text-[12px] text-faint">{hint}</span>}
      <span className="mt-1.5 flex h-11 items-center rounded-lg border border-white/10 bg-[#0c1326] px-3 focus-within:border-violet/60">
        {prefix && <span className="mr-1 text-muted">{prefix}</span>}
        <input name={name} defaultValue={defaultValue} inputMode="decimal" className="w-full bg-transparent text-[14px] text-white outline-none placeholder:text-faint" placeholder="—" />
        {suffix && <span className="ml-1 text-muted">{suffix}</span>}
      </span>
    </label>
  );
}

export function ProfitSettingsModal({ values, products }: { values: ProfitSettingsValues; products: { id: string; title: string; priceCents: number | null; costCents: number | null }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ProfitSettingsState, FormData>(saveProfitSettingsAction, { ok: false, error: null });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!state.ok) return;
    const t = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/12 bg-white/[0.03] px-3.5 text-[13px] text-white hover:border-white/30">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 text-muted" aria-hidden>
          <circle cx="10" cy="10" r="2.6" />
          <path d="M10 2.6v2M10 15.4v2M17.4 10h-2M4.6 10h-2M15.2 4.8l-1.4 1.4M6.2 13.8l-1.4 1.4M15.2 15.2l-1.4-1.4M6.2 6.2L4.8 4.8" />
        </svg>
        Edit profit settings
      </button>
      {open &&
        createPortal(
          <div role="dialog" aria-modal="true" aria-label="Profit settings" className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setOpen(false)}>
            <form
              action={action}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[92vh] w-full max-w-[620px] overflow-y-auto rounded-t-2xl border border-white/10 bg-[#0b1122] p-5 shadow-2xl sm:rounded-2xl sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[18px] font-semibold text-white">Profit settings</h2>
                  <p className="mt-1 text-[13px] text-muted">What a sale costs you beyond advertising. Mairo uses these to estimate profit — leave anything you don&rsquo;t know blank.</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 text-white/70 hover:text-white">
                  ✕
                </button>
              </div>

              <div className="mt-5 rounded-xl border border-violet/25 bg-violet/[0.06] p-4">
                <Field
                  name="averageMarginPercent"
                  label="Average margin"
                  hint={`What you keep from a sale after the cost of the product, before advertising.${values.brainMarginPercent !== null && values.averageMarginPercent === null ? ` Your Business Brain says ${values.brainMarginPercent}%.` : ""}`}
                  defaultValue={values.averageMarginPercent === null ? "" : String(values.averageMarginPercent)}
                  suffix="%"
                />
                <p className="mt-3 text-[12px] text-faint">Or give a typical price and cost and Mairo works the margin out:</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <Field name="sellingPrice" label="Selling price" defaultValue={dollars(values.sellingPriceCents)} prefix="$" />
                  <Field name="productCost" label="Product cost" defaultValue={dollars(values.productCostCents)} prefix="$" />
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field name="averageOrderValue" label="Average order value" hint="Blank uses tracked revenue ÷ purchases." defaultValue={dollars(values.averageOrderValueCents)} prefix="$" />
                <Field name="shippingCost" label="Shipping cost per order" defaultValue={dollars(values.shippingCostCents)} prefix="$" />
                <Field name="paymentFeePercent" label="Payment fee" hint="Card processing, e.g. 2.9%." defaultValue={String(values.paymentFeePercent)} suffix="%" />
                <Field name="paymentFeeFixed" label="Fixed fee per order" hint="e.g. $0.30." defaultValue={dollars(values.paymentFeeFixedCents)} prefix="$" />
                <Field name="otherMonthlyCosts" label="Other monthly costs" hint="Rent, software, wages — spread across the month." defaultValue={dollars(values.otherMonthlyCostsCents)} prefix="$" />
              </div>

              {products.length > 0 && (
                <div className="mt-5">
                  <p className="text-[13px] font-medium text-white">Cost per product</p>
                  <p className="mt-0.5 text-[12px] text-faint">For each product&rsquo;s margin and break-even ROAS.</p>
                  <ul className="mt-2 space-y-2">
                    {products.slice(0, 30).map((p) => (
                      <li key={p.id} className="flex items-center gap-3">
                        <span className="min-w-0 flex-1 truncate text-[13px] text-white/85">
                          {p.title}
                          {p.priceCents !== null && <span className="text-faint"> · ${(p.priceCents / 100).toFixed(2)}</span>}
                        </span>
                        <span className="flex h-10 w-28 items-center rounded-lg border border-white/10 bg-[#0c1326] px-2.5 focus-within:border-violet/60">
                          <span className="mr-1 text-muted">$</span>
                          <input name={`product-cost-${p.id}`} defaultValue={dollars(p.costCents)} inputMode="decimal" aria-label={`Cost of ${p.title}`} className="w-full bg-transparent text-[13px] text-white outline-none" placeholder="—" />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {state.error && <p className="mt-4 rounded-lg bg-alert/10 px-3 py-2 text-[13px] text-alert">{state.error}</p>}
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setOpen(false)} className="min-h-[44px] rounded-lg px-4 text-[14px] text-muted hover:text-white">
                  Cancel
                </button>
                <button type="submit" disabled={pending} className="min-h-[44px] rounded-lg bg-[#7c5cff] px-5 text-[14px] font-medium text-white hover:brightness-110 disabled:opacity-60">
                  {pending ? "Saving…" : "Save settings"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}
