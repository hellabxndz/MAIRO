import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="September 24, 2026">
      <section>
        <h2>Who we are</h2>
        <p>Mairo Assist provides an AI assistant that online stores (&ldquo;merchants&rdquo;) add to their websites. For information about a store&apos;s own customers, the merchant decides how it is used and we process it on the merchant&apos;s behalf.</p>
      </section>
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>Account information for merchants and their team members: name, email and sign-in activity.</li>
          <li>Store information a merchant authorizes through Shopify: products, inventory, and — only where needed for order support — orders, fulfillment and the customer name and email attached to them.</li>
          <li>Conversations between shoppers and the assistant, and the requests created from them.</li>
          <li>Usage information needed to run and bill the service, such as AI usage counts.</li>
        </ul>
      </section>
      <section>
        <h2>What we don&apos;t collect</h2>
        <p>We never ask for Shopify passwords and never process payment card numbers. We don&apos;t sell personal information and don&apos;t infer sensitive characteristics about shoppers.</p>
      </section>
      <section>
        <h2>How it&apos;s protected</h2>
        <p>Each merchant&apos;s data is isolated from every other merchant&apos;s at the database level. Store credentials are encrypted. Order details are shared with a shopper only after verification. Administrative actions are logged.</p>
      </section>
      <section>
        <h2>Retention and deletion</h2>
        <p>Merchants choose how long conversations are kept. When a merchant disconnects their store or uninstalls the app, we stop syncing immediately and delete store data according to Shopify&apos;s data-protection requirements. Shoppers can ask the merchant to access or delete their data, and we act on those requests.</p>
      </section>
      <section>
        <h2>AI processing</h2>
        <p>Conversations are processed by our AI provider to generate replies. The assistant always identifies itself as an AI.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>Questions about privacy can be sent to the contact address listed on this website.</p>
      </section>
    </LegalPage>
  );
}
