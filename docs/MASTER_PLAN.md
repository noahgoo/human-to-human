# Master Plan: AI Job-Matching Portal ("NexusPulse")

> **Status:** Final (pass 2). Owner: **Lead (Senior SWE)**.
> **Inputs:** [`SPEC.md`](./SPEC.md) (its locked decisions win over everything here) and [`design/stitch/`](../design/stitch/).
> **How to read this:**
> - §1–§6 are the architecture brief the specialists worked from, updated with the pass-2 decisions.
> - §7–§14 consolidate the specialist docs.
> - §15 records the product owner's decisions.
> - The names in §4–§6 are **canonical**. Every change to them is recorded in the §13 Decision log.

---

## 1. Lead: open questions, risks, assumptions

**Open questions.** None. Every pass-1 question was decided by the Lead (§13), and the product owner answered the remaining ones (§15, D-37–D-47). The most visible product-owner decisions:
- The UI says **"Credits"**; code and database names stay `token` (D-37).
- The **LinkedIn import is required** at onboarding, together with a parsed resume (D-39).
- **One recruiter per company** in MVP (D-44).
- **Light theme only** (D-47).
- Launch is US-only, with no NYC-located roles and no EU users (D-40).

**Design vs. spec conflicts.** The spec wins in each case. frontend.md §1.3 and §7 have the full list.
- The GitHub categories are **Security, Organization, Performance, Testing**. Stitch's "Security Rigor / Architecture / Runtime / Code Quality" is not used.
- The 70/30 weights are fixed, so Stitch's rubric-weight editor is dropped.
- Token cost is **1–3, set per job** (not the "1–2" shown in Stitch).
- One role per account, so the role switcher becomes a `RoleBadge`.
- Messaging-type actions (Request Intro, Schedule Interview, Hiring Review Panel) are **Later**.
- Recruiters never see applicants' connections, so the "internal connections" panels are dropped.

**Top risks.** The full register is in §12.
- **LinkedIn API limits.** OIDC sign-in returns only name, email and picture. The rest needs partner programs, so applicants upload their data export, whose format can change without notice.
- **Third-party PII** in `Connections.csv`.
- **AI cost and abuse.**
- **Prompt injection** through repos, resumes and job text.
- **Hidden ratings vs. the GDPR right of access.**
- **Hiring-AI regulation:** NYC LL144 and the EU AI Act.
- **Token races.**

**Assumptions**
- Single region: Vercel `iad1` and Supabase `us-east-1`.
- English UI.
- Sign-in is required for every page, including the job board.
- Fewer than 10k users and at most about 2,000 applications per job in year one.
- OpenRouter is the only LLM gateway.
- The token period is the UTC calendar month.

---

## 2. Stack recommendation

| Concern | Choice | Why (one line) |
|---|---|---|
| Framework | **Next.js 15 App Router + React 19 + TypeScript (strict)** | Locked. RSC suits read-heavy dashboards, and route handlers and server actions cover writes. |
| Styling/UI | **Tailwind CSS v4 (CSS-first `@theme`) + shadcn/ui (Radix) + lucide-react** | Locked Tailwind. shadcn gives accessible primitives we own, themed with Grounded Modern Utility tokens (frontend.md §2). |
| Hosting | **Vercel** (Fluid compute, Node runtime; middleware on Edge) | Locked. The parsers and the Supabase admin client need Node APIs. |
| DB / Auth / Storage | **Supabase**: Postgres 15, Auth, Storage, RLS | Locked. RLS is the authorization layer. |
| Query layer | **`@supabase/supabase-js` + `@supabase/ssr` + generated types**. No ORM. | Every client query goes through PostgREST, so RLS always applies. Atomic multi-row writes are Postgres RPCs. |
| Migrations | **Supabase CLI** (`supabase/migrations`, `seed.sql`, `supabase test db`) | Plain SQL next to RLS. `db reset` gives a local copy. |
| Validation | **zod** (`lib/schemas/`, shared client and server) | One schema per input, used by forms, handlers and LLM output (D-31). |
| Forms | **react-hook-form + zodResolver** | Reuses the zod schemas. |
| Data fetching | **RSC for reads. TanStack Query only for polling and optimistic UI** | Small bundles. Polling is simpler than Realtime in MVP. |
| Background jobs | **Inngest** (`/api/inngest`) | Durable steps, retries, per-key concurrency and throttles, `cancelOn`, `step.sleep`, and a local dev server. Slow LLM and GitHub work never runs in a request. |
| Scheduled jobs | **Inngest cron** for anything that emits events or calls the Storage API (`sweep-stuck-work`, purges, digest, spend monitor). **pg_cron** only for SQL-only retention. | No `pg_net` or Vault needed (D-01). |
| LLM client | **Vercel AI SDK `generateObject` + `@openrouter/ai-sdk-provider`**, `gpt-tokenizer` for budgets | Typed structured output, and models swappable by env (ai-evaluation.md §2.3). |
| GitHub fetch | **`@octokit/rest` + `@octokit/auth-app`** (read-only GitHub App), **zipball** | 5k/h rate limit. The zipball reuses fflate (D-04). Code is never executed. |
| CSV / ZIP | **papaparse / fflate** | Handles LinkedIn's preamble, BOMs and quoting. Streams ZIPs with byte caps. |
| PDF / DOCX | **unpdf / mammoth**, **file-type** for magic bytes | No native dependencies, which suits serverless. |
| Domains | **tldts** (Public Suffix List) | Correct registrable domain for company verification. |
| Rate limiting | **@upstash/ratelimit + Upstash Redis** | Per-policy limits. The LLM path fails closed. |
| Tests | **Vitest** (unit, integration, concurrency), **pgTAP** (RLS and RPCs), **@inngest/test**, **Playwright** + axe, **MSW**, k6 (pre-launch) | Each layer has one tool. pgTAP proves rating visibility in the database itself. |
| AI evals | `pnpm eval:ai` golden sets (ai-evaluation.md §9.2) | Gates prompt and model changes. |
| Email | **Resend + React Email**, which is also Supabase Auth SMTP. Mailpit in local dev and E2E. | One provider for auth and app mail. |
| Observability | **Sentry** (Next + Inngest), **pino** JSON logs with redaction, Inngest dashboard, `ai_usage` table, Vercel Speed Insights | Errors, job runs, AI spend and Web Vitals each have one home. |

---

## 3. System architecture

