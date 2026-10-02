# Sub-plan: Company Verification

**Owner:** Backend
**Reviewers:** Data, Lead
**Status:** Pass 1 draft. It uses the canonical tables `companies`, `company_domains` and `recruiter_memberships`, and the `verification_status` enum (MASTER_PLAN §4).

---

## 1. Open questions, risks, assumptions

### Open questions (each has a default that we build with)
| # | Question | Default (decided here) |
|---|---|---|
| C1 | Does a later recruiter with a verified company domain **auto-join**, or need approval from an existing member? | **Auto-join** after the work-email magic link is confirmed. Existing company admins get an email and can remove the new member with one click. A per-company "require approval" setting (`companies.join_policy`) is **Later**. |
| C2 | Does the first claim of a new company need a platform admin? | **No, when three checks pass:** (a) work email confirmed through the magic link, (b) the email's registrable domain equals the registrable domain of the website the recruiter entered, (c) no existing **verified** company has the same `name_normalized`. Otherwise the claim goes to the admin queue. All auto-verified companies also appear in an admin "recently auto-verified" list for post-hoc review. |
| C3 | Can we trust the **auth** email (Google, LinkedIn or email/password sign-up) instead of sending a second magic link? | **Yes**, if `auth.users.email_confirmed_at` is set **and** the auth email is the work email entered. The domain is already proven, so we skip the extra link. Otherwise we send a magic link to the work email. |
| C4 | Values of `recruiter_memberships.verified_via`? | MASTER_PLAN lists `email_domain` and `admin`. **Add `company_admin`** for approvals by an existing member. **Lead and Data to confirm.** |
| C5 | Who is a company admin (`is_company_admin`)? | The first verified recruiter of a company. Company admins can promote others, approve or reject pending members, and remove members. There must always be ≥1 company admin while there are verified members. |
| C6 | Admin MFA? | **Required.** Every `/admin/*` route and admin server action requires a Supabase session at `aal2` (TOTP). |

### Risks
- **LinkedIn cannot verify employment for us.** The Organization, Company Pages and Community Management APIs require LinkedIn partner approval. OIDC sign-in returns only name, email and picture, with no employer. "Verified on LinkedIn" workplace verification is not available to arbitrary third parties. So LinkedIn is **not** a verification source.
- **Domain ≠ authority.** Anyone with a mailbox at a domain can verify: contractors, interns, ex-employees whose mailbox is still alive. We accept this for MVP. Mitigations: company admins are notified on every join and can remove members, and admins can revoke.
- **Look-alike companies** (`str1pe.com` claiming "Stripe"). The name-collision check sends these to the admin queue. Logos and names are shown only after verification.
- **Free-mail and disposable domains** must never verify a company. We use a seeded blocklist (§3) that admins can extend.
- **Email link scanners** (Outlook Safe Links, Mimecast) pre-fetch URLs. A GET that consumes the token would verify by accident or burn the token. The link therefore opens a page with an explicit **Confirm** button (POST), and GET never consumes the token.
- **Admin bottleneck** if many recruiters use free mail. The admin queue has SLA alerting (claims pending > 48 h).

### Assumptions
- One recruiter account belongs to **one** company in MVP. Agency recruiters verify as their agency.
- A company can have several domains (`stripe.com`, `stripe.dev`). An admin adds extra domains in MVP.
- The registrable domain is computed with **`tldts`** (Public Suffix List), so `eng.corp.acme.co.uk` → `acme.co.uk`. This adds a small dependency (**Lead to note in the stack**).

---

## 2. Design

### 2.1 Approach evaluation
| Approach | Verdict |
|---|---|
| LinkedIn Organization / Company Pages API (check the recruiter is an admin of the company page) | **Rejected.** Needs partner approval we do not have, and page admin ≠ employee. |
| LinkedIn OIDC profile → employer | **Rejected.** OIDC scopes return no employer data. |
| **Work-email domain + magic link** | **Chosen (primary).** Cheap, self-serve, proves a mailbox at the domain. |
| Admin manual approval (evidence: LinkedIn profile URL, company website, note) | **Chosen (fallback)** for free mail, domain mismatch or name collision. |
| DNS TXT record on the company domain | **Later.** Proves domain control (IT-level authority). Needed for "require approval" companies and for adding domains self-serve. |
| Paid KYB (e.g. Middesk) | Later or never. Overkill for MVP. |

