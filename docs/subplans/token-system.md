# Sub-plan: Token System

**Owner:** Backend
**Reviewers:** Data, Frontend
**Status:** Pass 1 draft. The canonical names (`token_ledger`, `token_entry_kind`, `apply_to_job`, `get_token_balance`) come from MASTER_PLAN §4 and are used unchanged. Data implements and tests the SQL. This doc is the contract.

---

## 1. Open questions, risks, assumptions

### Open questions (each has a default that we build with)
| # | Question | Default (decided here) |
|---|---|---|
| T1 | Should `get_token_balance()` **write** the lazy grant row, as MASTER_PLAN §4 says? | **No.** `get_token_balance()` is a read-only `STABLE` function that counts a missing grant for the current period as a *virtual* +10. Only `apply_to_job()` (and `admin_adjust_tokens()`) **materialize** the grant row, because only they need it as a balance floor inside a write. With this, GETs never write and the RSC navbar can call it freely. **Lead to confirm** (small deviation from §4). |
| T2 | Do we need the Inngest cron grant on the 1st of the month? | **No for MVP.** The virtual grant makes it redundant, and a cron that inserts rows for every user is O(users) of useless writes. If analytics later need materialized rows, add `grant-monthly-tokens` (it is idempotent through the unique index). **Lead to confirm** (deviation from §4). |
| T3 | Can a recruiter change `token_cost` after applications exist? | **No.** `token_cost` and `is_technical` are frozen once the job has ≥1 application (enforced by a DB trigger). Before that, they can change freely, including while the job is `open`. |
| T4 | Refund when a job is closed or deleted before review? | `closed` → **no refund** (the recruiter still reviews the pipeline). `archived` while an application is still `submitted` (never acted on) → **automatic refund** of that application's `token_cost`. Jobs with applications **cannot be hard-deleted**. Only `draft` jobs with no applications can be deleted. |
| T5 | Refund when the repo review fails? | **No refund** (MASTER_PLAN default 2). Applicant-caused failures (repo deleted, made private, too large) are final. **System-caused** failures (LLM or GitHub outage after all retries) are **re-queued** through the admin "retry evaluation" action, not refunded. |
| T6 | Refund on applicant withdrawal? | **No.** Withdrawal is free but tokens are not returned, because otherwise apply-then-withdraw becomes a way to probe recruiters for free. |
| T7 | Which period is a refund credited to? | The **current** UTC period at refund time, so it is spendable. If the refund lands in a later month, the balance can exceed 10 that month. That is intended. |
| T8 | Protect the applicant from a cost change between viewing and applying? | Yes. Add an optional parameter `p_expected_cost smallint default null` to `apply_to_job`. If it is non-null and does not match the job's cost under lock, the RPC raises `CONFLICT` with `details.reason = 'token_cost_changed'`. The function is additive and backward compatible. **Lead to confirm** (signature extension). |

### Risks
- **Overspend or double-apply under races.** Mitigated by the per-applicant advisory lock, the unique constraints and the idempotency key (§3.3, §5).
- **Period boundary bugs** (UTC vs local). Every period is derived in SQL from `now()` through one function, `token_period(timestamptz)`. The client never sends a period.
- **Ledger tampering.** There are no client INSERT/UPDATE/DELETE policies on `token_ledger`. All writes go through `SECURITY DEFINER` functions, which have a pinned `search_path`.
- **Refund loops** (archive, re-open, archive again). `token_ledger` gets a unique partial index of **one refund per application**.

### Assumptions
- Only applicants hold tokens. Recruiters and admins never have ledger rows.
- The grant amount (10) is a constant in SQL (`token_monthly_grant()` returns 10) so it can change later in one place.
- An application row is never deleted except by account-deletion cascade.

---

## 2. Design

### 2.1 Ledger model
`token_ledger` is **append-only**. The balance is never stored. It is always derived:

```
balance(applicant, P) = Σ amount  WHERE applicant_id = applicant AND period = P
                       (+ 10 virtually if no monthly_grant row exists for P)
```

