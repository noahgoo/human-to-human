# Frontend Plan

> **Owner:** Frontend · **Reviewers:** Backend, Lead
> **Inputs:** [`SPEC.md`](../SPEC.md) (locked decisions win), [`MASTER_PLAN.md`](../MASTER_PLAN.md) (canonical names), [`design/stitch/`](../../design/stitch/) (5 screens + 2 design systems).
> **Scope:** pages and routes, layouts, components, design tokens, client state, loading/polling/error states, accessibility, frontend tests. No backend contracts are defined here. Where this plan needs something from Backend or Data, it is listed in §1 as a dependency or conflict.

---

## 1. Open questions, risks, assumptions

### 1.1 Conflicts and dependencies the Lead must resolve

Each item has a frontend default. We build with the default unless the Lead overrides it.

| # | Item | Frontend default | Needs |
|---|---|---|---|
| F1 | **Middleware needs `role` and onboarding state without a DB round trip on every request.** | Supabase **Custom Access Token Hook** adds the claims `app_role`, `onboarded` (bool) and, for recruiters, `membership_status` to the JWT (names per backend.md B1; MASTER_PLAN D-24). After the role is set or onboarding finishes, the client calls `supabase.auth.refreshSession()`. Layout guards (`requireRole`, `requireOnboarded`) stay authoritative. | Data (hook function + grant), Backend (guards) |
| F2 | **`jobs` has no location / work mode.** All job cards in Stitch show location and "Remote". | Add `jobs.location text null` and `jobs.work_mode` (`remote`/`hybrid`/`onsite`, null allowed) to MVP. Compensation stays **Later** (§7). | Data, Lead (decision log) |
| F3 | **Applicant onboarding completion.** The spec says onboarding uploads LinkedIn data *and* a resume. The design has "Skip for now". | **Both are required** (product owner, MASTER_PLAN D-39): a **succeeded LinkedIn import** (at least one recognised file) **and** a parsed resume. The Stitch "Skip for now" control is removed. | **Resolved (D-39)** |
| F4 | **Check-fit response shape.** Connections are "shown immediately, alongside the score". | **Resolved (MASTER_PLAN D-22):** connections are **not** embedded in the fit response. `CheckFitPanel` calls `GET /api/v1/jobs/{jobId}/connections` in parallel with the fit POST, so they still render immediately. | Resolved |
| F5 | **Job list needs the applicant's latest fit per job** so cards can show `MatchScoreBadge` without a click. | A view or RPC `my_latest_fit_evaluations(job_ids uuid[])` that returns the latest `succeeded` row per job plus an `is_stale` flag (input hash no longer matches). The RSC loader calls it once per page. | Data |
| F6 | **Uploads must not pass through Vercel functions** (4.5 MB request-body limit, and resumes can be 5 MB). | Upload `init` returns a Supabase **signed upload URL**. The browser `PUT`s the file straight to Storage with XHR (so we get progress events), then calls `complete`. | Backend (init/complete endpoints), Data (bucket policies) |
| F7 | **Terminology.** Spec and code say "tokens". All 5 designs say "Credits". | **UI copy says "Credits"; code, DB and API say `token`.** See §2.6. | **Decided by the product owner (D-37)** |
| F8 | **Can recruiters see an applicant's LinkedIn positions, education and skills?** | **Resolved: no.** Recruiters see the **resume only** (data.md §7 matrix, applicant-ranking §2.8). There is no `LinkedInSummary` in MVP. | Resolved (Data) |
| F9 | **Editing a job after people applied.** Changing `token_cost` or `is_technical` would be unfair to existing applicants. | Once a job has ≥1 application, `token_cost` and `is_technical` are read-only in the edit form, and the server rejects changes with `CONFLICT`. | Backend |
| F10 | **Application status transitions.** | **Adopted from data.md `set_application_status`:** `submitted ⇄ shortlisted`, `submitted|shortlisted → rejected`, `rejected → shortlisted`, and never out of `withdrawn`. UI: Shortlist and Reject in the list. "Move back to New" and "Reconsider (shortlist)" appear on the detail page only, and Reconsider warns that the applicant already got a rejection email. **Withdraw is MVP:** `withdrawApplication` exists in Backend and Data. It appears on `/applications/[id]` for `submitted`/`shortlisted`, with a confirm dialog: "Credits are not refunded." | Resolved (Data, Backend) |
| F11 | **Pending recruiters.** | A recruiter with `recruiter_memberships.verification_status = 'pending'` finishes onboarding but sees a `VerificationBanner` and may create and edit **draft** jobs (`/recruiter/jobs`, `/recruiter/jobs/new`, `/recruiter/jobs/[jobId]/edit`), but cannot publish or see applicants. `/recruiter/pending` is the landing page after onboarding. | **Resolved (MASTER_PLAN D-09)**, per company-verification §2.4 |
| F12 | **Applicant list sort keys.** | **Resolved by applicant-ranking §2.7/§2.9:** `sort=rank|confidence|github|newest|oldest` (`github` only for technical jobs), keyset cursors via `job_applicant_rankings_page`, and filters `status`, `minConfidence`, `github`, `includeIncomplete`. | Resolved (Data) |
| F13 | **Token balance endpoint shape.** | Adopted from `token-system.md` §4: `GET /api/v1/tokens/balance` → `{ period, granted, spent, refunded, adjusted, balance, resetsAt }`. Apply's `201` returns `balanceAfter`, and the dialog sends `expectedTokenCost`. | Resolved (token-system) |
| F14 | **LinkedIn import polling.** | `GET /api/v1/linkedin-imports/{id}` → `{ status, filesPresent, counts: {connections, companies, positions, skills, education}, error }`. Same pattern for `GET /api/v1/resumes/{id}` → `{ parseStatus, error }`. | Backend, Data |
| F15 | **Admin queue UI** (`/admin/companies`). | Frontend builds a minimal table page in Phase 2. There is no design for it. | Lead (confirm in MVP) |
| F16 | **Resume viewer vs Backend B5** (resumes are served with `Content-Disposition: attachment` because there is no AV scan in MVP). | The viewer is **text-first**: extracted `text_content` in a scroll panel, plus a "Download original" button that calls `getResumeUrl` (60 s, attachment). **No inline PDF iframe in MVP.** It comes Later, together with the ClamAV step, as a sandboxed iframe. The detail payload must therefore include `resume {available, fileName, mimeType, sizeBytes, textContent}`. | Data/Backend (add these fields to the detail read) |
| F17 | **Applicant onboarding gate vs `mark_onboarded()`.** data.md requires a succeeded LinkedIn import. Frontend F3 lets the applicant skip LinkedIn. | No skip in the UI; `mark_onboarded()` requires both. | **Resolved (D-39).** |

### 1.2 Spec items with no Stitch design

All of these follow the design system (§2) and reuse §4 components.

| Spec item | Route | Plan |
|---|---|---|
| Application status page | `/applications`, `/applications/[applicationId]` | List of `StatusChip` rows from `my_applications`, plus a detail page with a timeline. No scores or ratings (§6.3). |
| Recruiter job list | `/recruiter/jobs` | Table using the "Lists & Data Rows" pattern: title, `JobStatusChip`, technical badge, credit cost, applicant counts, published date, actions. |
| Applicant detail + resume viewer | `/recruiter/jobs/[jobId]/applicants/[applicationId]` | Two-column layout: left has the rank breakdown, fit explanation, `RepoScoreCard` (full) and status history. Right has `ResumeViewer` (text-first plus "Download original" via a 60 s signed URL; F16). |
| Check-fit result UI | `CheckFitPanel` (Sheet from `JobCard`, inline on `/jobs/[jobId]`) | Four states: idle, pending (polling), result (score, band, explanation, connections) and failed. Details in §6.2. |
| GitHub repo prompt in Apply | `ApplyDialog` step 1 (technical jobs only) | URL field with a notice: public repos only, the code is read and never run, **ratings go to the recruiter only**. |
| Recruiter onboarding / company verification | `/onboarding/recruiter`, `/recruiter/pending`, `/recruiter/company` | Form: company name, website, work email. The domain check result is shown inline. States: verified (go to jobs), pending (go to the pending page) and **blocked**: "This company already has a recruiter account" (D-44). |
| Empty / loading / error states | every page | Matrix in §6.7. Each route has its own `loading.tsx` (skeleton) and `error.tsx`. |
| Job detail (applicant) | `/jobs/[jobId]` | Not in Stitch. Title block like `JobCard`, then description, requirements, `CheckFitPanel` and the Apply CTA. |
| Sign-up, password reset, email verification, role pick | `(auth)`, `/onboarding/role` | Reuses the sign-in split layout. |

