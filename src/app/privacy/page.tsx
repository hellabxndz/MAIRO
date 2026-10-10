import type { Metadata } from "next";
import { LegalPage, Section, Bullets } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";
import { metaPostingApproved } from "@/lib/social/publishing-status";

export const metadata: Metadata = {
  title: "Privacy Policy · MAIRO",
  description: "What MAIRO collects, why, and how to have it deleted.",
};

export default function PrivacyPage() {
  const postingLive = metaPostingApproved();
  return (
    <LegalPage
      title="Privacy policy"
      intro={`${LEGAL.productName} runs Meta ad campaigns on behalf of small businesses. To do that we hold some information about you and your advertising. This page says exactly what, why, and how to get rid of it.`}
    >
      <Section heading="Who we are">
        <p>
          {LEGAL.productName} is operated by {LEGAL.companyName}. Where this policy says
          &ldquo;we&rdquo;, it means {LEGAL.companyName}. We are the data controller for the
          information described below. The details of your leads and your store&apos;s shoppers are
          held on your behalf: we use them only to provide {LEGAL.productName} to you.
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
              industry, and time zone. If you give us your website, we read its public pages to learn what
              you sell and how you describe it, and keep what we learned where you can see and correct it.</>,
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
            <><strong className="text-neutral-200">What your AI team did.</strong> A record of the work
              MAIRO&apos;s AI specialists do for you — what each one checked, recommended or changed, the
              figures it used, and what you approved or turned down, and when — along with your Daily
              Brief, reports and Performance Coach findings. It&apos;s kept so you can always see what
              happened and why.</>,
            <><strong className="text-neutral-200">Your leads.</strong> If your ads use a form we host,
              the details people submit to you — such as name, email and phone — so you can see and
              follow up your enquiries. If your Meta pixel is connected, a lead&apos;s email and phone number
              are hashed (scrambled one way) and sent to Meta so it can count the lead as a result of your
              ads; the readable details are not sent.</>,
            <><strong className="text-neutral-200">What you tell us about results.</strong> Whether a lead
              was good, booked an appointment or became a customer, and what a sale was worth — only what
              you mark.</>,
            <><strong className="text-neutral-200">Your store&apos;s orders.</strong> If you add our order
              webhook to your store (Shopify, for example), each order&apos;s value, currency and time.
              Shoppers&apos; emails and phone numbers are hashed on arrival and never stored in the clear.
              Where your store sends them, we also keep the shopper&apos;s country, IP address, browser
              type and ad click ID. The hashed details, those identifiers and the order value are passed
              to Meta so it can match the sale to your ads. If you give us your store&apos;s address, we
              also read its public product list.</>,
            <><strong className="text-neutral-200">Your social posts (Scale plan).</strong> The posts we
              plan and write for you, the pictures and videos you upload or we make for them, and which
              Instagram account and Facebook Page you connect for posting.</>,
            <><strong className="text-neutral-200">Optional connections.</strong> If you connect Google
              Tag Manager, an access token from Google that lets us add your tracking tags. If you turn
              on text alerts, the phone number we text.</>,
            <><strong className="text-neutral-200">What you tell us.</strong> Feedback you send, including
              why you&apos;re cancelling if you choose to say, and whether you agreed to let us use your
              results anonymously in a case study.</>,
          ]}
        />
        <p>
          We do not collect payment card details. We do not use advertising cookies or third-party
          trackers on this site; the only cookies we set keep you signed in, protect the Meta and
          Google sign-in steps, and remember your settings.
        </p>
      </Section>

      <Section heading="Why we hold it">
        <Bullets
          items={[
            "To sign you in and keep your account secure.",
            "To build your monthly advertising plan from the goal and budget you gave us.",
            "To create, run, and adjust campaigns on the ad account you connected.",
            "To show you how those campaigns are performing, and which of them bring in leads and sales.",
            "On the Scale plan, to publish the social posts you approve, once Meta allows it.",
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
            "We do not read your messages or access your personal profile content.",
            `We post on your Facebook Page or Instagram only on the Scale plan, only if you turn on Social Manager and grant Meta's separate posting permission, and only as you choose: each post you approve, a week you approve at once, or — if you switch on Social Autopilot — posts it schedules itself, following the strategy and the posts you have already approved.${postingLive ? "" : " Meta has not yet approved MAIRO's posting permissions, so publishing is not available to customers yet."}`,
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
            <><strong className="text-neutral-200">OpenAI</strong> — makes ad images in the Creative
              Studio. Your image requests, and any picture you upload to change, are sent to make them.</>,
            <><strong className="text-neutral-200">Stripe</strong> — takes payment for your
              subscription. Your card details go to Stripe, never to us.</>,
            <><strong className="text-neutral-200">Google</strong> — makes and edits ad pictures with its
              Gemini image model: your picture requests, and any photo you upload to change, are sent to
              it. Also used if you sign in with Google or connect Google Tag Manager.</>,
            <><strong className="text-neutral-200">Twilio</strong> — sends text alerts, only if you turn
              them on.</>,
            <><strong className="text-neutral-200">Neon</strong> — hosts our database.</>,
            <><strong className="text-neutral-200">Vercel</strong> — hosts and serves the application, and
              stores the pictures and videos you upload.</>,
          ]}
        />
        <p>
          If you run ads for clients and turn on a share link for a client&apos;s weekly report, anyone
          with that link can see the report until you turn the link off.
        </p>
      </Section>

      <Section heading="How long we keep it">
        <p>
          Account and campaign data is kept while your account is open, because the service can&apos;t
          work without it. Meta access tokens are deleted the moment you disconnect. When you delete
          your account, its records are removed from the live service straight away; backup copies
          and server logs expire within {LEGAL.deletionWindowDays} days; information already sent to
          the providers above is kept under their own retention rules; and billing records are kept
          for as long as tax law requires. The{" "}
          <a href="/data-deletion" className="text-neutral-200 underline underline-offset-4 hover:text-white">
            data deletion page
          </a>{" "}
          has the details.
        </p>
      </Section>

      <Section heading="Your rights">
        <p>
          You can see and correct what {LEGAL.productName} has learned about your business under
          Settings → Business Brain, and delete your account yourself on the data deletion page.
          You can also ask us for a copy of what we hold about you, ask us to correct it, or ask us to
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