### 2.2 State machine
```
companies.verification_status:      pending ──(domain verified + checks pass | admin approve)──► verified
                                       │                                                       │
                                       └──(admin reject)──► rejected ◄──(admin suspend)─────────┘
company_domains.verification_status: pending ──(first magic-link confirm | admin)──► verified ──(admin remove)──► rejected
recruiter_memberships.verification_status:
   pending ──(magic link on verified domain | company_admin approve | platform admin approve)──► verified
   pending ──(reject)──► rejected ;  verified ──(removed/revoked)──► rejected
```
A recruiter is **verified** only when `recruiter_memberships.verification_status = 'verified'` **and** `companies.verification_status = 'verified'`. `is_company_member(company_id)` (the RLS helper) checks both.

### 2.3 Flows

**Flow A: new company, work email (happy path)**
1. Recruiter onboarding (`/onboarding/recruiter`) asks for the company name, website and work email.
2. The server action `startCompanyClaim` runs these checks:
   - zod validation;
   - `domain = registrable(email)` and `siteDomain = registrable(website)`;
   - the domain is not in `blocked_email_domains`;
   - **if the domain already belongs to a verified company**, it returns `{ next: 'join', company }`. The UI switches to Flow B, so there are no duplicate companies.
3. In one RPC `create_company_claim(...)` it inserts:
   - `companies(pending, created_by)`;
   - `company_domains(domain, pending, 'email_link')`;
   - `recruiter_memberships(pending, is_company_admin = true, work_email)`.
   Then it creates a `work_email_verifications` row.
   - If the auth email is confirmed and equals the work email (C3), it skips to step 5.
4. It sends the magic-link email (Inngest `send-email`, template `work-email-verification`). The link is `/verify/work-email?token=<43-char base64url>`, single-use, valid for 30 minutes. Only `sha256(token)` is stored.
5. The recruiter opens the link and clicks **Confirm**. The server action `confirmWorkEmail({token})` calls the RPC `confirm_work_email(sha256(token))`, which:
   - marks the verification consumed and sets `work_email_verified_at`;
   - sets `company_domains` → `verified` (`verified_at`, method `email_link`);
   - when C2 passes, sets the company → `verified` and the membership → `verified` (`verified_via = 'email_domain'`);
   - when C2 fails, leaves the company `pending`, sets `companies.review_reason` (`domain_mismatch` | `name_collision`) and emits `company/claim.needs_review` to notify admins.
6. Middleware refreshes the session: the server action calls `refreshSession()` so the JWT claims update. The recruiter lands on the dashboard.

**Flow B: existing verified company, work email at a verified domain (auto-join)**
1. `requestCompanyJoin({companyId, workEmail})`. The domain ∈ the company's verified domains, so the server inserts a `pending` membership and sends the magic link.
2. On confirm, the membership → `verified` (`email_domain`) and `membership/joined` is emitted. Company admins receive a "New recruiter joined: {name, email}. Not a colleague? Remove" email.

**Flow C: no usable work email (free mail, contractor, domain not listed)**
1. `requestCompanyJoin({companyId, evidence})` with no work email, or a free-mail address, creates a `pending` membership (`work_email` null) with `evidence jsonb {linkedinUrl, note}`.
2. If the company is verified and has company admins, they are notified and approve or reject on `/recruiter/company/members`. Approval sets `verified_via = 'company_admin'`.
3. If the company has no verified members, or the request is still pending after 72 h, it also appears in the platform admin queue. Approval sets `verified_via = 'admin'`.

**Flow D: new company, no work email**
`startCompanyClaim` with free mail and `requestAdminReview = true` creates the company, domain row (when a website is given) and membership, all `pending`, with evidence. They go to the admin queue. The admin can approve the company and membership, and optionally mark the website domain `verified` (method `admin`) so later colleagues auto-join.

