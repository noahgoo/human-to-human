# NexusPulse: AI Job-Matching Portal (planning repo)

> **"NexusPulse" is a placeholder name** taken from the Stitch designs. The final brand has not been chosen (product owner, D-45).

NexusPulse is a two-sided job portal. **Applicants** upload their LinkedIn data export and a resume. They can check their fit for any job for free, which gives a 0–100 score with an explanation and lists their LinkedIn connections at the company. Each month they get **10 credits** (UTC calendar month; called `token` in code) to spend on applications, and each job costs 1–3. **Technical jobs** also ask for a public GitHub repo, which AI reviews statically on Security, Organization, Performance and Testing. Only recruiters see those ratings. **Recruiters** verify their company, post jobs, and review applicants ranked 70% fit / 30% GitHub (fit only for non-technical jobs). In the MVP they can shortlist or reject.

> **Status:** planning only. This repo has no application code yet. The plan is final as of pass 2; see [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md).

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 15 (App Router, React 19, TypeScript), Tailwind CSS v4, shadcn/ui, on **Vercel** |
| Data | **Supabase**: Postgres + RLS, Auth (email/password, Google, LinkedIn OIDC), Storage |
| Background jobs | **Inngest** (AI evaluations, repo fetches, parsing, emails, crons) |
| AI | **OpenRouter** via the Vercel AI SDK, with structured output |
| Libraries | zod, TanStack Query, papaparse, fflate, unpdf, mammoth, Octokit, tldts, Upstash rate limiting |
| Email / observability | Resend + React Email; Sentry, pino, Inngest dashboard |
| Tests | Vitest, pgTAP, @inngest/test, Playwright + axe, AI golden-set evals |