### 1.3 Design vs spec gaps (the spec wins)

| Stitch shows | Decision |
|---|---|
| Sign-in has a role toggle on **sign-in** | The role toggle appears on **sign-up only**. It only pre-selects the role, which is confirmed on `/onboarding/role` (OAuth users cannot pick a role before they authenticate). |
| Sign-in has LinkedIn only, no Google | Add a "Continue with Google" secondary button under LinkedIn. |
| "Continue with LinkedIn" implies a profile import | LinkedIn OIDC returns only name, email and picture. Onboarding copy must say "Sign-in does not import your LinkedIn data. Upload your export below." |
| Onboarding uploads `Connections.csv` only | Dropzone accepts **a ZIP export or any of the 5 CSVs** (Profile, Positions, Skills, Education, Connections), with a per-file checklist. |
| "Applications cost 1–2 credits" (onboarding, filters) | **1–3** (locked). |
| GitHub pillars Security Rigor / Architecture / Runtime / (Code Quality) | **Security, Organization, Performance, Testing** (locked). Four cells, not three. |
| Pipeline "Top 2%" percentiles, "Verified Artifact" | Dropped. We have no percentile data. The badge becomes the review status (`Reviewed` / `Reviewing…` / `Review failed`). |
| Pipeline shows applicants' internal connections to recruiters | **Dropped** (Lead OQ3: third-party PII). |
| Matched Jobs "≥85% score threshold" and "Sorted by match score" | Not possible: fit is on demand, per job. The job feed sorts by `published_at desc`. Match badges appear only on jobs the applicant has already checked. |
| Onboarding "Step 1 Profile Setup" | Our step 1 is "Account & role" (already done by the time you reach the page). |
| Role switcher in the navbar | Replaced by a `RoleBadge` (Lead decision). |

### 1.4 Risks

- **Stitch's internal inconsistency.** The DESIGN.md frontmatter (Material-3 tokens such as `primary #091426` and `surface #faf8ff`), the DESIGN.md prose (`#1E293B`, `#F8F9FA`), the export spec (`#0F172A`, `#F8FAFC`) and the per-screen `tailwind.config` all disagree slightly. **We adopt the Slate values that the PNGs actually render** (export spec + code.html). §2 has the table.
- **Contrast.** Stitch uses `#94A3B8` for captions on white (2.6:1, fails AA). We floor muted text at `#64748B` (4.8:1).
- **Rating leakage through the client bundle.** Recruiter-only components must never be imported into applicant routes. An ESLint `no-restricted-imports` boundary enforces this (§4.3), on top of RLS.
- **Polling cost.** Many open tabs polling fit evaluations every 2 s. Mitigations: backoff, stop on terminal state, no polling while the tab is hidden, and a hard stop at 3 minutes.
- **Signed URL expiry for resume downloads.** The URL is valid for 60 s and is requested on each click, never cached. MVP has no inline iframe (F16).
- **OAuth role race.** A user who signs up with Google from the "Recruiter" tab must not be created as an applicant. Role stays `null` until `/onboarding/role` is submitted, and middleware forces that page.

### 1.5 Assumptions

Next.js 15 App Router with React 19 · Tailwind **v4** (CSS-first `@theme`) and the current shadcn/ui · `lucide-react` icons (we do **not** load Material Symbols) · English only · desktop-first, responsive down to 360 px · light theme only (no dark mode, D-47) · sign-in is required for every page except `(auth)`.

---

## 2. Design system adoption

### 2.1 Source of truth

Only `app/globals.css` holds token values. Components use **semantic Tailwind classes only** (`bg-card`, `text-muted-foreground`, `border-border`, `bg-success-subtle`). Raw hex values and `slate-*`/`emerald-*` palette classes are banned in `components/` and `app/` by an ESLint rule (`no-restricted-syntax` on className literals, with a CI grep as backup). That keeps theming in one place.

### 2.2 Light tokens (Grounded Modern Utility, as rendered)

| CSS variable (shadcn name) | Value | Used for |
|---|---|---|
| `--background` | `#F8FAFC` | App canvas |
| `--foreground` | `#0F172A` | Headings, primary text |
| `--card` / `--popover` | `#FFFFFF` | Cards, dialogs, menus |
| `--card-foreground` | `#0F172A` | |
| `--muted` | `#F1F5F9` | Recessed wells, table headers, chip bg |
| `--muted-foreground` | `#64748B` | Captions (AA floor; **not** `#94A3B8`) |
| `--body` *(custom)* | `#475569` | Body copy / secondary text |
| `--border` / `--input` | `#E2E8F0` | Hairlines, inputs |
| `--border-strong` *(custom)* | `#CBD5E1` | Hover border, Level 2 |
| `--primary` | `#0F172A` | Primary button bg (hover `--primary-hover #334155`) |
| `--primary-foreground` | `#FFFFFF` | |
| `--secondary` | `#FFFFFF` | Secondary button (with border) |
| `--accent` | `#F1F5F9` | Ghost hover |
| `--ring` / `--link` *(custom)* | `#2563EB` | Focus ring, links |
| `--destructive` | `#DC2626` | Reject, errors |
| `--success` / `--success-subtle` / `--success-fg` | `#059669` / `#ECFDF5` / `#065F46` | Strong match, shortlisted |
| `--warning` / `--warning-subtle` / `--warning-fg` | `#D97706` / `#FEF3C7` / `#92400E` | Moderate match, pending review |
| `--token` / `--token-subtle` / `--token-fg` | `#2563EB` / `#EFF6FF` / `#1E40AF` | Credit pill, cost badges |
| `--linkedin` | `#0A66C2` | LinkedIn button only |

Mapped into Tailwind v4 with `@theme inline { --color-background: var(--background); ... }`, so `bg-success-subtle` and similar classes exist. Shadows are defined as `--shadow-1/2/3` from DESIGN.md "Elevation", plus `--shadow-bevel` for primary buttons.

### 2.3 Shape, spacing, type