```
 Browser (RSC pages + client islands, TanStack Query polling)
    │  server actions / fetch /api/v1/*     ▲ signed URLs (direct upload; 60 s resume download)
    ▼                                        │
 ┌──────────────── Vercel: Next.js ──────────┴────────────────┐
 │ middleware (@supabase/ssr refresh, JWT claims → gating)    │
 │ RSC loaders │ server actions │ /api/v1 route handlers      │
 │ lib/auth guards │ zod │ Upstash ratelimit │ pino │ Sentry  │
 │ /api/inngest  ◄──── Inngest Cloud (events, steps, crons)   │
 └──────┬─────────────────────────┬──────────────┬────────────┘
        │ user JWT (RLS)          │ service role │ HTTPS
        ▼                         │ (Inngest)    ▼
 ┌──────────── Supabase ──────────┴──┐   ┌────────────┐ ┌──────────┐
 │ Auth (email, Google, LinkedIn     │   │ OpenRouter │ │ GitHub   │
 │  OIDC; access-token hook)         │   │ (LLMs)     │ │ REST API │
 │ Postgres + RLS + RPC + views      │   └────────────┘ └──────────┘
 │ Storage: resumes, linkedin-exports│   Resend · Upstash · Sentry
 │  (private), company-logos (public)│
 │ pg_cron (SQL-only retention)      │
 └───────────────────────────────────┘
```

### 3.1 Check fit (free)
1. The client calls `POST /api/v1/jobs/{jobId}/fit-evaluations` and, **in parallel**, `GET /api/v1/jobs/{jobId}/connections`. The connections come from a SQL lookup over the applicant's own active import, with no LLM involved (D-22).
2. The handler checks the applicant is onboarded, then computes `input_hash` over job, resume, LinkedIn import (always present: onboarding requires it, D-39; a deleted import returns `409 linkedin_required`), `job.updated_at`, prompt version and model.
   - A cache hit returns `200`.
   - An in-flight row returns `202` with that row's id.
   - Otherwise the rate limit applies (5/min, 20/day, 3/day per job) along with the global budget breaker. The handler inserts a `pending` row, sends `fit/evaluation.requested`, and returns `202 {id}`.
3. Inngest `evaluate-fit` redacts PII and calls the LLM, which returns judgements only. `lib/ai/fit/score.ts` turns those into a deterministic 0–100 score. The function saves the result and writes an `ai_usage` row.
4. The client polls `GET /api/v1/fit-evaluations/{id}` every 2 s, then backs off.

### 3.2 Apply (atomic, idempotent; technical jobs get a GitHub review)
1. The `ApplyDialog` creates an `Idempotency-Key` when it opens. It makes a new key only when the body changes or the dialog closes (D-10). It sends `POST /api/v1/applications {jobId, githubRepoUrl?, repoOwnershipAttested?, expectedTokenCost}`.
2. The handler canonicalizes the repo URL. For technical jobs it makes a **synchronous public-repo check** (5 s timeout, cached in Redis), so a bad repo fails with `422` before anything is spent.
3. RPC `apply_to_job` runs as one transaction:
   - takes a per-applicant advisory lock;
   - replays or rejects the idempotency key;
   - locks the job row `FOR SHARE` and checks it is `open`;
   - checks the cost (`CONFLICT token_cost_changed`);
   - returns `ALREADY_APPLIED` if needed;
   - creates the month's grant lazily and checks the balance (`INSUFFICIENT_TOKENS`);
   - inserts the application (with resume snapshot), the ledger spend, the `submitted` event, and a `pending` `repo_evaluations` row for technical jobs.
4. After commit, the handler sends `application/submitted`. Two functions pick it up:
   - `snapshot-fit` links a reused or new fit evaluation.
   - `evaluate-repo` (technical jobs) re-checks the repo, pins the commit SHA, checks the review cache, fetches the tree manifest, selects files, streams the zipball through fflate (nothing touches disk), computes signals and redacts secrets, runs a single-pass or map-reduce LLM review on **Security, Organization, Performance and Testing** (1–10 each), applies sanity caps, and saves.
5. The Inngest cron `sweep-stuck-work` (every 5 min) re-emits lost events (D-01).
6. Applicants see only the coarse review state through `my_applications`, never the ratings (D-07).

### 3.3 Recruiter ranking
1. `/recruiter/jobs/[jobId]` loads page 1 through `lib/ranking/loadApplicantsPage()`. The same function serves `GET /api/v1/jobs/{jobId}/applicants`.
2. The view `job_applicant_rankings` (`security_invoker`, filtered by `is_company_member`) computes the rank:
   - technical job: `rank_score = 0.7 × confidence + 0.3 × (github_overall − 1)/9 × 100` (D-05);
   - non-technical job: `rank_score = confidence`;
   - tiers (D-06): 0 Complete, 1 Incomplete (review pending or failed; ordered by confidence), 2 Not scored.
3. Rows have a total order: tier, score, confidence, security, `submitted_at`, id. Pagination uses keyset cursors with `rankingVersion` and `rankingChanged`.
4. Actions:
   - `setApplicationStatus` (shortlist, reject, reconsider) sends a status email after a 10-minute delay;
   - `getResumeUrl` returns a 60 s attachment URL;
   - `revealContact` works only on shortlisted applications.
   Every action is audited.

---

## 4. Canonical domain entities

**Conventions**
- `uuid` PKs (`gen_random_uuid()`), and user rows key on `profiles.id = auth.users.id`.
- `created_at`/`updated_at timestamptz` with the shared `set_updated_at()` trigger.
- snake_case, plural table names, FK columns named `<singular>_id`, booleans `is_*`.
- **No soft delete**:
  - jobs move through `status`;
  - PII is hard-deleted;
  - `token_ledger`, `application_events` and `audit_log` are append-only (an UPDATE is blocked by trigger).
- RLS is enabled on every table, deny by default.
- Internal helpers live in schema `private`.
- Every SECURITY DEFINER function sets `search_path = ''`.
- Full DDL is in [data.md §3](./sections/data.md).

**Enums:**

| Enum | Values |
|---|---|
| `user_role` | `applicant`, `recruiter`, `admin` |
| `application_status` | `submitted`, `shortlisted`, `rejected`, `withdrawn` |
| `job_status` | `draft`, `open`, `closed`, `archived` |
| `verification_status` | `pending`, `verified`, `rejected` |
| `evaluation_status` | `pending`, `running`, `succeeded`, `failed` |
| `token_entry_kind` | `monthly_grant`, `application_spend`, `refund`, `adjustment` |
| `linkedin_import_source` | `zip`, `csv` |

**Tables.** The list is in §7. New in pass 2 (D-20): `audit_log`, `company_aliases`, `work_email_verifications`, `blocked_email_domains`.

