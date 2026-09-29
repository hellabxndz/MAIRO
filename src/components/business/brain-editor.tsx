"use client";

import { useState, useTransition } from "react";
import { saveBrainAction } from "@/lib/actions/business-actions";
import type { BrainProduct, BrainProfile } from "@/lib/business/brain";

// Settings > Business Brain: every field MAIRO remembers about the business,
// editable. A field changed here is marked as the business's own answer and a
// later website analysis leaves it alone.

const TEXT_FIELDS: { key: keyof BrainProfile; label: string; long?: boolean; hint?: string }[] = [
  { key: "businessName", label: "Business name" },
  { key: "website", label: "Website" },
  { key: "industry", label: "Industry" },
  { key: "overview", label: "What your business does", long: true },
  { key: "targetCustomer", label: "Who your customers are", long: true },
  { key: "brandVoice", label: "Brand voice", hint: "How you talk, e.g. \"friendly, straight-talking, no jargon\"" },
  { key: "brandStyle", label: "Brand style", hint: "How you look, e.g. \"clean, bright, lots of white space\"" },
  { key: "primaryCta", label: "Main call to action", hint: "What you most want people to do, e.g. \"Book a free consultation\"" },
  { key: "averageOrderValue", label: "Average order value", hint: "e.g. \"$45\" or \"$40–$60\"" },
  { key: "competitorCategory", label: "Who you compete with" },
  { key: "mainGoals", label: "Your main goals", long: true, hint: "e.g. \"Fill weekday appointments; grow online orders\"" },
];

const LIST_FIELDS: { key: keyof BrainProfile; label: string; hint?: string }[] = [
  { key: "offers", label: "Current offers" },
  { key: "discounts", label: "Discounts" },
  { key: "usps", label: "What makes you different" },
  { key: "bestProducts", label: "Best products to advertise" },
  { key: "categories", label: "Product categories" },
  { key: "painPoints", label: "Problems your customers have" },
  { key: "desires", label: "What your customers want" },
  { key: "successfulOffers", label: "Offers that worked", hint: "MAIRO leans on these when writing ads" },
  { key: "unsuccessfulOffers", label: "Offers that didn't work", hint: "MAIRO avoids these" },
];

const fieldCls = "mt-1.5 w-full rounded-xl border bg-transparent px-3.5 py-2.5 text-[13.5px] text-white placeholder:text-faint focus:outline-none";

