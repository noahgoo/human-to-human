# Section: Backend

**Owner:** Backend
**Reviewers:** Frontend, Data, Lead
**Status:** Pass 1 draft. It uses the canonical names from MASTER_PLAN §4–§5 unchanged. Sub-plans owned here: [`ai-evaluation.md`](../subplans/ai-evaluation.md), [`token-system.md`](../subplans/token-system.md), [`company-verification.md`](../subplans/company-verification.md).

---

## 1. Open questions, risks, assumptions

### Open questions (each has a default that we build with)
| # | Question | Default (decided here) |
|---|---|---|
| B1 | How does middleware learn the role and onboarding state without a DB query on every request? | A **Supabase Custom Access Token Hook** (`public.custom_access_token_hook`, Postgres function, **Data implements**) adds `app_role` and `onboarded` claims to the JWT. Middleware reads them from the session with no DB call. After `setRole` or onboarding completes, the server action calls `supabase.auth.refreshSession()` so the claims update. Guards (`requireRole`) still re-read `profiles` for writes, and RLS never trusts the claim. |
| B2 | How is the role captured for OAuth sign-ups, given that `signInWithOAuth` cannot carry user metadata? | The sign-up screen's role selector writes a short-lived, **httpOnly, signed** cookie `np_role_intent` (`applicant`/`recruiter`, 10 min). `/auth/callback` reads it after `exchangeCodeForSession` and calls RPC `set_my_role(role)` only when `profiles.role IS NULL`. Without a cookie (e.g. "Sign in with Google" on a brand-new account), the user is sent to `/onboarding/role`. Email/password sign-up passes `options.data.role`, and the `handle_new_user` trigger reads it on insert, whitelisted to `applicant`/`recruiter`. |
| B3 | Pending-evaluation sweeper: pg_cron or Inngest cron? | **Inngest cron `sweep-stuck-work` every 5 min.** pg_cron would need `pg_net` and the Inngest event key stored in Vault in order to emit events. It is simpler and observable in the Inngest dashboard. **Deviation from MASTER_PLAN §2; Lead to confirm.** |
| B4 | Monthly grant cron? | **Not needed:** a virtual grant in `get_token_balance()` and lazy materialization in `apply_to_job` cover it (token-system.md T1/T2). **Deviation from MASTER_PLAN §4; Lead to confirm.** |
| B5 | Antivirus scanning of uploaded resumes before recruiters download them | **Not in MVP.** Mitigations: magic-byte check, PDF/DOCX only, downloads served with `Content-Disposition: attachment` through 60 s signed URLs, and the recruiter UI shows the extracted text first. **Later:** a ClamAV scan step in `parse-resume`, through a container service, before `parse_status = succeeded`. |
| B6 | Who sends application status emails, and when? | Inngest `notify-application-status`, with a **10-minute delay** and a re-check, so that a recruiter who mis-clicks "Reject" can undo it without an email going out. |
| B7 | Upload limit for LinkedIn ZIP | **50 MB** compressed (the "Larger data archive" with messages can exceed it, so the copy tells users to request the default export). We extract only the 5 whitelisted CSVs, each ≤ 20 MB uncompressed. **Data to confirm in linkedin-ingestion.md.** |
| B8 | GitHub fetch format | **Zipball** (`downloadZipballArchive`) so we reuse `fflate`. MASTER_PLAN §2 says tarball, which would add a tar parser. **Minor deviation; Lead to confirm.** |

### Risks
- **Service-role misuse.** The service-role client bypasses RLS. It is importable only from `lib/supabase/admin.ts` (`import 'server-only'`). An ESLint `no-restricted-imports` rule allows it only from `inngest/**` and `scripts/support/**` (audited DSAR/support scripts), plus `lib/supabase/admin.ts` itself, and CI fails otherwise. Admin pages use the user-scoped client with `is_admin()` (aal2) RLS (MASTER_PLAN D-18).
- **Long work on Vercel.** Every LLM, GitHub, parse or email call runs in Inngest steps, never in a request. Route handlers stay under 2 s p95, except the sync GitHub check (5 s timeout).
- **Lost events after commit** (the DB commit succeeds and `inngest.send` fails). Covered by the `sweep-stuck-work` cron and idempotent functions.
- **Rate-limit store outage** (Upstash). The LLM-triggering endpoint fails closed. Everything else fails open and logs.
- **PII in logs and Sentry.** Structured logger redaction plus Sentry `beforeSend` scrubbing. Resume or LinkedIn text and prompts are never logged.
- **CSRF on route handlers.** Cookies are `SameSite=Lax`. Mutating `/api/v1` handlers also require `Content-Type: application/json` and a same-origin `Origin` header. Server actions already check Origin.

### Assumptions
- Node runtime everywhere (MASTER_PLAN §2). Middleware runs on the Edge runtime (Next default) and only touches cookies and claims.
- Supabase Auth is the only identity store. Inngest functions act as the service role, carrying `userId` in event data and checking ownership explicitly.
- One region: Vercel `iad1` + Supabase `us-east-1`.

---

## 2. Design

### 2.1 Auth and roles

**Providers** (Supabase Auth):
| Method | Supabase provider | Notes |
|---|---|---|
| Email + password | `email` | Confirm email **on**. Min length 10, plus Supabase leaked-password protection. Auth mail is sent through Resend SMTP. |
| Google | `google` | Scopes `openid email profile`. |
| LinkedIn | `linkedin_oidc` | Scopes `openid profile email`. Returns **only** name, email and picture, with no positions or connections (hence the export upload). |

**Identity linking:** Supabase auto-links identities that share a verified email. A user who signed up with a password and later uses Google with the same email lands on the same account and keeps the same role.

**Sign-up and role selection flow:**
```
/sign-up (role selector: Applicant | Recruiter)
  ├─ email/password → server action signUp({email,password,role}) → supabase.auth.signUp({options:{data:{role}, emailRedirectTo:/auth/callback}})
  │     trigger handle_new_user (Data): insert profiles(id, email, full_name, role = whitelisted meta role)
  └─ OAuth → server action startOAuth({provider, role?}) → set cookie np_role_intent → redirect to provider
/auth/callback?code=… → exchangeCodeForSession → if profiles.role is null and cookie present → rpc set_my_role(cookie)
                       → clear cookie → refreshSession → redirect(next || gate())
```
- `set_my_role(p_role user_role)` (Data implements, SECURITY DEFINER):
  - succeeds only if `profiles.role IS NULL` for `auth.uid()` and `p_role IN ('applicant','recruiter')`;
  - also creates the `applicant_profiles` row for applicants.
  Role is **immutable** afterwards (trigger `profiles_role_immutable`, except via the service role).