| `kind` | `amount` | Written by | `application_id` | Notes |
|---|---|---|---|---|
| `monthly_grant` | `+10` | `apply_to_job`, `admin_adjust_tokens` (lazily) | null | Unique per `(applicant_id, period)` |
| `application_spend` | `-token_cost` (−1..−3) | `apply_to_job` only | required | Unique per `application_id` where kind = spend |
| `refund` | `+token_cost` of the application | `refund_application` only | required | Unique per `application_id` where kind = refund |
| `adjustment` | any non-zero int | `admin_adjust_tokens` only | null | `reason` required |

**No rollover** follows from the formula: only rows whose `period` is the current period count. Last month's leftover balance is simply never summed. Nothing expires and no sweep runs.

**Period** is `token_period(ts timestamptz) = to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM')`, which is `IMMUTABLE`. `current_token_period()` returns `token_period(now())`. `now()` is the transaction start time, so a single transaction always sees one period, even when it straddles midnight UTC.

**Reset time** shown in the UI is `date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month'`, returned as `timestamptz`. The Frontend renders it in local time with the copy "Resets on {date} · unused tokens don't roll over".

### 2.2 Lazy vs. cron grant: decision
| Option | Pros | Cons |
|---|---|---|
| Cron on the 1st inserts +10 for every applicant | Rows exist for analytics | O(users) writes, fails if the cron fails (users show 0), and a user who signs up mid-month still needs a lazy path anyway |
| **Lazy materialization + virtual grant in reads** (chosen) | No scheduled dependency, correct for new users, no writes on reads | Analytics must apply the same virtual rule (`get_token_balance` encapsulates it) |

### 2.3 Cost 1–3 set by the recruiter
- `jobs.token_cost smallint not null default 2 check (token_cost between 1 and 3)`. Stitch recommends 2.
- Editable in `draft`, and in `open` **until the first application exists**.
- `applications.token_cost` snapshots the price paid. Refunds always use the snapshot.
- After the first application, the UI disables the selector with the hint "Cost is locked once candidates have applied. Close this job and post a new one to change it."

### 2.4 Refund policy (final)
| Event | Refund? | Mechanism |
|---|---|---|
| Recruiter shortlists or rejects | No | n/a |
| Job → `closed` | No | Applications remain reviewable |
| Job → `archived` with applications in `submitted` | **Yes**, for each `submitted` application | `archiveJob` server action sends `job/archived` → Inngest `refund-archived-job-applications` calls `refund_application(id, 'job_archived')` per application |
| Admin suspends or rejects a company (company-verification.md) | **Yes** (its open jobs are archived, so the rule above applies) | Same path |
| Job hard delete | Not possible with applications (`ON DELETE RESTRICT` from `applications.job_id`) | n/a |
| Repo review `failed` (applicant cause) | No | Ranked on confidence only and flagged |
| Repo review `failed` (system cause) | No, it is re-run | Admin `retryRepoEvaluation` |
| Applicant withdraws | No | n/a |
| Duplicate charge caused by a bug | Yes, manually | `admin_adjust_tokens(+n, reason)` |

> Delivery note: Postgres cannot call Inngest directly. The archive transition is done by the `archiveJob` server action, which **after** the update commits sends `job/archived`. The Inngest cron sweeper (backend.md §2.4) also selects archived jobs with un-refunded `submitted` applications every 5 minutes, so no lost event leaves a refund unpaid. `refund_application` is idempotent through the unique index.

---

## 3. Data model changes (for Data to implement)

### 3.1 Tables, constraints, RLS

```sql
-- token_ledger: additions to the canonical columns
alter table token_ledger
  add column reason        text,                       -- required for refund / adjustment
  add column created_by    uuid references profiles(id) on delete set null, -- admin for adjustments, null for system
  add constraint token_ledger_amount_sign check (
    (kind = 'monthly_grant'     and amount = 10) or       -- uses token_monthly_grant() value
    (kind = 'application_spend' and amount between -3 and -1 and application_id is not null) or
    (kind = 'refund'            and amount between 1 and 3  and application_id is not null and reason is not null) or
    (kind = 'adjustment'        and amount <> 0 and reason is not null)
  ),
  add constraint token_ledger_period_format check (period ~ '^\d{4}-(0[1-9]|1[0-2])$');

create unique index token_ledger_one_grant_per_period
  on token_ledger (applicant_id, period) where kind = 'monthly_grant';   -- canonical (§4)
create unique index token_ledger_one_spend_per_application
  on token_ledger (application_id) where kind = 'application_spend';
create unique index token_ledger_one_refund_per_application
  on token_ledger (application_id) where kind = 'refund';
create index token_ledger_applicant_period on token_ledger (applicant_id, period);

-- token_ledger.application_id FK: ON DELETE CASCADE (account deletion only path)
-- jobs: freeze cost/technical flag once applications exist
--   trigger jobs_freeze_pricing BEFORE UPDATE OF token_cost, is_technical ON jobs
--   raises P0001 HINT 'CONFLICT' (details: 'pricing_locked') if exists(select 1 from applications where job_id = new.id)
-- applications.job_id FK: ON DELETE RESTRICT
```

