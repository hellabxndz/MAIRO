# One MAIRO: the unified AI and its Business Brain

The customer talks to one AI — MAIRO — that knows their business, remembers what they told it, reads their real accounts, and proposes or (within their limits) makes changes. Inside, specialised backend services still do the work, because that is what keeps it reliable and safe. This document is the map.

## 1. Audit: what existed before this change

| System | What it was | Verdict |
|---|---|---|
| **The chat assistant** (`components/mairo/assistant.tsx`, `app/api/agents/chat/route.ts`, `lib/ai/agents.ts`) | Already one assistant: three earlier chat agents (Strategist, Creative, Support) had been folded into one thread with one prompt. Its default name was "Alex", shown as a persona beside MAIRO. | **Kept**; the name is now MAIRO. |
| **The eight "AI specialists"** (`lib/team/agents.ts`, `AgentRun`) | Strategy, Audience, Creative, Campaign, Optimization, Budget Guardian, Analytics and Growth. Each is a set of existing services, not a separate model, run as steps of the daily review and recorded as `AgentRun` rows. The customer saw them as named agents: on a team page, on decision cards, in onboarding, in pricing ("All 8 AI advertising specialists") and in the AI's own instructions. | **Consolidated in presentation, kept as backend structure.** |
| **The Business Brain** (`lib/brain/*`, `lib/business/brain.ts`, `BusinessBrain`, `BrainEvent`, `MairoLearning`) | Structured facts per business, each with a source ("You told MAIRO", "From your website", "Learned from your results"…), a status (confirmed or inferred), a timestamp and staleness checks. The customer's word always beats an inference. Also: temporary facts (promotions, sold out), history, and lessons learned from results with sample sizes. | **Kept: this is the one Brain.** Added the business's rules. |
| **Memory** (`lib/memory/profile.ts`, `AgentThread`/`AgentMessage`) | Conversation history in the database (survives sessions and deployments), plus a memory profile summarised into every request. | **Kept.** |
| **Context assembly** (chat route) | Every request already carried the Brain (`brainPrompt`), memory, readiness, strategy, the Strategy Engine, Meta knowledge and the mission. | **Kept.** It also carries the rules now, and the "one MAIRO" brief replaces the team brief. |
| **Tools** (`lib/ai/assistant-tools.ts`) | Reads: diagnose campaigns, Performance Coach, spend, team activity, Brain, mission, next best step. Writes (role-gated): update the Brain, tell MAIRO, propose a mission, propose a fix (one of the rules' own decisions, approved by the owner). | **Kept;** added `get_tracking_health` and `get_recent_activity`. |
| **Deterministic safety** (`lib/automation/levels.ts`, `lib/decisions/guardrails.ts`, `lib/decisions/apply.ts`, `lib/members/roles.ts`) | Automation levels, the actions that always need approval, the spending limits checked again at apply time, role checks on every action, and an atomic claim so nothing is applied twice. | **Kept;** the business's rules now go through the same `limitProblem` gate. |
| **AIOS copilot** (`OWNER_COPILOT`) | The founder's own assistant across all businesses, never given to customers. | **Kept separate on purpose:** it isn't the customer's AI. |

## 2. The architecture

```
             customer
                │  one conversation (sidebar Ask MAIRO / ⌘K, Home box, /dashboard/agents)
                ▼
   ┌───────────────────────────── one MAIRO ─────────────────────────────┐
   │  context per request (chat route):                                  │
   │    Business Brain facts + rules  ·  memory profile  ·  goal/mission │
   │    readiness · strategy · what MAIRO learned from results           │
   │  tools, filtered by the person's role in that business              │
   └──────────────┬──────────────────────────────┬──────────────────────┘
                  │ reads (always allowed)        │ writes (role-gated, proposal-only for changes)
                  ▼                               ▼
   live data from integrations             Business Brain edits (source + time kept)
   (Meta via the services, tracking        decisions → the approval queue
    health, results, activity)                     │
                                                   ▼
                       deterministic gate: levels · always-approval list · spending limits ·
                       the business's rules (radius) · roles · atomic claim · audit log
                                                   │
                                                   ▼
                                            Meta Marketing API
```

- **One business-context service.** `loadBrainState()` and `brainPrompt()` power the chat, Campaign Review, creative generation, the Strategy Engine and the decisions. `guardrailsFor()` gives every automatic or approved change the same limits plus the business's rules. Nothing keeps its own copy of the profile.
- **Live data stays live.** Campaign figures, tracking health and activity come from tools that read the current records and Meta, never from conversation memory. The Brain holds what's true about the business; the integrations hold what's happening.
- **The AI proposes; code decides.** The model can only call the tools it was given for that person's role. A change can only be one the rules produced (`propose_fix` points at a decision id), and applying it goes through `applyDecision` → `limitProblem` → Meta. A conversation can't widen a limit, skip an approval or reach another business.
- **One AI to the customer, eight kinds of work inside.** Work is still recorded per kind (`AgentRun.agent`), so "what MAIRO did" can say which part of the job it was. Every name reads "MAIRO · Strategy", "MAIRO · Budget Guardian" and so on: one AI, different jobs.

## 3. What changed in this round

- **One name.** The default assistant name is MAIRO; a name a business chose is kept. Every kind of work is labelled "MAIRO · …". Customer-facing copy no longer speaks of an AI team, eight specialists or named agents: dashboard, onboarding, decision cards, coach findings, notifications, approvals, pricing and FAQ, the site description and the privacy policy.
- **The AI is told it's one.** `AI_TEAM_BRIEF` now says: you are the one MAIRO, no specialists to hand off to, pick the tools yourself, report only what tools show, say plainly when something failed, and never break the business's rules.
- **The business's rules, enforced in code.** Two new Business Brain fields, under "Your Rules for MAIRO" on the business profile:
  - **Furthest from your area to advertise (miles)** (`maxRadiusMiles`). "We mainly want customers in Miami and don't want to advertise outside a 20-mile area" becomes `serviceArea = Miami` and `maxRadiusMiles = 20`, saved by the chat tool with source "From a chat with MAIRO". From then on the daily review drops any audience change beyond it, and `limitProblem` refuses one at apply time, approved or automatic.
  - **Standing instructions** (`standingInstructions`): "always / never" in the owner's words, given to the AI with every request. These can't be enforced in code, so nothing that spends or launches relies on them alone.
- **New tools:** `get_tracking_health` (the daily check's verdict, or "not checked yet") and `get_recent_activity` (changes made, what failed and why, what's waiting).

## 4. Still incomplete (not claimed)

- **The team page still exists** (`/dashboard/team`, now "What MAIRO is working on"), and the classic landing page and video clips still show the old specialist design. The rendered product film's captions must match the video, so `lib/demo/*` is unchanged until the film is re-rendered.
- **Retrieval is prompt-based, not semantic search.** The Brain, memory profile and recent history go into every request in full (they're small and structured). There's no vector index; past conversations beyond the thread's recent messages aren't searched. That is enough today; at scale, a retrieval layer over `AgentMessage` and `BrainEvent` would replace "recent N".
- **Only one rule is enforced in code** (the advertising radius). Others the owner might want — no discounts, excluded areas, maximum cost per lead — are standing instructions (followed by the AI, not enforced) unless they're already spending limits in Settings.
- **The live AI wasn't exercised in tests.** The suites check the context, tools, rules and gates with no model call. How well the model uses them is only visible with `ANTHROPIC_API_KEY` set, in a real conversation.
- **Proactive messages are the existing notifications** (tracking, coach, decisions, reports) in MAIRO's voice. They're written from templates and records, not generated by the model per business.

## 5. Tests

`npm run check:unified-ai`: one AI (names, prompts, copy); memory (stored with source, survives reload, in every request, correctable and deletable, an inference never overwrites the owner); isolation (no fact, rule, tracking or activity crosses businesses); rules (refused when approved or automatic, dropped from recommendations); tool permissions by role; grounding (not-checked vs checked, nothing vs something, failures shown). Alongside `check:assistant`, `check:brain`, `check:members`, `check:autopilot`, `check:decisions` and the rest of `npm run audit`.
