import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, secondaryButtonClass } from "@/components/ui";
import { activeOrganizationId } from "@/lib/active-org";
import { SalesSourcePicker } from "./sales-source-picker";

// The questions a shop gets once it has paid.
//
// Deliberately not part of signup. At signup nobody has paid, half the answers
// would be guesses, and every extra question is somewhere to abandon — the one
// screen that must stay short. These are also the questions whose answers cost
// money to act on, so asking them of somebody who has just subscribed is asking
// them of somebody who has decided.
//
// Only for businesses selling online. A plumber has no catalogue and no post
// worth boosting, and asking anyway is how a setup flow becomes something
// people click past.

export const dynamic = "force-dynamic";

export default async function SalesSetupPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const [organization, intake, productCount] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { salesAdSource: true, boostPostId: true, website: true },
    }),
    db.onboardingIntake.findUnique({
      where: { organizationId },
      select: { primaryGoal: true },
    }),
    db.product.count({ where: { organizationId } }),
  ]);

  // Somebody who is not selling online has no business on this screen, and
  // sending them back to the dashboard is kinder than showing them three
  // choices that do not apply to what they are advertising.
  if (intake?.primaryGoal !== "SALES") redirect("/dashboard");

  return (
    <div>
      <PageHeader
        title="How should your ads look?"
        description="You're set up and paid — this is the last thing MAIRO needs, and only because you're selling online."
      />

      <Card>
        <SalesSourcePicker
          initialSource={organization?.salesAdSource ?? "MAIRO_CREATES"}
          initialPostId={organization?.boostPostId ?? null}
          initialWebsite={organization?.website ?? null}
          initialProductCount={productCount}
        />
      </Card>

      <p className="mt-6 text-sm text-neutral-500">
        You can change this any time.{" "}
        <Link href="/dashboard" className="text-neutral-300 underline underline-offset-4">
          Skip for now
        </Link>{" "}
        and MAIRO writes the ads itself.
      </p>

      <div className="mt-8">
        <Link href="/dashboard" className={secondaryButtonClass}>
          Go to your dashboard
        </Link>
      </div>
    </div>
  );
}