### 2.4 What unverified recruiters can do
| Capability | Unverified (pending) | Verified |
|---|---|---|
| Sign in, finish onboarding, see "Verification pending" banner | Yes | Yes |
| Edit company profile (name, website, logo) | Yes, own pending company only | Company admins only |
| Create / edit **draft** jobs | **Yes** | Yes |
| Publish a job (`draft` → `open`) | **No**: `FORBIDDEN {reason:'company_not_verified'}` | Yes |
| See applicants / resumes / repo evaluations | No (and none exist) | Yes, own company's jobs |
| Approve other members | No | Company admins |
| Appear in applicant job feed | No. Applicants only see `open` jobs of `verified` companies (RLS) | Yes |

Enforcement:
- The DB trigger `jobs_publish_guard` (BEFORE UPDATE OF status) raises `FORBIDDEN` when the new status is `open` and the creator's company or membership is not verified.
- The `publishJob` server action pre-checks the same thing for a friendly error.
- The RLS select policy on `jobs` for applicants requires `status = 'open' AND company verified`.

### 2.5 Revocation and suspension
- **Member removed** (by a company admin or platform admin): the membership → `rejected` (`removed_at`, `removed_by`). Access is lost immediately through RLS. Their jobs stay with the company.
- **Last company admin**: they cannot remove themselves or leave until they promote another member. A platform admin can override.
- **Company suspended or rejected** by an admin: the company → `rejected`, every membership → `rejected`, and every `open` or `closed` job → `archived`. This triggers refunds for `submitted` applications (token-system.md §2.4). It requires a reason and is audited in `audit_log`.
- **Domain removed** by an admin: future joins via that domain stop. Existing members are unaffected.

---

## 3. Data model changes (for Data to implement)

```sql
-- companies
alter table companies
  add column created_by     uuid references profiles(id) on delete set null,
  add column review_reason  text check (review_reason in ('domain_mismatch','name_collision','free_mail','manual_request')),
  add column rejected_reason text,
  add column reviewed_by    uuid references profiles(id) on delete set null,
  add column reviewed_at    timestamptz;
create index companies_name_normalized_idx on companies (name_normalized);
-- name_normalized is NOT unique (two real "Acme"s exist); collisions route to admin review.

-- company_domains (domain is the registrable domain, lowercase, unique — canonical)
alter table company_domains
  add column verified_at timestamptz,
  add column verified_by uuid references profiles(id) on delete set null,
  add constraint company_domains_method check (verification_method in ('email_link','admin','dns_txt')),
  add constraint company_domains_domain_format check (domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$');

-- recruiter_memberships
alter table recruiter_memberships
  add column work_email             citext,
  add column work_email_verified_at timestamptz,
  add column evidence               jsonb,          -- {linkedinUrl, note} for admin/company-admin review
  add column approved_by            uuid references profiles(id) on delete set null,
  add column removed_at             timestamptz,
  add column removed_by             uuid references profiles(id) on delete set null,
  add constraint recruiter_memberships_verified_via check (verified_via in ('email_domain','admin','company_admin'));  -- C4
create unique index recruiter_one_active_membership
  on recruiter_memberships (profile_id) where verification_status in ('pending','verified');  -- one company per recruiter (MVP)

-- NEW: single-use magic-link tokens for work email
create table work_email_verifications (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references profiles(id) on delete cascade,
  membership_id   uuid not null references recruiter_memberships(id) on delete cascade,
  email           citext not null,
  domain          text not null,
  token_hash      bytea not null unique,           -- sha256(raw token); raw token never stored
  expires_at      timestamptz not null,            -- created_at + 30 min
  consumed_at     timestamptz,
  attempt_count   smallint not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);
-- RLS: enabled, NO client policies. Accessed only via SECURITY DEFINER RPCs below.

-- NEW: blocklist of free-mail / disposable domains
create table blocked_email_domains (
  domain     text primary key,                      -- lowercase registrable domain
  reason     text not null check (reason in ('free_mail','disposable','manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
-- Seeded from the `free-email-domains` + `disposable-email-domains` npm lists (~4k rows) in supabase/seed.sql
-- and a migration; RLS: select for authenticated (used for instant client-side hint), write admin only.

-- Admin audit: NO new table. Use Data's `audit_log` (data.md) with `log_audit(...)`:
--   existing actions 'company.verification_changed', 'membership.verification_changed', 'admin.token_adjustment',
--   'admin.repo_eval_rerun'; REQUEST Data to add 'company.domain_added', 'company.domain_removed', 'email_domain.blocked'.
--   metadata carries {decision, reason_code}; free-text reasons stay on the company/membership row, not in audit metadata.
```