- **Admin role:** set only by SQL (`update profiles set role='admin' …` in a seed script or the dashboard). Admin routes require `aal2` (TOTP MFA). `/admin/*` is hidden from navigation for everyone else.

**Onboarding gate** (`lib/auth/gate.ts`, used by middleware and the callback):
| Claims | Redirect target |
|---|---|
| no session, protected route | `/sign-in?next=…` |
| `app_role = null` | `/onboarding/role` |
| `applicant`, `onboarded = false` | `/onboarding/applicant` |
| `recruiter`, `onboarded = false` | `/onboarding/recruiter` |
| `admin` | `/admin/companies` (admins skip onboarding) |
| onboarded user hits `/onboarding/*` | role home (`/jobs`, `/recruiter/jobs` or `/admin/companies`) |
| user hits other role's area (`/recruiter/*` as applicant) | role home; the guard returns `FORBIDDEN` for APIs |

Route paths are owned by Frontend (frontend.md). This table defines behaviour only.

**`onboarded_at` set when:**
- **Applicant:** server action `completeApplicantOnboarding()` succeeds only if the active resume has `parse_status = 'succeeded'` **and** the active LinkedIn import has `status = 'succeeded'` (at least one recognised file; Connections optional). Both are required (product owner, MASTER_PLAN D-39). The action calls Data's `mark_onboarded()`, which re-checks both in SQL. The action calls Data's `mark_onboarded()`, which re-checks these prerequisites in SQL.
- **Recruiter:** `completeRecruiterOnboarding()` succeeds when the recruiter has a `pending` or `verified` membership. Verification is **not** required to finish onboarding, so unverified recruiters can draft jobs (company-verification.md §2.4).

**Guards** (`lib/auth/`, canonical names): `getSession()`, `requireUser()`, `requireRole(role)`, `requireOnboarded()`, `requireCompanyMember(companyId, {verified: true})`, plus **`requireAdmin()`** (role `admin` + `aal2`). Each throws an `AppError`, which route handlers and the server-action wrapper convert to the standard error shape.

