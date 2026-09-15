import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, EmptyState } from "@/components/ui";
import { CopyField } from "@/components/copy-field";
import { activeOrganizationId } from "@/lib/active-org";
import { ensureLeadForm, leadFormUrl, parseFields } from "@/lib/leads/forms";
import { siteUrl } from "@/lib/site";
import { FIELD_KINDS } from "@/lib/leads/fields";

// What came back from the ads, and the form that collected it.
//
// The form is written and hosted before anybody asks for it, so this page
// always has something on it — the questions MAIRO chose for this trade, the
// address to point an ad at, and every answer since. A business with no
// website can run lead ads from the day they sign up, which is the point.

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const form = await ensureLeadForm(organizationId);
  if (!form) redirect("/dashboard");

  const [leads, total] = await Promise.all([
    db.lead.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.lead.count({ where: { organizationId } }),
  ]);

  const fields = parseFields(form.fieldsJson);
  const url = leadFormUrl(form.slug, siteUrl());

  return (
    <div>
      <PageHeader
        title="Leads"
        description="People who filled in your form after tapping an ad."
      />

      <Card className="mb-8">
        <h2 className="text-base text-white">{form.headline}</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-400">
          {form.description}
        </p>

        <div className="mt-5">
          <p className="mb-2 text-xs uppercase tracking-[0.12em] text-neutral-500">
            Where the ad sends people
          </p>
          <CopyField value={url} />
          <p className="mt-2 text-xs text-neutral-600">
            Pick &ldquo;Fill in a form&rdquo; when you create a campaign and MAIRO points the ad
            here for you. You never have to paste this anywhere.
          </p>
        </div>

        <div className="mt-6 border-t border-white/10 pt-5">
          <p className="mb-3 text-xs uppercase tracking-[0.12em] text-neutral-500">
            What it asks — written for your trade
          </p>
          <ol className="space-y-2">
            {fields.map((f, i) => (
              <li key={f.key} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="text-neutral-600">{i + 1}.</span>
                <span className="text-neutral-200">{f.label}</span>
                <span className="text-xs text-neutral-600">
                  {FIELD_KINDS[f.type].prefilled ? "contact detail" : "answer"}
                  {f.required ? "" : " · optional"}
                  {f.options?.length ? ` · ${f.options.length} choices` : ""}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs leading-relaxed text-neutral-600">
            Short on purpose. Every question after the third costs you completed enquiries, and a
            lead you can phone is worth more than a detailed answer nobody sends.
          </p>
        </div>
      </Card>

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-neutral-300">
          {total} {total === 1 ? "enquiry" : "enquiries"}
        </h2>
        {total > leads.length && (
          <p className="text-xs text-neutral-600">Showing the latest {leads.length}</p>
        )}
      </div>

      {leads.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          description="Run a campaign that sends people to your form and answers land here."
        />
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => {
            const answers = safeAnswers(lead.answersJson);
            return (
              <Card key={lead.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.12em] text-neutral-500">
                    {lead.createdAt.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                  {lead.clickId && (
                    <span className="text-[11px] uppercase tracking-[0.12em] text-emerald-300/70">
                      came from an ad
                    </span>
                  )}
                </div>

                <dl className="mt-3 space-y-2">
                  {fields.map((f) => {
                    const value = answers[f.key];
                    if (!value) return null;
                    return (
                      <div key={f.key} className="flex flex-wrap gap-x-3 text-sm">
                        <dt className="min-w-40 text-neutral-500">{f.label}</dt>
                        <dd className="text-white">{value}</dd>
                      </div>
                    );
                  })}
                </dl>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function safeAnswers(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}