**Token rules (D-02, D-36)**
- The monthly grant is +10. **Balance = the sum for the current UTC period only**, so nothing rolls over.
- `get_token_balance()` is read-only and adds a *virtual* +10 when no grant row exists yet. `apply_to_job` writes the grant row.
- There is no grant cron.
- Archiving a job refunds its `submitted` applications.
- Withdrawals, closed jobs and failed reviews get no refund.

**Rating visibility.** This is enforced in the database, not only the UI.
- `repo_evaluations` has **no applicant policy**.
- `my_applications` is the only applicant read surface. It exposes coarse review state and nothing else.
- `fit_evaluations.flags` is not column-granted to clients.
- The self-service export excludes ratings.
- pgTAP checks all of this in `01_rating_visibility` and `13_applicant_safe_fields`.

---

## 5. API conventions

- **Server actions** handle form mutations from our own UI: auth, role selection, onboarding, profile, the company-verification flows, job create/update/publish/close/archive, status changes, resume URL, contact reveal, withdraw, account delete/export, and admin actions. Each returns `ActionResult<T> = {ok:true,data} | {ok:false,error}`.
- **`/api/v1` route handlers** handle anything polled, idempotent, paginated or called outside a form: upload init and complete, parse status, fit evaluations, connections, repo validation, token balance and ledger, Apply, the applicant's applications, recruiter applicant list and detail, and company search. Non-versioned routes: `/auth/callback`, `/api/inngest`, `/api/health`.
- **Page reads** happen in RSC with the user-scoped client.
- **Error shape:** `{ "error": { "code", "message", "details", "requestId" } }`. The code-to-HTTP mapping:

  | Code | HTTP |
  |---|---|
  | `UNAUTHENTICATED` | 401 |
  | `FORBIDDEN` | 403 |
  | `NOT_FOUND` | 404 |
  | `VALIDATION_FAILED` | 422 (`details.fields`) |
  | `CONFLICT`, `ALREADY_APPLIED`, `IDEMPOTENCY_KEY_REUSED`, `JOB_NOT_OPEN` | 409 |
  | `INSUFFICIENT_TOKENS` | 402 |
  | `REPO_NOT_ACCESSIBLE` | 422 |
  | `RATE_LIMITED` | 429 |
  | `INTERNAL` | 500 |

  RPCs raise `P0001` with the code in `HINT` and JSON in `DETAIL`. **The API never returns 400.** A missing `Idempotency-Key` is a 422 (D-10).
- **Casing:** every JSON key at the API boundary is camelCase, including the `nextCursor` and `error.requestId` envelope keys. The database is snake_case (D-12).
- **Auth guards** (`lib/auth/`): `getSession`, `requireUser`, `requireRole`, `requireOnboarded`, `requireCompanyMember(companyId, {verified})` and `requireAdmin` (`aal2`). Middleware gates using JWT claims. RLS is the real enforcement.
- **Idempotency:** the `Idempotency-Key` (uuid) header is required on `POST /api/v1/applications`. It is stored with a `request_hash`. A replay returns the identical 201, and a key reused with a different body returns `IDEMPOTENCY_KEY_REUSED`.
- **Pagination:** cursor-based. `?limit` (default 20, max 100) and an opaque `cursor`. Response: `{ data, nextCursor }`.
- **Mutations:** mutating route handlers require JSON plus a same-origin `Origin` header.
- **Events:** Inngest event names are `domain/noun.verb`, and payloads carry ids only.

---

## 6. Ownership map

| Doc / area | Owner | Reviewers |
|---|---|---|
| [`MASTER_PLAN.md`](./MASTER_PLAN.md) | Lead | All |
| [`sections/frontend.md`](./sections/frontend.md): routes, components, tokens, client state, a11y, Playwright | Frontend | Backend, Lead |
| [`sections/backend.md`](./sections/backend.md): auth, route handlers, server actions, Inngest, integrations, email, rate limits | Backend | Frontend, Data, Lead |
| [`sections/data.md`](./sections/data.md): DDL, RLS, views and RPCs, Storage, privacy and retention, pgTAP, seed | Data | Backend, Lead |
| Sub-plans | see §14 | |

**Schema rule:** Data writes every migration, RLS policy and pgTAP test. A sub-plan owner specifies the columns and RPC contracts for its own area. `apply_to_job` is specified by Backend and implemented by Data.

---

## 7. Data model summary

Full DDL, RLS matrix and delete rules are in [data.md §3–§4](./sections/data.md). The columns listed are the key ones only.

| Table | Purpose | Key columns | Applicant | Recruiter (verified member) |
|---|---|---|---|---|
| `profiles` | One per auth user | `role` (write-once), `full_name`, `email` (not client-granted), `onboarded_at` | own | co applicants' name/avatar |
| `applicant_profiles` | Applicant preferences and pointers | `headline`, `target_seniority`, `active_resume_id`, `active_linkedin_import_id` | own | co applicants |
| `companies` | Employer | `name`, `name_normalized` (generated), `verification_status`, `review_reason` | verified ones | own |
| `company_domains` | Domains that prove membership | `domain` (unique), `verification_method` (`email_link`/`admin`/`dns_txt`) | — | own |
| `company_aliases` **(new)** | Extra names for connection matching | `alias`, `alias_normalized`, `source` | verified cos | own |
| `recruiter_memberships` | Recruiter↔company: one active per recruiter **and one per company** (D-44) | `verification_status`, `verified_via` (`email_domain`/`admin`/`company_admin`), `is_company_admin`, `work_email` | — | own, colleagues |
| `work_email_verifications` **(new)** | Magic-link tokens (hashed) | `token_hash`, `expires_at`, `consumed_at` | — (RPC only) | — |
| `blocked_email_domains` **(new)** | Free-mail and disposable blocklist | `domain`, `reason` | read | read |
| `jobs` | Posting | `token_cost` 1–3 (default 2, frozen after first application), `is_technical`, `status`, `location`, `work_mode` | open jobs of verified cos | co (drafts for pending) |
| `linkedin_imports` | One upload or parse run | `status`, `files_present`, `counts`, `warnings`, `uploaded_at`, Profile.csv fields | own | — |
| `linkedin_positions` / `_skills` / `_education` | Parsed rows | `import_id`, minimal columns | own | — (D-29) |
| `connections` | **Third-party PII**, minimal | `first_name`, `last_name`, `company_name(_normalized)`, `position`, `connected_on`; no email, no URL | own only | **never** |
| `resumes` | Upload + extracted text | `storage_path`, `mime_type`, `size_bytes ≤ 5 MB`, `text_content`, `parse_status` | own | snapshotted on co applications |
| `fit_evaluations` | Confidence score | `input_hash`, `confidence_score`, `explanation`, `requirements`, `sub_scores`, `band`, `flags` (hidden) | own | linked from co applications |
| `repo_evaluations` | GitHub static review | four `*_score` 1–10, `overall_score`, `rationale`, `commit_sha`, `flags`, `failure_code` | **never** | co |
| `applications` | Applicant→job | `status`, `token_cost` snapshot, `github_repo_url`, `resume_id`, `fit_evaluation_id`, `idempotency_key`, `request_hash` | own (via RPCs) | co (status via RPC) |
| `application_events` | Status history | `from_status`, `to_status`, `actor_id`, `note` | — | co |
| `token_ledger` | Append-only movements | `period`, `kind`, `amount`, `application_id`, `reason` | own | — |
| `ai_usage` | LLM cost and latency | `task`, `stage`, `model`, tokens, `cost_usd`, `status` | — | — (admin) |
| `audit_log` **(new)** | Sensitive-action trail | `actor_id`, `action`, `subject_id`, `metadata` (ids only) | — | — (admin) |