**Account deletion:**
1. The server action `deleteAccount({confirm: 'DELETE'})` emits `account/deletion.requested`.
2. Inngest `delete-account` removes Storage objects (`resumes/{uid}/`, `linkedin-exports/{uid}/`).
3. It calls `auth.admin.deleteUser(uid)`, which cascades through `profiles` (Data's FK rules).
4. It sends the confirmation email to the captured address.
5. For recruiters, the company's open jobs are closed first. With one recruiter per company (D-44) there is no hand-over step.

### 2.2 Request pipeline and error handling
```
middleware.ts         → @supabase/ssr cookie refresh, x-request-id (uuid v7 if absent), gate redirects
route handler         → withApi(handler, {auth, role, rateLimit, idempotent?}) wrapper:
                          1. request_id + logger child
                          2. Origin/content-type check for mutations
                          3. requireUser/requireRole/requireOnboarded
                          4. Upstash rate limit
                          5. zod parse (body/query/params) → VALIDATION_FAILED {fields}
                          6. handler(ctx)   — user-scoped Supabase client (RLS)
                          7. map errors → { error: {code, message, details, requestId} }
server action         → action(schema, fn) wrapper returning ActionResult<T>; same steps 1,3,4,5,7
```
- `lib/errors/`: `AppError(code, message, details)`, `mapPostgrestError(e)` (reads `HINT` for `P0001`; maps `23505` → `CONFLICT`, `42501`/RLS → `FORBIDDEN` or `NOT_FOUND`, PGRST116 → `NOT_FOUND`), and `toResponse(err)`. Unknown errors → `INTERNAL`, reported to Sentry, message hidden.
- camelCase ↔ snake_case mapping per resource lives in `lib/schemas/<resource>.ts` (`toApi()`/`fromApi()`).

### 2.3 External integrations
| Integration | Module | Notes |
|---|---|---|
| OpenRouter | `lib/ai/client.ts` | Vercel AI SDK `generateObject` + `@openrouter/ai-sdk-provider`. Headers `HTTP-Referer`, `X-Title: NexusPulse`. `usage: {include: true}` for actual cost. Models, prompts and limits are in ai-evaluation.md. Each call writes one `ai_usage` row through `recordAiUsage()`. |
| GitHub | `lib/github/` | GitHub App (read-only `contents:read` and `metadata:read`, installed on our own org, used only for its 5k/h rate limit on public repos). `@octokit/auth-app` caches the installation token for 55 min. The sync check `checkPublicRepo(url)` (5 s timeout, Redis cache 10 min) is used by `POST /api/v1/repos/validate` and `POST /api/v1/applications`. |
| Resend | `lib/email/` | React Email templates in `emails/`. Transport: Resend in preview and prod, SMTP to the local Supabase Mailpit/Inbucket in dev and E2E (`EMAIL_TRANSPORT=smtp`). |
| Upstash | `lib/ratelimit.ts` | `Ratelimit.slidingWindow`, key prefix `rl:{policy}:{subject}`. |
| Sentry | `sentry.*.config.ts`, `inngest/middleware/sentry.ts` | Traces sample rate 0.1, errors 1.0. |

### 2.4 Inngest job catalogue
Client: `inngest/client.ts` (`id: 'nexuspulse'`, typed event schemas via `EventSchemas().fromZod`). Served at `/api/inngest` and signed with `INNGEST_SIGNING_KEY`. Every function:
- is **idempotent**: it re-reads DB state first and exits early if the row is already terminal;
- marks `running` and increments `attempts` in step 1;
- writes `failed` + `error` in `onFailure`;
- and is wrapped with the Sentry middleware.

| Function id | Trigger | Steps (each a `step.run`) | Retries | Concurrency / throttle | Timeouts |
|---|---|---|---|---|---|
| `parse-resume` | `resume/uploaded` `{resumeId, userId}` | load row → download object → re-sniff magic bytes → extract (unpdf / mammoth) with caps → normalize → save `text_content`, `parse_status` | 3 (exp. backoff) | key `event.data.userId` limit 1; global 20 | 60 s per step |
| `parse-linkedin-import` (**spec owned by linkedin-ingestion.md §2.7**) | `linkedin/import.uploaded` `{importId, applicantId}` (event id = `importId`) | `mark-running` → `validate` → `parse-<kind>` per file (delete-then-insert scoped to `import_id`) → `activate` (`rpc activate_linkedin_import`: atomic replace-all) → `delete-raw`; `onFailure` cleans up rows and raw files | 3 (validation/parse errors are `NonRetriableError`) | key `applicantId` limit 1; `cancelOn` a newer upload by the same applicant (`SUPERSEDED`); global 10 | 120 s |
| `evaluate-fit` | `fit/evaluation.requested` `{fitEvaluationId, applicantId}` | load + mark running → prepare inputs → `generateObject` (primary → fallback) → score → save → `ai_usage` | 3 | key `applicantId` limit 2; global limit 25; **throttle** 120/min | 45 s |
| `snapshot-fit` | `application/submitted` `{applicationId, applicantId, jobId, isTechnical}` | compute hash → reuse a succeeded row **or** insert pending + `step.invoke(evaluate-fit)` → set `applications.fit_evaluation_id` | 5 | key applicantId limit 2 | 90 s |
| `evaluate-repo` | `application/submitted` **if** `event.data.isTechnical == true`, **or** `repo/evaluation.requested` `{repoEvaluationId}` | re-check repo + pin SHA → review-cache lookup → tree manifest + select → download zipball + extract selected → signals + redact → single pass **or** parallel map steps + reduce → validate + sanity caps → save → `ai_usage` per call | 4 (backoff up to ~1 h; GitHub 403 rate limit → `step.sleep` until reset) | key `repoEvaluationId` limit 1; global 10; **throttle** 30/min | 120 s per LLM step; whole run 10 min |
| `notify-application-status` | `application/status.changed` `{applicationId, from, to}` | `step.sleep('10m')` → re-read status, skip if changed → send `email/send.requested` | 3 | key applicationId limit 1 (`cancelOn` a newer `status.changed` for the same id) | — |
| `send-email` | `email/send.requested` `{template, to, props, idempotencyKey}` | render React Email → Resend `send` with the `Idempotency-Key` header | 5 | global 10/s throttle (Resend limit) | 15 s |
| `refund-archived-job-applications` | `job/archived` `{jobId}` | list `submitted` applications → `refund_application(id,'job_archived')` each → email applicants | 5 | key jobId limit 1 | — |
| `on-company-events` | `company/claim.needs_review`, `company/verified`, `company/rejected`, `membership/decided` | resolve recipients → `email/send.requested` | 3 | — | — |
| `delete-account` | `account/deletion.requested` `{userId, email}` | storage cleanup (list + remove in batches of 100) → `auth.admin.deleteUser` → confirmation email | 5 | key userId limit 1 | 120 s |
| `sweep-stuck-work` | **cron** `*/5 * * * *` | re-emit `fit/evaluation.requested` for `pending` fits older than 2 min and `running` older than 10 min; same for `repo_evaluations` (> 10 / > 20 min) and `parse_status = pending` resumes/imports with an uploaded object (> 10 min); `application/submitted` for applications with null `fit_evaluation_id` (> 10 min); `job/archived` for archived jobs with un-refunded `submitted` applications. Each re-emit uses the Inngest event `id` = `{row id}:{attempt bucket}` for dedupe. Rows with `attempts ≥ 5` → `failed` | 1 | singleton | 60 s |
| `purge-expired-data` | **cron** `17 3 * * *` (daily) | delete `resumes` rows + objects for uploads never completed (> 24 h); expire stale company claims (> 7 days unconfirmed); delete consumed/expired `work_email_verifications` > 30 days | 2 | singleton | 300 s |
| `purge-linkedin-raw` (**owned by linkedin-ingestion.md §3**) | **cron** daily | remove Storage objects of imports with `raw_deleted_at is null` that are terminal or older than 7 days | 2 | singleton | 300 s |
| `ai-spend-monitor` | **cron** `*/15 * * * *` | sum today's `ai_usage.cost_usd` → set Redis `ai:spend:{date}` → Sentry alert at 80% / 100% of `AI_DAILY_BUDGET_USD` | 1 | singleton | — |
| `recruiter-daily-digest` | **cron** `0 14 * * 1-5` | per recruiter with new applications in the last 24 h → one digest email | 2 | singleton | — |

Event names are `domain/noun.verb` in the past tense for facts and `.requested` for commands. Payloads carry ids only, never PII.

### 2.5 File upload flow (resumes and LinkedIn exports)
Direct-to-Storage uploads with **signed upload URLs**. Our functions never proxy file bytes.

```
1. Client → POST /api/v1/resumes/uploads {name, size, mimeType}
   server: requireRole(applicant); rate limit; zod (size ≤ 5 MB, mime ∈ {application/pdf,
           application/vnd.openxmlformats-officedocument.wordprocessingml.document}, ext matches)
           insert resumes(id, applicant_id, storage_path='{uid}/{id}.{ext}', mime_type, size_bytes, parse_status='pending')
           storage.from('resumes').createSignedUploadUrl(path)   // single-use token, 2 h validity (Supabase)
   → 201 {resumeId, signedUrl, token, path, expiresAt}
2. Client → supabase.storage.from('resumes').uploadToSignedUrl(path, token, file)
   bucket enforces file_size_limit=5MB and allowed_mime_types (Data configures bucket)
3. Client → POST /api/v1/resumes/{resumeId}/complete
   server: verify ownership; storage .info() → object exists, size matches ±0, ≤ limit;
           download first 4 KB (Range) → file-type magic bytes must be PDF (%PDF-) or ZIP/DOCX (PK\x03\x04 + [Content_Types].xml);
           mismatch → delete object + row → 422 VALIDATION_FAILED {fields:{file:'type_mismatch'}}
           send resume/uploaded → 202 {resumeId, parseStatus:'pending'}
4. Client polls GET /api/v1/resumes/{resumeId} (2 s) until parse_status ∈ {succeeded, failed}.
   On success the server action setActiveResume runs implicitly in parse-resume (sets applicant_profiles.active_resume_id).
```
LinkedIn (request and response contract owned by linkedin-ingestion.md §4): `POST /api/v1/linkedin-imports` `{source: 'zip'|'csv', files: [{name, size}]}`:
- **ZIP:** 1 file, ≤ 50 MB, `application/zip`.
- **CSV:** 1–5 files named from the whitelist `Profile.csv`, `Positions.csv`, `Skills.csv`, `Education.csv`, `Connections.csv`, ≤ 20 MB each, `text/csv`.
It returns one signed URL per file under `linkedin-exports/{uid}/{importId}/{file}`. `complete` verifies every object, then emits `linkedin/import.uploaded`.

**Parser hardening (in Inngest, not request path):**
- **Resume PDF:** unpdf with max 30 pages, a 20 s step timeout and an output cap of 100k chars. Encrypted or password-protected PDFs → `failed: encrypted`. Image-only PDFs (fewer than 200 chars extracted) → `failed: no_text` with the copy "upload a text-based PDF or DOCX". **OCR is Later.**
- **DOCX** is a ZIP, so the zip-bomb guards apply before mammoth:
  - entries ≤ 1,000;
  - total uncompressed ≤ 50 MB;
  - per-entry ratio ≤ 100:1 above 1 MB;
  - no external relationships followed;
  - macros (`.docm` content types) rejected.
- **LinkedIn ZIP** (fflate `unzip` with a `filter` callback):
  - only the 5 whitelisted basenames are extracted, matched case-insensitively at any depth;
  - each ≤ 20 MB uncompressed, cumulative ≤ 60 MB;
  - entries with `..`, absolute paths or symlink attributes are ignored;
  - nested ZIPs are ignored.
- **CSV:** papaparse with the row caps from linkedin-ingestion.md §2.3 (Connections ≤ 35,000, fatal above; Positions and Skills 300, Education 50, truncated with a warning) and the column field caps from data.md. **Formula-injection characters** (`= + - @` at cell start) are stored as-is but escaped by any future CSV export.
- **Raw-file retention:** LinkedIn raw files are deleted right after a successful parse, and in any case within 7 days (`purge-linkedin-raw`). Resume originals are kept (recruiters download them) until the user replaces or deletes them. Replacing a resume keeps the old object only while an application references it, and it is purged when no application references it (Data's retention rules).

### 2.6 Rate limiting
| Policy | Subject | Limit | On store outage |
|---|---|---|---|
| `auth.signin` | IP + email hash | 10 / 15 min | open (Supabase has its own limits) |
| `auth.signup` | IP | 5 / h | open |
| `auth.reset` | IP + email hash | 3 / h | open |
| `fit.create` (cache misses only) | user | 5 / min, 20 / day; and 3 / day per (user, job) | **closed** |
| `fit.global` | — | `AI_DAILY_BUDGET_USD` breaker (Redis counter from `ai-spend-monitor` + in-process increment) | closed |
| `applications.create` | user | 10 / min | open (the RPC is the real guard) |
| `repos.validate` | user | 20 / h | open |
| `uploads.init` | user | resumes 10 / h; LinkedIn imports 10 / day (linkedin-ingestion.md) | open |
| `verification.email` | user | 3 / h, 10 / day | open |
| `verification.confirm` | user | 10 / h | open |
| `recruiter.read` (applicant list/detail, resume URL) | user | 120 / min | open |
| default for other `/api/v1` | user or IP | 300 / min | open |

A `429` response carries `Retry-After` and `details: {retryAfter, policy}`. Rate-limit hits are logged at `info` with the policy name, and Sentry receives only anomalies (more than 100 hits per user per hour).

### 2.7 Secrets and configuration
`lib/env.ts` validates all env vars at boot with zod and splits them into `serverEnv` (`server-only`) and `clientEnv` (`NEXT_PUBLIC_*` only).

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key) | Vercel (all envs) | Public by design. RLS protects data. |
| `SUPABASE_SERVICE_ROLE_KEY` (secret key) | Vercel server, Inngest | Used only by `lib/supabase/admin.ts`. Rotate quarterly. |
| `OPENROUTER_API_KEY` | Vercel server | Per-key credit limit set in the OpenRouter dashboard as a hard cap ($ monthly). Separate key for the CI eval runs. |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Vercel server | Via the Vercel ↔ Inngest integration. |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (base64 PEM), `GITHUB_APP_INSTALLATION_ID` | Vercel server | Read-only app. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Vercel server, Supabase SMTP settings | Sending domain with SPF, DKIM and DMARC (`p=quarantine`). |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Vercel server | |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | Vercel (build for source maps) | |
| `ROLE_INTENT_COOKIE_SECRET` | Vercel server | HMAC for `np_role_intent`. |
| `AI_DAILY_BUDGET_USD`, `FIT_MODEL`, `FIT_FALLBACK_MODEL`, `REPO_MAP_MODEL`, `REPO_REDUCE_MODEL`, `REPO_FALLBACK_MODEL` | Vercel server | Defaults are in code. |
| Google / LinkedIn OAuth client secrets | **Supabase dashboard only** | Never in Vercel. |

Rules:
- No secret ever has a `NEXT_PUBLIC_` prefix (CI grep check).
- `.env.local` is git-ignored, and `.env.example` lists names only.
- Preview deployments use a separate Supabase branch or project and a separate OpenRouter key with a low cap.
- GitHub secret scanning and push protection are on for our repo.

### 2.8 Logging and observability
- **Logger:** `pino` JSON to stdout (Vercel Logs, Inngest logs). Each record carries a `logger.child({request_id, user_id, route})` context. Levels: `info` for request summaries (method, route, status, duration_ms), `warn` for handled 4xx anomalies, `error` for 5xx.
- **Redaction** (`pino` `redact` paths plus a custom serializer): `email`, `password`, `token`, `authorization`, `cookie`, `*.text_content`, `*.resume*`, `prompt`, `completion`, `first_name`, `last_name`, `github_repo_url` (allowed at debug only). Never log LLM prompts or outputs. `ai_usage` holds metadata only.
- **Sentry:**
  - `@sentry/nextjs`: server, edge and client.
  - Inngest: Sentry middleware (`@inngest/middleware-sentry`), tagging `function_id` and `run_id`.
  - `beforeSend` strips request bodies, cookies and the query string `token`.
  - User context is `{id}` only.
  - Release = git SHA.
- **Request IDs:** middleware sets `x-request-id`. It is echoed in responses and in `error.requestId`, passed into Inngest event data as `requestId`, and stored on `ai_usage.request_id`.
- **Health:** `GET /api/health` (no auth) returns `{ok, db: 'ok'|'fail', version}` using a cheap `select 1` RPC. It is checked by an uptime monitor (Better Stack or Vercel monitoring).
- **Alerts** (Sentry alert rules / Inngest):
  - 5xx rate > 2% over 10 min;
  - `evaluate-fit` failure rate > 10% over 30 min;
  - `evaluate-repo` failure rate > 20% over 1 h;
  - any `pending` evaluation > 30 min (from `sweep-stuck-work` metrics);
  - AI spend ≥ 80% of the daily budget;
  - Resend errors > 5 in 10 min;
  - admin queue item older than 48 h (daily check in `purge-expired-data`).
- **Dashboards:**
  - the Inngest dashboard (runs, failures, throughput);
  - an `/admin/ai-usage` RSC page (Later; MVP uses SQL in the Supabase dashboard) showing spend per day, task, model and top users;
  - Vercel Analytics for Web Vitals.

### 2.9 Email notifications
All emails are rendered with React Email (`emails/*.tsx`) and sent through the `send-email` function (retries plus a Resend idempotency key). Auth emails are sent by Supabase through Resend SMTP using Supabase's templates, customized with our branding.

| Template | Recipient | Trigger | Notes |
|---|---|---|---|
| Confirm sign-up / magic link / reset password / email change | user | Supabase Auth | Supabase templates |
| `work-email-verification` | recruiter's work email | `startCompanyClaim`, resend | Link to `/verify/work-email?token=…`, expires in 30 min |
| `company-claim-needs-review` | platform admins | `company/claim.needs_review`, Flow C/D | Link to `/admin/companies` |
| `company-verified` / `company-rejected` | claimant + members | admin decision or auto-verify | Reason included on reject |
| `membership-decided` | requester | approve / reject | |
| `application-received` | applicant | `application/submitted` | Job title, credits spent, credit balance (UI copy says Credits, D-37). No scores |
| `application-shortlisted` / `application-rejected` | applicant | `notify-application-status` (10 min delay, cancelled by a newer change) | Neutral, kind tone. Never includes scores or ratings. `→ shortlisted` (also a reconsidered rejection) sends shortlisted; `→ rejected` sends rejected; `shortlisted → submitted` sends nothing |
| `application-refunded` | applicant | `refund-archived-job-applications` | Amount + new balance |
| `recruiter-daily-digest` | recruiter | weekday cron | Count of new applicants per job. Unsubscribe link (`profiles.email_digest_opt_out`) |
| `account-deleted` | former user | `delete-account` | Sent to the address captured in the event |

Transactional emails cannot be turned off. Only the digest has an opt-out. Every email includes a plain-text part. The From address is `NexusPulse <notifications@{domain}>` and Reply-To is `support@{domain}`.

---

## 3. Data model changes (for Data to implement)
Most backend-owned schema lives in the sub-plans (token-system §3, ai-evaluation §6, company-verification §3). Additional items required by this section:

| Item | Spec |
|---|---|
| `custom_access_token_hook(event jsonb)` | Adds `app_role` (`profiles.role`) and `onboarded` (`onboarded_at is not null`) to the claims. Granted to `supabase_auth_admin` only (B1). |
| `handle_new_user()` trigger on `auth.users` | Inserts `profiles` and copies `raw_user_meta_data->>'role'` only if it is in (`applicant`,`recruiter`). Copies name and avatar from OAuth metadata. |
| `set_my_role(p_role user_role)` | Described in §2.1. |
| `profiles_role_immutable` trigger | Blocks changes to `role` once non-null, except for `service_role`. |
| `profiles.email_digest_opt_out boolean not null default false` | For the digest. |
| `resumes.parse_error text` | Coarse reason (`encrypted`, `no_text`, `type_mismatch`, `too_large`, `parse_failed`). |
| `resumes.page_count smallint`, `resumes.original_filename text` (sanitized, ≤ 200 chars) | Shown to recruiters on download. |
| ~~`linkedin_imports.attempts`, `raw_deleted_at`~~ | Dropped: data.md already defines `raw_deleted_at` and `started_at` (linkedin-ingestion.md §3). |
| `ping()` SQL function | For `/api/health`. |
| Storage buckets | `resumes` (private, 5 MB, PDF/DOCX MIME), `linkedin-exports` (private, 50 MB, zip/csv MIME), `company-logos` (public read, 1 MB, png/jpeg/webp). Storage RLS: owner-only insert into the `{auth.uid()}/` prefix. Recruiters get **no** direct select (they use signed URLs from the server). |

---

## 4. API endpoints

Conventions follow MASTER_PLAN §5: the error shape, cursor pagination, camelCase at the boundary, the `Idempotency-Key` on Apply. **RA** = route handler under `/api/v1`. **SA** = server action (`ActionResult<T>`). Auth: `anon`, `user` (any signed-in), `applicant`, `recruiter`, `member` (verified member of the resource's company), `cadmin` (company admin), `admin` (platform admin + aal2). "onb" = onboarded.

### 4.1 Auth and account
| Kind | Method / name | Path | Auth | Request → Response | Errors |
|---|---|---|---|---|---|
| route | GET | `/auth/callback` | anon | `?code&next` → 302 to `next` or the gate target | redirects to `/sign-in?error=…` |
| SA | `signUp` | — | anon | `{email, password, role}` → `{needsEmailConfirm: true}` | VALIDATION_FAILED, CONFLICT (`email_taken`), RATE_LIMITED |
| SA | `signIn` | — | anon | `{email, password}` → `{redirectTo}` | UNAUTHENTICATED (`invalid_credentials`), RATE_LIMITED |
| SA | `startOAuth` | — | anon | `{provider: 'google'\|'linkedin_oidc', role?, next?}` → `{url}` | VALIDATION_FAILED |
| SA | `signOut` | — | user | → `{}` | — |
| SA | `requestPasswordReset` / `updatePassword` | — | anon / user | `{email}` / `{password}` → `{}` | RATE_LIMITED, VALIDATION_FAILED |
| SA | `setRole` | — | user (role null) | `{role}` → `{redirectTo}` (refreshes session) | CONFLICT (`role_already_set`), VALIDATION_FAILED |
| SA | `deleteAccount` | — | user, signed in < 5 min ago | `{confirm: 'DELETE'}` → `{}` (signs out) | FORBIDDEN (`reauth_required`) |
| SA | `exportMyData` | — | user | `{}` → `{url, expiresAt}`: calls Data's `export_my_data()` and returns the JSON as a 5-min signed download (rate limit 3/day) | RATE_LIMITED |
| RA | GET | `/api/v1/me` | user | → `{id, email (from the auth session, since `profiles.email` is not column-granted), fullName, avatarUrl, role, onboarded, company?: {id, name, verificationStatus, membershipStatus, isCompanyAdmin}}` | 401 |
| RA | GET | `/api/health` | anon | → `{ok, db, version}` | 503 |

### 4.2 Applicant onboarding and profile
| Kind | Method / name | Path | Auth | Request → Response | Errors |
|---|---|---|---|---|---|
| RA | POST | `/api/v1/resumes/uploads` | applicant | `{name, size, mimeType}` → `201 {resumeId, signedUrl, token, path, expiresAt}` | 401, 403, 422, 429 |
| RA | POST | `/api/v1/resumes/{resumeId}/complete` | applicant (owner) | `{}` → `202 {resumeId, parseStatus}` | 404, 409 (`already_completed`), 422 (`type_mismatch`, `size_mismatch`, `object_missing`) |
| RA | GET | `/api/v1/resumes/{resumeId}` | applicant (owner) | → `{id, parseStatus, parseError?, pageCount, originalFilename, isActive, createdAt}` | 404 |
| SA | `deleteResume` | — | applicant | `{resumeId}` → `{}` | CONFLICT (`active_resume_required` while onboarding) |
| RA | POST | `/api/v1/linkedin-imports` | applicant | `{source, files:[{name, size}]}` → `201 {importId, uploads:[{name, path, signedUrl, token}], expiresAt}` (linkedin-ingestion.md §4) | 422 `VALIDATION_FAILED` (`details.code`: `FILE_TOO_LARGE`, `DUPLICATE_FILE_KIND`, …), 429 (10/day) |
| RA | POST | `/api/v1/linkedin-imports/{importId}/complete` | applicant (owner) | `{}` → `202 {importId, status}` | 404, 409, 422 |
| RA | GET | `/api/v1/linkedin-imports/{importId}` | applicant (owner) | → `{id, status, source, filesPresent, counts:{positions, skills, education, connections, companies}, error?}` | 404 |
| RA | GET | `/api/v1/linkedin-imports/active` | applicant | → active import summary (same shape as GET by id) | 404 |
| RA | DELETE | `/api/v1/linkedin-imports/active?scope=all\|connections` | applicant | → `204` (`all`: every import + raw files; `connections`: connections rows only). Logs `linkedin.import_deleted` | 422 |
| SA | `saveApplicantPreferences` | — | applicant | `{headline?, targetSeniority?, locationPref?}` → profile | VALIDATION_FAILED |
| SA | `completeApplicantOnboarding` | — | applicant | `{}` → `{redirectTo:'/jobs'}` (calls Data's `mark_onboarded()`, then refreshes the session) | CONFLICT (`resume_not_ready`, `linkedin_not_ready`) |

### 4.3 Jobs (applicant side), fit, connections, tokens, applications
| Kind | Method / name | Path | Auth | Request → Response | Errors |
|---|---|---|---|---|---|
| RA | GET | `/api/v1/jobs?limit&cursor&q&technical&maxCost` | applicant onb | → `{data:[{id, title, company:{id,name,logoUrl}, tokenCost, isTechnical, publishedAt, myApplicationStatus?, latestFit?:{score, band}}], nextCursor}` (open jobs of verified companies; RSC reads the same query directly) | 401, 403, 422 |
| RA | GET | `/api/v1/jobs/{jobId}` | applicant onb | → job detail (description, requirements, tokenCost, isTechnical) | 404 |
| RA | POST | `/api/v1/jobs/{jobId}/fit-evaluations` | applicant onb | ai-evaluation §7 | ai-evaluation §7 |
| RA | GET | `/api/v1/fit-evaluations/{id}` | applicant (owner) | ai-evaluation §7 | 404 |
| RA | GET | `/api/v1/jobs/{jobId}/connections` | applicant onb | → `200 {data:[{id, firstName, lastName, position, companyName, connectedOn, matchKind}], exactCount, possibleCount, asOf}` (contract owned by linkedin-ingestion.md §4; Data's `connections_at_company(job.company_id)`, user-scoped client) | 404 |
| RA | POST | `/api/v1/repos/validate` | applicant | `{url}` → `{canonicalUrl, fullName, defaultBranch, sizeKb, language}` | 422 `REPO_NOT_ACCESSIBLE`, 429 |
| RA | GET | `/api/v1/tokens/balance` | applicant | → `{period, granted, spent, refunded, adjusted, total, balance, resetsAt}` | 401, 403 |
| RA | GET | `/api/v1/tokens/ledger?limit&cursor` | applicant | token-system §4 | 422 |
| RA | POST | `/api/v1/applications` | applicant onb, **`Idempotency-Key` required** | `{jobId, githubRepoUrl?, repoOwnershipAttested?, expectedTokenCost?}` (attestation required for technical jobs, D-16) → `201 {applicationId, jobId, status, tokenCost, balanceAfter, period, replayed}` | 401, 402 `INSUFFICIENT_TOKENS`, 403, 404, 409 `JOB_NOT_OPEN`/`ALREADY_APPLIED`/`IDEMPOTENCY_KEY_REUSED`/`CONFLICT` (`token_cost_changed`, `linkedin_required`), 422 `VALIDATION_FAILED`/`REPO_NOT_ACCESSIBLE`, 429 |
| RA | GET | `/api/v1/applications?limit&cursor&status` | applicant | from `my_applications` → `{data:[{id, job:{id,title,company,status}, status, tokenCost, submittedAt, updatedAt, repoReviewStatus?, refunded}], nextCursor}` | 401, 403 |
| RA | GET | `/api/v1/applications/{id}` | applicant (owner) | from `my_applications` + events → `{…, events:[{toStatus, at}]}`. **Never scores or ratings.** | 404 |
| SA | `withdrawApplication` | — | applicant (owner) | `{applicationId}` → application (no refund; calls `withdraw_application` RPC) | CONFLICT (`not_withdrawable` unless `submitted`/`shortlisted`) |

### 4.4 Recruiter: company, jobs, pipeline
| Kind | Method / name | Path | Auth | Request → Response | Errors |
|---|---|---|---|---|---|
| SA | `checkWorkEmailDomain`, `startCompanyClaim` (`CONFLICT company_has_recruiter` when the company or domain already has a recruiter, D-44), `resendWorkEmailVerification`, `confirmWorkEmail`, `cancelPendingMembership`, `updateCompanyProfile` | — | recruiter | company-verification §4 | |
| RA | POST | `/api/v1/companies/{companyId}/logo/uploads` | cadmin or pending creator | `{name, size, mimeType}` → signed upload | 403, 422 |
| SA | `completeRecruiterOnboarding` | — | recruiter | → `{redirectTo:'/recruiter/jobs' (verified) or '/recruiter/pending'}` | CONFLICT (`no_membership`) |
| SA | `createJob` | — | recruiter with an active membership (pending ok) | `{title, description, requirements, tokenCost 1–3, isTechnical}` → job (`draft`) | VALIDATION_FAILED (title 5–120, description 50–20,000, requirements 0–10,000 chars) |
| SA | `updateJob` | — | member, or the pending creator for drafts | partial job → job | CONFLICT (`pricing_locked`), FORBIDDEN |
| SA | `publishJob` | — | member (company **verified**) | `{jobId}` → job (`open`, `published_at`) | FORBIDDEN (`company_not_verified`), CONFLICT (bad transition) |
| SA | `closeJob` / `reopenJob` | — | member | `{jobId}` → job | CONFLICT |
| SA | `archiveJob` | — | member | `{jobId}` → `{job, refundsQueued}` → emits `job/archived` | CONFLICT |
| SA | `deleteDraftJob` | — | member / creator | `{jobId}` → `{}` | CONFLICT (`has_applications` / not draft) |
| RA | GET | `/api/v1/jobs/{jobId}/applicants?limit&cursor&sort&status&minConfidence&github&includeIncomplete&rankingVersion` | member | `rpc job_applicant_rankings_page` → `{data: RankedApplicant[], nextCursor, rankingVersion, rankingChanged, counts, job}` (**contract owned by applicant-ranking.md §2.8, §4**) | 401, 403, 404, 422, 429 |
| RA | GET | `/api/v1/jobs/{jobId}/applicants/{applicationId}` | member | `RankedApplicant` + detail fields (D-15, D-26): `resume {available, fileName, mimeType, sizeBytes, textContent}`, `events [{toStatus, at, actorName}]`, fit `requirements`/`subScores`, repo `signals` | 403, 404 |
| SA | `getResumeUrl` | — | member | `{applicationId}` → `{url, expiresAt}` (60 s, `download` disposition, the resume snapshotted on `applications.resume_id`; logs `resume.signed_url`) | FORBIDDEN, NOT_FOUND |
| SA | `revealContact` | — | member | `{applicationId}` → `{email}` via `rpc get_applicant_contact` (shortlisted only; `profiles.email` is not column-granted; logs `contact.revealed`) | NOT_FOUND (unknown or another company's application), CONFLICT (`not_shortlisted`); guard-level FORBIDDEN for unverified recruiters (D-15) |
| SA | `setApplicationStatus` | — | member | `{applicationId, toStatus: 'shortlisted'\|'rejected'\|'submitted', note?}` → application. Calls Data's `set_application_status` RPC (which writes `application_events` + `audit_log`), then emits `application/status.changed` | FORBIDDEN, CONFLICT (invalid transition; `withdrawn` is terminal) |

Recruiter dashboard reads (job list, counts) are RSC-only, through the user-scoped client.

### 4.5 Admin
| Kind | Name | Auth | Notes |
|---|---|---|---|
| RSC | `/admin/companies` (tabs) | admin | company-verification §4 |
| SA | `adminReviewCompany`, `adminReviewMembership`, `adminRevokeMembership`, `adminAddCompanyDomain`, `adminRemoveCompanyDomain`, `adminBlockEmailDomain` | admin | company-verification §4 |
| SA | `adminAdjustTokens` | admin | token-system §4 |
| SA | `adminRetryEvaluation` | admin | ai-evaluation §7 |
| route | POST `/api/inngest` | Inngest signature | Inngest serve handler |

---

## 5. Edge cases
| # | Case | Handling |
|---|---|---|
| BE1 | OAuth user with no role cookie (signed in rather than signed up) and no existing account | Profile created with `role = null` → gate → `/onboarding/role`. |
| BE2 | User signs up as recruiter with email, then uses "Continue with Google" as "applicant" with the same email | Identity linking → same account. The role cookie is ignored because the role is already set. A toast says "You're signed in as a Recruiter". |
| BE3 | JWT claims stale after onboarding | The server action refreshes the session. Middleware also treats `onboarded=false` plus a DB check in the onboarding page loader as the source of truth (one query only on `/onboarding/*`). |
| BE4 | Upload init succeeds but the client never uploads | The row stays `pending` without an object → purged after 24 h. |
| BE5 | Client calls `complete` twice | The second call → `409 already_completed`. Inngest dedupes the event by id `resume:{id}`. |
| BE6 | File renamed `.pdf` but is a ZIP or EXE | Magic-byte mismatch → object deleted → 422. |
| BE7 | Event send fails after the DB commit (Apply, fit) | Return success. `sweep-stuck-work` re-emits within 5 min. Functions are idempotent. |
| BE8 | Inngest runs a function twice (at-least-once) | Step memoization plus the early exit on terminal status. `ai_usage` rows are written inside the same step as the result, so a replay does not double-count. |
| BE9 | Vercel cold start + sync GitHub check exceed the client timeout on Apply | The client keeps the same `Idempotency-Key` and retries. The RPC replays. The GitHub check result is cached in Redis. |
| BE10 | Recruiter shortlists then rejects within 10 min | `cancelOn` cancels the first email. Only the final status is emailed. |
| BE11 | Resend outage | `send-email` retries 5× with backoff (~2 h). After that the run fails → Sentry. The email is lost, which is acceptable for notifications. |
| BE12 | Supabase Auth email (confirm) rate limits | Custom SMTP (Resend) lifts Supabase's built-in 2/h limit. Our own `auth.signup` limit applies. |
| BE13 | Admin session without MFA | `requireAdmin` → `FORBIDDEN {reason:'mfa_required'}`. The UI routes to TOTP enrollment. |
| BE14 | Clock skew between Vercel and DB for periods or rate limits | Periods are computed only in SQL `now()`. Rate limits use Redis time. |
| BE15 | Very large Connections.csv (30k+ rows) | Row cap → import `succeeded` with `counts.connections_truncated = true`, and the UI shows a notice. |
| BE16 | Deleted user's in-flight Inngest runs | Functions re-read rows. Missing rows → exit without error. |

---

## 6. Testing approach
| Layer | Tooling | Scope | Gate |
|---|---|---|---|
| Unit | Vitest | zod schemas, `lib/errors` mapping (every HINT → HTTP), guards (mocked session), gate redirect table, rate-limit key builders, upload validators, magic-byte checks, zip guards, env parsing, email rendering (snapshot HTML per template) | PR, ≥ 90% lines in `lib/` |
| DB | pgTAP via `supabase test db` (**Data writes**, Backend reviews) | RLS per table and role, RPC contracts (`apply_to_job`, `set_my_role`, verification RPCs), triggers (role immutable, pricing lock, publish guard), access-token hook output | PR |
| Integration | Vitest + local Supabase (`supabase start`) + MSW (OpenRouter, GitHub, Resend) | Each `/api/v1` route with real JWTs for 4 seeded personas (applicant, unverified recruiter, verified recruiter, admin). Asserts status codes, the error shape, `request_id`, pagination cursors, and **that applicant responses never contain repo scores**. Server actions are called directly. | PR |
| Concurrency | Vitest (`tests/integration/*.concurrency.test.ts`) | Parallel Apply (token-system §6), parallel fit create (in-flight dedupe), parallel `complete`, parallel claims of the same domain | PR |
| Inngest | `@inngest/test` (`InngestTestEngine`) | Every function: happy path, retry, `onFailure` writes `failed`, idempotent re-run, `cancelOn` for status emails, sweeper selection queries | PR |
| Security | Vitest + a custom script | No `service_role` import outside the allowed paths (ESLint rule). `NEXT_PUBLIC_` secret grep. Origin and content-type check on mutating routes. Upload path traversal attempts. | PR |
| AI evals | `pnpm eval:ai` | ai-evaluation §9.2 | PRs touching `lib/ai/**`, nightly |
| E2E | Playwright (**Frontend owns**). Backend provides `supabase/seed.sql` personas, an MSW/OpenRouter stub server and a Mailpit helper to read magic links | Sign-up → onboarding → Check fit → Apply → recruiter shortlist | PR (smoke), nightly (full) |
| Load (pre-launch) | k6 | Apply at 50 rps on 1k users, fit create at 20 rps (cached) | manual, once before launch |

Test data: `supabase/seed.sql` holds 4 personas, 2 companies (1 verified, 1 pending), 6 jobs (costs 1/2/3, technical and non-technical), LinkedIn fixtures and a sample resume PDF/DOCX in `tests/fixtures/`.

---

## Review notes
<!-- Frontend, Data, Lead: add comments here -->

## Resolution

_Lead, pass 2. IDs refer to the [MASTER_PLAN Decision log](../MASTER_PLAN.md#13-decision-log)._

| Item | Outcome |
|---|---|
| B1 access-token hook | **Accepted (D-24).** The claims are `app_role` and `onboarded`, plus `membership_status` for recruiters, which Frontend's layout needs. They are UX hints only and never feed RLS. |
| B2 role capture | **Accepted (D-25).** A signed `np_role_intent` cookie for OAuth, `options.data.role` for email sign-up, and `/onboarding/role` only when the role is still null. |
| B3 sweeper | **Inngest cron `sweep-stuck-work` (D-01).** pg_cron is kept only for SQL-only retention jobs. `pg_net` and Vault are dropped from data.md. |
| B4 no grant cron | **Accepted (D-02).** |
| B5 no AV scan in MVP | **Accepted (D-13).** Attachment-only downloads, a text-first viewer, and ClamAV Later. |
| B6 10-minute delayed status emails, B7 50 MB ZIP | **Accepted.** |
| B8 zipball | **Accepted (D-04).** |
| Onboarding gate | **Resume and LinkedIn import both required (product owner, D-39; reverses D-08).** §2.1 and §4.2 have been updated. If the applicant later deletes their LinkedIn data, Check fit and Apply return `409 CONFLICT {reason:'linkedin_required'}` until they re-upload. |
| Account deletion and export | **Server actions `deleteAccount` (re-auth < 5 min) and `exportMyData` (3/day) (D-28).** There is no `/api/v1/me` DELETE or export route. data.md §7.5 and §8 have been updated. |
| Admin pages | **User-scoped client + `is_admin()` RLS (D-18).** The ESLint service-role allowlist is `inngest/**`, `scripts/support/**` and `lib/supabase/admin.ts`. |
| Applicant detail route | **Renamed to `GET /api/v1/jobs/{jobId}/applicants/{applicationId}` (D-26).** |
| Route paths | **Frontend's paths are canonical**: `/sign-in`, `/sign-up`, and the role homes `/jobs`, `/recruiter/jobs`, `/admin/companies`. §2.1 and §4 have been updated. |
| Missing `Idempotency-Key` | 422, not 400 (D-10). §4.3 has been updated. |
| JSON casing | camelCase everywhere, `nextCursor` and `error.requestId` (D-12). |
