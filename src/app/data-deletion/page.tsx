import type { Metadata } from "next";
import { LegalPage, Section, Bullets } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";
import { auth } from "@/lib/auth";
import { runningMetaCampaigns } from "@/lib/billing/running-campaigns";
import { db } from "@/lib/db";
import { DeleteAccountButton } from "./delete-account-button";

export const metadata: Metadata = {
  title: "Delete your data · MAIRO",
  description: "How to remove your MAIRO account and everything we hold about you.",
};

// Every sentence here describes lib/account/close.ts and the Meta disconnect
// as they behave. What happens straight away and what takes longer are kept
// apart on purpose: the live records go the moment you confirm; backups, logs
// and copies already sent to other companies don't.

export default async function DataDeletionPage() {
  const session = await auth();
  const canDeleteHere = Boolean(session?.user && session.user.role !== "OWNER");
  const orgId = canDeleteHere ? session?.user?.organizationId ?? null : null;
  const ids = orgId ? [orgId, ...(await db.organization.findMany({ where: { parentId: orgId }, select: { id: true } })).map((o) => o.id)] : [];
  const running = (await runningMetaCampaigns(ids)).map((c) => ({ name: c.name, dailyBudgetCents: c.dailyBudgetCents }));
  const days = LEGAL.deletionWindowDays;

  return (
    <LegalPage
      title="Delete your data"
      intro={`Two ways to remove what ${LEGAL.productName} holds about you: disconnect Meta only, or delete the whole account. Both take effect as soon as you confirm, and neither requires asking us. A few copies outside the live service take longer to disappear — they're listed below.`}
    >
      <Section heading="Disconnect Meta only">
        <p>
          Keeps your {LEGAL.productName} account but ends our access to your ad account. Go to{" "}
          <strong className="text-neutral-200">Dashboard → Meta connection → Disconnect</strong>.
        </p>
        <p>
          The access token Meta issued us is deleted from our database straight away, and we can no
          longer read or change anything on your ad account. Campaigns already created stay in your
          Meta ad account and keep running until you pause them — pause them first in Campaigns if you
          want them to stop.
        </p>
        <p>
          You can also remove us from Meta&apos;s side at any time, without touching{" "}
          {LEGAL.productName}: Facebook → Settings &amp; Privacy → Settings → Business Integrations.
        </p>
      </Section>

      <Section heading="Delete your whole account">
        <p>This can&apos;t be undone. When you confirm, in this order:</p>
        <Bullets
          items={[
            <><strong className="text-neutral-200">Campaigns still running are named first.</strong> Deleting
              your account doesn&apos;t pause them, and afterwards we can&apos;t. You pause them, or confirm you
              understand they keep spending.</>,
            <><strong className="text-neutral-200">Your {LEGAL.productName} subscription is cancelled with
              Stripe.</strong> If Stripe can&apos;t confirm it, nothing is deleted, so you&apos;re never billed for an
              account that no longer exists. The current month isn&apos;t refunded.</>,
            <><strong className="text-neutral-200">Removed from {LEGAL.productName} straight away:</strong> your
              login; your business profile, onboarding answers and what {LEGAL.productName} learned about your
              business; your Meta connection and its access token, and any Google Tag Manager connection or
              phone number for texts; every plan, campaign record, ad, creative and social post; your
              conversations with the AI team and its activity history; your leads and what you marked about
              them; store orders and tracking settings; and feedback you sent us.</>,
            <><strong className="text-neutral-200">Pictures and videos</strong> you uploaded or {LEGAL.productName}{" "}
              made are deleted at the same time. If our file storage can&apos;t be reached at that moment, a daily
              check removes what&apos;s left.</>,
          ]}
        />

        <h3 className="pt-2 text-sm font-medium text-neutral-200">What takes longer</h3>
        <Bullets
          items={[
            `Backups. Our database provider keeps rolling backups so the service can recover from a failure. Deleted records drop out of them within ${days} days.`,
            `Server logs. Short-lived logs kept by our hosting provider can include account identifiers. They expire within ${days} days.`,
            "Copies already sent to other companies to do the work — ads and conversion events sent to Meta, and text and pictures sent to the AI providers listed in our privacy policy — are kept under those companies' own retention rules.",
            "Billing records. Stripe keeps its payment records, and we keep invoice records for as long as tax law requires. They're used for nothing else.",
          ]}
        />
        <p>
          <strong className="text-neutral-200">What isn&apos;t deleted:</strong> the campaigns themselves, which
          live in your Meta ad account and remain yours. If you want those gone too, pause or delete them in
          Meta Ads Manager.
        </p>

        {canDeleteHere ? (
          <div className="mt-8 rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-6">
            <h3 className="text-sm font-medium text-red-200">Delete this account</h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">
              You&apos;re signed in as{" "}
              <span className="text-neutral-200">{session?.user?.email}</span>. This deletes that
              account and its data as described above.
            </p>
            <div className="mt-5">
              <DeleteAccountButton running={running} />
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
          We confirm and complete a request we receive by email within {days} days. You can also use
          this address to ask for a copy of your data or to correct something.
        </p>
      </Section>
    </LegalPage>
  );
}
