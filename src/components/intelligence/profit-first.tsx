import type { ProfitReport } from "@/lib/intelligence/profit";
import { ProfitSettingsModal, type ProfitSettingsValues } from "./profit-settings-modal";

// PROFIT FIRST: is the business actually making money from its advertising?
// Revenue and estimated profit first, the advertising figures after. Profit is
// always labelled an estimate — MAIRO has the ad figures and what the business
// told it, not its accounts.

function money(cents: number | null, whole = false): string {
  if (cents === null) return "—";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: whole || Math.abs(cents) >= 100_000 ? 0 : 2 });
}

export function ProfitMetricCard({ label, value, note, tone = "default", large = false }: { label: string; value: string; note?: string; tone?: "default" | "good" | "bad"; large?: boolean }) {
  const color = tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-alert" : "text-white";
  return (
    <div className={`min-w-0 rounded-2xl border border-white/[0.07] bg-field/80 ${large ? "p-5" : "p-4"}`}>
      <p className="truncate text-[12.5px] text-muted">{label}</p>
      <p className={`mt-1 truncate font-semibold tabular-nums tracking-tight ${color} ${large ? "text-[32px]" : "text-[21px]"}`}>{value}</p>
      {note && <p className="mt-0.5 truncate text-[11.5px] text-faint">{note}</p>}
    </div>
  );
}

type Row = { name: string; revenueCents: number | null; spendCents: number | null; profitCents: number | null; roas: number | null };

function Waterfall({ r }: { r: ProfitReport }) {
  const revenue = r.revenueCents ?? 0;
  const steps = [
    { label: "Revenue", value: r.revenueCents, sign: "", tone: "bg-[#a78bfa]" },
    { label: "Product costs", value: r.productCostsCents, sign: "−", tone: "bg-white/25" },
    { label: "Advertising", value: r.spendCents, sign: "−", tone: "bg-[#7c5cff]/70" },
    { label: "Shipping & fees", value: r.shippingCents !== null && r.feesCents !== null ? r.shippingCents + r.feesCents : null, sign: "−", tone: "bg-white/20" },
    { label: "Other costs", value: r.otherCostsCents, sign: "−", tone: "bg-white/15" },
  ];
  return (
    <ul className="space-y-2.5">
      {steps.map((s) => (
        <li key={s.label} className="grid grid-cols-[130px_1fr_auto] items-center gap-3 text-[13px] sm:grid-cols-[150px_1fr_110px]">
          <span className="text-muted">
            {s.sign && <span className="mr-1 text-faint">{s.sign}</span>}
            {s.label}
          </span>
          <span className="h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
            <span className={`block h-full rounded-full ${s.tone}`} style={{ width: revenue > 0 && s.value !== null ? `${Math.min(100, (s.value / revenue) * 100)}%` : "0%" }} />
          </span>
          <span className="text-right tabular-nums text-white/85">{money(s.value)}</span>
        </li>
      ))}
      <li className="grid grid-cols-[130px_1fr_auto] items-center gap-3 border-t border-white/[0.08] pt-2.5 text-[14px] font-semibold sm:grid-cols-[150px_1fr_110px]">
        <span className="text-white">= Estimated profit</span>
        <span className="h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
          <span
            className={`block h-full rounded-full ${r.profitCents !== null && r.profitCents < 0 ? "bg-alert/70" : "bg-emerald-400/80"}`}
            style={{ width: revenue > 0 && r.profitCents !== null ? `${Math.min(100, (Math.abs(r.profitCents) / revenue) * 100)}%` : "0%" }}
          />
        </span>
        <span className={`text-right tabular-nums ${r.profitCents === null ? "text-faint" : r.profitCents < 0 ? "text-alert" : "text-emerald-300"}`}>{money(r.profitCents)}</span>
      </li>
    </ul>
  );
}