RLS:
- `token_ledger`: `SELECT` where `applicant_id = auth.uid()`. There is **no** INSERT, UPDATE or DELETE policy for any client role. Admins read through the service role in admin views.
- Functions are `SECURITY DEFINER`, `set search_path = public, pg_temp`, owned by a non-superuser owner role. Grant EXECUTE: `apply_to_job` and `get_token_balance` to `authenticated`, `refund_application` to `service_role` only, `admin_adjust_tokens` to `authenticated`, with an internal check that the caller is an admin.

New SQL functions: `token_monthly_grant()`, `token_period(timestamptz)`, `current_token_period()`, `ensure_monthly_grant(uuid)` (internal, not granted to clients), `refund_application(uuid, text)`, `admin_adjust_tokens(uuid, int, text)`.

---

### 3.2 `get_token_balance()` spec

```sql
create function get_token_balance()
returns table (period text, granted int, spent int, refunded int, adjusted int,
               balance int, resets_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  with p as (select current_token_period() as period),
  rows as (
    select l.kind, l.amount from token_ledger l, p
    where l.applicant_id = auth.uid() and l.period = p.period
  )
  select p.period,
    coalesce((select sum(amount) from rows where kind='monthly_grant'), token_monthly_grant())::int,
    coalesce(-(select sum(amount) from rows where kind='application_spend'), 0)::int,
    coalesce((select sum(amount) from rows where kind='refund'), 0)::int,
    coalesce((select sum(amount) from rows where kind='adjustment'), 0)::int,
    ( coalesce((select sum(amount) from rows), 0)
      + case when exists(select 1 from rows where kind='monthly_grant') then 0 else token_monthly_grant() end )::int,
    (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc'
  from p;
$$;
```
- If the caller's role is not `applicant`, it returns zero rows. The API maps that to `FORBIDDEN`.
- The balance may be negative only through an admin adjustment. `apply_to_job` never creates a negative balance.

---

### 3.3 `apply_to_job()` RPC spec

#### Signature
```sql
apply_to_job(
  p_job_id           uuid,
  p_idempotency_key  uuid,
  p_github_repo_url  text     default null,
  p_expected_cost    smallint default null      -- T8, additive
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
```
Called only from `POST /api/v1/applications` with the **user-scoped** client, so `auth.uid()` is the applicant. The route handler has already validated the URL syntax, and for technical jobs it has done the synchronous public-repo check (backend.md §2.3, §4.3).

