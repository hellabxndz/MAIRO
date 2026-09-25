# Setup checklist: getting Mairo Assist live

About 1 hour in total. Do the steps in order. Menu names on these sites may
differ slightly; if a screen doesn't match, send a screenshot.

## ☐ 1. Shopify Partner account (5 min, free)

1. Go to **partners.shopify.com** and click **Join now**.
2. Sign up with your business email and fill in the business details.
3. Once you're in, stop there. We'll create the app together in Phase 3.

## ☐ 2. Supabase: database and logins (20 min, free to start)

1. Go to **supabase.com**, sign up and click **New project**.
   - Name: `mairo-assist`
   - Database password: generate a strong one and **save it in your password manager**
   - Region: the one closest to your customers (e.g. US East)
2. Wait about 2 minutes for the project to be ready.
3. Open **Project Settings → API** (or **API Keys**) and copy these three into a note:
   - **Project URL**
   - **Publishable key** (older projects call it the *anon* key)
   - **Secret key** (older projects call it the *service_role* key). **Never share this one publicly.**
4. Open **SQL Editor → New query**. On GitHub (branch `claude/mairo-assist-saas-cambkf`),
   open `mairo-assist/supabase/setup_all.sql`, click **Copy raw file**, paste it into
   the query and click **Run**. It sets up the whole database in one go and should
   say "Success". If it shows an error, stop and send a screenshot.
5. Open **Authentication → Sign In / Providers → Email**: make sure **Confirm email** is on.
6. Leave the URL settings for now. You'll fill them in after step 3, once you have your web address.

## ☐ 3. Vercel: put the app online (10 min)

1. Go to **vercel.com** and open your account (the one hosting Mairo).
2. Click **Add New → Project** and import the **MAIRO** GitHub repo.
3. **Important:** set **Root Directory** to `mairo-assist`, and set the branch to
   `claude/mairo-assist-saas-cambkf` (or wait until it's merged into main).
4. Under **Environment Variables**, add:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL from step 2.3 |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key |
   | `SUPABASE_SECRET_KEY` | Secret key |
   | `ENCRYPTION_KEY` | Random value (see below) |
   | `CRON_SECRET` | Another random value (see below) |

   To make the two random values, open Terminal (Mac) and run
   `openssl rand -base64 32` twice, one value each. Or ask me and I'll walk you through it.
5. Click **Deploy**. When it's done, copy your site address (e.g.
   `https://mairo-assist.vercel.app`).
6. Add one more variable, `NEXT_PUBLIC_APP_URL`, set to that address, then click **Redeploy**.
7. Back in **Supabase → Authentication → URL Configuration**:
   - **Site URL**: your site address
   - **Redirect URLs**: add your site address followed by `/**` (e.g. `https://mairo-assist.vercel.app/**`)
8. In **Supabase → Authentication → Email Templates**, replace these three with
   the files in `mairo-assist/supabase/templates/`:
   - **Confirm signup** ← `confirmation.html`
   - **Reset password** ← `recovery.html`
   - **Change email address** ← `email_change.html`

## ☐ 4. OpenAI: the AI's brain (10 min, pay per use)

1. Go to **platform.openai.com**, sign in, and open **Billing**. Add a card and
   about $10 of credit.
2. Open **API keys → Create new secret key** and copy it.
3. In Vercel, add:
   - `OPENAI_API_KEY`: the key
   - `OPENAI_MODEL`: a current model name from OpenAI's models page (ask me if unsure)
4. **Redeploy**.

## ☐ 5. Try it (10 min)

1. Open your site and click **Get Started**.
2. Sign up, click the link in the confirmation email, and complete the 8 setup steps.
3. Go to **AI Employee**, send a test message in the preview, then click **Publish Changes**.
4. On **Overview**, click **Activate AI**.
5. Tell me how it went, including anything confusing or broken.

## ☐ 6. Connect Shopify (30 min)

1. **Supabase → SQL Editor**: open
   `mairo-assist/supabase/migrations/20260926000100_phase3_shopify.sql` on
   GitHub, copy all of it, paste, **Run**. It should say "Success".
2. **Encryption key**: on your computer, open PowerShell and run:
   `$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)`
   Copy the result. In Vercel add `ENCRYPTION_KEY` = that value (mark it
   **Sensitive**). Don't paste it anywhere else, and never change it later
   (connected stores would need reconnecting).