**Views:**
- `my_applications` (applicant-safe, coarse review state, `is_refunded`);
- `job_applicant_rankings` (recruiter-only).

**Key functions:**
- applications and tokens: `apply_to_job`, `get_token_balance`, `withdraw_application`, `set_application_status`, `get_applicant_contact`, `refund_application`, `admin_adjust_tokens`;
- LinkedIn and fit: `connections_at_company`, `activate_linkedin_import`, `my_latest_fits`;
- ranking: `job_applicant_rankings_page`, `job_ranking_version`;
- accounts: `mark_onboarded`, `set_my_role`, `export_my_data`, `custom_access_token_hook`;
- RLS helpers: `is_company_member`, `is_company_admin`, `is_admin`;
- the company-verification RPCs.

**Buckets:** `resumes` (private, 5 MB, PDF/DOCX), `linkedin-exports` (private, 50 MB, raw files deleted after parse), `company-logos` (public, 1 MB, PNG/JPEG/WebP).

---

## 8. API endpoint table

RA = route handler. SA = server action. The owning doc has the request and response contracts.

| Kind | Endpoint / action | Role | Contract owner |
|---|---|---|---|
| route | `GET /auth/callback` | anon | [backend §4.1](./sections/backend.md) |
| SA | `signUp`, `signIn`, `startOAuth`, `signOut`, `requestPasswordReset`, `updatePassword`, `setRole` | anon / user | [backend §4.1](./sections/backend.md) |
| SA | `deleteAccount` (re-auth < 5 min), `exportMyData` (3/day) | user | [backend §4.1](./sections/backend.md), [data §7.5](./sections/data.md) |
| RA | `GET /api/v1/me`, `GET /api/health` | user / anon | [backend §4.1](./sections/backend.md) |
| RA | `POST /api/v1/resumes/uploads`, `POST /api/v1/resumes/{id}/complete`, `GET /api/v1/resumes/{id}` | applicant | [backend §2.5, §4.2](./sections/backend.md) |
| RA | `POST /api/v1/linkedin-imports`, `POST …/{id}/complete`, `GET …/{id}`, `GET …/active`, `DELETE …/active?scope=` | applicant | [linkedin-ingestion §4](./subplans/linkedin-ingestion.md) |
| SA | `saveApplicantPreferences`, `completeApplicantOnboarding`, `deleteResume` | applicant | [backend §4.2](./sections/backend.md) |
| RA | `GET /api/v1/jobs`, `GET /api/v1/jobs/{jobId}` | applicant | [backend §4.3](./sections/backend.md) |
| RA | `POST /api/v1/jobs/{jobId}/fit-evaluations`, `GET /api/v1/fit-evaluations/{id}` | applicant | [ai-evaluation §7](./subplans/ai-evaluation.md) |
| RA | `GET /api/v1/jobs/{jobId}/connections` | applicant | [linkedin-ingestion §4](./subplans/linkedin-ingestion.md) |
| RA | `POST /api/v1/repos/validate` | applicant | [ai-evaluation §3.1, §7](./subplans/ai-evaluation.md) |
| RA | `GET /api/v1/tokens/balance`, `GET /api/v1/tokens/ledger` | applicant | [token-system §4](./subplans/token-system.md) |
| RA | `POST /api/v1/applications` (`Idempotency-Key`) | applicant | [token-system §3.3, §4](./subplans/token-system.md) |
| RA | `GET /api/v1/applications`, `GET /api/v1/applications/{id}` | applicant | [backend §4.3](./sections/backend.md) |
| SA | `withdrawApplication` | applicant | [backend §4.3](./sections/backend.md) |
| SA | `checkWorkEmailDomain`, `startCompanyClaim` (`CONFLICT company_has_recruiter`), `resendWorkEmailVerification`, `confirmWorkEmail`, `cancelPendingMembership`, `updateCompanyProfile`, `completeRecruiterOnboarding` | recruiter | [company-verification §4](./subplans/company-verification.md) |
| RA | `POST /api/v1/companies/{companyId}/logo/uploads` | company admin | [backend §4.4](./sections/backend.md) |
| SA | `createJob`, `updateJob`, `publishJob`, `closeJob`, `reopenJob`, `archiveJob`, `deleteDraftJob` | recruiter (publish needs verified) | [backend §4.4](./sections/backend.md), [token-system §2.4](./subplans/token-system.md) |
| RA | `GET /api/v1/jobs/{jobId}/applicants` | verified member | [applicant-ranking §4](./subplans/applicant-ranking.md) |
| RA | `GET /api/v1/jobs/{jobId}/applicants/{applicationId}` | verified member | [applicant-ranking §Resolution](./subplans/applicant-ranking.md), [ai-evaluation §7](./subplans/ai-evaluation.md) |
| SA | `setApplicationStatus`, `getResumeUrl`, `revealContact` | verified member | [applicant-ranking §4](./subplans/applicant-ranking.md) |
| SA | `adminReviewCompany`, `adminReviewMembership`, `adminRevokeMembership`, `adminAddCompanyDomain`, `adminRemoveCompanyDomain`, `adminBlockEmailDomain`, `adminAdjustTokens`, `adminRetryEvaluation` | admin (`aal2`) | [company-verification §4](./subplans/company-verification.md), [token-system §4](./subplans/token-system.md), [ai-evaluation §7](./subplans/ai-evaluation.md) |
| route | `POST /api/inngest` | Inngest signature | [backend §2.4](./sections/backend.md) |

---

## 9. Page list

Route map and gating are in [frontend.md §3](./sections/frontend.md). The "Stitch" column names the design screen a page follows. "—" means no design exists and the page follows the design system.

