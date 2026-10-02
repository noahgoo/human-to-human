# Master Plan: AI Job-Matching Portal ("NexusPulse")

> **Status:** Pass 1 (architecture brief). Owner: **Lead (Senior SWE)**.
> **Inputs:** [`SPEC.md`](./SPEC.md) (its locked decisions win over everything here) and [`design/stitch/`](../design/stitch/).
> **Audience:** the Frontend, Backend and Data engineers, who work in parallel from this brief. The names in §4, §5 and §6 are **canonical**. Do not rename them. To change one, add a row to the Decision log and tell the Lead.

---

## 1. Lead: open questions, risks, assumptions

**Open questions** (each has a default; we build with the default unless the user overrides it)
1. **Token month boundary:** default is the UTC calendar month. A per-user timezone is "Later".
2. **Repo review fails after Apply** (repo deleted, made private or too large): default is to **keep the application and not refund**. It ranks on confidence only and shows `github_status = failed` to recruiters. Before any token is spent, Apply checks synchronously that the repo exists and is public.
3. **Connections shown to recruiters:** the design shows "3 internal Stripe connections" on the recruiter side. Default for MVP: **applicants only**. Recruiters see nothing, because this is third-party PII. To revisit with the privacy review.
4. **Which confidence score ranks an application:** default is to snapshot a `fit_evaluations` row at Apply time. Apply reuses the latest successful row if its `input_hash` still matches, and otherwise runs a new evaluation.
5. **Admin approval for companies:** who is the admin? Default: a platform admin (`profiles.role = 'admin'`, seeded by hand) reviews in a minimal `/admin/companies` queue.

**Design vs. spec conflicts.** The spec wins in each case.
- Stitch uses the GitHub pillars "Security Rigor / Architecture / Runtime / Code Quality". **Locked:** Security, Organization, Performance, Testing.
- Stitch shows a recruiter rubric-weight editor and "1–2 credit" toggles. **Locked:** the 70/30 ranking weights are fixed; token cost is 1–3 and set per job.
- Stitch has a **role switcher** in the navbar. One account has one role (chosen at sign-up), so the switcher is replaced by a role badge.
- "Schedule Interview", "Request Intro", "Request Warm Ping" and "Hiring Review Panel" all fall under "Later" (messaging). MVP recruiter actions are **shortlist and reject** only.

**Top risks** (the full register comes in pass 2)
- **LinkedIn API limits.** OIDC "Sign In with LinkedIn" returns **only name, email and picture** (`openid profile email`). The Profile, Positions and Connections APIs need LinkedIn partner programs that we do not have. That is why applicants **upload their LinkedIn data export** (ZIP or CSVs). The export format is not versioned and can change without notice, so parsers must tolerate missing or renamed columns.
- **Privacy.** `Connections.csv` holds **third-party PII**: names, employers and sometimes emails of people who never consented. We store the minimum, drop email addresses, never show it to recruiters, and hard-delete it when asked.
- **LLM cost and abuse.** Check fit is free, so it needs caching and rate limits. Repo content is untrusted input that can carry prompt injection.
- **Rating leakage.** GitHub ratings must be hidden by **RLS and the API**, not just the UI.
- **Token races.** Double-clicks and concurrent Apply calls must never overspend or double-apply.

**Assumptions:** single region (Supabase US-East and the matching Vercel region); English only; the job board is not public (sign-in required); fewer than 10k users at launch; OpenRouter is the only LLM gateway.

---

## 2. Stack recommendation

