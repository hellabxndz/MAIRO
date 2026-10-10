import { googleSignInEnabled } from "@/lib/google-sign-in";
import { signInErrorMessage } from "@/lib/google-sign-in-rules";
import { AuthCard } from "@/components/auth-card";
import { PLANS, STARTER_TRIAL_DAYS } from "@/lib/plans";
import { SignUpForm } from "./sign-up-form";

// The form is a client component; this server half decides whether Google is
// configured, which only the server can see, and reads any ?error= a Google
// login was sent back with (e.g. no account yet, so one is created here).
//
// Beside the form: what happens after signing up, in the order the product
// does it, and exactly when money is involved — so nobody signs up expecting
// a campaign to run, or a card to be charged, before it will.

const STEPS = [
  { title: "Tell MAIRO about your business", body: "Your goal, your budget and your website." },
  { title: "Get your free advertising plan", body: "Who to reach, how much to spend and which campaign to run, written for your business." },
  { title: "Edit and approve the strategy", body: "Change anything with MAIRO or by hand, then approve it." },
  { title: "Connect Meta and choose a plan when you're ready", body: "Your own Meta ad account, and the subscription that lets MAIRO build and run your campaign." },
  { title: "Review and authorize the launch", body: "Nothing goes live until you approve it, with the budget shown." },
];

function money(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export default async function Page({ searchParams }: PageProps<"/sign-up">) {
  const { error } = await searchParams;
  const starter = PLANS.find((p) => p.tier === "STARTER");
  const noTrial = PLANS.filter((p) => !(p.trialDays ?? 0)).map((p) => p.name);
  return (
    <div className="mx-auto grid max-w-[900px] grid-cols-1 items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] md:gap-8">
      <AuthCard className="">
        <SignUpForm
          googleEnabled={googleSignInEnabled()}
          initialError={signInErrorMessage(typeof error === "string" ? error : null)}
        />
      </AuthCard>

      <aside aria-labelledby="next-title" className="rounded-2xl border border-white/10 bg-paper/70 p-6 sm:p-8">
        <h2 id="next-title" className="text-[16px] font-semibold text-white">What happens after you sign up</h2>
        <ol className="mt-5 space-y-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3.5">
              <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-[12.5px] font-semibold text-violet-300">
                {i + 1}
              </span>
              <div>
                <p className="text-[14px] font-semibold leading-snug text-white">{s.title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-400">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-6 space-y-3 border-t border-white/10 pt-5 text-[13px] leading-relaxed text-neutral-400">
          <p>
            <strong className="font-semibold text-white">Your free plan needs no credit card.</strong> You pay only if you choose a subscription.
          </p>
          {starter && (
            <p>
              <strong className="font-semibold text-white">The Starter trial:</strong> {STARTER_TRIAL_DAYS} days free. Stripe takes your card when you subscribe and
              charges {money(starter.priceMonthly)} a month from the day the trial ends, unless you cancel before then. {noTrial.join(" and ")} have no trial and are billed
              from the day you subscribe.
            </p>
          )}
          <p>Your ad spend is separate: Meta charges it to your own ad account, at the budget you approve.</p>
        </div>
      </aside>
    </div>
  );
}