| Route | Who | Purpose | Stitch |
|---|---|---|---|
| `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/verify-email` | public | Auth (LinkedIn, Google, email) | sign_in_authentication_mvp |
| `/onboarding/role` | role null | Pick role (immutable) | — |
| `/onboarding/applicant` | applicant | LinkedIn export and resume (**both required**, D-39), preferences | candidate_onboarding_mvp |
| `/onboarding/recruiter` | recruiter | Company claim and work email; blocked if the company already has a recruiter (D-44) | — |
| `/verify/work-email` | recruiter | Confirm magic link (POST button) | — |
| `/jobs` | applicant | Job marketplace, credits pill, recent activity | job_marketplace_dashboard_mvp |
| `/jobs/[jobId]` | applicant | Detail, Check fit, connections, Apply | — |
| `/applications`, `/applications/[applicationId]` | applicant | Status list, timeline, withdraw | — |
| `/profile` | applicant | Re-upload resume or LinkedIn, delete data | candidate_onboarding_mvp (cards) |
| `/recruiter/pending` | pending recruiter | Verification status | — |
| `/recruiter/jobs` | recruiter | Job list (drafts for pending recruiters) | — |
| `/recruiter/jobs/new`, `/recruiter/jobs/[jobId]/edit` | recruiter | Post or edit a job, cost 1–3, technical flag | post_a_job_screening_setup_mvp |
| `/recruiter/jobs/[jobId]` | verified recruiter | Ranked applicants | recruiter_pipeline_candidate_review_mvp |
| `/recruiter/jobs/[jobId]/applicants/[applicationId]` | verified recruiter | Rank breakdown, repo review, resume text and download, actions | — |
| `/recruiter/company` | recruiter | Company profile, domains (single recruiter) | — |
| `/admin/companies` | admin (`aal2`) | Verification queue | — |
| `/settings` | any | Account, export, delete | — |

---

## 10. MVP vs Later

| MVP | Later |
|---|---|
| Email/password, Google and LinkedIn OIDC sign-in; immutable role | Account role switching; SSO for companies |
| LinkedIn export upload (ZIP or 5 CSVs), replace-all, delete | LinkedIn partner APIs (if ever granted); scheduled refresh nudges beyond 180 days |
| Resume PDF/DOCX ≤ 5 MB with text extraction | OCR for image PDFs; AV scan (ClamAV) and inline PDF preview |
| Check fit (deterministic score + explanation + requirement checklist), connections at company | Semantic job search (embeddings); "1st-degree connection" job filter |
| Jobs with location, work mode, cost 1–3, technical flag; draft, open, closed, archived | Compensation range; skill tags with weights; draft auto-save; bookmarks |
| Credits (`token` in code): 10/month, no rollover, atomic idempotent Apply, archive refunds, withdraw (no refund) | Credit history page; admin AI-usage dashboard |
| GitHub static review on 4 categories, recruiter-only; ownership attestation | Verified repo ownership via GitHub account linking; DNS TXT company verification |
| Ranking 70/30 with tiers, filters, keyset pagination, fairness notice | Stored ranking table (only if the §2.5 revisit trigger fires); bias monitoring report |
| Shortlist, reject, reconsider; reveal email after shortlist; status emails; recruiter digest | Messaging, Request Intro / Warm Ping, interview scheduling, hiring review panel |
| Company verification: work-email domain + magic link, admin fallback, **one recruiter per company** (D-44) | Multiple recruiters per company with approval from the existing member; periodic re-verification |
| Admin queue (MFA), token adjustments, evaluation retry | In-app notifications (bell) |
| Light theme only (Grounded Modern Utility); no dark mode at any stage (D-47) | — |

---

## 11. Phased build order

Each phase ends with a demo against seeded data. CI (lint, typecheck, Vitest, pgTAP, generated-types diff) must stay green throughout.

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Foundations** (1 wk) | Repo scaffold, env validation, Supabase migrations 0001–0003 + 0009–0010 skeleton, `custom_access_token_hook`, auth (3 providers), `/onboarding/role`, middleware gating, design tokens + shadcn theme, AppShell, Sentry, pino, Inngest wiring, `seed.sql` personas. **Non-code:** engage counsel (D-17); recruit 3+ non-English LinkedIn exporters (L1). | Sign up with each provider and land on the role home; middleware redirect matrix E2E (flow 8) passes; `00_schema` pgTAP passes; deploy previews work. |
| **1. Applicant data** (1.5 wk) | Resume upload/parse, LinkedIn ingestion pipeline + fixtures, `/onboarding/applicant`, `/profile`, data deletion, `exportMyData`, `deleteAccount`. | E2E flow 1 green; all linkedin-ingestion fixtures pass; `03_connections_privacy` and `09_cascade` pass; raw files are gone after parse; abandoned-tab case activates correctly (D-14). |
| **2. Companies & jobs** (1.5 wk) | Company verification flows A and D (one recruiter per company), blocklist migration, `/admin/companies` (aal2), job CRUD + publish/close/archive, `/jobs` marketplace + detail, company logos. | E2E flow 2 green; `11_company_verification` passes; applicants see only open jobs of verified companies; pending recruiters can draft but not publish; a second recruiter for a claimed company or domain gets `company_has_recruiter`. |
| **3. Check fit** (1.5 wk) | `evaluate-fit`, scoring, caching, rate limits, budget breaker, `connections_at_company`, `CheckFitPanel`, `my_latest_fits`, golden-set evals. | E2E flow 3 green; fit eval gates (§9.2 of ai-evaluation) pass; mean cost ≤ 120% of estimate; Check fit p95 < 12 s. |
| **4. Apply, credits, repo review** (2 wk) | `apply_to_job`, balance and ledger, `ApplyDialog`, applications pages, withdraw, `snapshot-fit`, `evaluate-repo`, `sweep-stuck-work`, `application-received` email. | Token concurrency suite (7 scenarios) green; E2E flows 4, 5, 7 green; `01_rating_visibility`, `05_apply_to_job`, `13_applicant_safe_fields` pass; repo eval gates pass, including adversarial cases. |
| **5. Recruiter ranking & actions** (1.5 wk) | Ranking view + page RPC, shared loaders, applicant list/detail, resume viewer, status actions + delayed emails, reveal contact, archive refunds, digest. | E2E flow 6 green on the ranking fixture (A1…A12); `08_ranking` and `06_status_transitions` pass; fairness notice present; rankings-changed banner works. |
| **6. Hardening & launch** (1 wk) | k6 load test, security review (service-role lint, CSRF, upload fuzzing), a11y (axe zero serious), visual review against Stitch, alerts and runbooks, privacy notice + consent copy, DPAs (OpenRouter, Resend), counsel sign-off on D-17, prod migration push. | Launch checklist signed: load targets met, no Sev-1/2 open, counsel sign-off recorded in §13. |