**RPCs** (all `SECURITY DEFINER`, `search_path` pinned, and each raises `P0001` with a HINT code):
| Function | Caller | Does |
|---|---|---|
| `create_company_claim(p_name text, p_website text, p_domain text, p_work_email citext, p_token_hash bytea, p_evidence jsonb, p_request_admin_review bool)` | authenticated recruiter without an active membership | Inserts the company, domain (when given), membership (`is_company_admin = true`) and, if `p_token_hash` is set, the verification row. Returns `{companyId, membershipId}`. |
| `create_join_request(p_company_id uuid, p_work_email citext, p_token_hash bytea, p_evidence jsonb)` | recruiter without an active membership | Inserts a pending membership plus an optional verification row. Raises `VALIDATION_FAILED` if the email domain is not one of the company's verified domains while a token is given. |
| `confirm_work_email(p_token_hash bytea)` | authenticated | Matches the row by hash and `profile_id = auth.uid()`, not expired, not consumed. Bumps `attempt_count` on failure. Applies §2.3 step 5 and returns `{companyStatus, membershipStatus, reviewReason}`. |
| `confirm_work_email_via_auth()` | authenticated | The C3 shortcut. Checks `auth.users.email_confirmed_at` and that the email equals `work_email`. |
| `approve_membership(p_membership_id uuid, p_approve bool, p_reason text)` | company admin of that company **or** platform admin | Approves or rejects. Sets `verified_via` and `approved_by`. |
| `remove_membership(p_membership_id uuid, p_reason text)` | company admin or platform admin | Enforces the last-admin rule. |
| `set_company_admin(p_membership_id uuid, p_is_admin bool)` | company admin | |
| `admin_review_company(p_company_id uuid, p_decision text /* approve|reject|suspend */, p_reason text, p_verify_domain bool)` | platform admin | Cascades as in §2.5 and writes `audit_log`. Returns `{archivedJobIds}` so the caller emits `job/archived` per job (refunds). |
| `admin_add_company_domain(p_company_id uuid, p_domain text)` / `admin_remove_company_domain(p_domain_id uuid)` | platform admin | |
| `is_company_member(p_company_id uuid, p_require_admin bool default false)` | RLS helper (exists; Data) | Must require **both** the membership and the company to be verified. |

---

## 4. API endpoints

Everything here is form-driven UI, so it uses **server actions** (MASTER_PLAN §5). The one exception is the company search, which the onboarding combobox calls as you type.