#### Algorithm (single transaction, in this order)
```
1.  v_uid := auth.uid();  IF null → raise UNAUTHENTICATED
2.  SELECT role, onboarded_at FROM profiles WHERE id = v_uid
      IF role <> 'applicant' OR onboarded_at IS NULL → raise FORBIDDEN
3.  PERFORM pg_advisory_xact_lock(7301, hashtext(v_uid::text));
      -- two-int form: 7301 = token-system namespace, avoids collisions with other advisory-lock users.
      -- Serializes ALL applies by this applicant (any job). Released at commit/rollback.
4.  Idempotency check (BEFORE job/balance checks, so a replay succeeds even if the job closed since).
      v_req_hash := encode(sha256(convert_to(p_job_id::text || '|' || coalesce(p_github_repo_url,''), 'UTF8')), 'hex');
      SELECT * INTO v_app FROM applications WHERE applicant_id = v_uid AND idempotency_key = p_idempotency_key;
      IF found:
         IF v_app.request_hash = v_req_hash          -- Data's applications.request_hash (data.md)
            → RETURN build_result(v_app, replayed => true)
         ELSE → raise IDEMPOTENCY_KEY_REUSED
5.  SELECT id, status, token_cost, is_technical, company_id INTO v_job
      FROM jobs WHERE id = p_job_id FOR SHARE;           -- blocks concurrent cost/status UPDATE until we commit
      IF not found OR company not verified → raise NOT_FOUND
      IF v_job.status <> 'open'           → raise JOB_NOT_OPEN
6.  IF p_expected_cost IS NOT NULL AND p_expected_cost <> v_job.token_cost
      → raise CONFLICT  details {reason:'token_cost_changed', current_cost: v_job.token_cost}
7.  Repo URL rules:
      IF v_job.is_technical AND p_github_repo_url IS NULL → raise VALIDATION_FAILED {fields:{githubRepoUrl:'required'}}
      IF NOT v_job.is_technical AND p_github_repo_url IS NOT NULL → raise VALIDATION_FAILED {fields:{githubRepoUrl:'not_allowed'}}
      IF p_github_repo_url !~ '^https://github\.com/[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}$' → VALIDATION_FAILED (defense in depth)
8.  IF EXISTS (SELECT 1 FROM applications WHERE job_id = p_job_id AND applicant_id = v_uid)
      → raise ALREADY_APPLIED
9.  v_period := current_token_period();
    PERFORM ensure_monthly_grant(v_uid, v_period);       -- INSERT ... ON CONFLICT DO NOTHING
10. SELECT coalesce(sum(amount),0) INTO v_balance FROM token_ledger
      WHERE applicant_id = v_uid AND period = v_period;
    IF v_balance < v_job.token_cost
      → raise INSUFFICIENT_TOKENS details {balance: v_balance, required: v_job.token_cost}
11. INSERT INTO applications (job_id, applicant_id, status, token_cost, github_repo_url,
                              idempotency_key, request_hash, resume_id, submitted_at)
      VALUES (p_job_id, v_uid, 'submitted', v_job.token_cost, p_github_repo_url, p_idempotency_key,
              v_req_hash, (SELECT active_resume_id FROM applicant_profiles WHERE profile_id = v_uid), now())
      RETURNING * INTO v_app;
12. INSERT INTO token_ledger (applicant_id, period, kind, amount, application_id)
      VALUES (v_uid, v_period, 'application_spend', -v_job.token_cost, v_app.id);
13. INSERT INTO application_events (application_id, actor_id, from_status, to_status, note)
      VALUES (v_app.id, v_uid, NULL, 'submitted', 'applied');
14. IF v_job.is_technical:
      INSERT INTO repo_evaluations (application_id, repo_url, status) VALUES (v_app.id, p_github_repo_url, 'pending');
15. RETURN build_result(v_app, replayed => false)
      -- {application_id, job_id, status, token_cost, balance_after: v_balance - cost,
      --  period, replayed, is_technical}
EXCEPTION
  WHEN unique_violation THEN
    -- Should be unreachable thanks to the lock; mapped defensively by constraint name:
    --   applications_job_id_applicant_id_key        → ALREADY_APPLIED
    --   applications_applicant_id_idempotency_key_key → IDEMPOTENCY_KEY_REUSED
```

#### Error contract
All errors are `RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = <human text>, HINT = <code>, DETAIL = <json>`. `lib/errors/mapPostgrestError` maps `HINT` to the API error (MASTER_PLAN §5):

| HINT | HTTP | `details` |
|---|---|---|
| `UNAUTHENTICATED` | 401 | — |
| `FORBIDDEN` | 403 | `{reason: 'not_applicant' \| 'not_onboarded'}` |
| `NOT_FOUND` | 404 | — |
| `JOB_NOT_OPEN` | 409 | `{status}` |
| `CONFLICT` | 409 | `{reason: 'token_cost_changed', currentCost}` |
| `VALIDATION_FAILED` | 422 | `{fields}` |
| `ALREADY_APPLIED` | 409 | `{applicationId}` |
| `IDEMPOTENCY_KEY_REUSED` | 409 | — |
| `INSUFFICIENT_TOKENS` | 402 | `{balance, required, resetsAt}` |

#### Why the lock is per applicant, not per job
The scarce resource is the applicant's balance, which is shared across jobs. A per-applicant lock serializes the read-balance-then-insert sequence. Contention is negligible because one human rarely applies concurrently. The job's `FOR SHARE` row lock separately protects against a recruiter closing the job or changing its cost mid-transaction.