---

## 12. Risks

| # | Risk | Likelihood / impact | Mitigation | Owner |
|---|---|---|---|---|
| R1 | **LinkedIn API limits.** OIDC gives only name, email and picture. Profile, positions and connections APIs need partner programs, and scraping violates the ToS. | Certain / high | Applicants upload their own data export (ZIP or CSVs). LinkedIn is never used as a verification source. | Data |
| R2 | **Export format drift** (unversioned, localized, preamble). | High / medium | Alias header map, header-row detection, tolerant dates, `UNMAPPED_HEADER` warnings, non-English fixtures. | Data |
| R3 | **Third-party PII** in Connections.csv. | Certain / high | Allowlisted projection (no email or URL), owner-only RLS, never sent to recruiters, admins or the LLM, raw files deleted after parse, consent copy, support deletion for non-users. | Data |
| R4 | **Rating leakage** to applicants. | Medium / high | No applicant RLS policy, `my_applications` as the single surface, column grants, ESLint import boundary, bundle grep, pgTAP and integration tests. | Data, Frontend |
| R5 | **GDPR right of access vs. hidden ratings** (ratings are personal data). | Medium / high | Product hides ratings; formal DSARs fulfilled in full through an audited script; counsel confirms before EU users (D-17). | Lead |
| R6 | **NYC LL144 and EU AI Act** (hiring AI is a regulated or high-risk use). | Medium / high | Advisory scores, a human decides every outcome, no auto-reject, disclosure at Apply. Launch is US-only with no NYC-located roles until a bias audit; no EU until counsel clears it (D-17). | Lead |
| R7 | **Bias in scores.** | Medium / high | PII redaction, fairness rules in prompts, deterministic scoring, education only when required, fairness notice, golden-set evals, score distribution monitoring (Later). | Backend, Data |
| R8 | **AI cost.** | Medium / medium | Fit cache plus limits (20/day/user), global daily breaker, cross-application repo cache, OpenRouter hard credit cap, spend alerts. About $340/month at 1k users (ai-evaluation §4.3). | Backend |
| R9 | **Prompt injection** via resume, LinkedIn text, job text or repo. | High / medium | Tagged and escaped data, system-only instructions, structured output, code-computed scores, evidence fuzzy-matching, sanity caps, canary token, neutral recruiter flag. | Backend |
| R10 | **Repo ownership not verified**: anyone can submit a famous public repo. | High / medium | "Ownership not verified" label, fork/template flag, applicant attestation (D-16, D-38). GitHub account linking is Later. | Backend |
| R11 | **Malicious uploads** (zip bombs, traversal, macros, malware in resumes). | Medium / medium | Streaming byte caps, ratio checks, basename allowlists, memory-only extraction, magic bytes, attachment-only downloads, ClamAV Later (D-13). | Backend |
| R12 | **Token races and double spend.** | Medium / high | Advisory lock, unique constraints, idempotency key + request hash, `FOR SHARE` job lock, pricing freeze, concurrency test suite. | Backend, Data |
| R13 | **Service-role misuse** bypassing RLS. | Low / high | Single `lib/supabase/admin.ts`, ESLint allowlist (`inngest/**`, `scripts/support/**`), admin pages on the user client (D-18). | Backend |
| R14 | **Lost events or stuck work.** | Medium / medium | `sweep-stuck-work` every 5 minutes, idempotent functions, alerts on pending work older than 30 minutes. | Backend |
| R15 | **Company verification abuse** (look-alike domains, ex-employees). | Medium / medium | Blocklist, name-collision review queue, one recruiter per company, admin revocation, admin MFA. | Backend |
| R16 | **Admin bottleneck.** | Medium / low | Auto-verify path, 48-hour SLA alert. | Lead |
| R18 | **Wrong first claim blocks the real recruiter** (one recruiter per company, D-44). | Low / medium | Blocked screen offers "Contact support" → admin review (`disputed_claim`); admin revokes and approves a reclaim. | Backend |
| R17 | **Vendor outage** (OpenRouter, GitHub, Resend). | Medium / medium | Model fallbacks, Inngest retries with backoff, fail-closed GitHub check with retry, degraded "retrying" copy. | Backend |

---

## 13. Decision log

