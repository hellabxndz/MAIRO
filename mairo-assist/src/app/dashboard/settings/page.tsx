import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { BusinessProfileForm, SupportSettingsForm } from "@/components/settings/settings-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireBusiness } from "@/lib/tenancy/context";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireBusiness("business.update");
  const supabase = await createClient();
  const [{ data: business }, { data: settings }] = await Promise.all([
    supabase.from("businesses").select("name, website_url, industry, description").eq("id", ctx.business.id).single(),
    supabase.from("business_settings").select("support_email, escalation_email, timezone, conversation_retention_days").eq("business_id", ctx.business.id).single(),
  ]);
  const timezones = ["UTC", ...Intl.supportedValuesOf("timeZone").filter((tz) => tz !== "UTC")];

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your business details and how support works." />
      <Card>
        <CardHeader>
          <CardTitle>Business details</CardTitle>
          <CardDescription>Your AI employee uses these to introduce your brand.</CardDescription>
        </CardHeader>
        <CardContent>
          <BusinessProfileForm
            defaults={{
              name: business?.name ?? "",
              websiteUrl: business?.website_url ?? "",
              industry: business?.industry ?? "",
              description: business?.description ?? "",
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Support and data</CardTitle>
        </CardHeader>
        <CardContent>
          <SupportSettingsForm
            timezones={timezones}
            defaults={{
              supportEmail: settings?.support_email ?? "",
              escalationEmail: settings?.escalation_email ?? "",
              timezone: settings?.timezone ?? "UTC",
              retentionDays: String(settings?.conversation_retention_days ?? 365),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
