import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="September 24, 2026">
      <section>
        <h2>The service</h2>
        <p>Mairo Assist lets a business configure an AI assistant for its online store. The business is responsible for the instructions, policies and information it gives the assistant, and for decisions it approves in the approval center.</p>
      </section>
      <section>
        <h2>Your responsibilities</h2>
        <ul>
          <li>Keep your account credentials secure and only invite people you trust.</li>
          <li>Make sure your policies and instructions are accurate and lawful.</li>
          <li>Don&apos;t use the service to send unsolicited marketing or to mislead shoppers.</li>
        </ul>
      </section>
      <section>
        <h2>AI limitations</h2>
        <p>AI replies can be wrong. The assistant is designed to rely on your store&apos;s data and your policies, to say when it doesn&apos;t know, and to hand off to your team — but you should review its conversations. It never performs refunds, cancellations or order changes without your approval.</p>
      </section>
      <section>
        <h2>Billing</h2>
        <p>Paid plans renew monthly until cancelled. Usage allowances are listed on the pricing page. Charges are made through a single billing provider for each subscription.</p>
      </section>
      <section>
        <h2>Changes and termination</h2>
        <p>You can cancel at any time. We may suspend accounts that abuse the service or put other merchants or shoppers at risk.</p>
      </section>
    </LegalPage>
  );
}
