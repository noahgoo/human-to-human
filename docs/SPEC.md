# Product Spec (input) & Locked Decisions

This is the original product spec the planning agents worked from. Bracketed choices have been resolved below.

## Locked decisions

| Topic | Decision | Source |
|---|---|---|
| Stack | Next.js (App Router, TypeScript, Tailwind) + Supabase (Postgres, Auth, Storage, RLS) | User |
| Hosting | Vercel (app) + Supabase (managed Postgres/Storage) | User |
| AI provider | OpenRouter (model per task chosen in the AI Evaluation sub-plan) | User |
| Tokens | 10 per applicant per calendar month, **no rollover** | User |
| Job token cost | **Set by recruiter, 1–3** | User |
| GitHub review categories | Security, Organization, Performance, **Testing** | User |
| GitHub ratings visibility | **Hidden from applicant**; recruiters only | User |
| Ranking weights | **70% confidence / 30% GitHub** on technical jobs; confidence only on non-technical | User |
| Auth methods | Email/password + Google + LinkedIn (OIDC) | Default |
| LinkedIn upload | Full ZIP export **or** individual CSVs (Profile, Positions, Skills, Education, Connections) | Default |
| Resume | PDF or DOCX, max 5 MB | Default |
| GitHub repo | Public repos only; static review, never executed | Default |
| Company verification | Agents propose (default: work-email domain + admin approval fallback) | Default |
| Recruiters per company | Multiple | Default |
| Recruiter actions | MVP: shortlist / reject. Messaging is a later feature | Default |

## Original spec

### Auth & roles
- Sign in with [email/password | Google | LinkedIn OAuth]. At sign-up, user picks a role: Applicant or Recruiter.
- First-time users go to onboarding for their role.

### Applicant onboarding
- Upload LinkedIn data export ([ZIP | these CSVs: Profile, Positions, Skills, Education, Connections]).
- Upload resume ([PDF/DOCX]).

### Applicant dashboard
- List of open jobs, each showing its token cost.
- Each applicant gets 10 tokens per month; unused tokens [do/don't] roll over.
- "Check fit" button (free): compares LinkedIn + resume to the job requirements and shows a 0–100 confidence score with a short explanation. Also lists any of the applicant's LinkedIn connections who currently work at that company (matched from Connections.csv).
- "Apply" button: spends the job's token cost and submits the application.
- If the job is marked technical, the applicant is asked for a [public] GitHub repo link. An AI model reviews the code (static review, not execution) and rates it 1–10 on: Security, Organization, Performance, [4th category]. [Applicant does/doesn't see the ratings.]
- Applicant can see the status of each application.

### Recruiter onboarding
- Recruiter creates an account linked to a company. Company verification via [work email domain | admin approval | agents propose an approach, given LinkedIn API limits].
- [One | multiple] recruiters per company.

### Recruiter dashboard
- Create job postings: title, description, requirements, token cost [set by recruiter | calculated by system], and a "technical role" checkbox.
- See all their postings and the applicants for each.
- Applicants are ranked by [confidence score + GitHub score, weighted X/Y], showing confidence score, GitHub ratings, and resume.
- Recruiter can [shortlist / reject / message] applicants.

### Required planning outputs
- Master plan: tech stack recommendation, data model, API endpoints, page list, MVP vs. later features, phased build order, and risks (especially LinkedIn API limits and data privacy).
- Sub-plans (each with owner agent, reviewers, data model changes, API endpoints, edge cases, testing approach): AI Evaluation, Applicant Ranking, and optionally LinkedIn Data Ingestion, Token System, Company Verification.

## Design input
The Stitch export in [`design/stitch/`](../design/stitch/) ("NexusPulse" branding). Five MVP screens: sign-in, candidate onboarding, job marketplace, post-a-job, recruiter pipeline. Two design systems: Grounded Modern Utility (light, primary) and Obsidian Kinetic Intelligence (dark). See [`nexuspulse_mvp_design_system_export_specs.md`](../design/stitch/nexuspulse_mvp_design_system_export_specs.md).
