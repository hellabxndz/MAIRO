# Dashboard simplification: audit and consolidation map (30 Oct 2026)

What the customer dashboard looked like before this change, what was redundant,
and where everything went. Nothing was deleted. Every route still exists and
still works. The change is in what the navigation puts in front of a business
owner.

## 1. What was there

**Navigation**

| Surface | Items |
|---|---|
| Desktop sidebar | + Create (modal), plus Overview, Campaigns, Creative Studio, Performance, Intelligence, Recommendations, Approvals, Results. Settings at the bottom. Also Help, Feedback and Sign out. |
| Phone bottom bar | Overview, Campaigns, + Create, Creatives, Approvals |
| Top bar (desktop and phone) | Ask MAIRO, Simple/Advanced toggle, notifications, theme toggle, profile (which went to Settings) |

That makes eight primary destinations plus Settings. Five of them covered overlapping ground:

- Performance (`/dashboard/analytics`)
- Results (`/dashboard/reports`)
- Recommendations (`/dashboard/coach`)
- Approvals (`/dashboard/decisions`)
- Intelligence (`/dashboard/intelligence`, `/dashboard/team`, `/dashboard/agents`)

**Overview (Simple).** `ConsoleOverview` drew about ten panels:

- greeting header
- journey card
- Ask your AI team
- four metrics
- AI Action Center
- campaigns panel
- creatives panel
- results chart
- Daily Brief
- AI team (eight specialists)
- recent activity
- pulse card

Several actions competed, with no single next step.

**Creating a campaign.** `/dashboard/create` opened a platform picker. Only Meta works; Google, Retargeting and Search are "not available yet" cards. Then came the seven-step wizard at `/dashboard/create/meta`: business → goal → audience → budget → ad → AI review → launch. There was no "do it again" path.

**Creatives.** Five tabs: Active, New, Past, Top Performing, Library. Creative Studio is a separate route.

**Settings and account.**

- `/dashboard/settings` held a 14-link grid plus business, pixel, billing, assistant and automation forms.
- `/dashboard/account` was a second link list.
- Billing, Meta, Pixel, Tracking, Integrations, Notifications and Guide were each their own page, reachable from both.

**Backend (unchanged by this work).**

- Meta OAuth, campaign build, launch and pause (`lib/campaigns/*`, `lib/meta/*`)
- auto-launch only after a recorded person's approval
- Stripe checkout and webhooks; entitlements (`lib/entitlements.ts`)
- decisions and approvals (`lib/decisions/*`, `lib/approvals/queue.ts`)
- pixel and CAPI (`lib/tracking/*`)
- Creative Studio generation, AI assistant tools, cron jobs

## 2. Consolidation map

| New place | What it holds | Routes kept and reachable |
|---|---|---|
| **Overview** `/dashboard` | Welcome and business; ad status; 4 figures; one MAIRO summary built from real records; one primary action; up to 3 pending approvals with Approve / Not now; up to 3 campaigns; "What would you like to advertise today?" composer | `/dashboard/mission`, `/dashboard/decisions` (all approvals and history), `/dashboard/coach`, `/dashboard/intelligence`, `/dashboard/team`, `/dashboard/agents` |
| **Campaigns** `/dashboard/campaigns` | List: name, status, daily budget, goal, spend, result. "+ Create campaign" goes to `/dashboard/create`, which now asks "Similar to a previous campaign / Promote something different / Start fresh", then runs the existing wizard with its review and explicit Launch | `/dashboard/create/meta`, `/dashboard/launch`, `/dashboard/leads`, board view (`?view=board`) |
| **Creatives** `/dashboard/creatives` | "+ Create ad"; To review / Running / Library; Top performing and Past one tap away | `/dashboard/creative-studio`, `/dashboard/creatives/suggested`, `/dashboard/creatives/requests` |
| **Results** `/dashboard/results` (new) | Spend, Leads/Purchases, Cost per result, Revenue, ROAS; Today / 7 days / 30 days / Custom; What's working / What needs improvement / What MAIRO recommends (Review, Approve, Dismiss); More details: impressions, clicks, CTR, CPC, CPM | `/dashboard/analytics` (full figures), `/dashboard/reports` (weekly and monthly), `/dashboard/activity` |
| **Account** `/dashboard/account` (profile button) | Business profile, Connected Meta account, Pixel & tracking, Billing & subscription, Change plan, Notifications, Help, Log out; Appearance and Simple/Advanced moved here | `/dashboard/settings` and its sub-pages, `/dashboard/business`, `/dashboard/integrations`, `/dashboard/meta`, `/dashboard/pixel`, `/dashboard/tracking`, `/dashboard/website`, `/dashboard/billing`, `/dashboard/notifications`, `/dashboard/guide` |

**One AI experience.** The Overview composer is the entry point. Recognised intents go straight to the real workflow:

| Intent | Goes to |
|---|---|
| create or advertise | campaign create, prefilled with what was typed |
| make an ad or image | Creative Studio |
| performance | Results |
| approvals | the Approval Center |

Everything else goes to the existing MAIRO assistant, at `/dashboard/agents?ask=…` on the same thread as the side panel, which answers from the account's records with its tools. There are no separate agent screens in the navigation.

## 3. What did not change

- No schema change and no migration.
- No API route or server action was removed or changed in behaviour.
- Approvals still go through `ApprovalModal` and the decision actions with the atomic claim. Launch still requires the wizard's explicit Launch, or a recorded approval for auto-launch.
- Prices, plans, entitlements and Stripe are untouched.
