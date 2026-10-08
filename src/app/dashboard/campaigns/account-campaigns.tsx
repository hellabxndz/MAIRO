import { EmptyState } from "@/components/ui";
import { goalLabel, primaryResult } from "@/lib/dashboard/campaigns";
import { money } from "@/lib/dashboard/home";
import { loadAccountHistory } from "@/lib/meta/account-history";
import { adsManagerUrl, STATE_LABEL } from "@/lib/meta/account-history-rules";

// The Campaigns page's "On Meta" tab: campaigns already on the business's
// Meta ad account that MAIRO didn't make. Read-only — each card opens the
// campaign in Ads Manager, which is where it can be changed, because MAIRO
// never touches what it didn't build.
//
// It reads Meta itself, inside its own Suspense boundary on the page, so the
// tabs and header are on screen while Meta answers — and if Meta is slow,
// only this list waits (the read gives up after 20 seconds and says so).

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null);

export async function AccountCampaigns({ organizationId }: { organizationId: string }) {
  const history = await loadAccountHistory(organizationId);
  if (!history.ok) {
    return <p className="rounded-2xl bg-amber-400/[0.06] px-4 py-3 text-[13px] text-amber-200/90">{history.message}</p>;
  }
  if (history.campaigns.length === 0) {
    return (
      <EmptyState
        title="Nothing else on your Meta account"
        description="Campaigns you've run yourself in Meta Ads Manager show up here, with how they did. This account has none apart from MAIRO's."
      />
    );
  }

  const spent = history.campaigns.reduce((s, c) => s + (c.metrics?.spendCents ?? 0), 0);
  return (
    <div>
      <p className="mb-5 max-w-3xl text-[13.5px] leading-relaxed text-muted">
        Campaigns on your Meta ad account that weren&rsquo;t made in MAIRO
        {spent > 0 ? <> — {money(spent)} spent across them, by Meta&rsquo;s figures</> : null}. MAIRO shows how they did and
        learns from them, but never changes, pauses or spends on them. Open one in Ads Manager to change it.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {history.campaigns.map((c) => {
          const state = STATE_LABEL[c.state];
          const result = primaryResult(c.goal, null, c.metrics);
          const from = day(c.startedAt);
          const to = day(c.endedAt);
          return (
            <a
              key={c.id}
              href={adsManagerUrl(history.adAccountId, c.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="group block rounded-[24px] p-5 transition hover:bg-white/[0.045]"
              style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[16.5px] font-medium text-white">{c.name}</h2>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {goalLabel(c.goal)}
                    {from ? ` · ${from}${to ? ` – ${to}` : ""}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-[13px] text-white/85">
                  {state.dot} {state.text}
                </span>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-4">
                <div>
                  <dd className="text-[24px] font-light tabular-nums text-white">{money(c.metrics?.spendCents ?? null)}</dd>
                  <dt className="text-[12.5px] text-muted">Spent, all time</dt>
                </div>
                <div>
                  <dd className="text-[24px] font-light tabular-nums text-white">{result.value}</dd>
                  <dt className="text-[12.5px] text-muted">{result.label}</dt>
                </div>
              </dl>
              <p className="mt-3 text-[12.5px] text-faint">
                Made outside MAIRO · <span className="text-violet-bright group-hover:underline">Open in Ads Manager ↗</span>
              </p>
            </a>
          );
        })}
      </div>
    </div>
  );
}