| Concern | Choice | Why (one line) |
|---|---|---|
| Framework | **Next.js 15 App Router + TypeScript (strict)** | Locked. RSC suits read-heavy dashboards, and route handlers and server actions cover writes. |
| Styling/UI | **Tailwind CSS + shadcn/ui (Radix) + lucide-react** | Locked Tailwind. shadcn gives us accessible primitives we own, themed with the Grounded Modern Utility tokens. |
| Hosting | **Vercel** (Fluid compute, Node runtime) | Locked. Use the Node runtime everywhere because the parsers and the Supabase admin client need Node APIs. |
| DB / Auth / Storage | **Supabase**: Postgres 15, Auth, Storage, RLS | Locked. RLS is our primary authorization layer. |
| Query layer | **`@supabase/supabase-js` + `@supabase/ssr` + generated types (`supabase gen types`)**. No ORM. | Every query goes through PostgREST, so RLS always applies. Drizzle over a direct connection would bypass RLS. Multi-row atomic work goes into **Postgres functions (RPC)**. |
| Migrations | **Supabase CLI** (`supabase/migrations/*.sql`, `supabase/seed.sql`) | Plain SQL lives next to the RLS policies, and `supabase db reset` gives each developer a local copy. |
| Validation | **zod** (shared in `lib/schemas/`) | One schema per input, used by forms, route handlers and LLM structured output. |
| Forms | **react-hook-form + @hookform/resolvers/zod** | Reuses the zod schemas on the client. |
| Data fetching | **RSC for reads. TanStack Query only for client polling and optimistic UI** (evaluation status, token balance) | Keeps the client bundle small. Polling is simpler than Realtime for MVP. |
| Background jobs | **Inngest** (served at `/api/inngest` on Vercel) | Durable multi-step functions with retries, per-key concurrency and throttling (per user, per OpenRouter model), and a local dev server. A repo fetch plus several LLM calls is split into steps, so no single Vercel invocation runs long. Supabase pg_cron + Edge Functions would mean writing retries, fan-out and observability ourselves, in Deno. |
| Scheduled jobs | **Inngest cron**, plus one **pg_cron** sweeper for stuck `pending` evaluations | Inngest cron handles the app-level schedules. pg_cron catches lost events: it re-emits rows that have sat in `pending` for more than 10 minutes. |
| LLM client | **Vercel AI SDK (`ai`) + `@openrouter/ai-sdk-provider`**, using `generateObject` with zod schemas | Typed structured output and model swaps by config. The model for each task is chosen in `ai-evaluation.md`. |
| GitHub fetch | **`@octokit/rest`** with a GitHub App installation token; tarball via `repos.downloadTarballArchive` | A 5k/h rate limit; we only read and never execute. |
| CSV | **papaparse** | Robust with quoted fields, BOMs and preamble lines (LinkedIn's Connections.csv has a "Notes" preamble). |
| ZIP | **fflate** | Small and fast, can unzip only the entries we need, and runs in Node. |
| PDF | **unpdf** (serverless pdf.js build) | Text extraction with no native dependencies, which works on Vercel and Inngest. |
| DOCX | **mammoth** (`extractRawText`) | A de facto standard with no native dependencies. |
| File type sniff | **file-type** | Checks magic bytes, not the file extension, before parsing. |
| Rate limiting | **@upstash/ratelimit + Upstash Redis** | Edge-friendly limits on Check fit, uploads and auth. |
| Unit/integration tests | **Vitest**, plus **pgTAP** (`supabase test db`) for RLS and RPCs | Fast TypeScript tests. pgTAP proves RLS: for example, that an applicant cannot select `repo_evaluations`. |
| E2E tests | **Playwright** against local Supabase with OpenRouter mocked (MSW) | Covers the critical flows: sign-up, onboarding, Check fit, Apply, recruiter ranking. |
| Email | **Resend + React Email**, also configured as Supabase Auth's custom SMTP | One provider for auth mail and application status mail. |
| Observability | **Sentry** (errors and traces, Next and Inngest), **Vercel Logs** with a JSON logger (`pino`), **Inngest dashboard**, and the **`ai_usage` table** for LLM cost | Errors, job runs and per-user AI spend each have a single place to look. |
| Analytics | **PostHog** ("Later" unless it is cheap to add) | Not needed for MVP correctness. |

**Repo layout** (Frontend and Backend agree on this): `app/` (routes), `components/`, `lib/{supabase,auth,schemas,ai,parsers,tokens,errors}/`, `inngest/` (functions), `supabase/{migrations,tests}/`, `e2e/`.

---

## 3. System architecture

```
 Browser (RSC pages + client islands, TanStack Query polling)
    │  server actions / fetch /api/v1/*         ▲ signed URLs (resume download)
    ▼                                            │
 ┌──────────────── Vercel: Next.js (Node) ───────┴───────────┐
 │ middleware (@supabase/ssr session refresh, role routing)  │
 │ RSC loaders │ server actions │ /api/v1 route handlers     │
 │ lib/auth guards │ zod │ Upstash ratelimit                 │
 │ /api/inngest  ◄──── Inngest Cloud (events, steps, cron)   │
 └──────┬───────────────────────┬───────────────┬────────────┘
        │ user JWT (RLS)        │ service role   │ HTTPS
        ▼                       │ (Inngest only) ▼
 ┌──────────── Supabase ────────┴──┐     ┌──────────────┐  ┌─────────┐
 │ Auth (email, Google, LinkedIn   │     │ OpenRouter   │  │ GitHub  │
 │   OIDC) │ Postgres + RLS + RPC  │     │ (LLMs)       │  │ REST API│
 │ Storage: resumes, linkedin-     │     └──────────────┘  └─────────┘
 │   exports (private) │ pg_cron   │     Resend (email) · Sentry
 └─────────────────────────────────┘
```

### 3.1 Check fit (free)
1. The applicant clicks **Check fit**. The client sends `POST /api/v1/jobs/{jobId}/fit-evaluations`.
2. The handler runs `requireRole('applicant')`, applies the rate limit (default 20/day), and computes `input_hash = sha256(resume_id, linkedin_import_id, job.updated_at, prompt_version)`.
3. If a `succeeded` row with the same hash exists, it returns `200` with that row (cache hit). Otherwise it inserts `fit_evaluations(status='pending')`, sends the Inngest event `fit/evaluation.requested` and returns `202 {id}`.
4. The Inngest function `evaluate-fit` loads the profile, positions, skills, education, resume text and job, then calls OpenRouter with `generateObject` (score 0–100 plus an explanation). It writes the result and an `ai_usage` row and sets the status to `succeeded`.
5. The client polls `GET /api/v1/fit-evaluations/{id}` every 2s. **Connections at company** are a plain SQL lookup with no LLM: the `connections` rows whose `company_name_normalized` matches the job's company. That lookup is shown immediately, alongside the score.

### 3.2 Apply (atomic, idempotent)
1. The client generates an `Idempotency-Key` (uuid v4) when the dialog opens and sends `POST /api/v1/applications {job_id, github_repo_url?}`.
2. The handler checks that the job is `open`. If `jobs.is_technical`, it validates the URL format and makes **one synchronous GitHub HEAD/GET** to confirm the repo exists and is public. If not, it returns `422` and spends nothing.
3. The handler calls the RPC **`apply_to_job(p_job_id, p_idempotency_key, p_github_repo_url)`** (SECURITY DEFINER, single transaction):
   - takes `pg_advisory_xact_lock(hashtext(applicant_id))`, ensures this month's grant exists, computes the balance;
   - if the idempotency key was already used by this user, returns the existing application (same request) or `IDEMPOTENCY_KEY_REUSED` (different body);
   - rejects with `INSUFFICIENT_TOKENS`, or `ALREADY_APPLIED` (via unique `(job_id, applicant_id)`);
   - inserts `applications` (with `token_cost` snapshot), a `token_ledger` row (`application_spend`, `-cost`), an `application_events` row (`submitted`), and a `repo_evaluations` row (`pending`) when the job is technical.
4. After commit, the handler sends `application/submitted`. Inngest runs `snapshot-fit` (reuses or creates a `fit_evaluations` row and links `applications.fit_evaluation_id`) and, for technical jobs, `evaluate-repo`. That function: download the tarball, filter (skip vendor and binaries, cap file count and bytes), run a static LLM review that rates **Security, Organization, Performance and Testing** 1–10 with rationale, write `repo_evaluations` (`succeeded` or `failed`), then `ai_usage`. The code is **never executed**.
5. The pg_cron sweeper re-emits events for evaluations that have sat in `pending` for more than 10 minutes. That covers the case where the event send fails after the commit.

### 3.3 Recruiter ranking
1. The recruiter opens `/recruiter/jobs/{jobId}`. The RSC loader calls `requireCompanyMember(job.company_id)`.
2. The loader reads the view **`job_applicant_rankings`** (`security_invoker`, so the RLS of the underlying tables applies). It computes `rank_score`:
   - technical jobs: `0.7 × confidence_score + 0.3 × (avg(4 ratings) × 10)`, falling back to confidence only when `repo_evaluations.status <> 'succeeded'` (flagged);
   - non-technical jobs: `confidence_score`.
3. Rows are ordered by `rank_score DESC, submitted_at ASC`, with cursor pagination. Exact formula and tie-breaking: `applicant-ranking.md`.
4. Resume: a server action checks membership and returns a 60-second **signed URL** from the `resumes` bucket.
5. Shortlist and reject are a server action that updates `applications.status`, inserts `application_events`, and sends the email through Inngest.

---

## 4. Canonical domain entities

**Conventions**
- PKs are `id uuid default gen_random_uuid()`. User-owned rows reference `profiles.id`, which equals `auth.users.id`.
- Every table has `created_at timestamptz not null default now()` and `updated_at timestamptz` (maintained by the shared trigger `set_updated_at()`).
- snake_case everywhere. Tables are plural nouns. FK columns are `<singular>_id`. Booleans are `is_*` / `has_*`. Money and score columns use `numeric`/`smallint` with CHECK constraints.
- **Soft-delete policy:** do **not** soft-delete by default.
  - `jobs` close through `status` (`closed`/`archived`).
  - PII tables (`linkedin_*`, `connections`, `resumes`) are **hard-deleted** on user request or account deletion (cascade).
  - `applications`, `application_events`, `token_ledger` and `ai_usage` are append-only and audit-like. On account deletion, applications cascade-delete and `ai_usage.user_id` is set to null.
- RLS is **enabled on every table**, with deny by default. The service role is used only inside Inngest functions and `lib/supabase/admin.ts` (imported with `server-only`).
- Raw uploads go in private Storage buckets. Paths: `resumes/{user_id}/{resume_id}.{pdf|docx}` and `linkedin-exports/{user_id}/{import_id}/{file}`. Raw LinkedIn files are deleted after a successful parse, and in any case after 7 days.

**Enums** (Postgres types)
| Enum | Values |
|---|---|
| `user_role` | `applicant`, `recruiter`, `admin` |
| `application_status` | `submitted`, `shortlisted`, `rejected`, `withdrawn` |
| `job_status` | `draft`, `open`, `closed`, `archived` |
| `verification_status` | `pending`, `verified`, `rejected` |
| `evaluation_status` | `pending`, `running`, `succeeded`, `failed` (used by `fit_evaluations`, `repo_evaluations`, `linkedin_imports`) |
| `token_entry_kind` | `monthly_grant`, `application_spend`, `refund`, `adjustment` |

**Tables** (key columns only; specialists expand them)
| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | One per auth user; holds the role | `id` (=auth uid), `role user_role` (null until chosen, then immutable), `full_name`, `avatar_url`, `email`, `onboarded_at` |
| `applicant_profiles` | Applicant data that is not LinkedIn data | `profile_id` PK/FK, `headline`, `target_seniority`, `location_pref`, `active_resume_id`, `active_linkedin_import_id` |
| `companies` | An employer | `id`, `name`, `name_normalized`, `website`, `logo_url`, `verification_status`, `verified_at` |
| `company_domains` | Email domains that prove membership | `id`, `company_id`, `domain` (unique, lowercase), `verification_status`, `verification_method` |
| `recruiter_memberships` | Links a recruiter to a company (many per company) | `id`, `company_id`, `profile_id`, `verification_status`, `verified_via` (`email_domain`/`admin`), `is_company_admin`; unique `(company_id, profile_id)` |
| `jobs` | A job posting | `id`, `company_id`, `created_by`, `title`, `description`, `requirements`, `token_cost smallint CHECK 1..3`, `is_technical`, `status job_status`, `published_at` |
| `linkedin_imports` | One upload or parse run | `id`, `applicant_id`, `source` (`zip`/`csv`), `status evaluation_status`, `files_present text[]`, `counts jsonb`, `error`, `parsed_at` |
| `linkedin_positions` | Rows from Positions.csv | `id`, `import_id`, `applicant_id`, `company_name`, `title`, `started_on`, `ended_on`, `description` |
| `linkedin_skills` | Rows from Skills.csv | `id`, `import_id`, `applicant_id`, `name` |
| `linkedin_education` | Rows from Education.csv | `id`, `import_id`, `applicant_id`, `school`, `degree`, `started_on`, `ended_on` |
| `connections` | Rows from Connections.csv (**third-party PII**, minimal) | `id`, `import_id`, `applicant_id`, `first_name`, `last_name`, `company_name`, `company_name_normalized`, `position`, `connected_on`; **no email stored** |
| `resumes` | An uploaded resume plus its extracted text | `id`, `applicant_id`, `storage_path`, `mime_type`, `size_bytes CHECK ≤ 5 MB`, `text_content`, `parse_status evaluation_status` |
| `fit_evaluations` | Check-fit result (confidence score) | `id`, `applicant_id`, `job_id`, `input_hash`, `status`, `confidence_score smallint 0..100`, `explanation`, `model`, `prompt_version` |
| `repo_evaluations` | GitHub static review (**recruiter-only**) | `id`, `application_id` unique, `repo_url`, `commit_sha`, `status`, `security_score`, `organization_score`, `performance_score`, `testing_score` (smallint 1..10), `rationale jsonb`, `model`, `prompt_version` |
| `applications` | Applicant to job | `id`, `job_id`, `applicant_id`, `status application_status`, `token_cost` (snapshot), `github_repo_url`, `fit_evaluation_id`, `idempotency_key`, `submitted_at`; unique `(job_id, applicant_id)` and `(applicant_id, idempotency_key)` |
| `application_events` | Status history and audit | `id`, `application_id`, `actor_id`, `from_status`, `to_status`, `note` |
| `token_ledger` | Append-only token movements | `id`, `applicant_id`, `period` (`'YYYY-MM'`, UTC), `kind token_entry_kind`, `amount int`, `application_id`; unique `(applicant_id, period)` where `kind='monthly_grant'` |
| `ai_usage` | Cost and latency for each LLM call | `id`, `user_id`, `task` (`fit`/`repo`/`resume_parse`), `subject_id`, `model`, `input_tokens`, `output_tokens`, `cost_usd`, `latency_ms`, `status` |

**Token rules.** The monthly grant is +10. **Balance = sum(amount) for the current period only**, so tokens never roll over: last month's rows never count. The grant row is created lazily in `apply_to_job` and in `get_token_balance()`, and Inngest cron creates it on the 1st of the month for active users. Only `apply_to_job` writes spend rows. Clients cannot insert into the ledger.

**Rating visibility (must be enforced in the DB):**
- `repo_evaluations` has **no SELECT policy for applicants**. It is selectable only by verified members of the job's company.
- Applicants read their applications through the view **`my_applications`**, which exposes status, job and timestamps only, with no scores or ratings.
- API responses to applicants are built from that view.
- pgTAP tests assert all of the above.

**Other views and functions:** `job_applicant_rankings` (Data), `my_applications` (Data), `apply_to_job()` (Backend spec, Data review), `get_token_balance()`, `normalize_company_name(text)`, `is_company_member(company_id)` (RLS helper).

---

## 5. API conventions

**Server actions vs. route handlers**
- **Server actions** handle UI-only mutations that come from our own forms: role selection, profile edits, job create/edit/publish/close, shortlist/reject, resume signed-URL requests. They live in `app/**/actions.ts`. They return `ActionResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }` and never throw to the client.
- **Route handlers under `/api/v1/*`** handle anything that is polled, idempotent, called by non-form code, or that we might expose later:
  - `POST /api/v1/applications` (Apply)
  - fit evaluations (create and poll)
  - upload init/complete for resumes and LinkedIn
  - token balance
  - the recruiter applicant list (paginated)
- **Non-versioned routes:** `/api/inngest` (signed by Inngest), `/auth/callback` (Supabase OAuth).
- **Reads in pages** go through RSC with the user-scoped Supabase client, not through `/api/v1`.

**Error shape** (HTTP and server actions)
```json
{ "error": { "code": "INSUFFICIENT_TOKENS", "message": "Human readable", "details": {}, "request_id": "req_..." } }
```
Codes: `UNAUTHENTICATED` 401 · `FORBIDDEN` 403 · `NOT_FOUND` 404 · `VALIDATION_FAILED` 422 (`details.fields`) · `CONFLICT` 409 · `ALREADY_APPLIED` 409 · `IDEMPOTENCY_KEY_REUSED` 409 · `INSUFFICIENT_TOKENS` 402 · `JOB_NOT_OPEN` 409 · `REPO_NOT_ACCESSIBLE` 422 · `RATE_LIMITED` 429 · `INTERNAL` 500. Postgres RPC errors are raised with `SQLSTATE` `P0001` plus a code in `HINT`, and mapped in `lib/errors/`.

**Auth guards** (`lib/auth/`): `getSession()`, `requireUser()`, `requireRole(role)`, `requireOnboarded()`, `requireCompanyMember(companyId, { verified: true })`. Middleware only refreshes the session and redirects (to `/onboarding/*` when needed). **RLS is the real enforcement.** Guards give early, friendly errors.

**Idempotency:** `Idempotency-Key` header (uuid) is **required** on `POST /api/v1/applications`. It is stored on `applications.idempotency_key` and checked inside `apply_to_job`. Replaying it returns the original `201` body. Other POSTs may accept it, but none require it.

**Pagination:** cursor-based. `?limit=` (default 20, max 100) and `&cursor=` (opaque base64 of the sort key plus id). Response: `{ "data": [...], "next_cursor": "…" | null }`.

**Other rules**
- JSON uses camelCase at the API boundary and snake_case in the DB. Mapping lives in `lib/schemas/`.
- Every handler validates input with zod first.
- Request IDs are propagated to Sentry and logs.
- Upload size and MIME type are enforced both in Storage bucket policy and on the server.

---

## 6. Ownership map

| Doc / area | Owner | Reviewers | Scope |
|---|---|---|---|
| `docs/MASTER_PLAN.md` | Lead | All | Brief, cross-cutting decisions, pass-2 consolidation |
| `docs/sections/frontend.md` | Frontend | Backend, Lead | Pages and routes, layouts, components, design tokens from Stitch, states (loading, polling, error), accessibility, Playwright flows |
| `docs/sections/backend.md` | Backend | Frontend, Data, Lead | `/api/v1` endpoint list, server actions, auth guards, Inngest functions, OpenRouter integration, email, rate limits, error mapping |
| `docs/sections/data.md` | Data | Backend, Lead | Full DDL, enums, RLS policies, views and SQL functions, Storage buckets, retention and deletion, pgTAP tests, seed data |
| `docs/subplans/ai-evaluation.md` | Backend | Data, Lead | Fit and repo prompts, model choice, zod output schemas, repo fetch and filter limits, prompt-injection defenses, caching, cost caps |
| `docs/subplans/applicant-ranking.md` | Data | Backend, Frontend, Lead | `job_applicant_rankings` formula, missing-score handling, ties, pagination, recruiter UI data contract |
| `docs/subplans/linkedin-ingestion.md` | Data | Backend, Lead | ZIP/CSV detection, column mapping, normalization, `connections` PII minimization, re-upload semantics, company matching |
| `docs/subplans/token-system.md` | Backend | Data, Frontend | `token_ledger`, `apply_to_job` contract, grants, no rollover, races, idempotency, balance UI |
| `docs/subplans/company-verification.md` | Backend | Data, Lead | Work-email domain flow, free-mail blocklist, admin approval fallback, multiple recruiters, `/admin/companies` |

**Schema ownership.** Data writes all migrations and RLS. The owner of a sub-plan specifies the columns and RPCs for its tables, and Data reviews them for conventions. `apply_to_job` is specified by Backend (token-system) and implemented and tested by Data.

**Every doc starts with** "Open questions, risks, assumptions" and ends with an "Edge cases" and "Testing approach" section.

---

## 7. Data model summary
_Lead fills in pass 2_

## 8. API endpoint table
_Lead fills in pass 2_

## 9. Page list
_Lead fills in pass 2_

## 10. MVP vs Later
_Lead fills in pass 2_

## 11. Phased build order
_Lead fills in pass 2_

## 12. Risks
_Lead fills in pass 2_

## 13. Decision log
_Lead fills in pass 2_

## 14. Sub-plan index
_Lead fills in pass 2_
