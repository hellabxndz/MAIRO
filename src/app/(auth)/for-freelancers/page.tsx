"use client";

import { useActionState } from "react";
import Link from "next/link";
import { freelancerSignUpAction } from "@/lib/actions/auth-actions";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-white/30";

export default function FreelancerSignUpPage() {
  const [state, formAction, pending] = useActionState(freelancerSignUpAction, undefined);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-white">Set up your studio</h1>
      <p className="mb-6 text-sm leading-relaxed text-neutral-400">
        For people who run ads for other businesses. One login, every client you
        work with, each with their own ad account and campaigns.
      </p>

      <form action={formAction} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-neutral-400">Your name</label>
          <input name="name" required className={inputClass} placeholder="Jane Diaz" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-neutral-400">Studio name</label>
          <input
            name="studioName"
            required
            className={inputClass}
            placeholder="Diaz Media"
          />
          <p className="text-xs text-neutral-600">
            What your clients know you as. Only you see this.
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-neutral-400">Email</label>
          <input
            name="email"
            type="email"
            required
            className={inputClass}
            placeholder="you@yourstudio.com"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-neutral-400">Password</label>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            className={inputClass}
            placeholder="At least 8 characters"
          />
        </div>

        {state?.error && <p className="text-sm text-red-400">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-white px-3 py-2 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-60"
        >
          {pending ? "Creating studio..." : "Create studio"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-400">
        Running ads for your own business?{" "}
        <Link href="/sign-up" className="text-white underline">
          Sign up here
        </Link>
      </p>
    </div>
  );
}