| Kind | Name / path | Auth | Input | Output | Errors |
|---|---|---|---|---|---|
| GET | `/api/v1/companies?query=&limit=` | recruiter | `query` ≥ 2 chars | `{data:[{id, name, website, logoUrl, domains:[...], verified:true}], next_cursor}` (verified companies only; matches name prefix or domain) | 401, 403, 422, 429 (30/min) |
| action | `checkWorkEmailDomain({email})` | recruiter | email | `{domain, blocked: bool, reason?, matchingCompany?: {id,name}}` (instant UX hint) | VALIDATION_FAILED |
| action | `startCompanyClaim({name, website, workEmail?, evidence?, requestAdminReview?})` | recruiter, no active membership | — | `{next: 'check_email' \| 'verified' \| 'join' \| 'pending_review', companyId?, company?}` | VALIDATION_FAILED (`fields.workEmail: 'free_mail'`), CONFLICT (`already_member`), RATE_LIMITED |
| action | `requestCompanyJoin({companyId, workEmail?, evidence?})` | recruiter, no active membership | — | `{next: 'check_email' \| 'pending_company_admin' \| 'pending_review'}` | NOT_FOUND, VALIDATION_FAILED (`domain_not_company`), CONFLICT, RATE_LIMITED |
| action | `resendWorkEmailVerification()` | recruiter with a pending membership | — | `{sentTo: 'j***@acme.com', expiresAt}` | RATE_LIMITED (3/h, 10/day), CONFLICT (`already_verified`) |
| page + action | `/verify/work-email?token=` → `confirmWorkEmail({token})` | signed-in recruiter (the page redirects to sign-in with `next=`) | token | `{membershipStatus, companyStatus, reviewReason?}` | VALIDATION_FAILED (`token_invalid` \| `token_expired` \| `token_used`), FORBIDDEN (`token_other_user`), RATE_LIMITED (10 attempts/h) |
| action | `cancelPendingMembership()` | recruiter | — | `{ok}`. Lets them choose another company | CONFLICT if verified |
| action | `updateCompanyProfile({companyId, name?, website?, logoPath?})` | company admin, or the creator of a pending company | — | company | FORBIDDEN, VALIDATION_FAILED. **Changing `name` on a verified company re-queues admin review** |
| action | `approveMember({membershipId, approve, reason?})` | company admin | — | membership | FORBIDDEN, NOT_FOUND, CONFLICT |
| action | `removeMember({membershipId, reason})` | company admin | — | membership | FORBIDDEN, CONFLICT (`last_company_admin`) |
| action | `setCompanyAdmin({membershipId, isAdmin})` | company admin | — | membership | FORBIDDEN, CONFLICT (`last_company_admin`) |
| **Admin** (all require `role='admin'` and `aal2`; RSC pages under `/admin/companies` read with the service-role client in `lib/supabase/admin.ts`) | | | | | |
| RSC | `/admin/companies?tab=pending\|auto_verified\|memberships\|rejected` | admin | — | Queue rows: company, domains, claimant, `review_reason`, evidence, `name_normalized` collisions, age | FORBIDDEN |
| action | `adminReviewCompany({companyId, decision: 'approve'\|'reject'\|'suspend', reason, verifyDomain?})` | admin | — | `{company, archivedJobIds}` (then emits `job/archived` per id) | FORBIDDEN, NOT_FOUND, CONFLICT (bad transition), VALIDATION_FAILED (reason required for reject/suspend) |
| action | `adminReviewMembership({membershipId, approve, reason})` | admin | — | membership | same |
| action | `adminRevokeMembership({membershipId, reason})` | admin | — | membership | same |
| action | `adminAddCompanyDomain({companyId, domain})` / `adminRemoveCompanyDomain({domainId, reason})` | admin | — | domain | CONFLICT (`domain_taken`), VALIDATION_FAILED (`blocked_domain`) |
| action | `adminBlockEmailDomain({domain, reason})` | admin | — | row | CONFLICT if the domain belongs to a verified company |

**Inngest events emitted** (catalogue in backend.md §2.4): `company/claim.needs_review`, `company/verified`, `company/rejected`, `membership/joined`, `membership/join.requested`, `membership/decided`, `job/archived`, and `email/send.requested` (template `work-email-verification`).

---

## 5. Edge cases

