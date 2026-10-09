import Link from "next/link";
import { Badge, Card, PageHeader, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { db } from "@/lib/db";
import { graphApiVersion } from "@/lib/meta/client";
import { checkConnectedOrganizations, checkMetaApp, worstState, type LiveStep, type StepState } from "@/lib/meta/live-check";

// Owner-only: the live Meta check. Asks the real Graph API whether MAIRO's
// app, and each connected business's token, ad account, Page, results and
// pixel, actually work — read-only, enforced in code, so running it can never
// change a campaign or spend anything. It runs only when asked, because each
// business is a dozen real calls to Meta.

export const dynamic = "force-dynamic";
export const metadata = { title: "Live Meta check — AIOS" };

const TONE: Record<StepState, "green" | "red" | "yellow" | "neutral"> = { pass: "green", fail: "red", warn: "yellow", skip: "neutral" };
const WORD: Record<StepState, string> = { pass: "Works", fail: "Broken", warn: "Needs attention", skip: "Not tested" };

function Steps({ steps }: { steps: LiveStep[] }) {
  return (
    <ul className="mt-4 divide-y divide-[color:var(--mairo-line)]">
      {steps.map((s) => (
        <li key={s.key} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-4">
          <span className="w-[150px] shrink-0">
            <Badge tone={TONE[s.state]}>{WORD[s.state]}</Badge>
          </span>
          <span className="min-w-0">
            <span className="block text-[13.5px] font-medium text-white">{s.label}</span>
            <span className="block text-[13px] leading-relaxed text-muted">{s.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function MetaCheckPage({ searchParams }: { searchParams: Promise<{ run?: string; org?: string }> }) {
  const { run, org } = await searchParams;
  const connected = await db.metaAdAccount.findMany({
    select: { organizationId: true, organization: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  const ran = run === "1";
  const [app, orgs] = ran ? await Promise.all([checkMetaApp(), checkConnectedOrganizations({ organizationId: org || undefined, limit: 10 })]) : [null, null];

  return (
    <div className="mx-auto max-w-[980px]">
      <PageHeader
        title="Live Meta check"
        description={`Asks Meta, for real, whether everything MAIRO depends on works: the app, each business's token and permissions, ad account, payment method, Page, campaigns, results and pixel. It only reads — anything but a read is refused before it leaves the server — so it never changes a campaign or spends money. Graph API ${graphApiVersion()}.`}
      />

      <Card className="mb-6">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" action="/aios/meta-check">
          <input type="hidden" name="run" value="1" />
          <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[12.5px] text-muted">
            Which business
            <select name="org" defaultValue={org ?? ""} className="rounded-xl border border-[color:var(--mairo-line)] bg-field px-3 py-2.5 text-[13.5px] text-white">
              <option value="">The 10 most recently connected</option>
              {connected.map((c) => (
                <option key={c.organizationId} value={c.organizationId}>
                  {c.organization.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={primaryButtonClass}>
            {ran ? "Run again" : "Run the live check"}
          </button>
        </form>
        <p className="mt-3 text-[12.5px] text-faint">
          {connected.length} business{connected.length === 1 ? "" : "es"} connected. Each check is about a dozen reads and usually takes a few seconds.
        </p>
      </Card>

      {app && orgs && (
        <>
          <Card className="mb-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-white">The MAIRO app on Meta</h2>
              <Badge tone={TONE[worstState(app)]}>{WORD[worstState(app)]}</Badge>
            </div>
            <Steps steps={app} />
          </Card>
          {orgs.length === 0 ? (
            <Card>
              <p className="text-[13.5px] text-muted">No business has connected Meta yet, so there is no token to test. Connect one from a customer account first.</p>
            </Card>
          ) : (
            orgs.map((o) => (
              <Card key={o.organizationId} className="mb-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-[15px] font-semibold text-white">{o.name}</h2>
                  <div className="flex items-center gap-3">
                    <Badge tone={TONE[worstState(o.steps)]}>{WORD[worstState(o.steps)]}</Badge>
                    <Link href={`/aios/meta-check?run=1&org=${o.organizationId}`} className={`${secondaryButtonClass} !px-3.5 !py-1.5 text-[12.5px]`}>
                      Recheck
                    </Link>
                  </div>
                </div>
                <Steps steps={o.steps} />
              </Card>
            ))
          )}
        </>
      )}
    </div>
  );
}