#### HTTP wrapper behaviour (`POST /api/v1/applications`)
- `201` with the result for a new application. A replay (`replayed: true`) **also returns `201` with the identical body**, as MASTER_PLAN §5 requires.
- After a **non-replayed** commit it sends `application/submitted` to Inngest. If the send fails, it still returns 201. The sweeper re-emits (backend.md §2.4).
- The response includes `balanceAfter`, so the client updates the navbar without refetching. It also invalidates the `['token-balance']` TanStack query.

---

### 3.4 Refund and admin functions

```sql
refund_application(p_application_id uuid, p_reason text) returns jsonb   -- service_role only
  1. SELECT a.*, j.status AS job_status FROM applications a JOIN jobs j ... FOR UPDATE OF a
  2. pg_advisory_xact_lock(7301, hashtext(a.applicant_id::text))   -- same namespace as apply
  3. IF exists refund for application → RETURN {refunded:false, reason:'already_refunded'}
  4. IF p_reason = 'job_archived' AND (a.status <> 'submitted' OR job_status <> 'archived')
       → RETURN {refunded:false, reason:'not_eligible'}
  5. INSERT token_ledger (applicant_id, period=current_token_period(), kind='refund',
                          amount=a.token_cost, application_id=a.id, reason=p_reason)
  6. INSERT application_events (application_id, actor_id NULL, from_status=a.status,
                                to_status=a.status, note='refund:'||p_reason)
  7. RETURN {refunded:true, amount}

admin_adjust_tokens(p_applicant_id uuid, p_amount int, p_reason text) returns jsonb  -- authenticated, asserts caller role='admin'
  - asserts target role='applicant', |p_amount| <= 20, reason length 5..500
  - lock, ensure_monthly_grant, insert 'adjustment' with created_by = auth.uid()
  - also writes an `audit_log` row (`admin.token_adjustment`, Data's table)
```

---

