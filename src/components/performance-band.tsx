import { Card } from "@/components/ui";
import { Metric, formatInteger, formatMoney, formatPercent, NO_VALUE } from "@/components/metrics";
import type { PerformanceReport } from "@/lib/meta/performance";

// The headline row of results on the dashboard, read live from Meta.
//
// It has four states and they are deliberately different from one another,
// because collapsing them is how a dashboard starts lying: nothing connected,
// nothing created, created but never switched on, and actually running. Only
// the last one shows figures.

export function PerformanceBand({ report }: { report: PerformanceReport }) {
  if (report.unavailable) {
    return (
      <Card>
        <p className="text-sm text-neutral-400">Results</p>
        <p className="mt-2 text-sm text-neutral-500">{report.unavailable}</p>
      </Card>
    );
  }

  if (report.rows.length === 0) {
    return (
      <Card>
        <p className="text-sm text-neutral-400">Results</p>
        <p className="mt-2 text-sm text-neutral-500">
          Nothing to report yet — results appear here once you have a campaign on Meta.
        </p>
      </Card>
    );
  }

  const { totals } = report;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-neutral-400">Results so far</p>
        <p className="text-xs text-neutral-600">
          Live from your Meta ad account · {report.rows.length}{" "}
          {report.rows.length === 1 ? "campaign" : "campaigns"}
        </p>
      </div>

      {totals.hasData ? (
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Spend" value={formatMoney(totals.spend)} />
          <Metric label="Impressions" value={formatInteger(totals.impressions)} />
          <Metric label="Clicks" value={formatInteger(totals.clicks)} />
          <Metric
            label="Cost per click"
            value={totals.cpc === null ? NO_VALUE : formatMoney(totals.cpc)}
            hint={totals.ctr === null ? undefined : `${formatPercent(totals.ctr)} click-through`}
          />
        </div>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-neutral-500">
          Your campaigns are on Meta but haven&apos;t run yet, so there&apos;s nothing to
          measure. MAIRO creates every campaign paused — switch one on in Meta Ads
          Manager and the numbers start showing up here.
        </p>
      )}
    </Card>
  );
}
