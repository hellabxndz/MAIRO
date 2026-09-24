import { Check, CircleDashed, Lock, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AiNameForm, BusinessInfoForm, GoalsForm, PoliciesForm, SellsForm } from "@/components/onboarding/step-forms";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectShopifyForm } from "@/components/integrations/shopify-forms";
import { WidgetPreview } from "@/components/widget/widget-preview";
import { requireUser } from "@/lib/auth/session";
import { isOpenAIConfigured, isShopifyConfigured } from "@/lib/env";
import { continueFrom, skipShopify } from "@/lib/onboarding/actions";
import { ONBOARDING_STEPS, resolveStep, TOTAL_STEPS } from "@/lib/onboarding/steps";
import { createClient } from "@/lib/supabase/server";
import { getBusinessContext } from "@/lib/tenancy/context";
import { parseAiConfig } from "@/lib/validation/ai-employee";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Set up your AI employee" };

const SHOPIFY_FEATURES = [
  "Answers about your real products, prices and sizes",
  "Product recommendations from your live catalog",
  "Checking stock without guessing",
  "Secure order lookup and tracking",
  "Return and exchange requests tied to real orders",
];

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  await requireUser("/onboarding");
  const sp = await searchParams;
  const ctx = sp.new === "1" ? null : await getBusinessContext();

  if (!ctx) {
    return (
      <Shell step={1} reached={1}>
        <BusinessInfoForm />
      </Shell>
    );
  }
  if (!ctx.permissions.has("business.update")) redirect("/dashboard");

  const supabase = await createClient();
  const [{ data: business }, { data: settings }, { data: employee }, { data: docs }, { data: shopify }] = await Promise.all([
    supabase.from("businesses").select("id, name, website_url, industry, description, sells, ai_goals").eq("id", ctx.business.id).single(),
    supabase.from("business_settings").select("onboarding_step, onboarding_completed_at").eq("business_id", ctx.business.id).single(),
    supabase.from("ai_employees").select("id, name, draft_config, tested_at, published_version_id, status").eq("business_id", ctx.business.id).maybeSingle(),
    supabase.from("knowledge_documents").select("category, title, content").eq("business_id", ctx.business.id).eq("source_type", "manual"),
    supabase.from("shopify_connections").select("status, shop_name, shop_domain").eq("business_id", ctx.business.id).in("status", ["pending", "active", "reauth_required"]).maybeSingle(),
  ]);
  if (!business || !settings) redirect("/dashboard");
  if (settings.onboarding_completed_at && !sp.step) redirect("/dashboard");

  const reached = Math.min(settings.onboarding_step, TOTAL_STEPS);
  const step = resolveStep(settings.onboarding_step, sp.step);
  const config = parseAiConfig(employee?.draft_config);
  const policy = (title: string) => docs?.find((d) => d.title === title)?.content ?? "";
  const aiName = employee?.name ?? "Your AI employee";
  const shopifyError = typeof sp.shopify_error === "string" ? sp.shopify_error.replace(/[^a-z_]/g, "").slice(0, 40) : null;

  return (
    <Shell step={step} reached={settings.onboarding_completed_at ? TOTAL_STEPS : reached}>
      {step === 1 && (
        <BusinessInfoForm
          businessId={business.id}
          defaults={{ name: business.name, websiteUrl: business.website_url ?? "", industry: business.industry ?? "", description: business.description ?? "" }}
        />
      )}
      {step === 2 && <SellsForm defaults={business.sells ?? []} />}
      {step === 3 && <GoalsForm defaults={business.ai_goals ?? []} />}
      {step === 4 && <AiNameForm current={employee?.name} />}
      {step === 5 && (
        <div className="space-y-5">
          {shopify?.status === "active" ? (
            <Alert tone="success" title="Shopify connected">{shopify.shop_name ?? shopify.shop_domain} — products and recent orders are syncing.</Alert>
          ) : (
            <div className="rounded-2xl border border-line bg-white/[0.02] p-5">
              <div className="flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#95bf47]/15 ring-1 ring-[#95bf47]/30">
                  <ShoppingBag className="size-6 text-[#95bf47]" aria-hidden />
                </div>
                <div className="space-y-1">
                  <p className="font-medium">Connect through Shopify&apos;s official authorization</p>
                  <p className="text-sm text-fg-muted">
                    You approve exactly what Mairo Assist may read on Shopify&apos;s own screen. We never ask for your
                    Shopify password.
                  </p>
                </div>
              </div>
              <div className="mt-5">
                {isShopifyConfigured() && ctx.permissions.has("integrations.manage") ? (
                  <ConnectShopifyForm returnTo="/onboarding?step=5" defaultShop={shopify?.shop_domain} label={shopify?.status === "reauth_required" ? "Reconnect Shopify" : "Connect Shopify"} />
                ) : null}
              </div>
              {shopifyError && <Alert tone="danger" className="mt-3">We couldn&apos;t connect the store ({shopifyError.replaceAll("_", " ")}). Please try again, or connect later from Integrations.</Alert>}
              <p className="mt-2 text-xs text-fg-subtle">
                {!isShopifyConfigured()
                  ? "Shopify isn't configured on this deployment yet. "
                  : !ctx.permissions.has("integrations.manage")
                    ? "Only people allowed to manage integrations can connect the store. "
                    : ""}
                You can skip for now and connect later from Integrations.
              </p>
            </div>
          )}
          <div className="rounded-2xl border border-line p-5">
            <p className="mb-3 text-sm font-medium">What needs a connected store</p>
            <ul className="space-y-2 text-sm text-fg-muted">
              {SHOPIFY_FEATURES.map((f) => (
                <li key={f} className="flex gap-2"><Lock className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden />{f}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-fg-subtle">Without Shopify, your AI employee can still answer questions from your policies and knowledge base.</p>
          </div>
          <form action={skipShopify} className="flex justify-end">
            <Button type="submit" size="lg" variant={shopify?.status === "active" ? "primary" : "secondary"}>
              {shopify?.status === "active" ? "Continue" : "Skip for now"}
            </Button>
          </form>
        </div>
      )}
      {step === 6 && (
        <PoliciesForm
          defaults={{ shipping: policy("Shipping policy"), returns: policy("Return policy"), refunds: policy("Refund policy"), instructions: config.instructions }}
        />
      )}
      {step === 7 && (
        <div className="grid gap-6 md:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <p className="text-sm text-fg-muted">This is how {aiName} will appear to your customers.</p>
            <Alert tone="warning" title="Live test conversations aren't available yet">
              {isOpenAIConfigured()
                ? "Test chats with your AI employee arrive with the AI conversation release. "
                : "The AI engine isn't configured on this deployment yet. "}
              Your AI employee will stay off until you&apos;ve tested it — we never switch on an untested assistant.
            </Alert>
            <form action={continueFrom.bind(null, 7)} className="flex justify-end pt-2">
              <Button type="submit" size="lg">Continue</Button>
            </form>
          </div>
          <WidgetPreview name={aiName} welcomeMessage={config.welcomeMessage} brandColor={config.brandColor} businessName={business.name} />
        </div>
      )}
      {step === 8 && (
        <div className="space-y-5">
          <ul className="divide-y divide-line rounded-2xl border border-line">
            <Checklist done={Boolean(employee)} label={`${aiName} is named and configured`} />
            <Checklist done={(docs?.length ?? 0) > 0} label="Policies added to the knowledge base" optional />
            <Checklist done={shopify?.status === "active"} label="Shopify store connected" />
            <Checklist done={Boolean(employee?.tested_at)} label="Tested in preview" />
            <Checklist done={Boolean(employee?.published_version_id)} label="Configuration published" />
            <Checklist done={false} label="Chat widget switched on in your Shopify theme editor (App embeds → Mairo Assist)" />
          </ul>
          <Alert tone="info" title="What happens next">
            Your AI employee is <strong className="text-fg">paused</strong> until every required step above is done. Once
            it&apos;s tested and published, you&apos;ll switch it on from your dashboard and enable the chat widget in your
            Shopify theme editor.
          </Alert>
          <form action={continueFrom.bind(null, 8)} className="flex justify-end">
            <Button type="submit" size="lg">Go to my dashboard</Button>
          </form>
        </div>
      )}
    </Shell>
  );
}

function Checklist({ done, label, optional }: { done: boolean; label: string; optional?: boolean }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 text-sm">
      {done ? <Check className="size-4 text-success" aria-label="Done" /> : <CircleDashed className="size-4 text-fg-subtle" aria-label="Not done" />}
      <span className={done ? "text-fg" : "text-fg-muted"}>{label}</span>
      {optional && !done && <Badge className="ml-auto">Optional</Badge>}
    </li>
  );
}

function Shell({ step, reached, children }: { step: number; reached: number; children: React.ReactNode }) {
  const current = ONBOARDING_STEPS[step - 1];
  return (
    <div className="grid gap-8 pt-4 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Setup progress" className="hidden lg:block">
        <ol className="space-y-1">
          {ONBOARDING_STEPS.map((s) => {
            const available = s.n <= reached;
            const inner = (
              <>
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs",
                    s.n === step ? "bg-gradient-to-br from-violet to-electric text-white" : s.n < reached ? "bg-success/15 text-success" : "bg-white/5 text-fg-subtle",
                  )}
                >
                  {s.n < reached && s.n !== step ? <Check className="size-3.5" aria-hidden /> : s.n}
                </span>
                {s.title}
              </>
            );
            return (
              <li key={s.n}>
                {available ? (
                  <Link href={`/onboarding?step=${s.n}`} aria-current={s.n === step ? "step" : undefined} className={cn("flex items-center gap-3 rounded-lg px-2 py-2 text-sm", s.n === step ? "bg-white/5 text-fg" : "text-fg-muted hover:text-fg")}>
                    {inner}
                  </Link>
                ) : (
                  <span className="flex items-center gap-3 px-2 py-2 text-sm text-fg-subtle">{inner}</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <section className="glass glow-ring animate-fade-up rounded-2xl p-5 sm:p-8">
        <div className="mb-2 flex items-center justify-between text-xs text-fg-subtle">
          <span>Step {step} of {TOTAL_STEPS}</span>
          <span className="lg:hidden">{current.title}</span>
        </div>
        <div className="mb-6 h-1 overflow-hidden rounded-full bg-white/5" aria-hidden>
          <div className="h-full rounded-full bg-gradient-to-r from-violet to-electric transition-all" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
        </div>
        <h1 className="mb-6 text-2xl font-semibold tracking-tight sm:text-3xl">{current.question}</h1>
        {children}
      </section>
    </div>
  );
}