The reasoning for each choice is in [MASTER_PLAN §2](docs/MASTER_PLAN.md#2-stack-recommendation).

## Doc map

| Doc | What it covers | Owner |
|---|---|---|
| [`docs/SPEC.md`](docs/SPEC.md) | Original spec and **locked decisions** (these win over everything) | User |
| [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md) | Architecture, data model summary, API table, pages, MVP vs Later, phases, risks, decision log, product-owner decisions | Lead |
| [`docs/sections/frontend.md`](docs/sections/frontend.md) | Routes, components, design tokens, client state, accessibility, E2E | Frontend |
| [`docs/sections/backend.md`](docs/sections/backend.md) | Auth, route handlers, server actions, Inngest jobs, integrations, rate limits, email | Backend |
| [`docs/sections/data.md`](docs/sections/data.md) | Full DDL, RLS, views and RPCs, Storage, privacy and retention, pgTAP, seed | Data |
| [`docs/subplans/ai-evaluation.md`](docs/subplans/ai-evaluation.md) | Fit scoring, GitHub repo review, models, cost, prompt-injection defenses, evals | Backend |
| [`docs/subplans/applicant-ranking.md`](docs/subplans/applicant-ranking.md) | Ranking formula, tiers, pagination, recruiter data contract, fairness | Data |
| [`docs/subplans/linkedin-ingestion.md`](docs/subplans/linkedin-ingestion.md) | LinkedIn export parsing, normalization, connection matching | Data |
| [`docs/subplans/token-system.md`](docs/subplans/token-system.md) | Credits ledger, balance, atomic Apply, refunds | Backend |
| [`docs/subplans/company-verification.md`](docs/subplans/company-verification.md) | Work-email domain verification, admin queue, memberships | Backend |
| [`design/stitch/`](design/stitch/) | Stitch export: 5 MVP screens ([sign-in](design/stitch/sign_in_authentication_mvp/), [candidate onboarding](design/stitch/candidate_onboarding_mvp/), [job marketplace](design/stitch/job_marketplace_dashboard_mvp/), [post a job](design/stitch/post_a_job_screening_setup_mvp/), [recruiter pipeline](design/stitch/recruiter_pipeline_candidate_review_mvp/)) and 2 design systems ([Grounded Modern Utility](design/stitch/grounded_modern_utility/DESIGN.md), light, primary; [Obsidian Kinetic Intelligence](design/stitch/obsidian_kinetic_intelligence/DESIGN.md), **unused**: the product is light-theme only) | Design |
| [`design/stitch/nexuspulse_mvp_design_system_export_specs.md`](design/stitch/nexuspulse_mvp_design_system_export_specs.md) | Design overview and screen specs | Design |

## Agent team and ownership

| Agent | Owns | Reviews |
|---|---|---|
| **Lead (Senior SWE)** | MASTER_PLAN, cross-cutting decisions, decision log | All docs |
| **Frontend Engineer** | `sections/frontend.md` | backend.md, token-system, applicant-ranking |
| **Backend Engineer** | `sections/backend.md`, `ai-evaluation`, `token-system`, `company-verification` | frontend.md, data.md, applicant-ranking, linkedin-ingestion |
| **Data Engineer** | `sections/data.md`, `applicant-ranking`, `linkedin-ingestion` | backend.md, ai-evaluation, token-system, company-verification |

Data writes every migration and RLS policy. A sub-plan's owner specifies the contracts for its own area. Full map: [MASTER_PLAN §6](docs/MASTER_PLAN.md#6-ownership-map) and [§14](docs/MASTER_PLAN.md#14-sub-plan-index).

## MVP scope (brief)

- Sign-in with email/password, Google or LinkedIn (name, email and picture only). The role is chosen once.
- Applicant onboarding: **both required**: a LinkedIn export (ZIP or CSVs) that imports successfully, and a parsed resume (PDF/DOCX, up to 5 MB).
- Job marketplace. Free **Check fit** with connections at the company. **Apply** for 1–3 credits (10/month, no rollover, atomic and idempotent). Application status and withdraw.
- Technical jobs: AI static review of a public GitHub repo, which applicants never see.
- Recruiters: **one recruiter per company** in MVP, with company verification by work email and an admin fallback. Job posting (cost 1–3, technical flag). A ranked applicant list with a fairness notice. Shortlist and reject, a resume viewer, and the applicant's email revealed after shortlisting.
- Privacy: connections are visible only to the applicant who uploaded them, raw uploads are deleted after parsing, and users can export or delete their data.
- **Later:** messaging and intros, semantic search, compensation, OCR and AV scanning, verified repo ownership via GitHub account linking, multiple recruiters per company. The product is light-theme only. See [MASTER_PLAN §10](docs/MASTER_PLAN.md#10-mvp-vs-later).

Product-owner decisions are in [MASTER_PLAN §15](docs/MASTER_PLAN.md#15-product-owner-decisions).

## Getting started (planned)

These steps describe the intended developer setup once Phase 0 lands ([MASTER_PLAN §11](docs/MASTER_PLAN.md#11-phased-build-order)).

1. **Prerequisites:** Node 20+, pnpm, Docker (for local Supabase), and the Supabase CLI.
2. **Install:** `pnpm install`
3. **Environment:** copy `.env.example` to `.env.local` and fill in:
   - the Supabase URL and keys;
   - `OPENROUTER_API_KEY`;
   - the Inngest keys;
   - the GitHub App credentials;
   - the Resend key;
   - the Upstash URL and token;
   - the Sentry DSN.
   [backend.md §2.7](docs/sections/backend.md) lists every variable.
4. **Database:** `supabase start`, then `supabase db reset` to apply the migrations and seed personas, then `pnpm db:types` to generate the TypeScript types.
5. **Run:** `pnpm dev` (Next.js) and `npx inngest-cli dev` (local Inngest). Mailpit at `localhost:54324` catches email.
6. **Test:**
   - `pnpm test` (Vitest);
   - `supabase test db` (pgTAP);
   - `pnpm e2e` (Playwright);
   - `pnpm eval:ai` (AI golden sets; needs an OpenRouter key).
7. **Seed logins:** the users in `supabase/seed.sql` (applicant, verified and pending recruiters, admin) all use the local-only password documented in [data.md §9](docs/sections/data.md).
