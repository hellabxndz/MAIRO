import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Galaxy } from "@/components/galaxy";
import { SetupForm } from "./setup-form";

// This has to check the database fresh on every request (is there an OWNER
// yet?), not get baked into the static build output.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const ownerCount = await db.user.count({ where: { role: "OWNER" } });
  if (ownerCount > 0) redirect("/sign-in");

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-16 text-white">
      <Galaxy />
      <div className="relative w-full max-w-sm">
        <p className="mb-8 text-center text-lg font-semibold tracking-tight">MAIRO</p>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 shadow-[0_0_60px_-15px_rgba(255,255,255,0.15)] backdrop-blur-xl">
          <h1 className="mb-1 text-xl font-semibold">Create your owner account</h1>
          <p className="mb-6 text-sm text-neutral-400">
            One-time setup. This creates the account with access to the AIOS dashboard —
            once it exists, this page stops working.
          </p>
          <SetupForm />
        </div>
      </div>
    </div>
  );
}