function Table({ title, note, rows, empty }: { title: string; note: string; rows: Row[]; empty: string }) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-field/80 p-5">
      <h3 className="text-[15px] font-semibold text-white">{title}</h3>
      <p className="mt-0.5 text-[12.5px] text-faint">{note}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted">{empty}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[460px] text-[13px]">
            <thead>
              <tr className="text-left text-[11.5px] text-faint">
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 text-right font-medium">Revenue</th>
                <th className="py-2 text-right font-medium">Ad spend</th>
                <th className="py-2 text-right font-medium">ROAS</th>
                <th className="py-2 text-right font-medium">Est. profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {rows.map((r) => (
                <tr key={r.name}>
                  <td className="max-w-[200px] truncate py-2 text-white">{r.name}</td>
                  <td className="py-2 text-right tabular-nums text-white/85">{money(r.revenueCents)}</td>
                  <td className="py-2 text-right tabular-nums text-white/85">{money(r.spendCents)}</td>
                  <td className="py-2 text-right tabular-nums text-white/85">{r.roas === null ? "—" : `${r.roas.toFixed(1)}x`}</td>
                  <td className={`py-2 text-right tabular-nums ${r.profitCents === null ? "text-faint" : r.profitCents < 0 ? "text-alert" : "text-emerald-300"}`}>{money(r.profitCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ProfitFirstView({
  report,
  days,
  settings,
  platforms,
  campaigns,
  products,
}: {
  report: ProfitReport;
  days: number;
  settings: ProfitSettingsValues;
  platforms: Row[];
  campaigns: Row[];
  products: { id: string; title: string; priceCents: number | null; costCents: number | null; marginPercent: number | null; breakEven: number | null }[];
}) {
  const r = report;
  const profitTone = r.profitCents === null ? "default" : r.profitCents >= 0 ? "good" : "bad";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ProfitMetricCard large label={`Revenue · last ${days} days`} value={money(r.revenueCents)} note="Sales Meta tracked back to your ads" />
        <ProfitMetricCard large label="Estimated profit" value={money(r.profitCents)} tone={profitTone} note={r.profitCents === null ? "Add your margin to estimate it" : r.profitMargin !== null ? `${Math.round(r.profitMargin * 100)}% of revenue · estimated` : "Estimated"} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <ProfitMetricCard label="Ad spend" value={money(r.spendCents)} />
        <ProfitMetricCard label="Customers" value={r.customers === null ? "—" : r.customers.toLocaleString("en-US")} note="Tracked purchases" />
        <ProfitMetricCard label="Cost per customer" value={money(r.costPerCustomerCents)} />
        <ProfitMetricCard label="ROAS" value={r.roas === null ? "—" : `${r.roas.toFixed(2)}x`} />
        <ProfitMetricCard label="Break-even ROAS" value={r.breakEvenRoas === null ? "—" : `${r.breakEvenRoas.toFixed(1)}x`} note={r.breakEvenRoas === null ? "Needs your margin" : "Below this, ads cost more than they earn"} />
        <ProfitMetricCard label="Profit margin" value={r.profitMargin === null ? "—" : `${Math.round(r.profitMargin * 100)}%`} note={r.margin ? `Gross margin ${Math.round(r.margin.percent)}%` : undefined} />
      </div>

      <section className="rounded-2xl border border-white/[0.07] bg-field/80 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Profit status</p>
            <p className={`mt-1 text-[20px] font-semibold ${r.status === "above" ? "text-emerald-300" : r.status === "below" ? "text-alert" : "text-muted"}`}>
              {r.status === "above" ? "Above break-even" : r.status === "below" ? "Below break-even" : "Not enough to tell yet"}
            </p>
            <p className="mt-0.5 max-w-2xl text-[13.5px] text-muted">
              {r.status === "above" && r.roas !== null && r.breakEvenRoas !== null
                ? `Your ads return ${r.roas.toFixed(1)}x; they need ${r.breakEvenRoas.toFixed(1)}x to pay for themselves. Every dollar above that is estimated profit.`
                : r.status === "below" && r.roas !== null && r.breakEvenRoas !== null
                  ? `Your ads return ${r.roas.toFixed(1)}x, under the ${r.breakEvenRoas.toFixed(1)}x they need to pay for themselves at your margin.`
                  : r.missing[0] ?? "MAIRO needs tracked revenue and your margin to work this out."}
            </p>
          </div>
          <ProfitSettingsModal values={settings} products={products} />
        </div>
        <div className="mt-5">
          <Waterfall r={r} />
        </div>
        <p className="mt-4 text-[12px] text-faint">
          Estimated from Meta&rsquo;s tracked revenue and the costs you entered{r.margin?.source === "business-brain" ? " (margin from your Business Brain)" : ""}. It isn&rsquo;t accounting — returns, refunds and untracked sales aren&rsquo;t included.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Table title="Platform profitability" note="Before fixed monthly costs." rows={platforms} empty="Meta hasn't split this period by app yet." />
        <Table title="Campaign profitability" note="Before fixed monthly costs." rows={campaigns} empty="No campaign has tracked revenue in this period." />
      </div>

      <section className="rounded-2xl border border-white/[0.07] bg-field/80 p-5">
        <h3 className="text-[15px] font-semibold text-white">Product profitability</h3>
        <p className="mt-0.5 text-[12.5px] text-faint">Each product&rsquo;s margin and the ROAS an ad for it needs to break even. Meta doesn&rsquo;t report sales per product, so this is per unit, not per campaign.</p>
        {products.length === 0 ? (
          <p className="mt-3 text-[13px] text-muted">No products yet — they appear here once your store&rsquo;s products are in MAIRO.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[460px] text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] text-faint">
                  <th className="py-2 font-medium">Product</th>
                  <th className="py-2 text-right font-medium">Price</th>
                  <th className="py-2 text-right font-medium">Cost</th>
                  <th className="py-2 text-right font-medium">Margin</th>
                  <th className="py-2 text-right font-medium">Break-even ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {products.slice(0, 12).map((p) => (
                  <tr key={p.id}>
                    <td className="max-w-[220px] truncate py-2 text-white">{p.title}</td>
                    <td className="py-2 text-right tabular-nums text-white/85">{money(p.priceCents)}</td>
                    <td className="py-2 text-right tabular-nums text-white/85">{p.costCents === null ? <span className="text-faint">Add cost</span> : money(p.costCents)}</td>
                    <td className="py-2 text-right tabular-nums text-white/85">{p.marginPercent === null ? "—" : `${Math.round(p.marginPercent)}%`}</td>
                    <td className="py-2 text-right tabular-nums text-white/85">{p.breakEven === null ? "—" : `${p.breakEven.toFixed(1)}x`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