- **Radius:** `--radius: 0.5rem`. Buttons and inputs use `rounded-md` (6 px), cards `rounded-xl` (12 px, which matches the PNGs), dialogs `rounded-xl`, status chips `rounded-md`. The **pill** shape (`rounded-full`) is used only for `TokenBalancePill`, `MatchScoreBadge` and avatars, as the PNGs show.
- **Layout:** `max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8`. Top nav is 64 px (we do **not** adopt DESIGN.md's 240 px left rail, since no screen uses it). 12-column grid. Main + sidebar is `lg:grid-cols-[1fr_360px]`.
- **Type scale** (Tailwind v4 `@theme` `--text-*` with line-height and tracking):

| Utility | Size / weight / LH / tracking | Use |
|---|---|---|
| `text-h1` | 30px / 700 / 1.25 / -0.02em (mobile 24px) | Page titles |
| `text-h2` | 20px / 600 / 1.3 / -0.01em | Section titles |
| `text-h3` | 17px / 600 / 1.4 | Card titles |
| `text-body` | 14px / 400 / 1.5 | Default |
| `text-small` | 12.5px / 500 / 1.4 | Captions, labels |
| `text-metric` | 32px / 700 / 1.1, `tabular-nums` | Balance, counts |
| `text-code` | 12.5px / 500, JetBrains Mono | Repo URLs, SHAs, credit counts |

All numbers (scores, balances, dates in tables) use `tabular-nums`.

### 2.4 Fonts

`next/font/google` in `app/layout.tsx`. Self-hosted, with no runtime Google request:
- `Plus_Jakarta_Sans({ subsets:['latin'], weight:['400','500','600','700'], variable:'--font-sans', display:'swap' })`
- `JetBrains_Mono({ subsets:['latin'], weight:['400','500'], variable:'--font-mono', display:'swap' })`

### 2.5 shadcn/ui theming

Install the primitives we need: `button, input, textarea, label, select, checkbox, radio-group, dialog, sheet, dropdown-menu, tabs, tooltip, toast (sonner), skeleton, progress, badge, table, separator, avatar, form, alert`. Then edit their variants to match DESIGN.md:
- `Button`: `default` (primary + bevel shadow, hover `--primary-hover`, active `translate-y-px`), `secondary` (white + border + shadow-1), `ghost`, `destructive`, `link`, and **`linkedin`**. Sizes `sm` 32 px, `default` 38 px, `lg` 44 px.
- `Input`/`Select`: 38 px high, `focus-visible:ring-[3px] ring-ring/12 border-ring`, error state `border-destructive ring-destructive/10`.
- `Badge` → specialised into `StatusChip`, `MatchScoreBadge` and `TokenCostBadge` (§4).

### 2.6 Terminology decision

- **UI copy says "credits"** ("8 / 10 credits", "Costs 2 credits"). This matches all five designs, and in an AI product "tokens" is easily confused with LLM tokens.
- **Code, DB, API, analytics and error codes say `token`** (`token_ledger`, `TokenBalancePill`, `INSUFFICIENT_TOKENS`).
- All copy goes through `lib/copy.ts`: `export const CREDIT = { one: 'credit', other: 'credits', title: 'Credits' }` plus `formatCredits(n)`. The product owner confirmed "Credits" (D-37).
- Error copy maps codes to words: `INSUFFICIENT_TOKENS` → "You don't have enough credits for this job."

### 2.7 Theme scope

**Light theme only** (Grounded Modern Utility), per the product owner (MASTER_PLAN D-47). There is no dark mode, no `next-themes` and no theme toggle, now or Later. The Obsidian Kinetic Intelligence file in `design/stitch/` is unused.

---

## 3. Pages, routes, gating

### 3.1 Route map

| Route | Role | Page | Stitch screen |
|---|---|---|---|
| `/` | any | Redirect: signed out → `/sign-in`, otherwise role home | – |
| `/sign-in` | public | Sign in (LinkedIn, Google, email) | **sign_in_authentication_mvp** (role toggle removed) |
| `/sign-up` | public | Create account + role pre-select toggle | sign_in_authentication_mvp (variant) |
| `/forgot-password`, `/reset-password` | public | Password reset | no design – follow design system |
| `/verify-email` | public | "Check your inbox" | no design – follow design system |
| `/auth/callback` | – | Route handler (Backend) | – |
| `/onboarding/role` | signed in, role null | Pick Applicant / Recruiter (immutable) | no design – reuse sign-up segmented control |
| `/onboarding/applicant` | applicant, not onboarded | Upload data + preferences (step 2), review & finish (`?step=review`) | **candidate_onboarding_mvp** |
| `/onboarding/recruiter` | recruiter, no membership | Company + work email | no design – follow design system |
| `/jobs` | applicant | Job marketplace | **job_marketplace_dashboard_mvp** |
| `/jobs/[jobId]` | applicant | Job detail, Check fit, Apply | no design – JobCard header + design system |
| `/applications` | applicant | My applications (status list) | no design – derived from "Recent Activity" sidebar |
| `/applications/[applicationId]` | applicant | Application status + timeline | no design – follow design system |
| `/profile` | applicant | Re-upload resume / LinkedIn, preferences, delete imported data | candidate_onboarding_mvp (cards reused) |
| `/recruiter/pending` | recruiter, pending | Verification pending | no design – follow design system |
| `/recruiter/jobs` | recruiter (verified) | Job list | no design – follow design system |
| `/recruiter/jobs/new` | recruiter | Post a job | **post_a_job_screening_setup_mvp** |
| `/recruiter/jobs/[jobId]/edit` | recruiter | Edit job | post_a_job_screening_setup_mvp |
| `/recruiter/jobs/[jobId]` | recruiter | Ranked applicants | **recruiter_pipeline_candidate_review_mvp** |
| `/recruiter/jobs/[jobId]/applicants/[applicationId]` | recruiter | Applicant detail + resume viewer | no design – card styles from pipeline screen |
| `/recruiter/company` | recruiter | Company profile, domains, verification state (single recruiter; no member management in MVP, D-44) | no design – follow design system |
| `/admin/companies` | admin | Approval queue | no design – follow design system |
| `/settings` | any signed-in | Account: email, password, sign out, delete account | no design – follow design system |

### 3.2 App Router file structure

```
middleware.ts                         # session refresh + gating (§3.3)
app/
  layout.tsx                          # fonts, <Providers> (QueryClient, Toaster), html lang
  page.tsx                            # redirect to role home
  not-found.tsx  global-error.tsx
  (auth)/
    layout.tsx                        # split panel: value prop left, form right
    sign-in/page.tsx
    sign-up/page.tsx
    forgot-password/page.tsx
    reset-password/page.tsx
    verify-email/page.tsx
    actions.ts                        # signIn, signUp, resetPassword (server actions)
  auth/callback/route.ts              # Backend-owned
  (onboarding)/
    layout.tsx                        # slim header (logo + sign out), OnboardingStepper slot
    onboarding/role/{page.tsx,actions.ts}
    onboarding/applicant/{page.tsx,actions.ts,loading.tsx}
    onboarding/recruiter/{page.tsx,actions.ts}
  (applicant)/
    layout.tsx                        # requireRole('applicant') + requireOnboarded(); AppShell; prefetch balance
    jobs/{page.tsx,loading.tsx,error.tsx}
    jobs/[jobId]/{page.tsx,loading.tsx,not-found.tsx}
    applications/{page.tsx,loading.tsx}
    applications/[applicationId]/page.tsx
    profile/{page.tsx,actions.ts}
  (recruiter)/
    layout.tsx                        # requireRole('recruiter') + membership check -> /recruiter/pending
    recruiter/pending/page.tsx
    recruiter/company/{page.tsx,actions.ts}
    recruiter/jobs/{page.tsx,loading.tsx,actions.ts}
    recruiter/jobs/new/page.tsx
    recruiter/jobs/[jobId]/{page.tsx,loading.tsx,actions.ts}
    recruiter/jobs/[jobId]/edit/page.tsx
    recruiter/jobs/[jobId]/applicants/[applicationId]/{page.tsx,loading.tsx}
  (admin)/
    layout.tsx                        # requireRole('admin')
    admin/companies/{page.tsx,actions.ts}
  (account)/
    settings/{page.tsx,actions.ts}    # AppShell picks nav by role
components/  lib/  e2e/               # see §4, §8
```

Route groups do not change URLs, so applicant URLs are unprefixed (`/jobs`) while recruiter URLs live under `/recruiter`. Middleware can then match on prefixes.

### 3.3 Middleware gating and redirects

`middleware.ts` runs `@supabase/ssr` `updateSession`, then reads JWT claims (F1). Matcher excludes `_next`, static assets, `/api/*` and `/auth/callback`.

| Condition (first match wins) | Request to | Redirect to |
|---|---|---|
| No session | any non-`(auth)` page | `/sign-in?next=<path>` |
| Session, `user_role` null | anything except `/onboarding/role`, `/settings` | `/onboarding/role` |
| Applicant, `onboarded=false` | anything except `/onboarding/applicant`, `/settings` | `/onboarding/applicant` |
| Recruiter, `onboarded=false` | anything except `/onboarding/recruiter`, `/settings` | `/onboarding/recruiter` |
| Onboarded | `/sign-in`, `/sign-up`, `/onboarding/*`, `/` | role home |
| Applicant | `/recruiter/*`, `/admin/*` | `/jobs` |
| Recruiter | applicant paths, `/admin/*` | `/recruiter/jobs` |
| Recruiter, `membership_status='pending'` | `/recruiter/jobs/[jobId]` (applicant list) and other verified-only pages | `/recruiter/pending` (done in the `(recruiter)` layout, not in middleware). Draft pages stay reachable (D-09). |

Role homes: applicant `/jobs`, recruiter `/recruiter/jobs`, admin `/admin/companies`.

**First-time user:** sign-up → (email: `/verify-email` → link → `/auth/callback`) → `/onboarding/role` → `/onboarding/{role}` → role home. `next=` is honoured only after onboarding and only for same-origin relative paths.

---

## 4. Component inventory

### 4.1 Shared / domain components

| Component | Props | Data source | Notes |
|---|---|---|---|
| `AppShell` | `role`, `user {name, avatarUrl}`, `children` | `(group)/layout.tsx` RSC via `getSession()` + `profiles` | 64 px top nav. Nav: applicant = Jobs, My applications. Recruiter = Jobs, Post a job, Company. Mobile = Sheet. |
| `RoleBadge` | `role` | session claims | Replaces the Stitch role switcher. Recruiter variant shows company name + verified tick. |
| `TokenBalancePill` | `initialBalance: TokenBalance` | RSC prefetch (`get_token_balance()`) → TanStack `['token-balance']` ← `GET /api/v1/tokens/balance` | "`balance` / `total` credits" (`total` from the API = granted + refunded + adjusted, D-11), e.g. "8 / 10 credits" (the denominator can exceed 10 after a refund; see token-system review item 4). Tooltip: "Resets {resetsAt in local time}. Unused credits don't roll over." Applicants only. Optimistic (§5.4). |
| `TokenCostBadge` | `cost: 1|2|3` | `jobs.token_cost` | Mono, `token-subtle` bg. "2 credits". |
| `TokenCostSelector` | `value`, `onChange`, `disabled?`, `disabledReason?` | form state | Three radio cards (1/2/3) from Stitch step 4. "2 credits" is labelled *Recommended*. Default is 2. |
| `JobCard` | `job: JobListItem`, `fit?: FitSummary`, `connectionsCount?: number`, `applied?: {applicationId, status}`, `onCheckFit()` | `/jobs` RSC: open `jobs` + `companies` + F5 + `my_applications` | From the Stitch card: logo (initial monogram fallback), title, company · location · work mode, `TokenCostBadge`, `MatchScoreBadge` if fit exists, `Technical` chip. CTAs: **Check fit** (secondary) and **View & apply** (primary). Shows a `StatusChip` instead of Apply when the user has already applied. No comp range, no bookmark. |
| `MatchScoreBadge` | `score: number|null`, `status?: evaluation_status`, `stale?: boolean`, `size?` | `fit_evaluations.confidence_score` | Bands come from the shared `lib/ranking/bands.ts` (applicant-ranking §2.6): **≥85 "Strong match"** (success), **70–84.99 "Good match"** (success-subtle, outline), **50–69.99 "Moderate match"** (warning), **<50 "Limited match"** (neutral). Never red. Props add `provisional?: boolean` (dashed outline + "Provisional"). The text always includes the number ("82 · Good match"), so colour is never the only signal. `pending` → spinner "Checking…". `stale` → dashed border + tooltip "Your profile changed. Re-check." Shared by applicant and recruiter. |
| `CheckFitPanel` | `jobId`, `initial?: FitEvaluationDTO` | `POST /api/v1/jobs/{jobId}/fit-evaluations`, poll `GET /api/v1/fit-evaluations/{id}` (`useFitEvaluation`) | States in §6.2. Rendered in a `Sheet` from `JobCard` and inline on job detail. |
| `ConnectionsCallout` | `connections: {firstName,lastName,position}[]`, `total`, `companyName`, `hasLinkedInImport` | `GET /api/v1/jobs/{jobId}/connections` (F4, D-22) or RSC count | "3 connections work at Stripe: Sarah L., Alex M. +1". Shows up to 3 names, with "Show all" opening a list. If the applicant later deleted their LinkedIn data from `/profile`: "Re-upload your LinkedIn export to check fit and see connections" linking to `/profile`. **No Request Intro** (Later). Applicant-only. |
| `FileDropzone` | `accept: string[]`, `maxBytes`, `multiple`, `onFiles(files)`, `state: idle|uploading|processing|done|error`, `progress?`, `error?` | local | Accessible button + hidden input, plus drag-and-drop. Client checks of extension and size (server re-checks magic bytes). Mono filename. Replace / Remove actions. |
| `LinkedInImportStatus` | `importId` | poll `GET /api/v1/linkedin-imports/{id}` | Checklist of the 5 files (present/missing), phase text, final counts ("1,428 connections across 342 companies · 37 positions · 24 skills · 3 education"). |
| `ResumeCard` | `resume {fileName, sizeBytes, mimeType, parseStatus}` | `resumes` row + poll `GET /api/v1/resumes/{id}` while not terminal | Stitch onboarding card: file icon, name, size, Replace. |
| `OnboardingStepper` | `steps`, `current` | static | Stitch 3-step tracker. `aria-current="step"`. |
| `ApplyDialog` | `job {id, title, companyName, tokenCost, isTechnical}` | `POST /api/v1/applications`, `['token-balance']` | Flow in §6.3. Holds the Idempotency-Key. |
| `StatusChip` | `status: application_status`, `audience: 'applicant'|'recruiter'` | `my_applications.status` / `applications.status` | Applicant labels: submitted → "Submitted", shortlisted → "Shortlisted", rejected → "Not selected", withdrawn → "Withdrawn". Recruiter labels: "New", "Shortlisted", "Rejected", "Withdrawn". Colours: neutral / success / muted / muted. |
| `JobStatusChip` | `status: job_status` | `jobs.status` | Draft (neutral), Open (success), Closed (muted), Archived (muted). |
| `ApplicationTimeline` | `events: {toStatus, at}[]` | `my_applications` timestamps (applicant) / `application_events` (recruiter) | Vertical list. The applicant view never shows notes or actors. |
| `MetricCard` | `label`, `value`, `hint?`, `icon` | RSC counts | Reduced set only (§7). |
| `EmptyState` / `ErrorState` | `title`, `body`, `action?` | – | Used by every list. `ErrorState` shows `requestId` in mono for support. |
| `*Skeleton` | – | – | `JobCardSkeleton`, `ApplicantRowSkeleton`, `TableSkeleton`. Match the final layout to avoid CLS. |

### 4.2 Recruiter-only components (`components/recruiter/`)

| Component | Props | Data source | Notes |
|---|---|---|---|
| `JobForm` | `mode: 'create'|'edit'`, `defaultValues`, `lockedFields?: ('tokenCost'|'isTechnical')[]` | server actions `createJob`, `updateJob`, `publishJob`; zod `jobInputSchema` | Sections (Stitch numbering kept): **1 Role overview** (title, location, work mode). **2 Description & requirements** (two Markdown textareas with live char count). **3 Technical screening** (`is_technical` checkbox: "Require a public GitHub repo. AI rates Security, Organization, Performance, Testing (1–10). Applicants don't see ratings."). **4 Credit cost** (`TokenCostSelector`). Sticky right column: live `JobCard` preview + "Publish" / "Save as draft". |
| `ApplicantRow` | `row: ApplicantRankingRow`, `isTechnical`, `onStatusChange` | first page via RSC from `job_applicant_rankings`; more pages via `GET /api/v1/jobs/{jobId}/applicants` | Stitch candidate card, trimmed: rank #, avatar, name, headline, `MatchScoreBadge`, applied-ago, `StatusChip`, compact `RepoScoreCard` (technical only), "Spent N credits", actions **Shortlist**, **Reject** and **View application**. The whole row is not one link: the name is the link, and buttons are separate. |
| `RepoScoreCard` | `evaluation: {status, security, organization, performance, testing, rationale?, repoUrl, commitSha?}`, `variant: 'compact'|'full'` | `repo_evaluations` via ranking view / detail RSC | 4 cells (Security, Organization, Performance, Testing) with `x / 10`, plus average. `full` adds per-category rationale, repo link and SHA (mono). `pending` → "Reviewing repository…". `failed` → warning "Review unavailable: listed under Incomplete" (MASTER_PLAN D-06). **Never imported by applicant code.** |
| `RankBreakdown` | `rank: RankedApplicant['rank']`, `confidence`, `github` | `RankedApplicant` (applicant-ranking §2.8) | "Rank score 86.33 = 70% × fit 90 + 30% × GitHub 77.8 (8.00 / 10 scaled 1–10 → 0–100)". The list shows rounded integers, the breakdown shows 2 decimals. Tier 1 shows "Provisional: ranked below complete applicants until the GitHub review finishes". Tier 2 shows "Fit score pending". |
| `ApplicantFilters` | `status`, `sort`, `minConfidence`, `github`, `includeIncomplete`, `counts`, `isTechnical` | URL search params | Status tabs **Active** (default `submitted,shortlisted`) / Shortlisted / Rejected / Withdrawn with counts. Sort: Rank, Fit score, GitHub score (technical only), Newest, Oldest. "Min fit" select (Any / 50+ / 70+ / 85+, matching the bands). GitHub review multi-select (technical only). "Show incomplete" switch. Every change resets the cursor. The cursor is never put in the URL. |
| `StatusActions` | `applicationId`, `status` | server action `setApplicationStatus` | Shortlist (one click, optimistic via `useOptimistic`). Reject opens a confirm dialog ("The applicant will be notified by email."). The F10 transition matrix decides which buttons appear. On shortlisted applications, the detail page also shows **Reveal email** (`revealContact` → `get_applicant_contact`, D2): the email appears with Copy and `mailto:`, plus the caption "Reveals are logged". It is fetched on click, never cached, and never shown in the list. |
| `ResumeViewer` | `applicationId`, `resume {available, fileName, mimeType, sizeBytes, textContent}` | detail RSC + server action `getResumeUrl(applicationId)` → `{url, expiresAt}` (60 s, attachment) | Text-first (F16): extracted text in a scroll panel (`whitespace-pre-wrap`, plain text). "Download original" requests a fresh URL on every click and never prefetches, which keeps `audit_log` honest. `available=false` → "Resume removed by applicant". Inline PDF is Later. |
| `VerificationBanner` | `status`, `companyName` | `recruiter_memberships` | Pending, rejected (with support contact), verified tick. |

### 4.3 Folder layout and boundaries

```
components/ui/            shadcn primitives (themed)
components/shell/         AppShell, TopNav, RoleBadge, UserMenu, MobileNav
components/states/        EmptyState, ErrorState, skeletons
components/tokens/        TokenBalancePill, TokenCostBadge, TokenCostSelector
components/jobs/          JobCard, JobFeed, JobDetailHeader
components/fit/           MatchScoreBadge, CheckFitPanel, ConnectionsCallout
components/applications/  ApplyDialog, StatusChip, ApplicationTimeline
components/uploads/       FileDropzone, LinkedInImportStatus, ResumeCard
components/onboarding/    OnboardingStepper
components/recruiter/     (all §4.2)
lib/hooks/                useTokenBalance, useFitEvaluation, useLinkedInImport, useResumeParse, useDirectUpload
lib/api/                  typed fetch client (`apiFetch`) + ApiError parsing
lib/copy.ts               terminology + error messages
```

ESLint `no-restricted-imports`: files under `app/(applicant)/**`, `components/{jobs,fit,applications}/**` may not import `components/recruiter/**` or `lib/schemas/repo-evaluation*`.

---

## 5. State management and data fetching

### 5.1 Principles

| Concern | Tool |
|---|---|
| Page reads | **RSC** with the user-scoped Supabase server client (`lib/supabase/server.ts`). No `/api/v1` round trip. |
| Form mutations | **Server actions** (`app/**/actions.ts`) returning `ActionResult<T>`. Called through `useActionState` or react-hook-form `handleSubmit`. After success: `revalidatePath` or `router.refresh()`. |
| Polled or idempotent endpoints | **TanStack Query** against `/api/v1/*` (fit evaluations, LinkedIn/resume parse status, token balance, applicant pagination). |
| URL state | Filters and sort on `/jobs` and `/recruiter/jobs/[jobId]` live in `searchParams`, so links are shareable and the RSC reads them. |
| Local UI state | `useState`. No global store (no Redux or Zustand). |

One `QueryClient` per browser session, created in `app/providers.tsx`. Defaults: `staleTime: 30s`, `retry: (n, err) => err.status >= 500 && n < 2`, `refetchOnWindowFocus: false` (except for the balance).

### 5.2 Query keys

| Key | Endpoint | Refetch |
|---|---|---|
| `['token-balance']` | `GET /api/v1/tokens/balance` | `initialData` from the layout RSC. Refetched on window focus and after Apply. |
| `['fit-evaluation', id]` | `GET /api/v1/fit-evaluations/{id}` | Polling (§5.3) |
| `['linkedin-import', id]` | `GET /api/v1/linkedin-imports/{id}` | Polling, 1.5 s |
| `['resume', id]` | `GET /api/v1/resumes/{id}` | Polling, 1.5 s |
| `['applicants', jobId, {status, sort}]` | `GET /api/v1/jobs/{jobId}/applicants` | `useInfiniteQuery` with `nextCursor`. Page 1 is seeded from the RSC. Invalidated after a status change. |

### 5.3 Polling for async evaluations

`useFitEvaluation(id)`: `refetchInterval: (q) => terminal(q.state.data?.status) ? false : elapsed < 30s ? 2000 : 5000`. Hard stop at **3 min**, then show "This is taking longer than usual. We'll keep working; check back in a few minutes." with a Retry button that re-POSTs, which hits the cache or creates a new row. `refetchIntervalInBackground: false`, so a hidden tab doesn't poll. Status text goes into an `aria-live="polite"` region. Terminal states: `succeeded`, `failed`. The same hook shape is used for LinkedIn import and resume parse.

### 5.4 Optimistic token balance with rollback

In `ApplyDialog` → `useMutation`:
1. `onMutate`: `cancelQueries(['token-balance'])`, snapshot `prev`, `setQueryData` with `balance - job.tokenCost` and `spent + cost`. The pill animates the number (no animation under `prefers-reduced-motion`).
2. `onError`: `setQueryData(prev)`, and then by code:
   - `INSUFFICIENT_TOKENS`: invalidate the balance.
   - `ALREADY_APPLIED`: invalidate, then go to the application.
   - `REPO_NOT_ACCESSIBLE`: back to the URL step with a field error.
   - `JOB_NOT_OPEN`: close the dialog, `router.refresh()`.
   - `CONFLICT` with `details.reason='token_cost_changed'`: show the new cost (`details.currentCost`) on the confirm step and require a fresh confirmation.
   - `IDEMPOTENCY_KEY_REUSED`: generate a new key and ask the user to retry.
   - network error or 5xx: keep the **same** key and offer Retry (a safe replay).
3. `onSettled`: `invalidateQueries(['token-balance'])` so the server value wins.
4. `onSuccess` (201, or a replayed 201): `setQueryData(['token-balance'], b => ({...b, balance: res.balanceAfter}))`, toast "Application sent: 2 credits spent", `router.push('/applications/{id}')`, `router.refresh()` so the job list shows "Applied".

### 5.5 Idempotency-Key on Apply

- Generated with `crypto.randomUUID()` **when the dialog opens** and kept in a `useRef` for that dialog session.
- **Regenerated when the request body changes** (the GitHub URL is edited after a failed attempt), because a different body under the same key returns `IDEMPOTENCY_KEY_REUSED`.
- **Kept** across network retries, double-clicks and 5xx responses. That is the point: a replay returns the original 201.
- Discarded when the dialog closes. The Submit button is also disabled while the request is in flight (belt and braces).
- Sent as the `Idempotency-Key` header by `apiFetch` (`lib/api/applications.ts → createApplication(input, key)`).

### 5.6 Forms and shared zod

- Schemas live in `lib/schemas/` (shared with Backend, and Backend owns the server contract). The frontend imports the same schema objects: `jobInputSchema`, `applicationCreateSchema` (`jobId`, `githubRepoUrl?` with a refinement to `https://github.com/{owner}/{repo}`, normalised by stripping `.git`, trailing slash, `/tree/...`), `roleSelectSchema`, `recruiterOnboardingSchema`, `applicantPreferencesSchema`, `uploadInitSchema` (MIME + size: resume `application/pdf` or the DOCX MIME, ≤ 5 MB).
- `react-hook-form` + `zodResolver(schema)`. Validation runs on blur, then on change after the first error.
- Server errors: `VALIDATION_FAILED.details.fields` → `form.setError(field, {message})`. Any other code → a form-level `<Alert>` with the `lib/copy.ts` message.
- Cross-field rules (for example, a technical job needs a GitHub URL in Apply) live in the schema with `.superRefine`, so client and server agree.

### 5.7 Direct uploads (`useDirectUpload`)

1. Init (MASTER_PLAN D-27): `POST /api/v1/resumes/uploads` `{name, size, mimeType}` → `{resumeId, signedUrl, token, path, expiresAt}`, or `POST /api/v1/linkedin-imports` `{source, files:[{name, size}]}` → `{importId, uploads:[{name, path, signedUrl, token}], expiresAt}`.
2. XHR `PUT` to each signed URL. `upload.onprogress` drives `<Progress>`. Abort on unmount or Remove.
3. `POST /api/v1/resumes/{resumeId}/complete` or `POST /api/v1/linkedin-imports/{importId}/complete` → `202` → start polling (§5.3).

Errors: an expired signed URL means re-init once, then show an error. A 413/415 from Storage maps to the same copy as the client check.

---

## 6. Key flows

### 6.1 Sign-up → onboarding → dashboard

1. `/sign-up`: segmented control **Job seeker | Recruiter** (default Job seeker, persisted in the `?role=` param). Buttons: Continue with LinkedIn, Continue with Google, then email + password (zod: ≥ 10 chars, matching Supabase config). The chosen role is passed as `options.data.role` (email) or the signed `np_role_intent` cookie set by `startOAuth` (OAuth), per backend.md B2 and MASTER_PLAN D-25. If no role arrives, `/onboarding/role` asks for it.
2. Email sign-up → `/verify-email` ("We sent a link to x@y. Didn't get it? Resend in 60 s."). OAuth goes straight to the callback.
3. `/onboarding/role` (only when `app_role` is still null): two large radio cards. Copy: "You can't change this later." Recruiter card: "Use your work email so we can verify your company." Server action `selectRole` → `refreshSession()` → redirect.
4. **Applicant** `/onboarding/applicant` (Stitch screen):
   - Stepper: ✓ Account & role · **2 Upload data** · 3 Review & finish.
   - **LinkedIn card**: `FileDropzone` accepting `.zip` or multiple `.csv`, ZIP ≤ 50 MB / CSV ≤ 20 MB each (linkedin-ingestion §2.3). Before upload, the client lists recognised files (ZIP entries are listed via `fflate` `unzip` with a filter, without reading full content) as a 5-item checklist: Profile, Positions, Skills, Education, Connections. Missing files are fine, with a warning "Without Connections.csv we can't show who you know at companies." Phases: *Uploading 45%* → *Parsing your export…* (indeterminate, polls `linkedin_imports.status`) → *Done* with counts. `failed` shows the coded message from linkedin-ingestion §4 plus **Retry upload** and "Try individual CSVs instead"; the previous successful import (if any) stays active. Uploads and parse status survive a reload, so the applicant can leave while LinkedIn prepares the export and come back. Help text: "LinkedIn → Settings → Data privacy → Get a copy of your data. Select Connections, Positions, Profile, Skills and Education. LinkedIn usually emails it within about 10 minutes; you can upload your resume meanwhile." Privacy note: "We store your connections' names, companies and titles only, never their emails, and never show them to recruiters."
   - **Resume card**: `FileDropzone` (PDF/DOCX, ≤ 5 MB) → `ResumeCard` with parse status *Extracting text…* → ✓. A failed parse blocks Continue ("We couldn't read this file. Try exporting it as PDF.").
   - **Preferences** (optional): target seniority, location preference → `applicant_profiles`.
   - **Credits card** (Stitch bottom banner, fixed copy): "10 free credits every month. Jobs cost 1–3 credits. Unused credits don't roll over."
   - Footer: **Continue**, enabled only once the LinkedIn import is `succeeded` **and** the resume has `parse_status=succeeded` (D-39). There is no skip. While disabled, a checklist under the button says which item is missing, uploading, parsing or failed (with Retry). A server `CONFLICT` (`linkedin_not_ready` / `resume_not_ready`) from Finish shows the same checklist.
   - `?step=review`: summary of the import counts, resume, preferences. **Finish** → server action `completeApplicantOnboarding` (sets `onboarded_at`) → `refreshSession()` → `/jobs` with a first-visit toast ("You have 10 credits this month").
5. **Recruiter** `/onboarding/recruiter`: company name, website (optional), and a read-only email from auth. Inline domain check result (`checkWorkEmailDomain`): *"New company. We'll send a link to confirm you@acme.com."*, or *"We'll verify acme.com with an admin."* (domain mismatch / name collision), or **blocked**: *"This company already has a recruiter account."* with a "Contact support" link; the form cannot be submitted and `startCompanyClaim` returns `CONFLICT company_has_recruiter` as a backstop (one recruiter per company, D-44). Free-mail domains → blocked with an explanation (list owned by company-verification). Submit → `onboarded_at` → verified: `/recruiter/jobs`, pending: `/recruiter/pending` ("We're verifying Acme Inc. This usually takes 1 business day. We'll email you.").

### 6.2 Check fit (free, async)

1. On `/jobs`, **Check fit** on a `JobCard` opens a right `Sheet` (bottom sheet on mobile) with `CheckFitPanel`. On `/jobs/[jobId]` the panel is inline.
2. If the RSC already has a non-stale succeeded fit, show it immediately with "Checked {relative time}" and a **Re-check** link.
3. Otherwise `POST /api/v1/jobs/{jobId}/fit-evaluations`:
   - `200` → render the result.
   - `202 {id}` → render **ConnectionsCallout immediately** (its own parallel `GET /api/v1/jobs/{jobId}/connections`), plus a score skeleton with "Comparing your resume and LinkedIn to the requirements…" (live region). Polling as in §5.3.
   - `429 RATE_LIMITED` → "You've used today's 20 free fit checks. More tomorrow."
4. Result layout: large `MatchScoreBadge` (score / 100 + band) → explanation (plain text, max ~120 words, `whitespace-pre-line`) → `ConnectionsCallout` → footer disclaimer "AI estimate based on your resume and LinkedIn export. Recruiters see their own evaluation." → primary **Apply (2 credits)** which opens `ApplyDialog`.
5. `failed` → `ErrorState` "We couldn't check this job right now", with Retry.
6. After success, `router.refresh()` so the card's badge updates.

### 6.3 Apply

Entry: **Apply** on `/jobs/[jobId]` or in `CheckFitPanel`. Disabled with a reason when: already applied (shows `StatusChip` + link), job not open, or balance < cost ("You need 3 credits; you have 1. Credits reset on Nov 1.").

**Step order (decision):** GitHub URL first (technical jobs only), **confirmation last**, because confirming is the irreversible spend and must be the final click.

1. Dialog opens → Idempotency-Key generated (§5.5).
2. **Technical job → Step 1 "Share a repository":** URL input (`applicationCreateSchema`), helper "Public GitHub repos only. Our AI reads the code statically and never runs it. **Ratings are shared with the recruiter only; you won't see them.**" Next validates the format client-side. Existence and visibility are checked server-side at submit (no extra endpoint).
3. **Step 2 "Confirm":** a summary card with job, company, "Cost: 2 credits", "Balance after: 6 of 10", "Credits reset {date} (UTC) and don't roll over", and the repo URL (mono) if any. Buttons: Back / **Spend 2 credits & apply**.
4. Submit → optimistic balance (§5.4) → `POST /api/v1/applications` `{jobId, githubRepoUrl?, expectedTokenCost}` with `Idempotency-Key`. The button shows a spinner, and Esc and close are disabled while in flight.
5. `201` → toast → `/applications/[applicationId]`.
6. **Status page** shows a **Withdraw application** action for `submitted`/`shortlisted` (confirm: "Withdraw from {job}? Your {n} credits are not refunded, and you can't re-apply to this job."), the job header, a `StatusChip` (Submitted), the timeline (Submitted {date}), "Spent 2 credits", the repo URL if technical ("Repository submitted for review"), and nothing about scores. Copy for each status: Submitted, "The recruiter will review your application." · Shortlisted, "Good news: you've been shortlisted. The company will contact you by email." · Not selected, "The company decided not to move forward."
7. `/applications` lists every application with the job title, company, `StatusChip`, applied date and credits spent, sorted newest first. Each row links to its detail page.

### 6.4 Recruiter: post a job

1. `/recruiter/jobs/new` → `JobForm` (create). The sticky preview reuses the applicant `JobCard` (preview mode, no CTAs) so the recruiter sees exactly what candidates see.
2. Fields: title (required, 5–120), location (optional), work mode (radio), description (required, Markdown, 50–20,000), requirements (required, Markdown, 1–10,000); limits come from the shared `jobInputSchema` (MASTER_PLAN D-31), **Technical role** checkbox, **Credit cost** selector 1/2/3 (default 2; help: "Higher cost means fewer, more deliberate applications. Applicants get 10 credits a month.").
3. **Save as draft** → `createJob({status:'draft'})`. **Publish** → `createJob` + `publishJob` (one server action `createAndPublishJob`) → redirect to `/recruiter/jobs/[jobId]` with toast "Job published".
4. Edit: the same form. `tokenCost` and `isTechnical` are locked when applications exist (F9, enforced by the `jobs_freeze_pricing` trigger). The tooltip reads: "Cost is locked once candidates have applied. Close this job and post a new one to change it." Close job → confirm dialog → `status='closed'` (applicants can no longer apply, existing applications stay reviewable, **no refund**). Archive job → confirm dialog that states "{n} applicants you haven't acted on will get their credits back" → `archiveJob` (token-system §2.4). Delete is offered only for drafts with no applications.

### 6.5 Recruiter: ranked applicants

1. `/recruiter/jobs/[jobId]`: header with title, `JobStatusChip`, `TokenCostBadge`, Technical chip, a job switcher `Select` (Stitch dropdown "Staff Infra Engineer (14 applicants)") and Edit / Close actions.
2. Metric strip (MVP set), from `counts`: **Active**, **New**, **Shortlisted**, and for technical jobs **Incomplete** (pending or failed GitHub reviews).
3. **Fairness notice** (applicant-ranking §2.10, verbatim) as an info `Alert` above the list, and repeated as one line next to the score on the detail page: *"Scores are AI-generated estimates to help you prioritise. They can be wrong or incomplete. Review each candidate's resume before you decide. Never reject a candidate on score alone."* It cannot be dismissed. A user may collapse it to one line, and that choice is stored in `localStorage`. When `job.mixedPromptVersions` is true, a second notice reads: "Some applicants were scored with an earlier model version; scores may not be directly comparable."
4. `ApplicantFilters` (see §4.2), plus a caption "Ranked by 70% fit + 30% GitHub" (technical) or "Ranked by fit score" (non-technical). Params go into the URL.
5. List: `ApplicantRow`s with `rank.position` ("#3") shown, but only under `sort=rank`. Page 1 (20 rows) is read in the RSC by calling `job_applicant_rankings_page` + `job_ranking_version` + counts through **one shared loader** (`lib/ranking/loadApplicantsPage.ts`) that the API route also uses, so both return the same shape. The client continues with **Load more** (`useInfiniteQuery`, `nextCursor`, `rankingVersion` sent back on every page). If a page returns `rankingChanged: true`, a banner reads "Rankings updated · Refresh" and the list never reorders by itself.
6. **Tiers** (only under `sort=rank`): the list is split into labelled groups: "Complete (n)", "Incomplete: GitHub review pending or unavailable (n)" and "Not scored yet (n)". Tier 1 rows show a provisional `MatchScoreBadge` with the badge "Provisional · GitHub review in progress" (pending/running) or "GitHub review unavailable: {failure copy}" (failed, mapped from Backend's `failure_code` in `lib/copy.ts`). Tier 2 rows show "Fit score pending" or "Fit score unavailable". Under other sorts there are no group headers, only the badges.
7. **Shortlist**: optimistic chip change → server action → toast with no undo (the email is queued). **Reject**: confirm dialog → server action. On error, revert and show a toast with the message.
8. **View application** → detail page: `RankBreakdown`, fit explanation, `RepoScoreCard full` (summary and evidence per category; evidence paths in mono, **plain text, never links or Markdown**, because the content comes from an untrusted repo), `ApplicationTimeline`, `StatusActions` (+ Reveal email when shortlisted) and `ResumeViewer` (right column ≥ lg, a "Resume" tab on mobile). Prev/Next applicant arrows keep the current sort and filters (they read the same cursor list from the query cache, and fall back to back-to-list).
9. Keyboard: `j`/`k` move focus between rows, `s` shortlists, `r` opens the reject confirm. Shortcuts are listed in a `?` help popover and are only active when focus is in the list.

### 6.6 Error-code → UI mapping

| Code | UI |
|---|---|
| `UNAUTHENTICATED` | Redirect to `/sign-in?next=` (fetch wrapper) |
| `FORBIDDEN` | `ErrorState` "You don't have access to this page." |
| `NOT_FOUND` | `notFound()` → route `not-found.tsx` |
| `VALIDATION_FAILED` | Field errors |
| `ALREADY_APPLIED` / `JOB_NOT_OPEN` / `INSUFFICIENT_TOKENS` / `REPO_NOT_ACCESSIBLE` / `IDEMPOTENCY_KEY_REUSED` | §5.4 |
| `RATE_LIMITED` | Inline message with the retry time from `details.retryAfter` |
| `CONFLICT` | Toast with the message, then refresh |
| `INTERNAL` | `ErrorState` with the `requestId` and Retry |

### 6.7 Empty / loading / error states

| Surface | Loading | Empty | Error |
|---|---|---|---|
| `/jobs` | 4× `JobCardSkeleton` (`loading.tsx`) | "No open jobs right now. New roles are posted weekly." | `error.tsx` + Retry |
| `/jobs` with filter | – | "No jobs match '{q}'." + Clear filters | – |
| CheckFitPanel | Score skeleton + live text | – | "Couldn't check fit", Retry |
| ConnectionsCallout | – | "No connections at {company} yet." / "Upload LinkedIn export" | Hidden (non-critical) |
| `/applications` | Row skeletons | "You haven't applied yet. You have {n} credits this month." + Browse jobs | `error.tsx` |
| Onboarding uploads | Progress bar → indeterminate "Parsing…" | Dropzone | File-specific message + Retry/Replace |
| `/recruiter/jobs` | Table skeleton | "Post your first job" + CTA | `error.tsx` |
| Ranked applicants | `ApplicantRowSkeleton` ×5 | Open job: "No applicants yet. Share the job link." Draft: "Publish this job to receive applicants." | `error.tsx` |
| RepoScoreCard | "Reviewing repository…" | – | "Review unavailable: listed under Incomplete" (warning) |
| ResumeViewer | Text panel skeleton | "Resume removed by applicant" | Download: "Couldn't get the file", Retry (new signed URL) |
| TokenBalancePill | Uses RSC `initialData`, so never empty | – | Shows the last known value + `aria-describedby` "may be out of date" |

---

## 7. Design elements beyond the spec

| Element | Verdict | Reason |
|---|---|---|
| **Request Intro / Request Warm Ping / View Referrals** | **Later** | Needs messaging or intro workflow (spec: messaging is later) and contacting third parties who never consented. MVP shows connection names only, as plain text. |
| **Compensation range** (+ equity toggle) | **Later** | Not in the spec or the data model. High value for applicants but adds schema, validation and pay-transparency concerns. Location / work mode come in instead (F2). |
| **Semantic search** ("Go, Rust, Distributed Systems") | **Later** | Needs embeddings and a vector index. MVP: a plain keyword filter on title + company (`ilike`, debounced, in `?q=`) plus filters "Technical only" and "Max credits ≤ n". No "1st-degree connection" filter in MVP (it would need a connections join per job; Later). |
| **Role switcher** (Candidate / Recruiter) | **Drop** | One account has one immutable role. Replaced by `RoleBadge`. |
| **Notifications bell** | **Later** | Email (Resend) covers status changes in MVP. In-app notifications need a table and a read state. |
| **Hiring Review Panel** (reviewers, approvals, consensus) | **Later** | Multi-reviewer workflow is not in the spec, and MVP has one recruiter per company (D-44). |
| **Rubric weight editor** ("Edit Requisition Weights", Evaluation Priority sliders) | **Drop** | Conflicts with the locked 70/30 weights and the fixed 4 categories. Replaced by the read-only `RankBreakdown` caption. |
| **Credit Intake Gate radio** (pipeline sidebar) | **MVP, relocated** | Token cost is set per job at posting (`TokenCostSelector`, 1–3, in `JobForm`). The pipeline header shows it read-only. No sidebar control, and no change after the first application (F9). |
| **Metric cards** | **MVP (reduced)** | Applicant: Available credits (+ "resets in N days"), Active applications. Recruiter: Applicants / New / Shortlisted / Repo reviews done. **Dropped:** "Matched jobs ≥85%", "+4 new today", "99.8% purity", "Zero spam", "31.5% ratio". These are either not computable or vanity numbers. |
| **"Trusted by 14,000+ software engineers"** | **Drop** | An unverifiable social-proof claim before launch is misleading. Replaced by the three factual value bullets (with "10 monthly credits", "Find connections at companies", "Recruiter-side code reviews"). |
| Bookmark / save job | Later | Not in the spec; needs a table. |
| "Schedule Interview", "Request Referral Check", "Move to Review" | Later / Drop | Messaging is Later. "Move to Review" is replaced by Shortlist. |
| Internal Connections Detector (post-job sidebar) | Drop | Exposes applicants' connection graphs to recruiters (PII). |
| Live marketplace card preview (post-job) | **MVP** | Cheap: it reuses `JobCard`. |
| Draft auto-save | Later | Explicit "Save as draft" in MVP. |
| "Recent Activity" sidebar (dashboard) | **MVP** | It's the applicant status widget: latest 3 from `my_applications` + "View all". The "Code Evaluation 9.2/10" line is **removed** (applicants can't see ratings). |
| "Why application credits?" card | MVP | Static copy, no cost. Fix the claim to remove "3× higher response rate". |
| Skill tags with matching weights | Later | `requirements` is free text in MVP. |
| "Verified Organization" badge, Org ID | Badge MVP, Org ID Drop | The badge comes from `companies.verification_status`. Org ID is noise. |
| "MVP" pill in navbar, "Network Map" nav item | Drop | Not a product feature. |

---

## 8. Accessibility, responsiveness, performance, testing

### 8.1 Accessibility (target WCAG 2.2 AA)

- Contrast: all text ≥ 4.5:1 (muted floor `#64748B`). Badge text uses the `*-fg` darks (`#065F46`, `#92400E`, `#1E40AF`) on the subtle backgrounds.
- Focus: visible 3 px `ring` on every interactive element. No `outline: none` without a replacement. A skip link to `<main>` comes first in `AppShell`.
- Colour is never the only signal: score badges carry number + word, and status chips carry text.
- Live regions: fit polling, upload/parse phases and the balance change after Apply (`aria-live="polite"`). Toasts via sonner (`role=status`).
- Dialogs and sheets: Radix focus trap, `aria-labelledby`, Esc to close (except while Apply is in flight). Return focus to the trigger.
- `FileDropzone`: a real `<button>` opens the picker. Drag-and-drop is an enhancement. Errors are linked with `aria-describedby`.
- Forms: `<Label htmlFor>`, `aria-invalid`, error text below the input, and focus on the first invalid field on submit.
- Ranked list: `<ol>` with `aria-label="Applicants ranked by …"`. Each row has a heading (the name). Keyboard shortcuts are opt-out and documented.
- The resume is shown as extracted text (screen-reader friendly). Any future PDF iframe gets a `title`.
- `prefers-reduced-motion` disables the number tween and skeleton shimmer.
- An automated axe check runs in Playwright on every page (zero serious or critical violations is a CI gate).

### 8.2 Responsiveness

| Breakpoint | Behaviour |
|---|---|
| `< 640` | Single column, 16 px margins. Nav collapses to a Sheet (the balance pill stays visible in the header). `CheckFitPanel` becomes a bottom sheet. ApplicantRow stacks, with the RepoScoreCard as a 2×2 grid. Applicant detail uses tabs (Overview / Resume). |
| `640–1023` | 8-column grid. Sidebars (Recent Activity, post-job preview) move below the main content. |
| `≥ 1024` | Main + 360 px sidebar. Post-job preview is sticky. Applicant detail has 2 columns. |
| `> 1440` | Container clamped at 1280 px. |

Playwright runs every E2E flow at **1280×800** and **390×844**.

### 8.3 Performance

- RSC by default. `"use client"` only on interactive islands (ApplyDialog, CheckFitPanel, FileDropzone, filters, StatusActions, TokenBalancePill).
- Budgets (gzip, first-load JS): `/jobs` ≤ 130 KB, `/recruiter/jobs/[jobId]` ≤ 160 KB, `(auth)` ≤ 90 KB. Checked in CI with `@next/bundle-analyzer` output + `size-limit`.
- `next/dynamic` for the `fflate` ZIP pre-scan (onboarding only) and react-hook-form on pages that need it.
- No icon font (lucide tree-shaken), `next/font` self-hosted, `next/image` for company logos (Supabase Storage remote pattern).
- Streaming: `loading.tsx` per route + `<Suspense>` around the slow parts (latest fits, applicant list), so the shell paints first.
- Targets: LCP < 2.0 s, CLS < 0.05, INP < 200 ms on `/jobs` (Vercel Speed Insights).
- Polling limits in §5.3. Lists are paginated at 20.

### 8.4 Frontend testing

| Layer | Tooling | What |
|---|---|---|
| Unit / component | **Vitest + Testing Library + jsdom**, **MSW** for `/api/v1` | `MatchScoreBadge` band boundaries (49.99/50/69.99/70/84.99/85, null, pending, stale). `StatusChip` labels per audience. `TokenBalancePill` optimistic decrement and **rollback** on 402/409/500. `ApplyDialog`: key stable across retry, **new key when the URL changes**, step order, the confirm button disabled during the request, each error code → UI. `FileDropzone` rejects >5 MB and wrong extensions, keyboard activation. `useFitEvaluation` interval backoff and stop (fake timers). `JobForm` zod errors + locked fields. `apiFetch` error parsing. Copy terminology (`formatCredits`). |
| Boundary | ESLint rule test + a build-time check | `grep` of the applicant route bundles (`.next/static/chunks/app/(applicant)`) for `securityScore`/`RepoScoreCard` must be empty. |
| E2E | **Playwright** against local Supabase + Inngest dev + OpenRouter mocked (MSW / fixture server), seeded users | (1) Sign-up email → verify (Inbucket) → role → applicant onboarding with fixture ZIP + PDF → `/jobs` shows 10 credits. (2) Recruiter sign-up with a work email → pending → admin approves → verified → post a technical job (cost 3). (3) Check fit: 202 → poll → score + connections. Second click is a cache hit. (4) Apply to a technical job: bad repo → 422 field error, nothing spent. Good repo → balance 10→7, status page, double-click creates a single application. (5) Insufficient credits disables Apply. (6) Recruiter ranked list: order matches the seeded ranking, sort/filter via URL, shortlist + reject (confirm), tier groups and provisional badges on the applicant-ranking §6.1 fixture (order A1…A12), the fairness notice visible, resume text shown and Download issuing a signed URL, Reveal email only after shortlisting, a "Rankings updated" banner when a seeded review completes between pages. (7) Applicant sees "Shortlisted" and **no ratings anywhere** (asserts the DOM and network responses contain no `security`). (8) Middleware redirects matrix (§3.3). Every flow runs at desktop + mobile, with axe. |
| Visual | Playwright `toHaveScreenshot` | **Phase 1:** for the 5 Stitch screens, seed data that mirrors the mock and capture our page at 1280 px. The designer and frontend review it side by side against `design/stitch/*/screen.png` (checklist: spacing, type scale, colours, radii), since pixel diffs against Stitch can't pass because the content intentionally differs. **After sign-off:** our own screenshots become baselines (threshold 0.1%) and catch regressions. Deterministic fonts, frozen time, mocked avatars. |

---

## 9. Edge cases

- The user opens Apply in two tabs. Both have different keys, and the RPC's unique `(job_id, applicant_id)` makes the second return `ALREADY_APPLIED`. The UI navigates to the existing application.
- Balance changes between dialog open and submit (spent in another tab). The server returns 402, we roll back and show the fresh balance.
- Month rolls over while the dialog is open. The server is the authority, and the post-settle refetch shows the new balance and reset date.
- Job closed while the applicant is on the detail page → `JOB_NOT_OPEN` → refresh shows "This job is closed".
- Fit check pending when the applicant replaces their resume. The old result is marked stale when it arrives (F5 `is_stale`).
- The LinkedIn ZIP has none of the 5 files (wrong archive): the checklist is all missing, and upload is blocked client-side with an explanation.
- Huge Connections.csv (30k rows): parse phase only. The UI never renders the full list; `ConnectionsCallout` shows at most 3 names + count.
- OAuth sign-in with an email that already has a password account: Supabase links or errors. We show the Supabase message on `/sign-in` with "Sign in with email instead".
- Recruiter's membership is revoked while on a page: the next RSC request gets an RLS-empty result or a guard `FORBIDDEN` → redirect to `/recruiter/pending`.
- Signed resume URL expires before the download starts (slow network): Retry requests a fresh URL.
- Applicant deletes their LinkedIn data from `/profile` (allowed, privacy right): a banner on `/jobs` asks them to re-upload; Check fit and Apply return `CONFLICT {reason:'linkedin_required'}` until they do (D-39), and existing fits go stale.
- JS disabled or hydration failure: RSC pages still render. Apply needs JS (a dialog), so a `<noscript>` notice is shown.

---

## 10. Review notes

_No separate review notes were filed. Cross-review items are tracked in §1.1 and resolved below._

## Resolution

_Lead, pass 2. IDs refer to the [MASTER_PLAN Decision log](../MASTER_PLAN.md#13-decision-log)._

| Item | Outcome |
|---|---|
| F1 claims | `app_role`, `onboarded`, `membership_status` (D-24). §1.1 has been updated. |
| F2 location and work mode | **MVP.** `jobs.location` and `jobs.work_mode` (D-21). Compensation is Later. |
| F3 / F17 onboarding | **LinkedIn import and resume both required (product owner, D-39)**, reversing D-08. §1.1 and §6.1 have been updated: no skip, explicit error and retry states. |
| F4 connections | **Separate parallel call (D-22).** §1.1, §4.1 and §6.2 have been updated. |
| F5 latest fit per job | **`my_latest_fits(p_job_ids)`** (D-23). The app computes staleness. |
| F6 direct uploads | **Accepted.** The endpoint names are Backend's (D-27). §5.7 has been updated. |
| F7 terminology | **"Credits" in every UI label, message and email (product owner, D-37).** Code, DB and API stay `token`. |
| F8–F10, F12–F14 | Resolved as marked. Withdraw is MVP (D-19). |
| F11 pending recruiters | **Drafts allowed (D-09).** §1.1 and §3.3 have been updated. |
| F15 admin queue | **MVP**, built in Phase 2 as a minimal table (MASTER_PLAN §11). |
| F16 resume viewer | **Text-first + download (D-13).** |
| Sign-up role and password | Backend's B2 mechanism (D-25). Minimum password length is 10. §6.1 has been updated. |
| Job field limits, CSV size | The shared zod schemas are the single source (D-31). §6.1 and §6.4 have been updated. |
| Failed review copy | "Review unavailable: listed under Incomplete" (D-06). §4.2 and §6.7 have been updated. |
| Theme | **Light only** (product owner, D-47). §2.7 has been updated. The Obsidian design file is unused. |
| Repo ownership | `ApplyDialog` step 1 adds a required checkbox: "This repository is my own work, or I am a major contributor" (`repoOwnershipAttested`, D-16). `RepoScoreCard` shows `repoFullName` with "Ownership not verified". |