| # | Case | Handling |
|---|---|---|
| V1 | Subdomain email `jane@eng.acme.com` | Registrable domain `acme.com` matches `company_domains.domain`. |
| V2 | Multi-part TLD `acme.co.uk` | `tldts` PSL handles it. We never use naive "last two labels". |
| V3 | Free-mail (`gmail.com`, `outlook.com`, `proton.me`, `yahoo.co.jp`) or disposable domain | Blocked from domain verification, with an offer of Flow C or D. |
| V4 | University or ISP domains (`mit.edu`, `comcast.net`) | Allowed technically. Universities are real employers. ISP domains go on the blocklist (`manual`) as admins see them. |
| V5 | Two claims race for the same new domain | `company_domains.domain` is unique. The second `create_company_claim` gets `CONFLICT {reason:'domain_claimed', companyId}`, and the UI offers to join that pending company: a pending membership, decided by the claimant once they are verified, or by an admin. |
| V6 | Claimant never confirms and the domain is squatted by a pending claim | A pending company with no confirmed email after 7 days is deleted by the daily cron `expire-stale-company-claims`, which frees the domain. |
| V7 | Token expired / reused / for a different user | `token_expired` / `token_used` / `FORBIDDEN token_other_user`. Resend is available (rate-limited). |
| V8 | Link pre-fetched by a mail scanner | GET renders the Confirm page only. Consumption requires a POST from a signed-in session. |
| V9 | Brute-forcing tokens | 256-bit random token, hash lookup, 10 confirm attempts/h per user, `attempt_count` cap of 5 per verification row, then it is invalidated. |
| V10 | Recruiter's auth email is personal, work email is different | Normal magic link to the work email. The auth email is unchanged. |
| V11 | Recruiter leaves the company (mailbox closed) | Not detected in MVP. The company admin removes them. **Later:** re-verify the work email every 12 months. |
| V12 | Website domain ≠ email domain (`acme.io` site, `acmehq.com` mail) | Admin queue with `review_reason = 'domain_mismatch'`. The admin may verify both domains. |
| V13 | Name collision with a verified company ("Stripe" by `stripe-payments.dev`) | Admin queue (`name_collision`). The admin view shows the existing company and its domains side by side. |
| V14 | Company verified, then the admin suspends it with live applicants | Jobs archived and `submitted` applications refunded. Members lose access. Applicants see "Job removed · tokens refunded". |
| V15 | Recruiter tries to also join a second company | `CONFLICT already_member` (one active membership). |
| V16 | Applicant account tries recruiter actions | `requireRole('recruiter')` → FORBIDDEN. Roles are immutable. |
| V17 | Email delivery fails (bounce) | Resend webhook (Later). MVP: the UI shows "Didn't get it? Resend" plus the admin-review fallback after 2 resends. |
| V18 | Company admin removes the only other member, then tries to leave | Last-admin rule: `CONFLICT last_company_admin`. |
| V19 | Logo upload | Same signed-upload flow as resumes (backend.md §2.5), bucket `company-logos` (public read), PNG/JPEG/WebP ≤ 1 MB (no SVG, to avoid script content). **Data to add the bucket.** |

---

## 6. Testing approach

- **Unit (Vitest):**
  - `registrableDomain()` table tests (subdomains, PSL multi-part TLDs, IDN/punycode, uppercase, trailing dot).
  - Blocklist lookup.
  - Token generation (length, entropy source `crypto.randomBytes(32)`) and hashing.
  - The `startCompanyClaim` decision table (all branches → `next` value).
- **pgTAP (Data, Backend reviews):**
  - `is_company_member` is false when either the membership or the company is unverified.
  - `jobs_publish_guard` blocks publish for unverified members.
  - Applicants cannot see jobs of unverified companies.
  - The `work_email_verifications` table has no client access.
  - `confirm_work_email` behaviour: expired, consumed, other user, attempt cap, C2 pass vs. each failure reason.
  - The last-admin rule.
  - `admin_review_company('suspend')` archives jobs, rejects memberships and writes `audit_log`.
  - Non-admin callers are rejected from the admin RPCs.
  - The domain unique conflict.
- **Integration (Vitest + local Supabase + MSW for Resend):**
  - Flow A end to end: claim → email captured by the MSW Resend mock → confirm → company verified → `publishJob` succeeds.
  - Flow B auto-join emits `membership/joined`.
  - Flow C: company-admin approval.
  - Flow D: admin approval.
  - Races: two parallel claims for the same domain → exactly one company. Parallel confirms of the same token → exactly one success.
- **Admin auth:** an `aal1` admin session is rejected by every admin action. A recruiter is rejected.
- **E2E (Frontend owns, Backend supplies fixtures):** recruiter signup → claim → open the magic link from Mailpit/Inbucket (local Supabase mail; `EMAIL_TRANSPORT=smtp`) → publish a job.

---

## Review notes
<!-- Data, Lead: add comments here -->

### Data review
_Reviewer: Data. Context: [`sections/data.md`](../sections/data.md) §3.4, §4, §6, §7._

