"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signInAction } from "@/lib/actions/auth-actions";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-white/30";

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signInAction, undefined);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-white">Welcome back</h1>
      <p className="mb-6 text-sm text-neutral-400">Sign in to your MAIRO dashboard.</p>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <div className="space-y-1">
          <label className="text-xs font-medium text-neutral-400">Email</label>
          <input
            name="email"
            type="email"
            required
            className={inputClass}
            placeholder="you@business.com"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-neutral-400">Password</label>
          <input name="password" type="password" required className={inputClass} />
        </div>

        {state?.error && <p className="text-sm text-red-400">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-white px-3 py-2 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-60"
        >
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-400">
        Don&apos;t have an account?{" "}
        <Link href="/sign-up" className="text-white underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
