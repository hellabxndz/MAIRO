import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  const existingIntake = await db.onboardingIntake.findUnique({
    where: { organizationId: session.user.organizationId },
  });

  if (existingIntake) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Let&apos;s set up your ad plan</h1>
      <p className="mt-2 text-neutral-400">
        A few questions so we can build your first month&apos;s strategy. This takes
        about two minutes.
      </p>
      <div className="mt-10">
        <OnboardingForm />
      </div>
    </div>
  );
}
