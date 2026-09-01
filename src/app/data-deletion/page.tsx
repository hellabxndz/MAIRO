import type { Metadata } from "next";
import { LegalPage, Section, Bullets } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";
import { auth } from "@/lib/auth";
import { DeleteAccountButton } from "./delete-account-button";

export const metadata: Metadata = {
  title: "Delete your data · MAIRO",
  description: "How to remove your MAIRO account and everything we hold about you.",
};

export default async function DataDeletionPage() {
  const session = await auth();
  const canDeleteHere = Boolean(session?.user && session.user.role !== "OWNER");

  return (
    <LegalPage
      title="Delete your data"
      intro={`Two ways to remove what ${LEGAL.productName} holds about you: disconnect Meta only, or delete the whole account. Both are immediate and neither requires asking us.`}
    >
      <Section heading="Disconnect Meta only">
        <p>
          Keeps your {LEGAL.productName} account but cuts our access to your ad account. Go to{" "}
          <strong className="text-neutral-200">Dashboard → Meta connection → Disconnect</strong>.
        </p>
        <p>
          The access token Meta issued us is deleted from our database immediately, and we can no
          longer read or change anything on your ad account. Campaigns already created stay in your
          Meta ad account — they are yours, and you keep full control of them in Ads Manager.
        </p>
        <p>
          You can also revoke us from Meta&apos;s side at any time, without touching{" "}
          {LEGAL.productName}: Facebook → Settings &amp; Privacy → Settings → Business Integrations.
        </p>
      </Section>

      <Section heading="Delete your whole account">
        <p>This removes everything. It cannot be undone. Deleted immediately:</p>
        <Bullets
          items={[
            "Your login — name, email, and password hash.",
            "Your business profile and everything from onboarding: goal, budget, audience, brand voice, competitors, notes.",
            "Your Meta connection, including the stored access token, ad account ID, and Page ID.",
            "Every monthly plan, campaign record, and creative request we hold for you.",
            "Your entire conversation history with the AI specialists.",
          ]}
        />
        <p>
          <strong className="text-neutral-200">What is not deleted:</strong> the campaigns themselves,
          which live in your Meta ad account and remain yours. If you want those gone too, delete
          them in Meta Ads Manager — we cannot do that once our access is revoked.
        </p>

        {canDeleteHere ? (
          <div className="mt-8 rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-6">
            <h3 className="text-sm font-medium text-red-200">Delete this account</h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">
              You&apos;re signed in as{" "}
              <span className="text-neutral-200">{session?.user?.email}</span>. This deletes that
              account and all of its data straight away.
            </p>
            <div className="mt-5">
              <DeleteAccountButton />
            </div>
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <p className="text-sm leading-relaxed text-neutral-400">
              <a href="/sign-in" className="text-neutral-200 underline underline-offset-4 hover:text-white">
                Sign in
              </a>{" "}
              and come back to this page to delete your account yourself. Or email us — see below.
            </p>
          </div>
        )}
      </Section>

      <Section heading="Or ask us to do it">
        <p>
          Email{" "}
          <a
            href={`mailto:${LEGAL.contactEmail}?subject=Data%20deletion%20request`}
            className="text-neutral-200 underline underline-offset-4 hover:text-white"
          >
            {LEGAL.contactEmail}
          </a>{" "}
          from the address on your account, with &ldquo;Data deletion request&rdquo; in the subject.
        </p>
        <p>
          We will confirm and complete it within {LEGAL.deletionWindowDays} days. You can also use
          this address to request a copy of your data or ask us to correct something.
        </p>
      </Section>

      <Section heading="What we keep afterwards">
        <p>
          Nothing that identifies you, unless the law requires it — for example, invoice records we
          must retain for tax purposes. Those are kept for the legally required period and used for
          nothing else.
        </p>
      </Section>
    </LegalPage>
  );
}