| ID | Decision | Rationale | Affected docs |
|---|---|---|---|
| D-01 | The stuck-work sweeper is the **Inngest cron `sweep-stuck-work`** (5 min). pg_cron is used only for SQL-only retention. `pg_net` and Vault are dropped. | Emitting events from SQL would need `pg_net` and secrets in Vault. Inngest gives visibility and retries. | backend B3, data §1.3/§3.1/§7.3, applicant-ranking, token-system |
| D-02 | **Virtual monthly grant** in a read-only `get_token_balance()`. Lazy grant materialization in `apply_to_job` and `admin_adjust_tokens`. **No grant cron.** | No O(users) writes, nothing breaks if a cron fails, correct for mid-month sign-ups, GETs never write. | token-system T1/T2, data §5.3, §4 here |
| D-03 | `apply_to_job` gains `p_expected_cost smallint default null`, which raises `CONFLICT token_cost_changed` on mismatch. | Protects the applicant from a cost change between viewing and confirming. Additive. | token-system T8, frontend §5.4 |
| D-04 | Repos are downloaded as a **zipball** (not a tarball). | Reuses fflate. No tar parser needed. | ai-evaluation §3.2, backend B8, §2 here |
| D-05 | GitHub component = **`(avg − 1) / 9 × 100`**. | The 1–10 scale starts at 1, so `avg × 10` gave the worst repo 3 free points. | applicant-ranking R1, §3.3 here |
| D-06 | A failed **or** pending review puts the applicant in the **"Incomplete" tier**, below all complete applicants and ordered by confidence. No refund. | A missing review must never outrank a real one, and making a repo private after applying must not pay off. | applicant-ranking R2, ai-evaluation X11, token-system §2.4, frontend §4.2/§6.7 |
| D-07 | Applicants see a **coarse review state** (`pending`/`completed`/`failed`) and only the **fixable** failure codes. Everything else is `system`. `integrity` is never shown. | Gives actionable feedback without revealing ratings or that an injection was detected. | ai-evaluation A5, data §4.1/§5.1 |
| D-08 | **Superseded by D-39.** ~~Onboarding requires a parsed resume. The LinkedIn export is on the same step but skippable.~~ `mark_onboarded()` accepts resume-only, and the fit prompt handles a null import. | The spec lists both uploads under onboarding and we keep both there, but exports can take minutes to hours to arrive from LinkedIn. Blocking on them hurts activation. The product owner chose otherwise (D-39). | frontend F3/F17, data §5.3/§8, backend §2.1/§4.2, linkedin-ingestion L5, ai-evaluation X2 |
| D-09 | **Pending recruiters may create and edit drafts**, but cannot publish or see applicants. | Lets them set up while waiting. The publish guard and RLS keep it safe. | company-verification §2.4, frontend F11/§3.3, data §3.5 |
| D-10 | A missing or invalid `Idempotency-Key` returns **422 `VALIDATION_FAILED`** (`fields.idempotencyKey`). The dialog **makes a new key when the body changes**, and keeps it across retries otherwise. | There is no 400 in our error vocabulary. Correcting a repo URL must not trip `IDEMPOTENCY_KEY_REUSED`. | token-system §4/§6, backend §4.3, frontend §5.5 |
| D-11 | The balance API returns **`total = granted + refunded + adjusted`**. The pill shows `balance / total`, which **can exceed 10** in a month with a refund. | Truthful arithmetic. The tooltip explains refunds. | token-system §4, backend §4.3, frontend §4.1 |
| D-12 | **camelCase for every JSON key** at the API boundary, including `nextCursor` and `error.requestId`. The database stays snake_case. | One rule, no exceptions. | all API contracts, §5 here |
| D-13 | MVP resume viewer: **extracted text plus "Download original"** (60 s signed URL, attachment). No inline PDF. | There is no AV scan in MVP. Inline preview arrives with ClamAV. | backend B5, frontend F16, applicant-ranking |
| D-14 | `linkedin_imports.uploaded_at` (set by `complete`). Activation ignores newer init-only rows. Deletion during a parse sends `linkedin/import.deleted` (in `cancelOn`), and activation is a no-op when the row is gone. | Fixes the bug where an abandoned tab blocked a real upload, and stops deleted data from coming back. | linkedin-ingestion §2.7/§3/§4/§5, data §3.6 |
| D-15 | **Ranking contract:** `counts` adds `unscored`; status counts ignore the status filter; incomplete and unscored counts are over Active only; `github.flags` is in the list; recruiters read names and fit through existing RLS (pgTAP added); a detail read exists; `get_applicant_contact` returns `CONFLICT not_shortlisted` or `NOT_FOUND` for non-members. | Closes the Frontend and Backend review gaps. | applicant-ranking, data §8, backend §4.4 |
| D-16 | **Repo ownership:** MVP shows "Ownership not verified" plus the fork/template flag to recruiters, and the applicant must attest (`repoOwnershipAttested`). Verified ownership via GitHub account linking is Later. | Cheap deterrent now. Real verification adds an OAuth provider and friction. Confirmed by the product owner (D-38). | ai-evaluation, backend §4.3, token-system §4, frontend |
| D-17 | **Legal:** ratings stay hidden in the product and self-service export. Formal DSARs are fulfilled in full via an audited script. Launch is US-only with no NYC-located roles and no EU users until counsel signs off on GDPR Art. 15/22, the EU AI Act and LL144. | The locked spec decision stands, and the legal exposure is gated rather than ignored. | data D5/§7.6, applicant-ranking §2.10, §12 here |
| D-18 | **Admin requires MFA (`aal2`)** in RLS (`is_admin()`), guards and actions. Admin pages use the **user-scoped client**. The service role is only for Inngest and audited support scripts. | Accountability ("who did this") stays in the database, and the blast radius stays small. | company-verification C6/§4, backend §1/§2.1, data §4 |
| D-19 | **Withdraw is MVP**, with no refund and no re-apply to the same job. | Applicants need it. Refunding would allow free probing. | token-system T6/E12, backend §4.3, frontend F10 |
| D-20 | New tables `audit_log`, `company_aliases`, `work_email_verifications`, `blocked_email_domains`. | Needed for auditing, connection matching and verification. | data §3.4/§3.9 |
| D-21 | `jobs.location` and `jobs.work_mode` (`remote`/`hybrid`/`onsite`) are MVP. Compensation is Later. | Every Stitch card shows them, and they are cheap to add. | frontend F2, data §3.5 |
| D-22 | Connections come from **`GET /api/v1/jobs/{jobId}/connections`**, called in parallel with Check fit, and are never embedded in the fit response. | Keeps the fit cache pure and the connections lookup independent. | frontend F4, linkedin-ingestion §4, ai-evaluation §2.8 |
| D-23 | `my_latest_fits(p_job_ids)` gives the job cards their match badge. The app computes staleness. | One query per page. The cache key's model and prompt version live in app config. | frontend F5, data §5.3 |
| D-24 | JWT claims are `app_role`, `onboarded` and `membership_status` (recruiters). They are UX hints only and never read by RLS. | Middleware gating with no DB round trip. | backend B1, frontend F1, data §5.3 |
| D-25 | Role capture uses `options.data.role` for email sign-up and the signed `np_role_intent` cookie for OAuth. `/onboarding/role` appears only if the role is still null. | OAuth cannot carry metadata. Admin can never be self-assigned. | backend B2, frontend §6.1 |
| D-26 | Applicant detail is **`GET /api/v1/jobs/{jobId}/applicants/{applicationId}`**. `/api/v1/recruiter/*` paths are gone. | One resource tree for applicants of a job. | ai-evaluation §7, backend §4.4 |
| D-27 | Upload endpoints are `POST /api/v1/resumes/uploads` and `/api/v1/linkedin-imports` (+ `/complete`) with direct-to-Storage signed URLs. | Bypasses Vercel's 4.5 MB body limit. One naming scheme. | backend §2.5, frontend §5.7 |
| D-28 | Account deletion and export are **server actions** (`deleteAccount` with re-auth < 5 min; `exportMyData` 3/day). | Form-driven UI, so per §5 they are not API routes. | backend §4.1, data §7.5/§8 |
| D-29 | Recruiters see the **resume only**: no LinkedIn tables, no connections, and email only after shortlisting. | Minimization. Connections are third-party PII. | data D2/D3, applicant-ranking §2.8 |
| D-30 | `applications.resume_id` snapshots the resume at Apply time, and the fit evaluation is snapshotted too. | Recruiters see what was submitted. Applicants cannot re-roll scores after applying. | data D1, token-system §3.3, applicant-ranking §2.1 |
| D-31 | **Validation limits live once in `lib/schemas/`** (job title 5–120, description 50–20,000, requirements 1–10,000; password ≥ 10; resume ≤ 5 MB; LinkedIn ZIP ≤ 50 MB, CSV ≤ 20 MB). DB CHECKs are backstops. | Ends drift between the docs. | frontend §6.1/§6.4, backend §4.4, linkedin-ingestion §2.3 |
| D-32 | Fit scores are computed **deterministically in code** from LLM judgements. Ratings are 1–10 integers from structured output with sanity caps. | Reproducible, explainable, and resistant to injection. | ai-evaluation A1/§3.8 |
| D-33 | Stack additions: `tldts`, `gpt-tokenizer`, `@octokit/auth-app`, `@inngest/test`, Mailpit (local), Tailwind v4. | Required by the sub-plans. | §2 here |
| D-34 | Company verification: **work-email domain + magic link** first, admin fallback. (Auto-join and multiple recruiters were superseded by D-44.) LinkedIn is not a verification source. DNS TXT is Later. | Self-serve and cheap, within LinkedIn's API limits. | company-verification §2 |
| D-35 | **UI says "credits". Code, DB, API and errors say `token`.** All copy goes through `lib/copy.ts`. | Matches all five designs and avoids confusion with LLM tokens. Confirmed by the product owner (D-37). | frontend §2.6, token-system |
| D-36 | **Pricing and refunds:** `token_cost` default 2, frozen (along with `is_technical`) after the first application. Refund only when a job with untouched `submitted` applications is archived (or its company suspended), credited to the current period. No refund on close, withdrawal or failed review. | Fair to applicants without making abuse free. | token-system T3–T7/§2.4 |
| D-37 | **Product owner:** the UI says **"Credits"** in every label, message and email. Code, DB, API names and error codes stay `token`. | Product owner decision #1 (§15). | frontend §2.6, token-system, backend §2.9, company-verification, SPEC |
| D-38 | **Product owner:** the applicant's repo-ownership **attestation is enough for MVP**. GitHub account linking is Later. | Product owner decision #2 (§15). | ai-evaluation, §10 here |
| D-39 | **Product owner:** the **LinkedIn import is required** at onboarding. `mark_onboarded()` needs a succeeded import (≥ 1 recognised file) **and** a parsed resume. No skip. Partial exports (e.g. no Skills.csv) remain valid. If the applicant later deletes their LinkedIn data, Check fit and Apply return `409 CONFLICT linkedin_required`. **Reverses D-08.** | Product owner decision #3 (§15). The fit prompt may now assume LinkedIn data exists. | frontend F3/F17/§6.1/§9, backend §2.1/§4.2, data §5.3/§8, linkedin-ingestion L5, ai-evaluation X2, token-system §4, SPEC |
| D-40 | **Product owner:** MVP launch is **US-only, with no NYC-located roles and no EU users**. | Product owner decision #4 (§15). Confirms D-17. | §12 here |
| D-41 | **Product owner:** formal data-access requests may include the GitHub ratings. | Product owner decision #5 (§15). Confirms D-17. | data D5 |
| D-42 | **Product owner:** AI spend caps are **$50/day** (budget breaker default) **plus a monthly OpenRouter hard cap**. | Product owner decision #6 (§15). | ai-evaluation §2.7, backend §2.7 |
| D-43 | **Product owner:** the refund policy in D-36 is confirmed as written. | Product owner decision #7 (§15). | token-system §2.4 |
| D-44 | **Product owner:** **exactly one recruiter per company** in MVP. A second recruiter whose company or domain is already claimed is blocked with "This company already has a recruiter account" (`CONFLICT company_has_recruiter`). This is enforced by the unique index `recruiter_memberships_one_per_company_uq`. No auto-join. Multiple recruiters with approval from the existing member are Later. | Product owner decision #8 (§15). Supersedes the "Multiple" default in SPEC and the auto-join parts of D-34. | company-verification, data §3.4/§7.5, backend §2.1/§2.4/§2.9/§4.4, frontend §1.2/§3.1/§6.1, SPEC, §8/§10 here |
| D-45 | **Product owner:** "NexusPulse" is a **placeholder** brand name, not final. | Product owner decision #9 (§15). | README |
| D-46 | **Product owner:** the credit period is the **UTC calendar month**. | Product owner decision #10 (§15). | token-system §2.1, SPEC |
| D-47 | **Product owner:** **light theme only** (Grounded Modern Utility). There is no dark mode now or Later. The Obsidian Kinetic Intelligence file in `design/stitch/` is unused. | Product owner decision #11 (§15). | frontend §2.7, §10 here, README, SPEC |
---

