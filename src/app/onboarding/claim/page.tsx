import { ClaimPlan } from "./claim-plan";

// Where "Sign in and keep this plan" on the free ad plan lands someone who
// already has an account (proxy.ts sends them to sign in first, and back).
// The plan this browser saved joins their business — taken from this
// browser's own cookie by a POST, never from the link — then setup opens
// with its answers, or the dashboard once the business is set up.

export const metadata = { title: "Keeping your plan" };
export const dynamic = "force-dynamic";

export default function ClaimPage() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-6 text-center">
      <ClaimPlan />
    </main>
  );
}