export function BusinessBrain({ profile, edited }: { profile: BrainProfile; edited: string[] }) {
  const [p, setP] = useState<BrainProfile>(profile);
  const [lists, setLists] = useState<Record<string, string>>(() =>
    Object.fromEntries(LIST_FIELDS.map((f) => [f.key, (profile[f.key] as string[]).join("\n")])),
  );
  const [colors, setColors] = useState(profile.brandColors.join(", "));
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  function setProduct(i: number, patch: Partial<BrainProduct>) {
    setP((prev) => ({ ...prev, products: prev.products.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  }

  function save() {
    start(async () => {
      const payload: Record<string, unknown> = { ...p };
      for (const f of LIST_FIELDS) payload[f.key] = lists[f.key].split("\n").map((s) => s.trim()).filter(Boolean);
      payload.brandColors = colors.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
      payload.products = p.products.filter((x) => x.name.trim());
      const res = await saveBrainAction(payload);
      setNote(res?.ok ? { ok: true, text: "Saved. MAIRO uses this from your next campaign on." } : { ok: false, text: res?.error ?? "Couldn't save." });
    });
  }

  const mark = (k: string) => (edited.includes(k) ? <span className="ml-2 text-[10.5px] text-faint">edited by you</span> : null);

  return (
    <div className="space-y-8">
      <div className="grid gap-5 sm:grid-cols-2">
        {TEXT_FIELDS.map((f) => (
          <label key={f.key} className={f.long ? "sm:col-span-2" : ""}>
            <span className="text-[12.5px] text-muted">
              {f.label}
              {mark(f.key)}
            </span>
            {f.long ? (
              <textarea rows={3} value={p[f.key] as string} onChange={(e) => setP({ ...p, [f.key]: e.target.value })} className={fieldCls} style={{ borderColor: "var(--mairo-line)" }} />
            ) : (
              <input value={p[f.key] as string} onChange={(e) => setP({ ...p, [f.key]: e.target.value })} className={fieldCls} style={{ borderColor: "var(--mairo-line)" }} />
            )}
            {f.hint && <span className="mt-1 block text-[11.5px] text-faint">{f.hint}</span>}
          </label>
        ))}
        <label>
          <span className="text-[12.5px] text-muted">Brand colors{mark("brandColors")}</span>
          <input value={colors} onChange={(e) => setColors(e.target.value)} placeholder="#1a2b3c, #ff6600" className={fieldCls} style={{ borderColor: "var(--mairo-line)" }} />
          <span className="mt-1 block text-[11.5px] text-faint">Hex codes, separated by commas</span>
        </label>
        <label>
          <span className="text-[12.5px] text-muted">Profit margin (%){mark("profitMarginPercent")}</span>
          <input
            type="number"
            min={0}
            max={100}
            value={p.profitMarginPercent ?? ""}
            onChange={(e) => setP({ ...p, profitMarginPercent: e.target.value === "" ? null : Number(e.target.value) })}
            className={fieldCls}
            style={{ borderColor: "var(--mairo-line)" }}
          />
          <span className="mt-1 block text-[11.5px] text-faint">Optional. Lets the dashboard show profit after ad spend, not just revenue.</span>
        </label>
      </div>

      <div>
        <p className="text-[12.5px] text-muted">Products and services{mark("products")}</p>
        <ul className="mt-2 space-y-2">
          {p.products.map((x, i) => (
            <li key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <input value={x.name} onChange={(e) => setProduct(i, { name: e.target.value })} placeholder="Name" className={fieldCls} style={{ borderColor: "var(--mairo-line)", marginTop: 0 }} aria-label="Product name" />
              <input value={x.price ?? ""} onChange={(e) => setProduct(i, { price: e.target.value || null })} placeholder="Price" className={fieldCls} style={{ borderColor: "var(--mairo-line)", marginTop: 0 }} aria-label="Price" />
              <input value={x.category ?? ""} onChange={(e) => setProduct(i, { category: e.target.value || null })} placeholder="Category" className={fieldCls} style={{ borderColor: "var(--mairo-line)", marginTop: 0 }} aria-label="Category" />
              <button type="button" onClick={() => setP({ ...p, products: p.products.filter((_, j) => j !== i) })} className="px-2 text-[12px] text-muted hover:text-white">
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setP({ ...p, products: [...p.products, { name: "", price: null, category: null, notes: null }] })} className="mt-2 text-[12.5px] text-blue-bright hover:text-white">
          + Add a product
        </button>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {LIST_FIELDS.map((f) => (
          <label key={f.key}>
            <span className="text-[12.5px] text-muted">
              {f.label}
              {mark(f.key)}
            </span>
            <textarea rows={3} value={lists[f.key]} onChange={(e) => setLists({ ...lists, [f.key]: e.target.value })} placeholder="One per line" className={fieldCls} style={{ borderColor: "var(--mairo-line)" }} />
            {f.hint && <span className="mt-1 block text-[11.5px] text-faint">{f.hint}</span>}
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={save} disabled={pending} className="rounded-full px-6 py-3 text-[13.5px] font-medium text-white disabled:opacity-60" style={{ backgroundImage: "var(--mairo-ramp)" }}>
          {pending ? "Saving…" : "Save Business Brain"}
        </button>
        {note && <p className={`text-[12.5px] ${note.ok ? "text-live" : "text-amber-200/90"}`}>{note.text}</p>}
      </div>
    </div>
  );
}