**Agree (and data.md updated to match):**
- NEW tables `work_email_verifications` and `blocked_email_domains`, with RLS as you describe: no client access to verifications; `blocked_email_domains` readable by `authenticated` and writable by admins. Added to data.md §3.4.
- C4: `verified_via` gains **`company_admin`**.
- The three new `audit_log` actions `company.domain_added`, `company.domain_removed` and `email_domain.blocked` were added to the CHECK list. Keeping free-text reasons on the row, not in audit metadata, matches data.md §3.9.
- `is_company_member` requires **both** a verified membership **and** a verified company. data.md §4.1 is updated. This also makes every recruiter policy (applications, repo evaluations, resumes) fail closed on company suspension, which is what §2.5 needs.
- `companies.name_normalized` is **not unique** (two real "Acme"s). data.md previously had a unique index among verified companies, which would block an admin approving a genuine second Acme. It is replaced by a plain btree index.
- Column additions on `companies` (`review_reason`, `rejected_reason`, `reviewed_by`, `reviewed_at`), `company_domains` (`verified_by`; method list `email_link|admin|dns_txt`, which replaces data.md's `email_otp`), and `recruiter_memberships` (`work_email`, `work_email_verified_at`, `evidence`, `approved_by`, `removed_at`, `removed_by`).
- §2.4: pending recruiters may create and edit **draft** jobs, and publishing requires verification. data.md's job policies are changed: insert/update/select use `is_company_member(company_id, false)` (any non-rejected membership), and the publish check lives in the `guard_job_update` trigger, plus a matching check on INSERT with `status = 'open'`. The applicant job feed also requires a verified company.
- The `company-logos` bucket was added to data.md §6: public read, PNG/JPEG/WebP ≤ 1 MB, path `{company_id}/logo.{ext}`, writes allowed for company admins or the creator of a pending company.

**Issues / requested changes:**
1. **`citext` is not an installed extension** in data.md. Use `text` with `check (email = lower(email))` and lowercase in the server action. data.md does this for `work_email` and `work_email_verifications.email`. Simpler than adding an extension for two columns.
2. **`is_company_member` signature:** you list `(p_company_id, p_require_admin bool default false)`; data.md has `(p_company_id, p_require_verified bool default true)`. Keep data.md's (the `false` form is what pending recruiters need for drafts) and add a separate **`is_company_admin(p_company_id)`** for the admin-only RPCs. Please update the §3 table.
3. **Relaxed CHECKs:** data.md had `(status = 'verified') = (verified_at is not null)` on `companies` and `recruiter_memberships`. With suspension/removal (verified → rejected, keeping `verified_at` for history), that would fail. It is now one-directional: `status <> 'verified' or verified_at is not null`. Your RPCs need not clear `verified_at`.
4. **Company profile edits should be RPC-only.** `updateCompanyProfile` re-queues review when a verified company's name changes, which is an invariant. data.md drops the client UPDATE grant on `companies` and expects an RPC `update_company_profile(p_company_id, p_name, p_website, p_logo_path)` (SECURITY DEFINER, `is_company_admin` or creator-of-pending check). Please add it to the §3 RPC table.
5. **Domain removal should delete the row**, not set it to `rejected`. `company_domains.domain` is globally unique, so a rejected row would block the domain forever, e.g. for a legitimate re-claim after a squatted claim is rejected. `admin_remove_company_domain` should DELETE and log `company.domain_removed` (with the domain in metadata; it is not PII).
6. **Admin pages using the service-role client:** prefer the **user-scoped client + `is_admin()` RLS**. data.md gives admins SELECT/UPDATE policies on companies, domains and memberships, and `is_admin()` now requires `aal2`. The service role bypasses everything and makes "who did this" depend on app code. Service role only for cross-table cascades inside RPCs.
7. **`evidence` jsonb** (recruiter's LinkedIn URL and note) is readable by every verified colleague via the membership SELECT policy. That is acceptable for MVP, since company admins need it, but note it in the onboarding copy ("visible to admins of {company}").
8. **`blocked_email_domains` seed** must live in a **migration** (it is needed in production), not in `seed.sql` (dev only). A ~4k-row `insert … on conflict do nothing` migration is fine.
9. **Retention:** consumed or expired `work_email_verifications` are deleted after 30 days (matches backend.md `purge-expired-data`). Pending companies with no confirmed email after 7 days are deleted. Their draft jobs cascade, and `applications.job_id RESTRICT` cannot fire because unverified companies cannot publish. Both were added to data.md §7.4.
10. **Last-company-admin rule:** enforced in the RPCs. pgTAP covers `remove_membership`, `set_company_admin` and self-leave. No trigger needed.
11. **Indexes added:** `work_email_verifications(membership_id)`, `(profile_id, created_at desc)`, partial `(expires_at) where consumed_at is null` for the purge, and `recruiter_memberships(company_id) where is_company_admin`.

## Resolution
<!-- Lead -->