3. **Create the app**: Shopify **Dev Dashboard** (from the Partner Dashboard →
   Apps) → **Create app** → name it "Mairo Assist". In its configuration:
   - App URL: `https://mairo-assist.vercel.app/api/shopify/install`
   - Allowed redirection URL: `https://mairo-assist.vercel.app/api/shopify/callback`
   - Scopes: `read_products`, `read_inventory`, `read_orders`
   - Compliance webhooks (customer data request, customer erasure, shop
     erasure): all three → `https://mairo-assist.vercel.app/api/webhooks/shopify`
   - Release/save a version.
4. Copy the app's **Client ID** and **Client secret** into Vercel as
   `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` (secret marked **Sensitive**).
   **Redeploy**.
5. **Development store**: Partner Dashboard → **Stores → Add store → Development
   store**. Add a few products (with sizes and stock) so there's something to sync.
6. In Mairo Assist: **Integrations** → type `your-dev-store.myshopify.com` →
   **Connect Shopify** → approve. Within a minute you should see products and
   counts; then ask the AI preview "do you sell …?".

## ☐ 7. Free plan and paid plans (Stripe)

1. **Supabase → SQL Editor**: run
   `mairo-assist/supabase/migrations/20260927000100_free_plan.sql`. Every
   business (including ones you already have) is put on the Free plan.
2. Free works right away: new sign-ups get 100 AI responses a month and nothing
   is charged.
3. **To sell paid plans** (optional, can be done later):
   1. Create a **Stripe** account, and stay in **Test mode** at first.
   2. **Products → Add product** three times: Starter $149/month, Growth
      $299/month, Pro $499/month (recurring, monthly). Copy each **price ID**
      (`price_...`).
   3. **Developers → Webhooks → Add endpoint**:
      `https://mairo-assist.vercel.app/api/webhooks/stripe`, with the events
      `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
      `customer.subscription.updated`, `customer.subscription.deleted`,
      `invoice.paid`, `invoice.payment_failed`. Copy the **signing secret**
      (`whsec_...`).
   4. **Settings → Billing → Customer portal**: turn it on (used by "Manage billing").
   5. In Vercel, add `STRIPE_SECRET_KEY` (`sk_test_...`, Sensitive),
      `STRIPE_WEBHOOK_SECRET` (Sensitive), `STRIPE_PRICE_STARTER`,
      `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_PRO`, then **Redeploy**.
   6. Test with card `4242 4242 4242 4242`. When it all works, repeat with
      **live** keys and prices.
4. Your own business is on Free after the migration. To give yourself a paid
   plan without paying, ask me for the one-line SQL.

## ☐ 8. Put the chat on your store (Phase 4)

1. **Supabase → SQL Editor**: run
   `mairo-assist/supabase/migrations/20260928000100_phase4_widget.sql`.
2. **Shopify Dev Dashboard → your app → Versions → Create version**, keeping
   everything as before, plus:
   - **Scopes**: `read_products,read_inventory,read_orders,write_script_tags`
   - **App proxy**: Subpath prefix `apps`, Subpath `mairo-assist`,
     Proxy URL `https://mairo-assist.vercel.app/api/proxy`
   - **Release** it.
3. In Mairo Assist → **Integrations**, click **Connect Shopify** again with the
   same store address and approve (this grants the new permission).
4. Make sure your AI employee is tested, published and **active**.
5. Go to **Chat Widget**. When all checks are green, click **Turn on chat
   widget**, then open your store: the chat bubble appears in the corner.
6. **Order lookup in chat** (optional, later) needs both:
   - Shopify's approval for protected customer data (Partner Dashboard → your
     app → API access → Protected customer data), then set
     `SHOPIFY_CUSTOMER_DATA=approved` in Vercel and reconnect the store.
   - A **Resend** account with your domain verified: set `RESEND_API_KEY`
     (Sensitive) and `MAIL_FROM` (e.g. `Your Store <help@yourdomain.com>`).
   - It's included from the Growth plan.

## Later (before real customers)

- ☐ Custom email sender (Resend or Postmark) connected under **Supabase → Auth → SMTP**
- ☐ Your own domain (e.g. `assist.yourbrand.com`) pointed at the Vercel project
- ☐ Privacy and Terms pages reviewed by a lawyer
- ☐ Shopify protected customer data request (Partner Dashboard → your app → API access), then set `SHOPIFY_CUSTOMER_DATA=approved`