## 14. Sub-plan index

| Sub-plan | Owner | Reviewers | Covers |
|---|---|---|---|
| [ai-evaluation.md](./subplans/ai-evaluation.md) | Backend | Data, Lead | Fit scoring, repo review, models, cost, injection defenses, evals |
| [applicant-ranking.md](./subplans/applicant-ranking.md) | Data | Backend, Frontend, Lead | Formula, tiers, tie-breaks, view, pagination, recruiter data contract, fairness |
| [linkedin-ingestion.md](./subplans/linkedin-ingestion.md) | Data | Backend, Lead | Export formats, parsing pipeline, normalization, connection matching |
| [token-system.md](./subplans/token-system.md) | Backend | Data, Frontend | Ledger, balance, `apply_to_job`, refunds, races |
| [company-verification.md](./subplans/company-verification.md) | Backend | Data, Lead | Domain + magic link, admin queue, memberships, revocation |

Section docs: [frontend.md](./sections/frontend.md) (Frontend; reviewers Backend, Lead), [backend.md](./sections/backend.md) (Backend; reviewers Frontend, Data, Lead) and [data.md](./sections/data.md) (Data; reviewers Backend, Lead). Each doc ends with a **Resolution** section recording the Lead's pass-2 outcome.

---

## 15. Product owner decisions

| # | Topic | Decision | Log |
|---|---|---|---|
| 1 | Terminology | The UI says **"Credits"**. Code and database names stay `token`. | D-37 |
| 2 | Repo ownership | Attestation is enough for MVP. GitHub account linking is Later. | D-38 |
| 3 | LinkedIn at onboarding | **Required**, together with a parsed resume. No skip. | D-39 |
| 4 | Launch geography | US-only, no NYC-located roles, no EU users for MVP. | D-40 |
| 5 | Ratings in data-access requests | Formal requests may include GitHub ratings. | D-41 |
| 6 | AI spend caps | $50/day default plus a monthly hard cap. | D-42 |
| 7 | Refund policy | Confirmed as written. | D-43 |
| 8 | Recruiters per company | **One** in MVP. Multiple recruiters, with approval from the existing member, is Later. | D-44 |
| 9 | Brand name | "NexusPulse" is a placeholder. | D-45 |
| 10 | Credit period | UTC calendar month. | D-46 |
| 11 | Theme | Light only. No dark mode. | D-47 |
