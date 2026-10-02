# Sub-plan: Applicant Ranking

**Owner:** Data Engineer
**Reviewers:** Backend, Frontend, Lead

> Locked inputs ([`SPEC.md`](../SPEC.md)): technical jobs rank on **70% confidence / 30% GitHub**; non-technical jobs on confidence only; GitHub categories are **Security, Organization, Performance, Testing**, each 1–10, **visible to recruiters only**. Canonical names come from [`MASTER_PLAN.md`](../MASTER_PLAN.md) §4. Schema and RLS are in [`sections/data.md`](../sections/data.md).

---

## 1. Open questions, risks, assumptions

### 1.1 Decisions that change the brief (Lead to confirm)

| # | Brief says | This plan decides | Why |
|---|---|---|---|
| R1 | §3.3: GitHub component = `avg(4 ratings) × 10` | **`(avg − 1) / 9 × 100`** | The rating scale starts at 1, not 0. With `avg × 10` the worst possible repo (all 1s) still scores 10/100, which gives it 3 free rank points, and the GitHub component only spans 27 points (10→100 × 0.3) instead of 30. Min-max scaling maps the real range 1–10 onto 0–100, the same range as confidence, so "30%" is exactly 30% of the spread. Worked example in §2.2. |
| R2 | OQ2: when the repo review **failed**, rank on confidence only | **Failed and pending reviews both go into an "Incomplete" tier below every complete applicant**, ordered by confidence inside the tier and badged. | Ranking a failed or pending applicant on confidence alone puts them **above** an equally confident applicant whose repo was reviewed and scored below 100, i.e. a missing review is rewarded. It is also gameable (make the repo private right after Apply). The tier keeps them visible and ordered, without letting missing data outrank real data. Inngest retries plus the Inngest `sweep-stuck-work` cron keep the pending tier short (minutes). |
| R3 | §3.3: order by `rank_score DESC, submitted_at ASC` | **`rank_tier ASC, rank_score DESC, confidence DESC, security DESC, submitted_at ASC, application_id ASC`** | The task's tie-break chain; makes the order total and deterministic. |

### 1.2 Other open questions (defaults in bold)

| # | Question | Default |
|---|---|---|
| R4 | Should recruiters be able to re-run a fit evaluation (e.g. after editing the job)? | **No in MVP.** The snapshot at Apply time is final. The list shows a notice when applicants for one job were scored under different `prompt_version`s. |
| R5 | Show band labels ("Strong match") or only numbers? | **Both**, with neutral wording (§2.6). |
| R6 | Show a rank position ("#3 of 41")? | **Yes**, computed over all non-withdrawn applicants of the job in the default order, independent of filters. |
| R7 | Pagination response key: the brief shows `next_cursor` but also says camelCase at the API boundary. | **`nextCursor`**: Lead settled it globally (MASTER_PLAN Decision log D-12, camelCase for every JSON key). |

### 1.3 Risks

- **Automation bias.** Recruiters may treat the number as the decision. Mitigations in §2.10 (advisory copy, no bulk reject by score, resume one click away).
- **Score drift between model/prompt versions.** Applicants scored by different prompt versions are not strictly comparable. Mitigation: versions are stored and surfaced (R4).
- **LLM text rendered to recruiters** (confidence explanation, GitHub rationale and evidence) can contain content copied from an untrusted repo. Mitigation: Frontend renders it as plain text only, no Markdown links or HTML.
- **Rating leakage to applicants.** Mitigation: RLS (no applicant policy on `repo_evaluations`), the view's `is_company_member` filter, and pgTAP (data.md §11).

### 1.4 Assumptions

- At most ~2,000 applications per job in year one, so computing the ranking on read is cheap.
- `applications.fit_evaluation_id` is set by Inngest `snapshot-fit` shortly after Apply (brief §3.2), usually from a cached Check-fit result.
- A `repo_evaluations` row exists (status `pending`) for every application to a technical job from the moment `apply_to_job` commits.

---

## 2. Design

### 2.1 Inputs

| Input | Source | Range |
|---|---|---|
| `confidence` | `fit_evaluations.confidence_score` of the row linked by `applications.fit_evaluation_id`, only when that row is `succeeded` | integer 0–100 |
| `S, O, P, T` | `repo_evaluations.security_score`, `organization_score`, `performance_score`, `testing_score`, only when `status = 'succeeded'` | integers 1–10 |
| `github_overall` | `repo_evaluations.overall_score` = `(S + O + P + T) / 4` (generated column, exact to 0.25) | 1.00–10.00 |
| `is_technical` | `jobs.is_technical` (locked once the job has applications; data.md §3.5) | bool |

**Which confidence:** the **snapshot at Apply time** (brief OQ4). `snapshot-fit` reuses the applicant's latest `succeeded` fit row for this job if its `input_hash` still matches (same resume, LinkedIn import, job version and prompt version), otherwise runs a fresh evaluation. Succeeded evaluations are immutable (trigger, data.md §3.8). Later resume uploads, LinkedIn re-imports or Check-fit runs **do not** change the ranking of an existing application. This keeps the ranking stable and stops applicants from re-rolling the score after applying.

### 2.2 Formula

```
github_scaled = (github_overall − 1) / 9 × 100                      -- 0..100

technical job,  review succeeded:   rank_score = 0.7 × confidence + 0.3 × github_scaled
                                               = 0.7 × confidence + (github_overall − 1) × 10/3
non-technical job:                  rank_score = confidence
otherwise:                          rank_score = null  (see tiers)

rank_score is rounded to 2 decimals (numeric(5,2)); tie-breaks resolve equal values.
```

