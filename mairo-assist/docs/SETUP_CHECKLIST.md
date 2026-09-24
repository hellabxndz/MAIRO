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

## Later (before real customers)

- ☐ Custom email sender (Resend or Postmark) connected under **Supabase → Auth → SMTP**
- ☐ Your own domain (e.g. `assist.yourbrand.com`) pointed at the Vercel project
- ☐ Privacy and Terms pages reviewed by a lawyer
- ☐ Next build phase: Shopify connection (needs step 1 done)