## 4. API endpoints

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/v1/tokens/balance` | applicant | — | `200 {period, granted, spent, refunded, adjusted, balance, resetsAt}` | 401, 403 |
| GET | `/api/v1/tokens/ledger?limit&cursor` | applicant | — | `200 {data:[{id, kind, amount, period, applicationId, jobTitle, reason, createdAt}], next_cursor}` (newest first, all periods) | 401, 403, 422 |
| POST | `/api/v1/applications` | applicant, onboarded; header `Idempotency-Key` (uuid, **required**) | `{jobId, githubRepoUrl?, expectedTokenCost?}` | `201 {applicationId, jobId, status, tokenCost, balanceAfter, period, replayed}` | 400 (missing key), 401, 403, 404, 409 `JOB_NOT_OPEN`/`ALREADY_APPLIED`/`IDEMPOTENCY_KEY_REUSED`/`CONFLICT`, 402, 422 `VALIDATION_FAILED`/`REPO_NOT_ACCESSIBLE`, 429 |
| server action | `archiveJob(jobId)` | verified company member | `{jobId}` | `ActionResult<{refundsQueued: n}>` | FORBIDDEN, NOT_FOUND, CONFLICT |
| server action | `updateJob(...)` with a changed `tokenCost` | verified company member | — | — | `CONFLICT {reason:'pricing_locked'}` |
| server action | `adminAdjustTokens(applicantId, amount, reason)` | admin (aal2) | — | `ActionResult<{balance}>` | FORBIDDEN, VALIDATION_FAILED |

Rate limit on `POST /api/v1/applications`: 10/min per user (backend.md §2.6).

**Frontend contract (balance UI):**
- The navbar pill reads `balance` / `granted`, e.g. "8 / 10 tokens".
- The Apply dialog shows the cost, the current balance and the balance after applying. It disables Confirm when `balance < cost` and shows the reset date.
- The dialog generates the `Idempotency-Key` once **when it opens** and reuses it on retry. A new key is generated only after the dialog closes.
- The dialog sends `expectedTokenCost` with the cost it displayed. On `CONFLICT token_cost_changed`, it re-renders with the new cost and asks for confirmation again.

---

## 5. Edge cases

| # | Case | Outcome |
|---|---|---|
| E1 | Double-click / client retry, same key | Lock serializes them. The second call hits the step-4 replay and returns the identical 201. One spend row. |
| E2 | Two tabs, same job, different keys | Second call → `ALREADY_APPLIED` (409) with `applicationId`. |
| E3 | Two tabs, different jobs, combined cost > balance | Serialized. The second call gets `INSUFFICIENT_TOKENS`. |
| E4 | Network drop after commit, before response | Client retries with the same key and gets the replay 201. No double spend. |
| E5 | Apply at 23:59:59.9 UTC on the last day | `now()` is fixed at transaction start, so the spend is in the old period. The next request is in the new period with a fresh virtual +10. |
| E6 | First action of a new month is a balance GET | Virtual grant shows 10 and no row is written. The first Apply materializes the grant. |
| E7 | Concurrent `ensure_monthly_grant` (e.g. apply + admin adjust) | `ON CONFLICT DO NOTHING` on the unique partial index, and both run under the same advisory lock anyway. |
| E8 | Recruiter changes cost while applicant has dialog open (no applications yet) | `p_expected_cost` mismatch → `CONFLICT`. If the update lands after our commit, the trigger now rejects it (application exists). |
| E9 | Recruiter closes job concurrently | The `FOR SHARE` vs `FOR UPDATE` row lock orders them. Either the apply commits first (valid application to a now-closed job) or the apply sees `closed` → `JOB_NOT_OPEN`. |
| E10 | Same key reused for a different job | `IDEMPOTENCY_KEY_REUSED`. |
| E11 | Same key, same job, but a different repo URL | `IDEMPOTENCY_KEY_REUSED` (the body differs). |
| E12 | Withdraw then re-apply | `ALREADY_APPLIED`: unique `(job_id, applicant_id)` holds across statuses. No re-apply in MVP. |
| E13 | Job archived twice / un-archived and re-archived | Unique refund index → second refund returns `already_refunded`. |
| E14 | Refund in a later month | Credited to the current period. The balance may exceed 10 that month. |
| E15 | Recruiter tries to switch `is_technical` after applications | Trigger → `CONFLICT pricing_locked`. Without this, repo reviews would be missing or orphaned. |
| E16 | Applicant deletes account | Ledger and applications cascade. No tokens matter afterwards. |
| E17 | Inngest `application/submitted` lost | Sweeper finds `repo_evaluations.pending` older than 10 min, or applications with null `fit_evaluation_id` older than 10 min, and re-emits. |
| E18 | Non-applicant calls RPC directly through PostgREST | `FORBIDDEN` at step 2. |
| E19 | Client calls `refund_application` directly | No EXECUTE grant → PostgREST 404/permission error → mapped to `FORBIDDEN`. |

---

## 6. Testing approach

**pgTAP (Data writes, Backend reviews)** in `supabase/tests/token_system.test.sql`:
- `token_period('2026-01-31 23:59:59.999+00') = '2026-01'` and `token_period('2026-02-01 00:00:00+00') = '2026-02'`. Also a non-UTC input, `'2026-01-31 20:00-05'` → `'2026-02'`.
- Virtual grant: a new applicant's balance is 10 and no row exists. After Apply, the grant row exists.
- No rollover: insert last-period rows (grant +10, spend −2), and the current balance is 10.
- Each error HINT is raised in the right case (one test per row of the §3.3 error table).
- Replay returns the same `application_id` and `replayed=true`, and the ledger still has exactly one spend row.
- RLS: an applicant cannot insert, update or delete `token_ledger`, and cannot select another applicant's rows. A recruiter calling `get_token_balance` gets zero rows.
- Triggers: changing `token_cost` or `is_technical` with applications present raises. Deleting a job with applications fails.
- `refund_application` eligibility and idempotency. `admin_adjust_tokens` rejects non-admins.

**Concurrency tests (Vitest, `tests/integration/tokens.concurrency.test.ts`)** run against local Supabase (`supabase start`) using real user JWTs and `Promise.all`:
1. **Balance race:** an applicant with 10 tokens, 15 open jobs each costing 1, 15 parallel applies with distinct keys → exactly 10 × 201 and 5 × 402. Ledger sum = 0, and no balance goes negative.
2. **Mixed costs:** jobs costing 3,3,3,3 with 10 tokens, in parallel → exactly 3 succeed (9 spent) and 1 gets 402.
3. **Same key ×20 in parallel** → one application, 20 × 201 with identical bodies, one spend row.
4. **Same job, 20 distinct keys** → 1 × 201 and 19 × 409 `ALREADY_APPLIED`.
5. **Apply vs close race:** 50 iterations of apply ∥ `closeJob`. The invariant always holds: either an application exists with job status closed and created before close, or apply returned `JOB_NOT_OPEN`. Never a 500.
6. **Apply vs cost change:** apply with `expectedTokenCost=2` ∥ update to 3. Either 201 at cost 2 (and the update then fails with `pricing_locked`), or `CONFLICT token_cost_changed`.
7. **Refund ∥ apply** for the same applicant → the final balance equals the arithmetic expectation.

**Route handler tests (Vitest):** a missing or invalid `Idempotency-Key` → 400 `VALIDATION_FAILED`. HINT → HTTP mapping. The Inngest send is called only when `replayed=false`, and a send failure still returns 201.

**E2E (Playwright, Frontend owns):** apply decrements the navbar balance, a double-click creates a single application, the insufficient-tokens state renders the reset date.

---

## Review notes
<!-- Data, Frontend: add comments here -->

### Frontend review
_Reviewer: Frontend. Context: [`docs/sections/frontend.md`](../sections/frontend.md) §5.4, §5.5, §6.3._

**Agree / adopted in frontend.md:** the balance shape from `GET /api/v1/tokens/balance`, `balanceAfter` in the Apply `201` (the client sets the cache from it and then invalidates), `expectedTokenCost` (T8), the pricing freeze (T3, which is the same as frontend F9), the archive refund (archive confirm dialog shows the refund count), and the read-only virtual grant (T1). The RSC navbar calls `get_token_balance()` on every navigation, so "GETs never write" matters to us.

**Requests / conflicts:**
1. **Terminology.** §4 says the pill reads "8 / 10 tokens". frontend.md §2.6 decides the **UI says "credits"** (all 5 Stitch screens do) and code/API keep `token`. Please change the UI copy references here, including "unused tokens don't roll over" in §2.1. The Lead confirms (frontend F7).
2. **Idempotency key regeneration.** §4 says "a new key is generated only after the dialog closes". Frontend also **regenerates the key when the request body changes inside the same dialog** (the user fixes the GitHub URL after `REPO_NOT_ACCESSIBLE`). Otherwise a retry with the corrected URL would hit E11 `IDEMPOTENCY_KEY_REUSED` in the case where the first attempt did reach the RPC. A same-body retry still reuses the key. Please add this rule to §4.
3. **Missing `Idempotency-Key` status.** The §4 table says `400`, and the route tests say `400 VALIDATION_FAILED`. MASTER_PLAN §5 maps `VALIDATION_FAILED` to **422**. Pick one, preferably 422 `VALIDATION_FAILED` with `details.fields.idempotencyKey`. The client always sends the header, so this only affects tests.
4. **`granted` can exceed 10** (T7 refunds, adjustments). The pill renders `balance / granted`, so a refund shows "11 / 10" if `granted` stays 10. Since refunds are reported in a separate `refunded` field, the frontend will render `balance / (granted + refunded + adjusted)`. Confirm that is what you intend, or return a `total` field.
5. **Withdraw.** T6 and E12 talk about withdrawal, but MVP has no withdraw UI (frontend F10; the spec has no withdraw action). If withdraw is meant to be MVP, the Lead must add it to the page list. Until then, frontend hides it.
6. **`resetsAt` rendering.** Agreed: shown in local time ("Resets Nov 1, 1:00 AM"), with a tooltip "Credits reset at 00:00 UTC on the 1st".
7. **Error details.** `INSUFFICIENT_TOKENS.details.resetsAt` and `ALREADY_APPLIED.details.applicationId` are both used directly by the dialog (reset-date copy and redirect to the existing application). No change needed.
8. **Ledger endpoint (`/api/v1/tokens/ledger`).** Not used by the MVP UI. Frontend proposes a "Credit history" list on `/profile` as **Later**. Fine to keep the endpoint for admin and support.
9. **E2E ownership.** Accepted. Frontend Playwright flow 4 covers the balance decrement, a single application on double-click, the reset date when credits are insufficient, and the `token_cost_changed` re-confirm (via a seeded cost change between dialog open and submit).

## Resolution
<!-- Lead -->