**Scaling comparison (why R1):**

| Repo ratings | avg | `avg × 10` | `(avg−1)/9×100` | rank pts from GitHub (`avg×10` / chosen) |
|---|---|---|---|---|
| 1,1,1,1 | 1.00 | 10.0 | 0.0 | 3.00 / **0.00** |
| 4,5,5,6 | 5.00 | 50.0 | 44.4 | 15.00 / **13.33** |
| 8,8,8,8 | 8.00 | 80.0 | 77.8 | 24.00 / **23.33** |
| 10,10,10,10 | 10.00 | 100.0 | 100.0 | 30.00 / **30.00** |

### 2.3 Tiers (missing or pending scores)

| `rank_tier` | Label | Condition | Ordered by |
|---|---|---|---|
| **0** | Complete | confidence available **and** (job non-technical **or** review `succeeded`) | `rank_score` |
| **1** | Incomplete | confidence available, job technical, review `pending`, `running` or `failed` (or the row is missing) | confidence (shown as `provisionalScore`) |
| **2** | Not scored | no succeeded fit evaluation linked (snapshot pending or failed) | `submitted_at` |

Badges: tier 1 pending/running → **"Provisional · GitHub review in progress"**; tier 1 failed → **"GitHub review unavailable"** with the failure reason from `repo_evaluations.failure_code` (Backend's codes); tier 2 → **"Fit score pending"** or **"Fit score unavailable"**. When a pending review completes, the applicant moves to tier 0 at their true position. An admin re-run of a failed review (`admin.repo_eval_rerun`) does the same.

### 2.4 Tie-breaking (total order)

Default sort (`sort=rank`):
1. `rank_tier` ascending (0 first)
2. `rank_score` descending (tier 1: confidence; tier 2: n/a)
3. `confidence` descending
4. GitHub `security_score` descending (nulls last; non-technical rows have none)
5. `submitted_at` ascending (earlier applicant first)
6. `application_id` ascending (final, arbitrary but stable)

### 2.5 View or stored? **View.**

`job_applicant_rankings` is a `security_invoker` view computed on read. Reasons: inputs change rarely and asynchronously (two evaluations per application); per-job row counts are small (≤ 2,000), so an in-memory sort is sub-millisecond; a view has no cache to invalidate when an evaluation finishes. Indexes used: `applications_job_idx (job_id, submitted_at, id)`, `repo_evaluations.application_id` (unique), `fit_evaluations` PK, `profiles` / `applicant_profiles` PKs.

**Revisit trigger:** any job with > 5,000 applications or p95 of `job_applicant_rankings_page` > 100 ms. Then add a table `application_rankings(application_id pk, job_id, rank_tier, rank_score, …)` maintained by triggers on `applications`, `fit_evaluations` and `repo_evaluations`, with a btree index on `(job_id, rank_tier, rank_score desc, confidence desc, security desc, submitted_at, id)`. The RPC contract below does not change.

```sql
create view public.job_applicant_rankings with (security_invoker = true) as
with base as (
  select
    a.id                      as application_id,
    a.job_id,
    j.company_id,
    j.is_technical,
    a.applicant_id,
    p.full_name               as applicant_name,
    p.avatar_url              as applicant_avatar_url,
    ap.headline               as applicant_headline,
    a.status                  as application_status,
    a.submitted_at,
    a.status_changed_at,
    a.resume_id,
    (a.resume_id is not null) as has_resume,
    a.github_repo_url,
    fe.status                 as fit_status,
    case when fe.status = 'succeeded' then fe.confidence_score end as confidence_score,
    case when fe.status = 'succeeded' then fe.explanation      end as confidence_explanation,
    fe.prompt_version         as fit_prompt_version,
    case when j.is_technical then coalesce(re.status, 'pending'::public.evaluation_status) end as github_status,
    re.failure_code           as github_failure_code,
    re.security_score, re.organization_score, re.performance_score, re.testing_score,
    re.overall_score          as github_overall,
    case when re.status = 'succeeded' then round((re.overall_score - 1) * 100 / 9, 2) end as github_scaled,
    re.rationale              as github_rationale,
    re.commit_sha             as github_commit_sha,
    re.completed_at           as github_reviewed_at,
    re.prompt_version         as repo_prompt_version,
    re.repo_meta              as github_repo_meta,      -- shown with "ownership not verified"
    re.flags                  as github_flags,
    private.fit_flags_for_member(fe.id) as fit_flags    -- fit_evaluations.flags is not column-granted to clients
  from public.applications a
  join public.jobs j                    on j.id = a.job_id
  left join public.profiles p           on p.id = a.applicant_id
  left join public.applicant_profiles ap on ap.profile_id = a.applicant_id
  left join public.fit_evaluations fe   on fe.id = a.fit_evaluation_id
  left join public.repo_evaluations re  on re.application_id = a.id
  where public.is_company_member(j.company_id)          -- applicants and other companies: 0 rows
),
scored as (
  select b.*,
    case
      when b.confidence_score is null                         then 2
      when b.is_technical and b.github_status <> 'succeeded'  then 1
      else 0
    end as rank_tier,
    case
      when b.confidence_score is null then null
      when not b.is_technical         then b.confidence_score::numeric(5,2)
      when b.github_status = 'succeeded'
        then round(0.7 * b.confidence_score + (b.github_overall - 1) * 10 / 3, 2)
    end as rank_score
  from base b
),
keyed as (
  select s.*,
    (s.rank_tier = 1)                                         as is_provisional,
    coalesce(s.rank_score, s.confidence_score::numeric, -1)  as sort_score,
    coalesce(s.confidence_score, -1)                          as confidence_sort,
    coalesce(s.security_score, 0)                             as security_sort,
    coalesce(s.github_overall, 0)                             as github_sort,
    case
      when s.rank_score is null   then null
      when s.rank_score >= 85     then 'strong'
      when s.rank_score >= 70     then 'good'
      when s.rank_score >= 50     then 'moderate'
      else 'limited'
    end as rank_band
  from scored s
)
select k.*,
  case when k.application_status <> 'withdrawn' then
    row_number() over (
      partition by k.job_id, (k.application_status = 'withdrawn')
      order by k.rank_tier, k.sort_score desc, k.confidence_sort desc, k.security_sort desc,
               k.submitted_at, k.application_id)
  end as rank_position
from keyed k;

grant select on public.job_applicant_rankings to authenticated;
```

The view does not select `profiles.email`, `connections`, any `linkedin_*` table, or other jobs' data.

### 2.6 Score bands and labels

| Value | Band (`rank_band`) | UI label |
|---|---|---|
| 85.00–100 | `strong` | Strong match |
| 70.00–84.99 | `good` | Good match |
| 50.00–69.99 | `moderate` | Moderate match |
| 0–49.99 | `limited` | Limited match |
| null (tiers 1–2) | null | "Provisional" or "Not scored" badge |

Confidence alone uses the same bands. GitHub categories (per rating, 1–10): **1–3 Needs work · 4–6 Fair · 7–8 Good · 9–10 Excellent**; the overall is shown as `x.xx / 10` plus the same labels on `round(overall)`. Band thresholds live in one place (`lib/ranking/bands.ts`, mirrored in the view) and are tested together.

### 2.7 Pagination (keyset, stable)

Every sort mode is a tuple where **ascending** order is the desired order, so a single row comparison works:

| `sort` | Key tuple (all ascending) |
|---|---|
| `rank` (default) | `(rank_tier, -sort_score, -confidence_sort, -security_sort, submitted_at, application_id)` |
| `confidence` | `(-confidence_sort, rank_tier, -sort_score, -security_sort, submitted_at, application_id)` |
| `github` (technical jobs only) | `((github_status <> 'succeeded')::int, -github_sort, -sort_score, -confidence_sort, submitted_at, application_id)` |
| `newest` | `(-extract(epoch from submitted_at), application_id)` |
| `oldest` | `(submitted_at, application_id)` |

The cursor is base64url JSON of the last row's key tuple plus the sort mode: `{"s":"rank","k":[0,-86.33,-90,-8,"2026-10-01T09:00:00Z","…uuid"]}`. A cursor whose `s` differs from the requested sort → `VALIDATION_FAILED`.

```sql
create or replace function public.job_applicant_rankings_page(
  p_job_id             uuid,
  p_limit              int default 20,
  p_sort               text default 'rank',
  p_statuses           public.application_status[] default '{submitted,shortlisted}',
  p_min_confidence     smallint default null,
  p_github_statuses    public.evaluation_status[] default null,
  p_include_incomplete boolean default true,
  p_after              jsonb default null)
returns setof public.job_applicant_rankings
language plpgsql stable security invoker set search_path = '' as $$
declare k jsonb := p_after->'k';
begin
  if p_limit not between 1 and 100 then
    raise exception 'limit out of range' using errcode = 'P0001', hint = 'VALIDATION_FAILED';
  end if;
  if p_sort = 'rank' then
    return query
      select r.* from public.job_applicant_rankings r
      where r.job_id = p_job_id
        and r.application_status = any (p_statuses)
        and (p_min_confidence is null or r.confidence_score >= p_min_confidence)
        and (p_github_statuses is null or r.github_status = any (p_github_statuses))
        and (p_include_incomplete or r.rank_tier = 0)
        and (k is null or
             (r.rank_tier, -r.sort_score, -r.confidence_sort, -r.security_sort, r.submitted_at, r.application_id)
           > ((k->>0)::int, (k->>1)::numeric, (k->>2)::numeric, (k->>3)::numeric,
              (k->>4)::timestamptz, (k->>5)::uuid))
      order by r.rank_tier, r.sort_score desc, r.confidence_sort desc, r.security_sort desc,
               r.submitted_at, r.application_id
      limit p_limit + 1;                  -- one extra row tells the API whether nextCursor exists
  elsif p_sort = 'confidence' then
    -- same shape with the 'confidence' tuple from the table above
    …
  elsif p_sort in ('github', 'newest', 'oldest') then
    …
  else
    raise exception 'unknown sort' using errcode = 'P0001', hint = 'VALIDATION_FAILED';
  end if;
end $$;
grant execute on function public.job_applicant_rankings_page(uuid, int, text, public.application_status[],
  smallint, public.evaluation_status[], boolean, jsonb) to authenticated;

create or replace function public.job_ranking_version(p_job_id uuid) returns timestamptz
language sql stable security invoker set search_path = '' as $$
  select greatest(max(coalesce(a.updated_at, a.created_at)),
                  max(coalesce(fe.updated_at, fe.created_at)),
                  max(coalesce(re.updated_at, re.created_at)))
  from public.applications a
  left join public.fit_evaluations fe on fe.id = a.fit_evaluation_id
  left join public.repo_evaluations re on re.application_id = a.id
  where a.job_id = p_job_id and private.is_job_member(p_job_id);
$$;
```

**Stability guarantees.**
- New applications and status changes never cause duplicates or skipped rows across pages for rows whose keys did not change (keyset, total order).
- A row whose keys change between page loads (a review completes and moves it from tier 1 to tier 0) can appear twice or be missed. The API returns `rankingVersion` (from `job_ranking_version`) with page 1; the client sends it back with later pages, and the API answers `rankingChanged: true` when it differs. The UI then shows "Rankings updated · Refresh" and does not reorder on its own.
- `rank_position` is computed over the whole job, so it stays correct on every page and under filters.

### 2.8 What the recruiter sees per applicant (data contract)

```ts
// lib/schemas/ranking.ts (API boundary, camelCase)
type RankedApplicant = {
  applicationId: string;
  applicant: { id: string; name: string | null; avatarUrl: string | null; headline: string | null };
  status: 'submitted' | 'shortlisted' | 'rejected' | 'withdrawn';
  appliedAt: string;                 // submitted_at, ISO
  statusChangedAt: string;
  rank: {
    position: number | null;         // among non-withdrawn applicants of the job
    tier: 'complete' | 'incomplete' | 'unscored';
    score: number | null;            // rank_score, tier 0 only
    provisionalScore: number | null; // confidence, tier 1 only
    band: 'strong' | 'good' | 'moderate' | 'limited' | null;
    isProvisional: boolean;
  };
  confidence: { status: 'pending' | 'running' | 'succeeded' | 'failed' | null;
                score: number | null; explanation: string | null; promptVersion: string | null };
  github: null | {                   // null for non-technical jobs
    status: 'pending' | 'running' | 'succeeded' | 'failed';
    failureCode: string | null;
    repoFullName: string | null;     // from repo_meta; UI notes "ownership not verified"
    flags: { injectionSuspected?: boolean; insufficientCode?: boolean; likelyTemplateOrFork?: boolean } | null;
    repoUrl: string; commitSha: string | null; reviewedAt: string | null;
    overall: number | null;          // 1.00–10.00
    overallScaled: number | null;    // 0–100
    categories: Record<'security' | 'organization' | 'performance' | 'testing', {
      score: number | null; label: 'Needs work' | 'Fair' | 'Good' | 'Excellent' | null;
      summary: string | null;
      evidence: { path: string; lines?: string; note: string }[];   // from rationale jsonb
    }>;
  };
  resume: { available: boolean };    // URL fetched on demand (below)
};
```

**Resume:** server action `getResumeUrl(applicationId)` → `{ url, expiresAt }`, a **60-second signed URL** of the resume snapshotted on the application (data.md D1, §6). Logged to `audit_log` (`resume.signed_url`). If `available` is false the UI shows "Resume removed by applicant".

**Explicitly not included:** the applicant's **connections** (or any count of them), LinkedIn positions/skills/education, email (only via `get_applicant_contact` after shortlisting, data.md D2), token data, applications to other companies, Check-fit history.

### 2.9 Filters and sorts

| Control | Param | Values | Default |
|---|---|---|---|
| Status tabs | `status` (multi) | `submitted`, `shortlisted`, `rejected`, `withdrawn` | `submitted,shortlisted` ("Active") |
| Sort | `sort` | `rank`, `confidence`, `github` (technical only), `newest`, `oldest` | `rank` |
| Minimum confidence | `minConfidence` | 0–100 | none |
| GitHub review | `github` (multi, technical only) | `succeeded`, `pending`, `failed` | all |
| Include incomplete | `includeIncomplete` | bool | `true` |

Counts per tab come from one grouped query on `applications` (`count(*) … group by status`) returned with page 1. Name search, saved filters and CSV export are Later.

### 2.10 Bias and fairness

- **Scores are advisory.** Every ranking screen shows, above the list:
  > *Scores are AI-generated estimates to help you prioritise. They can be wrong or incomplete. Review each candidate's resume before you decide. Never reject a candidate on score alone.*
- **A human makes every decision.** No auto-reject, no "reject all below X", no bulk actions keyed on score in MVP. Reject is per applicant and records the actor (`application_events.actor_id`). This keeps us out of "solely automated decision" territory (GDPR Art. 22) and is required context for the EU AI Act (Annex III high-risk) and NYC Local Law 144 (data.md §7.6).
- **Inputs are job-related only.** The fit prompt gets resume text, LinkedIn positions/skills/education and the job; it never gets connections, photo or avatar. Backend's ai-evaluation.md should strip name, email, phone, address, age/graduation-year cues and photos from resume text before the LLM call (request to Backend).
- **GitHub weighting is disclosed** to applicants at Apply time on technical jobs (consent copy in data.md §7.6), and only applies where the recruiter marked the job technical.
- **Ties never favour anything but earlier application**, then a random-but-stable id.
- **Monitoring:** we do not collect demographic data, so we cannot measure adverse impact directly. We track score distributions per job and per prompt version, and the share of tier 1/2 applicants, in an admin report (Later); a bias audit with an independent auditor is a prerequisite for NYC use.
- **Transparency to recruiters:** the explanation and per-category evidence are shown next to every number, and mixed `prompt_version`s within a job trigger a notice.

---

## 3. Data model changes

- View `job_applicant_rankings` and functions `job_applicant_rankings_page`, `job_ranking_version` (above).
- Depends on data.md: `repo_evaluations.overall_score` (generated), `repo_evaluations.failure_code`, `applications.resume_id`, `applications.status_changed_at`, `jobs.is_technical` lock trigger, immutable succeeded evaluations.
- No stored ranking table (see revisit trigger, §2.5).

---

## 4. API endpoints

### `GET /api/v1/jobs/{jobId}/applicants`
Auth: `requireRole('recruiter')` + `requireCompanyMember(job.company_id, { verified: true })`; RLS enforces it again (non-members get an empty set → API returns `404 NOT_FOUND` for an unknown or foreign job).
Query: `limit` (1–100, default 20), `cursor`, `sort`, `status`, `minConfidence`, `github`, `includeIncomplete`, `rankingVersion` (from page 1).
Response `200`:
```json
{
  "data": [ { "applicationId": "…", "rank": { "position": 1, "tier": "complete", "score": 86.33, "band": "strong", "isProvisional": false, "provisionalScore": null }, "…": "…" } ],
  "nextCursor": "eyJzIjoicmFuayIsImsiOlsuLi5dfQ" ,
  "rankingVersion": "2026-10-02T09:14:03.120Z",
  "rankingChanged": false,
  "counts": { "submitted": 31, "shortlisted": 4, "rejected": 6, "withdrawn": 1, "incomplete": 2, "unscored": 1 },
  "job": { "id": "…", "isTechnical": true, "mixedPromptVersions": false }
}
```
Errors: `UNAUTHENTICATED` 401, `FORBIDDEN` 403 (not a verified member), `NOT_FOUND` 404, `VALIDATION_FAILED` 422 (bad cursor, sort `github` on a non-technical job, limit out of range), `RATE_LIMITED` 429.

### Server actions (Backend implements)
- `getResumeUrl(applicationId)` → `ActionResult<{ url: string; expiresAt: string }>`; errors `FORBIDDEN`, `NOT_FOUND` (no resume).
- `setApplicationStatus(applicationId, toStatus: 'shortlisted' | 'rejected' | 'submitted', note?)` → calls `rpc('set_application_status')` (data.md §5.3); errors `FORBIDDEN`, `CONFLICT` (invalid transition, withdrawn).
- `revealContact(applicationId)` → `rpc('get_applicant_contact')`, shortlisted only.

RSC pages read the first page by calling the same RPC through the user-scoped Supabase client.

---

## 5. Edge cases

- **Job has no applicants** → `data: []`, `nextCursor: null`, counts all 0.
- **Snapshot fit not yet linked** (seconds after Apply) → tier 2 "Fit score pending"; moves up when linked.
- **Fit snapshot failed** → tier 2 "Fit score unavailable"; Backend's sweeper/admin re-run fixes it.
- **Review succeeded with extreme scores** (all 1s) → GitHub contributes 0 points; the applicant still ranks by 70% of confidence.
- **Non-technical job with a repo URL** (impossible: `apply_to_job` rejects) → if present, ignored; `github` is null.
- **Job switched technical/non-technical** → blocked once applications exist (trigger), so formulas never mix within a job.
- **Applicant withdrew** → hidden by default; `rank_position` null; visible under the Withdrawn tab.
- **Applicant deleted their account** → rows cascade away; positions of others shift by one on refresh.
- **Applicant deleted the resume** → `resume.available = false`; score unchanged.
- **Two applicants identical in every key except id** → order by `application_id`; stable across requests.
- **Recruiter loses membership mid-session** → next page returns `404`/empty; cached first page remains in the browser only.
- **Rounding:** `rank_score` is rounded to 2 decimals before comparison, so two applicants with 66.4999 and 66.5001 tie and fall to confidence. This is intended (differences below 0.01 are noise).

---

## 6. Testing approach

### 6.1 Deterministic fixture: technical job "Acme · Senior Backend Engineer" (seeded)

| App | Confidence | S, O, P, T | Review | Submitted | Expected `rank_score` | Expected position | What it proves |
|---|---|---|---|---|---|---|---|
| A1 | 90 | 8, 8, 8, 8 | succeeded | 09:01 | **86.33** | 1 | base formula |
| A2 | 80 | 10, 10, 10, 10 | succeeded | 09:02 | **86.00** | 2 | GitHub max = 30 pts |
| A3 | 85 | 9, 8, 7, 8 | succeeded | 09:04 | **82.83** | 3 | tie on score + confidence → Security 9 wins |
| A4 | 85 | 8, 8, 8, 8 | succeeded | 09:03 | **82.83** | 4 | (earlier, but lower Security) |
| A5 | 88 | 7, 6, 6, 7 | succeeded | 09:05 | **79.93** | 5 | quarter averages |
| A6 | 95 | 1, 1, 1, 1 | succeeded | 09:07 | **66.50** | 6 | min ratings → 0 GitHub pts; tie with A7 → higher confidence wins |
| A7 | 70 | 7, 6, 6, 6 | succeeded | 09:06 | **66.50** | 7 | |
| A8 | 60 | 5, 5, 5, 5 | succeeded | 09:08 | **55.33** | 8 | full tie to Security → earlier `submitted_at` wins |
| A9 | 60 | 5, 5, 5, 5 | succeeded | 09:09 | **55.33** | 9 | |
| A10 | 92 | — | pending | 09:10 | null (provisional 92) | 10 | tier 1 below every tier 0, even with higher confidence |
| A11 | 75 | — | failed | 09:00 | null (provisional 75) | 11 | failed = tier 1, ordered by confidence |
| A12 | — | — | pending | 08:59 | null | 12 | tier 2 (fit pending) last |
| A13 | 99 | 10, 10, 10, 10 | succeeded | 08:58 | 99.30 | null | withdrawn: excluded by default filter |

Expected default order: **A1, A2, A3, A4, A5, A6, A7, A8, A9, A10, A11, A12**.
Arithmetic: A1 = 0.7·90 + 7·10/3 = 63 + 23.33; A5 = 61.6 + 5.5·10/3 = 61.6 + 18.33; A6 = 66.5 + 0; A7 = 49 + 5.25·10/3 = 49 + 17.5.

### 6.2 Fixture: non-technical job "Acme · Customer Success Lead"

| App | Confidence | Submitted | Expected |
|---|---|---|---|
| B1 | 88 | 10:00 | 2 |
| B2 | 88 | 10:05 | 3 (tie → earlier wins; no Security key) |
| B3 | 91 | 10:10 | 1 |
| B4 | — (fit failed) | 09:00 | 4 (tier 2) |

### 6.3 Tests

- **pgTAP `08_ranking.test.sql`** (as an Acme recruiter): `results_eq` on `select application_id from job_applicant_rankings_page(job, 100)` against the expected order for both fixtures; exact `rank_score` values; `rank_tier`, `is_provisional`, `rank_band` per row; `rank_position` unchanged when filtering `status = shortlisted`; paging with `p_limit = 2` across all pages reproduces the full order with no duplicates; a cursor taken mid-tie (between A3 and A4, and between A8 and A9) continues correctly; flipping A10's review to `succeeded` with 6,6,6,6 places it at its computed position (0.7·92 + 5·10/3 = 81.07 → between A4 and A5); `sort = confidence`, `github`, `newest`, `oldest` each match hand-written expected orders.
- **pgTAP visibility** (data.md §11 `01_*`, `02_*`): applicant gets 0 rows from the view and from the RPC; Globex recruiter gets 0 rows for the Acme job; `job_ranking_version` returns null for non-members.
- **Vitest:** cursor encode/decode round-trip and tamper rejection; `bands.ts` boundaries (49.99, 50, 69.99, 70, 84.99, 85); mapping from view row to `RankedApplicant` never emits fields outside the contract (snapshot of keys; assert no `email`, no `connections`).
- **Playwright:** recruiter opens the technical job → order A1…A12 with provisional badges on A10/A11; the advisory disclaimer is visible; opening A1's resume issues a signed URL; applicant session hitting `/api/v1/jobs/{id}/applicants` → 403.

## Review notes

### Frontend review
_Reviewer: Frontend. Context: [`docs/sections/frontend.md`](../sections/frontend.md) §1.1 (F8, F10, F12, F16, F17), §4.2, §6.5._

**Agree / adopted in frontend.md:** R1 scaling (the `RankBreakdown` copy shows the scaled GitHub value), R2 tiers, R3 total order, R5 bands + labels, R6 position, the §2.8 contract, the §2.9 sort/filter set (this closes frontend F12), the §2.10 disclaimer text verbatim, and "no bulk actions keyed on score". I also accept "no LinkedIn data for recruiters" (this closes F8; `LinkedInSummary` removed). LLM text (explanation, rationale, evidence) is rendered as **plain text only**. Evidence paths are shown in mono and never linked.

**1. Data contract (list and detail)**
- The list contract is fine. Please also add a **detail** read with the same `RankedApplicant` plus `resume: { available, fileName, mimeType, sizeBytes, textContent }` (detail only, not in list pages, because of payload size) and `events: {toStatus, at, actorName}[]`. The detail page reads the view by `application_id` in the RSC, so this may simply be documented columns/joins rather than a new endpoint.
- **`counts`:** add `unscored` (tier 2) next to `incomplete`, because frontend shows per-tier group headers. Also state whether `counts.incomplete` respects the status filter. Frontend assumes it is counted over **Active** (`submitted,shortlisted`) only.
- **Shared loader:** page 1 in the RSC calls the RPC directly (§4, last line). Please specify a single `lib/ranking/loadApplicantsPage()` that both the RSC and `GET /api/v1/jobs/{jobId}/applicants` use, so page 1 also returns `next_cursor`, `rankingVersion`, `counts` and `job`. Otherwise the client cannot continue with Load more from an RSC-rendered first page.
- **R7:** frontend handles either key. Lead to decide globally. The point is the rule (`next_cursor` vs camelCase), not this field alone.

**2. Incomplete tier display** (frontend §6.5 step 6)
- Only under `sort=rank`, the list is split into labelled groups: *Complete (n)* · *Incomplete: GitHub review pending or unavailable (n)* · *Not scored yet (n)*. Under other sorts, rows carry only badges.
- Tier 1 shows the confidence as a **provisional** `MatchScoreBadge` (dashed outline, "Provisional"). `rank.score` is never displayed for tier 1, and the band is hidden (`band` is null).
- The badge copy is as in §2.3. `failure_code` → human copy lives in `lib/copy.ts`. **Request to Backend:** publish the final `failure_code` list (e.g. `repo_not_found`, `repo_private`, `repo_too_large`, `system_error`) so copy can be written. For `system_error`, the UI says "We're retrying the review", not "unavailable".
- `rank.position` shows for tiers 0–2 under `sort=rank` only. Under other sorts it is hidden, because "#7" next to a newest-first list misleads.

**3. Sort, filter, keyset pagination**
- Every filter or sort change drops the cursor and refetches page 1. Cursors never go into the URL (only filters and sort do), so shared links always start at page 1.
- `rankingChanged: true` → banner "Rankings updated · Refresh", with no automatic reorder. Agreed.
- "Min fit" UI offers Any / 50 / 70 / 85, matching the band thresholds, rather than a free slider.
- The `github` sort and `github` filter are hidden on non-technical jobs, so the 422 is never hit from the UI.
- **Question:** does `rank_position` for a **shortlisted** row stay its global position? Per R6, yes. Frontend relies on that for the "#3 of 41" label on the detail page. `of 41` = active non-withdrawn count. Please confirm whether rejected applicants count in the denominator (the view counts all non-withdrawn rows; frontend would prefer that and will label it "of 41 applicants").
- Prev/Next on the detail page walks the cached pages in the TanStack Query cache. At the end of the loaded pages it fetches the next cursor. No extra endpoint needed.

**4. Email only after shortlisting**
- Agreed (D2). Detail page, shortlisted only: a **Reveal email** button → `revealContact(applicationId)`. The email is shown with Copy and `mailto:`, plus the caption "Reveals are logged". It is not cached in the query cache, and not shown in the list or after the status moves away from shortlisted.
- **Request:** `revealContact` should return `CONFLICT` (not `FORBIDDEN`) when the application is no longer shortlisted, so the UI can say "This applicant is no longer shortlisted" instead of a generic access error. §4 currently says `FORBIDDEN (not shortlisted)` in data.md.

**5. Resume signed URL**
- Name adopted: `getResumeUrl` (frontend previously said `getResumeSignedUrl`).
- **Conflict to resolve:** backend.md B5 serves resumes with `Content-Disposition: attachment` (no AV scan in MVP), which rules out the inline PDF iframe frontend originally planned. Frontend now plans a **text-first viewer**: `text_content` shown as plain text, plus "Download original" (60 s URL, requested per click, never prefetched, so `audit_log` reflects real views). Inline PDF preview comes **Later**, together with the ClamAV step. This requires `textContent` in the detail read (point 1).
- The Playwright line in §6.3 ("opening A1's resume issues a signed URL") becomes "clicking Download issues a signed URL".

**6. Fairness disclaimer copy**
- Used verbatim above every ranking list (info `Alert`, cannot be dismissed, may be collapsed to one line, collapse stored in `localStorage`), and as a single line next to the score on the detail page.
- Suggest one addition for tier 1 rows, as a tooltip: *"Provisional: this applicant's GitHub review isn't finished, so they're listed below fully scored applicants. This is not a judgment of their code."* This addresses the risk that recruiters read "Incomplete" as negative.
- `mixedPromptVersions` notice copy: *"Some applicants were scored with an earlier model version, so their scores may not be directly comparable."*
- Keyboard shortcut `r` (frontend §6.5) only opens the per-applicant confirm dialog. That is consistent with "no bulk reject".

**7. Status transitions.** data.md's `set_application_status` allows `rejected → shortlisted` and `shortlisted → submitted`, and §4 lists `'submitted'` as a target. Frontend adopts this (F10): "Move back to New" and "Reconsider" appear on the detail page only, and Reconsider warns that a rejection email was already sent. **Backend:** confirm that a "reconsidered" applicant gets a shortlist email after the earlier rejection email, and whether moving shortlisted → submitted sends anything (frontend assumes no email).

### Backend review

**Agree. I have adopted these in my docs:**
- **R1 `(avg − 1)/9 × 100`:** agreed. The math in §6.1 checks out (A1 86.33, A3/A4 82.83, A10 flip 81.07).
- **R2 Incomplete tier:** agreed. It also removes the incentive to make a repo private right after Apply. I updated ai-evaluation.md X11 and token-system.md §2.4 to point here instead of saying "ranked on confidence only".
- **R3 tie-break chain and `next_cursor` (R7):** agreed.
- **Endpoint `GET /api/v1/jobs/{jobId}/applicants`:** adopted. I dropped my `/api/v1/recruiter/jobs/{jobId}/applicants` (backend.md §4.4). One handler serves both roles on `/api/v1/jobs/{jobId}/…`, and each sub-path does its own role guard. I also agree with Frontend's single `lib/ranking/loadApplicantsPage()` shared by the RSC and the route, which I will own in `lib/ranking/`.
- **Server actions:** I renamed mine to yours: `getResumeUrl` (was `getResumeDownloadUrl`), `setApplicationStatus` (replaces `shortlistApplication`/`rejectApplication`), and the new `revealContact` → `get_applicant_contact`.
- **Bands:** I renamed my fit bands to `strong/good/moderate/limited` with the same 85/70/50 thresholds (ai-evaluation.md §2.5). `lib/ranking/bands.ts` is the single source of truth.
- **`failure_code`:** ai-evaluation.md now uses your column names `failure_code`, `attempt_count` and `files_analyzed`, and adds a CHECK with the final list (ai-evaluation.md §6):
  - **applicant-caused:** `not_found_or_private`, `too_large`, `too_many_files`, `archive_too_large`, `empty`, `no_reviewable_code`;
  - **system-caused:** `timeout`, `llm_failed`, `integrity`, `github_unavailable`.
  This answers Frontend's request in point 2. System-caused codes get the copy "We're retrying the review".
- **Bias request (§2.10):** already covered. ai-evaluation.md §2.2 redacts name, email, phone, URLs and addresses before the LLM call, and the system prompt forbids using protected attributes and school prestige.

**Answers to Frontend:**
- **Point 4:** agreed. `revealContact` maps "not shortlisted" to `CONFLICT {reason:'not_shortlisted'}`. Data: please raise HINT `CONFLICT` in `get_applicant_contact` for that case, and keep `FORBIDDEN` for non-members.
- **Point 7, emails:**
  - Every status change emits `application/status.changed`. `notify-application-status` waits 10 min, re-reads the status, and is cancelled by a newer change.
  - `→ shortlisted` sends `application-shortlisted`, including after a reconsidered rejection. If the rejection is under 10 min old, its email is cancelled and never sent.
  - `→ rejected` sends `application-rejected`.
  - `shortlisted → submitted` sends **nothing**.
- **Point 5:** agreed. Text-first viewer, attachment-only downloads until AV scanning is added (backend.md B5). The detail read includes `resume.textContent`.

**Requests / issues:**
1. **Add `github.flags` to `RankedApplicant`:** `{injectionSuspected, insufficientCode, likelyTemplateOrFork}` from `repo_evaluations.flags` (ai-evaluation.md A7, recruiter-only, neutral copy). List-level badge only. Signals and evidence stay in the detail read.
2. **RLS for `security_invoker`:** the view joins `profiles`, `applicant_profiles` and `fit_evaluations` as the recruiter. Please confirm data.md has SELECT policies that let verified company members read `full_name`/`avatar_url` and `applicant_profiles.headline` of applicants **to their jobs only**, plus the `fit_evaluations` rows linked from those applications. Otherwise names and scores come back null silently. Please add a pgTAP assertion: as an Acme recruiter, `applicant_name is not null` for A1.
3. **Immutability vs. sanity re-run:** `guard_terminal_evaluation` blocks updates to `succeeded` rows. My repo sanity re-run happens **before** the row is marked succeeded, and the cross-application review cache inserts **new** rows, so we are compatible. Admin re-runs (`adminRetryEvaluation`) apply only to `failed` rows.
4. **Sweeper owner:** §1.2 and §2.3 refer to "the pg_cron sweeper". I proposed an Inngest cron `sweep-stuck-work` instead (backend.md B3). This is open with the Lead and only affects the wording here.
5. **Rate limit:** `GET /api/v1/jobs/{jobId}/applicants` uses the `recruiter.read` policy, 120/min per user (backend.md §2.6).

## Resolution

_Lead, pass 2. IDs refer to the [MASTER_PLAN Decision log](../MASTER_PLAN.md#13-decision-log)._

| Item | Outcome |
|---|---|
| R1 scaling `(avg − 1) / 9 × 100` | **Accepted (D-05).** It replaces the brief's `avg × 10`. |
| R2 "Incomplete" tier | **Accepted (D-06).** Pending, running and failed reviews rank in tier 1, below every complete applicant. Missing fit scores rank in tier 2. This supersedes the pass-1 brief's "rank on confidence only". |
| R3 tie-break chain, R4 no re-score, R5 bands, R6 rank position | **Accepted.** `rank_position` counts **every non-withdrawn applicant, rejected included**, and the UI labels it "of N applicants". It stays the global position under filters. |
| R7 pagination key | **`nextCursor` (D-12).** Every JSON key at the API boundary is camelCase, including `nextCursor` and `error.requestId`. |
| Frontend 1: detail read and shared loader | **Accepted (D-15, D-26).** `GET /api/v1/jobs/{jobId}/applicants/{applicationId}` returns `RankedApplicant` plus `resume {available, fileName, mimeType, sizeBytes, textContent}`, `events [{toStatus, at, actorName}]`, fit `requirements`/`subScores` and repo `signals`. Backend owns `lib/ranking/loadApplicantsPage()` and `loadApplicantDetail()`, which serve both the RSC and the route, so page 1 also returns `nextCursor`, `rankingVersion`, `counts` and `job`. |
| Frontend 1: `counts` | **Accepted.** Add `unscored` (tier 2) next to `incomplete`. The status counts (`submitted`, `shortlisted`, `rejected`, `withdrawn`) ignore the status filter. `incomplete` and `unscored` are counted over Active (`submitted`, `shortlisted`) only. |
| Frontend 2: failure copy | **Accepted (D-07).** Recruiters see the precise `failure_code`. System codes read "We're retrying the review". `integrity` reads "Review unavailable" and never mentions injection. |
| Frontend 4 / Backend: `get_applicant_contact` errors | **`CONFLICT {reason:'not_shortlisted'}`** when the application is not shortlisted. **`NOT_FOUND`** for a non-member or an unknown id, so foreign rows stay invisible. The guard returns FORBIDDEN for unverified recruiters (D-15). data.md §8 has been updated. |
| Frontend 5: text-first resume viewer | **Accepted (D-13).** Downloads only, with `Content-Disposition: attachment` and 60-second URLs. Inline PDF preview is Later, once AV scanning exists. |
| Frontend 6–7: tier tooltip, status emails | **Accepted** as Backend answered. Reconsidering a rejection sends the shortlisted email, and `shortlisted → submitted` sends nothing. |
| Backend 1: `github.flags` in the list | **Accepted.** The flags are already in the §2.8 contract. The list shows a badge only, and the evidence stays in the detail read. |
| Backend 2: RLS for names and fit scores through the view | **Confirmed.** data.md §4.3 has `profiles_select_applicants`, the `applicant_profiles` member select, and `fit_select_recruiter`. Add a pgTAP assertion to `08_ranking.test.sql`: as an Acme recruiter, `applicant_name is not null` and `confidence_score is not null` for A1. |
| Backend 4: sweeper | **Inngest cron `sweep-stuck-work` (D-01).** The R2 row in §1.1 has been updated. |
