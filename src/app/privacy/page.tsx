import type { Metadata } from "next";
import { LegalPage, Section, Bullets } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy · MAIRO",
  description: "What MAIRO collects, why, and how to have it deleted.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro={`${LEGAL.productName} runs Meta ad campaigns on behalf of small businesses. To do that we hold some information about you and your advertising. This page says exactly what, why, and how to get rid of it.`}
    >
      <Section heading="Who we are">
        <p>
          {LEGAL.productName} is operated by {LEGAL.companyName}. Where this policy says
          &ldquo;we&rdquo;, it means {LEGAL.companyName}. We are the data controller for the
          information described below.
        </p>
      </Section>

      <Section heading="What we collect">
        <p>Only what the service needs to function. Specifically:</p>
        <Bullets
          items={[
            <><strong className="text-neutral-200">Your account.</strong> Your name, email address, and a
              cryptographic hash of your password. We never store your password itself and cannot
              read it.</>,
            <><strong className="text-neutral-200">Your business.</strong> Business name, website,
              industry, and time zone.</>,
            <><strong className="text-neutral-200">What you tell us during onboarding.</strong> Your
              advertising goal, monthly budget, target audience, brand voice, competitors, and any
              notes you add.</>,
            <><strong className="text-neutral-200">Your Meta connection.</strong> If you connect a Meta
              ad account, we store its ID, your Facebook Page ID, your business ID, and an access
              token issued by Meta that lets us act on your behalf.</>,
            <><strong className="text-neutral-200">Your campaigns and results.</strong> The campaigns we
              create for you, their budgets and status, and the performance figures we read back
              from Meta.</>,
            <><strong className="text-neutral-200">Your conversations.</strong> Messages you exchange
              with the AI specialists inside the app.</>,
          ]}
        />
        <p>
          We do not collect payment card details. We do not use advertising cookies or third-party
          trackers on this site.
        </p>
      </Section>

      <Section heading="Why we hold it">
        <Bullets
          items={[
            "To sign you in and keep your account secure.",
            "To build your monthly advertising plan from the goal and budget you gave us.",
            "To create, run, and adjust campaigns on the ad account you connected.",
            "To show you how those campaigns are performing.",
            "To answer your questions through the AI specialists.",
            "To contact you about your account or a problem with your campaigns.",
          ]}
        />
        <p>
          We do not sell your information. We do not share it with advertisers, data brokers, or
          anyone building marketing lists.
        </p>
      </Section>

      <Section heading="Your Meta data specifically">
        <p>
          When you connect a Meta ad account you grant us permission to manage and read ads on that
          account. We want to be precise about what that means.
        </p>
        <Bullets
          items={[
            "We only ever touch the ad account you explicitly connected. We do not access other accounts, even if your Facebook login can reach them.",
            "Everything we create stays in your account. You can see, edit, pause, or delete any of it in Meta Ads Manager at any time, with or without us.",
            "We read performance figures for your campaigns only, and show them back to you alone. We do not pool them with other businesses' data.",
            "We do not post to your Facebook Page, read your messages, or access your personal profile content.",
            "You can disconnect at any time from the Meta connection page in your dashboard. That deletes the access token immediately.",
          ]}
        />
      </Section>

      <Section heading="Who else processes it">
        <p>
          We use a small number of service providers to run the product. They process data on our
          instructions only:
        </p>
        <Bullets
          items={[
            <><strong className="text-neutral-200">Meta Platforms</strong> — to create and read the ads
              we run for you.</>,
            <><strong className="text-neutral-200">Anthropic</strong> — powers the AI that writes your
              plans, ad copy, and specialist replies. Your prompts and business context are sent to
              generate those responses.</>,
            <><strong className="text-neutral-200">Neon</strong> — hosts our database.</>,
            <><strong className="text-neutral-200">Vercel</strong> — hosts and serves the application.</>,
          ]}
        />
      </Section>

      <Section heading="How long we keep it">
        <p>
          Account and campaign data is kept while your account is open, because the service can&apos;t
          work without it. Meta access tokens are deleted the moment you disconnect. When you close
          your account we delete your data within {LEGAL.deletionWindowDays} days, other than
          anything we&apos;re legally required to retain.
        </p>
      </Section>

      <Section heading="Your rights">
        <p>
          You can ask us for a copy of what we hold about you, ask us to correct it, or ask us to
          delete it. See the{" "}
          <a href="/data-deletion" className="text-neutral-200 underline underline-offset-4 hover:text-white">
            data deletion page
          </a>{" "}
          for how, or email{" "}
          <a href={`mailto:${LEGAL.contactEmail}`} className="text-neutral-200 underline underline-offset-4 hover:text-white">
            {LEGAL.contactEmail}
          </a>
          . We respond within {LEGAL.deletionWindowDays} days.
        </p>
      </Section>

      <Section heading="Security">
        <p>
          Passwords are hashed with bcrypt. Traffic is encrypted in transit. Meta access tokens are
          held server-side and never exposed to the browser. No system is perfectly secure, but if a
          breach affects your data we will tell you.
        </p>
      </Section>

      <Section heading="Children">
        <p>
          {LEGAL.productName} is a business tool and is not intended for anyone under 18. We do not
          knowingly collect information from children.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          If we change this policy in a way that materially affects you, we will update the date at
          the top and let you know by email before it takes effect.
        </p>
      </Section>
    </LegalPage>
  );
}
