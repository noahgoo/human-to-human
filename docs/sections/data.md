# Data: schema, RLS, privacy, migrations

**Owner:** Data Engineer
**Reviewers:** Backend, Lead

> Inputs: [`SPEC.md`](../SPEC.md) (locked decisions) and [`MASTER_PLAN.md`](../MASTER_PLAN.md) §4–§6 (canonical names). Every table, enum, view and function name below is canonical unless it is marked **NEW**, in which case it is listed in "Proposed additions" for the Lead's Decision log.
> Related sub-plans owned by Data: [`linkedin-ingestion.md`](../subplans/linkedin-ingestion.md), [`applicant-ranking.md`](../subplans/applicant-ranking.md).

---

## 1. Open questions, risks, assumptions

### 1.1 Open questions (each has a default that we build with)

| # | Question | Default (built unless overridden) | Needs |
|---|---|---|---|
| D1 | Applications should point at the resume the recruiter sees. If the applicant uploads a new resume after applying, which one does the recruiter get? | **Snapshot.** Add `applications.resume_id` (set by `apply_to_job` from `applicant_profiles.active_resume_id`). The recruiter always sees the resume that was active at Apply time. If the applicant deletes it, `resume_id` goes null and the UI says "Resume removed by applicant". | Backend to add to `apply_to_job` |
| D2 | Can recruiters ever see an applicant's email? | **Only after shortlisting**, through the SECURITY DEFINER function `get_applicant_contact(application_id)`. `profiles.email` is not column-granted to `authenticated` at all. | Lead, Frontend |
| D3 | Can recruiters see an applicant's parsed LinkedIn data (positions, skills, education)? | **No (MVP).** Recruiters see the resume, confidence and GitHub ratings only. LinkedIn tables are owner-only. Revisit with a consent toggle later. | Lead |
| D4 | One recruiter, many companies? | **One non-rejected membership per recruiter** (partial unique index). Multiple recruiters per company is supported (locked). | Backend (company-verification) |
| D5 | Hiding GitHub ratings from applicants vs. the GDPR right of access (Art. 15). AI-generated ratings about a person are personal data. | **The in-product UI and the self-service export hide ratings** (locked decision). A formal data-subject access request (DSAR) made to support is fulfilled in full, ratings included, through a service-role script. Counsel must confirm. | Lead (legal) |
| D6 | Column-level encryption (pgsodium TCE / Vault) for PII columns? | **No column-level encryption in MVP.** Rely on Supabase disk encryption (AES-256), RLS, column grants and minimisation. Vault holds only secrets (Inngest event key for the pg_cron sweeper). Reasoning is in §7.3. | Lead |
| D7 | `audit_log` is not in the canonical table list. | **Add it (NEW).** Needed for resume access, status changes, verification decisions, exports and deletions. | Lead (Decision log) |
| D8 | `company_aliases` is not in the canonical list. | **Add it (NEW).** Needed for connection matching (see linkedin-ingestion.md). | Lead (Decision log) |
| D9 | Where do the parsed Profile.csv fields go? | **Columns on `linkedin_imports`**: `headline`, `summary`, `industry`, `geo_location`. Address, birth date, zip code, maiden name, Twitter and IM handles are dropped at parse time. | Backend (fit prompt reads them) |
| D10 | Storage bucket name: the task said "linkedin-imports", the brief says `linkedin-exports`. | **`linkedin-exports`** (brief wins). | None |

### 1.2 Risks

- **RLS bypass by the service role.** Inngest functions use the service role, so a bug there can write across tenants. Mitigation: every service-role write goes through a small set of typed helpers in `lib/supabase/admin.ts` that always filter by `applicant_id`; pgTAP covers the RPCs; Inngest functions never read user-supplied table names or ids without validating ownership first.
- **Leakage through views.** A `security_definer` view would bypass RLS. Mitigation: all views are `security_invoker = true`, and pgTAP asserts it (`pg_class.reloptions`). `job_applicant_rankings` additionally filters on `is_company_member()`.
- **Column grants surprise developers.** `select *` on `profiles` fails for `authenticated` because `email` is not granted. Mitigation: documented here; generated types still show `email`, so the Frontend lint rule is "select explicit columns". pgTAP asserts the grant.
- **Generated columns depend on `normalize_company_name()`.** Changing the function does not recompute stored values. Mitigation: any migration that changes the function must also run `update … set company_name = company_name` on `connections`, `linkedin_positions`, `companies` and `company_aliases` (all generated columns recompute on any UPDATE).
- **Third-party PII in `connections`.** People who never consented. Mitigation: minimisation (§7.2), owner-only RLS, no recruiter or admin access, hard delete, no use in LLM prompts.
- **Large exports.** Up to 30,000 connections per applicant (LinkedIn's cap). With 10k users that is at most 300M rows in the worst case; realistically ~500 per user, so about 5M rows. Indexes are sized for that.
- **Supabase blocks direct SQL deletes from `storage.objects`.** Raw file and account deletion must go through the Storage API, so they run in Inngest, not in pg_cron.

### 1.3 Assumptions

- Postgres 15+ (Supabase default), so `ON DELETE SET NULL (column_list)` is available.
- Extensions: `pgcrypto`, `pg_trgm`, `unaccent` (all in schema `extensions`), `pg_cron`, `pg_net`, `supabase_vault`, `pgtap` (tests only).
- Only `public` is exposed through PostgREST. Internal helpers live in schema `private`, which is not exposed. `authenticated` gets `USAGE` on `private` so RLS policies can call the helpers.
- The UTC month is the token period (brief OQ1).
- All timestamps are `timestamptz` and stored in UTC.

---

## 2. Design

### 2.1 Principles
1. **RLS is the authorization layer.** Every table has RLS enabled with deny by default. Every client query goes through PostgREST with the user's JWT.
2. **Writes that touch several rows or need invariants go through RPCs** (`SECURITY DEFINER`, `set search_path = ''`, explicit ownership checks). Clients get INSERT/UPDATE policies only where a single row with a simple ownership check is enough.
3. **Explicit grants.** Migration 0001 revokes all default privileges on `public` from `anon` and `authenticated`. Each table then gets exactly the grants it needs. `anon` gets nothing (the job board is sign-in only).
4. **Policies use `(select auth.uid())`** so Postgres evaluates it once per statement (initPlan), not once per row.
5. **Helpers are `SECURITY DEFINER STABLE`**, so a policy on table A can check table B without recursing into B's RLS.

### 2.2 Roles used in this document

| Label | How it is determined |
|---|---|
| `anon` | No JWT. |
| **Applicant** | `authenticated` and `profiles.role = 'applicant'`. |
| **Recruiter (member)** | `authenticated`, `profiles.role = 'recruiter'` and a `recruiter_memberships` row with `verification_status = 'verified'` for the company in question. |
| **Recruiter (pending)** | Recruiter whose membership is `pending` or `rejected`. |
| **Admin** | `profiles.role = 'admin'` (seeded by hand, brief OQ5). |
| `service_role` | Inngest functions and `lib/supabase/admin.ts`. Bypasses RLS. |

---

## 3. Data model changes: full DDL

Migration files live in `supabase/migrations/` with timestamp prefixes (§9). The DDL below is grouped by migration.

### 3.1 Extensions, schemas, enums (`…_0001_foundation.sql`)

```sql
create extension if not exists pgcrypto  with schema extensions;
create extension if not exists pg_trgm   with schema extensions;
create extension if not exists unaccent  with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net    with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- deny by default: nothing in public is readable unless granted below
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- canonical enums (MASTER_PLAN §4)
create type public.user_role           as enum ('applicant', 'recruiter', 'admin');
create type public.application_status  as enum ('submitted', 'shortlisted', 'rejected', 'withdrawn');
create type public.job_status          as enum ('draft', 'open', 'closed', 'archived');
create type public.verification_status as enum ('pending', 'verified', 'rejected');
create type public.evaluation_status   as enum ('pending', 'running', 'succeeded', 'failed');
create type public.token_entry_kind    as enum ('monthly_grant', 'application_spend', 'refund', 'adjustment');

-- supporting enums (Data)
create type public.linkedin_import_source as enum ('zip', 'csv');

-- shared trigger
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
```

### 3.2 `normalize_company_name` (`…_0002_normalize.sql`)

Declared `IMMUTABLE` so it can back generated columns. `unaccent(regdictionary, text)` is only STABLE; wrapping it in an IMMUTABLE function with the dictionary named explicitly is the standard Supabase-safe pattern. Rules and test vectors are in [linkedin-ingestion.md §Company-name normalisation](../subplans/linkedin-ingestion.md).

```sql
create or replace function public.normalize_company_name(p_name text)
returns text
language plpgsql immutable parallel safe
set search_path = ''
as $$
declare
  s text;
  prev text;
  suffix_re constant text :=
    '\s(inc|incorporated|llc|llp|lp|ltd|limited|corp|corporation|co|company|plc|gmbh|mbh|ag|kg|se|sa|sas|sarl|srl|spa|bv|nv|pty|pvt|private|oy|oyj|ab|as|asa|aps|kk|ulc|group|holdings|and)$';
begin
  if p_name is null or btrim(p_name) = '' then return null; end if;
  s := lower(extensions.unaccent('extensions.unaccent'::regdictionary, p_name));
  s := regexp_replace(s, '\.(com|io|ai|co|net|org)\b', '', 'g');   -- booking.com -> booking
  s := replace(s, '&', ' and ');
  s := replace(s, '.', '');                                          -- l.l.c. -> llc, s.a. -> sa
  s := regexp_replace(s, '[^a-z0-9]+', ' ', 'g');                    -- other punctuation -> space
  s := btrim(regexp_replace(s, '\s+', ' ', 'g'));
  s := regexp_replace(s, '^the\s', '');
  loop                                                               -- strip trailing legal suffixes repeatedly
    prev := s;
    s := btrim(regexp_replace(s, suffix_re, ''));
    exit when s = prev or s = '';
  end loop;
  if s in ('self employed','self','freelance','freelancer','independent','independent consultant',
           'stealth','stealth startup','stealth mode','retired','unemployed','confidential','none',
           'n a','na','various','student','open to work','seeking opportunities') then
    return null;                                                     -- generic "employers" never match a company
  end if;
  if s = '' then                                                     -- never normalise a name to empty
    s := btrim(regexp_replace(regexp_replace(lower(p_name), '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g'));
  end if;
  return nullif(s, '');
end $$;

grant execute on function public.normalize_company_name(text) to authenticated, service_role;
```

### 3.3 Identity (`…_0003_identity.sql`)

```sql
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          public.user_role,                         -- null until chosen; then immutable (trigger)
  full_name     text check (char_length(full_name) <= 200),
  avatar_url    text check (char_length(avatar_url) <= 2048),
  email         text not null,                            -- mirrored from auth.users; NOT granted to authenticated
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);
create index profiles_role_idx on public.profiles(role);

create table public.applicant_profiles (
  profile_id                 uuid primary key references public.profiles(id) on delete cascade,
  headline                   text check (char_length(headline) <= 220),
  target_seniority           text check (target_seniority in
                               ('intern','junior','mid','senior','staff','principal','manager','director','executive')),
  location_pref              text check (char_length(location_pref) <= 200),
  active_resume_id           uuid,                        -- FK added in 0006 (circular)
  active_linkedin_import_id  uuid,                        -- FK added in 0005 (circular)
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz
);

-- new auth user -> profile row
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          new.raw_user_meta_data->>'avatar_url');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.sync_user_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.sync_user_email();

-- role is write-once, and 'admin' only via service role / SQL
create or replace function private.guard_profile_role() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.role is distinct from old.role then
    if old.role is not null then
      raise exception 'role is immutable' using errcode = 'P0001', hint = 'FORBIDDEN';
    end if;
    if new.role = 'admin' and current_user not in ('postgres', 'service_role', 'supabase_admin') then
      raise exception 'cannot self-assign admin' using errcode = 'P0001', hint = 'FORBIDDEN';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard_role before update on public.profiles
  for each row execute function private.guard_profile_role();

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger applicant_profiles_updated_at before update on public.applicant_profiles
  for each row execute function public.set_updated_at();
```

### 3.4 Companies and recruiters (`…_0004_companies.sql`)

```sql
create table public.companies (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (char_length(btrim(name)) between 1 and 200),
  name_normalized      text generated always as (public.normalize_company_name(name)) stored,
  website              text check (website ~* '^https://'),
  logo_url             text check (char_length(logo_url) <= 2048),
  verification_status  public.verification_status not null default 'pending',
  verified_at          timestamptz,
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz,
  check ((verification_status = 'verified') = (verified_at is not null))
);
-- two verified companies cannot share a normalised name
create unique index companies_name_norm_verified_uq on public.companies(name_normalized)
  where verification_status = 'verified';
create index companies_name_norm_trgm on public.companies using gin (name_normalized extensions.gin_trgm_ops);

-- NEW: alternative names used for connection matching
create table public.company_aliases (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  alias             text not null check (char_length(btrim(alias)) between 1 and 200),
  alias_normalized  text generated always as (public.normalize_company_name(alias)) stored,
  source            text not null check (source in ('admin', 'domain', 'seed')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  unique (company_id, alias_normalized)
);
create index company_aliases_norm_idx on public.company_aliases(alias_normalized);

create table public.company_domains (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id) on delete cascade,
  domain               text not null unique
                         check (domain = lower(domain)
                                and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  verification_status  public.verification_status not null default 'pending',
  verification_method  text check (verification_method in ('email_otp', 'dns_txt', 'admin')),
  verified_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz
);
create index company_domains_company_idx on public.company_domains(company_id);

create table public.recruiter_memberships (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id) on delete cascade,
  profile_id           uuid not null references public.profiles(id) on delete cascade,
  verification_status  public.verification_status not null default 'pending',
  verified_via         text check (verified_via in ('email_domain', 'admin')),
  verified_at          timestamptz,
  verified_by          uuid references public.profiles(id) on delete set null,
  is_company_admin     boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz,
  unique (company_id, profile_id),
  check ((verification_status = 'verified') = (verified_at is not null and verified_via is not null))
);
-- D4: at most one live membership per recruiter
create unique index recruiter_memberships_one_live_uq on public.recruiter_memberships(profile_id)
  where verification_status <> 'rejected';
create index recruiter_memberships_company_verified_idx on public.recruiter_memberships(company_id, profile_id)
  where verification_status = 'verified';

-- a verified domain contributes its first label as an alias ('stripe.com' -> 'stripe')
create or replace function private.alias_from_domain() returns trigger
language plpgsql security definer set search_path = '' as $$
declare label text := split_part(new.domain, '.', 1);
begin
  if new.verification_status = 'verified' and char_length(label) >= 3
     and label not in ('mail','email','corp','team','careers','jobs','hr','www') then
    insert into public.company_aliases (company_id, alias, source)
    values (new.company_id, label, 'domain')
    on conflict (company_id, alias_normalized) do nothing;
  end if;
  return new;
end $$;
create trigger company_domains_alias after insert or update of verification_status on public.company_domains
  for each row execute function private.alias_from_domain();

-- updated_at triggers on all four tables (omitted for brevity; same pattern as 0003)
```

Inserts into `companies`, `company_domains` and `recruiter_memberships` happen through Backend's company-verification RPCs (SECURITY DEFINER). Clients have no INSERT policy on them.

### 3.5 Jobs (`…_0004_companies.sql`, continued)

```sql
create table public.jobs (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  created_by    uuid references public.profiles(id) on delete set null,
  title         text not null check (char_length(btrim(title)) between 3 and 150),
  description   text not null check (char_length(description) between 1 and 20000),
  requirements  text not null check (char_length(requirements) between 1 and 10000),
  location      text check (char_length(location) <= 200),
  token_cost    smallint not null check (token_cost between 1 and 3),
  is_technical  boolean not null default false,
  status        public.job_status not null default 'draft',
  published_at  timestamptz,
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  check (status = 'draft' or published_at is not null)
);
create index jobs_open_idx    on public.jobs(published_at desc, id) where status = 'open';
create index jobs_company_idx on public.jobs(company_id, status);

-- invariants clients cannot break
create or replace function private.guard_job_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.company_id <> old.company_id then
    raise exception 'company_id is immutable' using errcode = 'P0001', hint = 'VALIDATION_FAILED';
  end if;
  if new.is_technical <> old.is_technical
     and exists (select 1 from public.applications a where a.job_id = old.id) then
    raise exception 'is_technical is locked once applications exist' using errcode = 'P0001', hint = 'CONFLICT';
  end if;
  if old.status = 'archived' and new.status <> 'archived' then
    raise exception 'archived jobs cannot be reopened' using errcode = 'P0001', hint = 'CONFLICT';
  end if;
  if new.status <> 'draft' and old.status = 'draft' and new.status <> 'open' then
    raise exception 'draft can only move to open' using errcode = 'P0001', hint = 'CONFLICT';
  end if;
  if new.status = 'draft' and old.status <> 'draft' then
    raise exception 'cannot return to draft' using errcode = 'P0001', hint = 'CONFLICT';
  end if;
  if new.status = 'open' and old.status <> 'open' then
    new.published_at := coalesce(old.published_at, now());
    new.closed_at := null;
  elsif new.status in ('closed', 'archived') and old.status = 'open' then
    new.closed_at := now();
  end if;
  return new;
end $$;
create trigger jobs_guard before update on public.jobs
  for each row execute function private.guard_job_update();
```

Allowed job transitions: `draft → open`, `open ⇄ closed`, `open|closed → archived`. Opening a job also requires the company to be `verified` (checked in the INSERT/UPDATE policy, §4).

### 3.6 LinkedIn data (`…_0005_linkedin.sql`)

```sql
create table public.linkedin_imports (
  id              uuid primary key default gen_random_uuid(),
  applicant_id    uuid not null references public.profiles(id) on delete cascade,
  source          public.linkedin_import_source not null,
  status          public.evaluation_status not null default 'pending',
  files_present   text[] not null default '{}'
                    check (files_present <@ array['Profile.csv','Positions.csv','Skills.csv','Education.csv','Connections.csv']),
  counts          jsonb not null default '{}'::jsonb,   -- {"connections":{"parsed":1428,"skipped":3}, ...}
  warnings        jsonb not null default '[]'::jsonb,   -- [{file, code, row, message}], capped at 50 entries
  error           text,                                 -- error code, see linkedin-ingestion.md
  error_detail    jsonb,
  -- Profile.csv, minimised (D9)
  headline        text check (char_length(headline) <= 300),
  summary         text check (char_length(summary) <= 5000),
  industry        text check (char_length(industry) <= 200),
  geo_location    text check (char_length(geo_location) <= 200),
  raw_deleted_at  timestamptz,                          -- set when the raw files are removed from Storage
  started_at      timestamptz,
  parsed_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  unique (id, applicant_id),
  check (status <> 'failed' or error is not null),
  check (status <> 'succeeded' or parsed_at is not null)
);
create index linkedin_imports_applicant_idx on public.linkedin_imports(applicant_id, created_at desc);
create index linkedin_imports_raw_pending_idx on public.linkedin_imports(created_at) where raw_deleted_at is null;

alter table public.applicant_profiles
  add constraint applicant_profiles_active_import_fk
  foreign key (active_linkedin_import_id, profile_id)
  references public.linkedin_imports(id, applicant_id)
  on delete set null (active_linkedin_import_id);

create table public.linkedin_positions (
  id                       uuid primary key default gen_random_uuid(),
  import_id                uuid not null,
  applicant_id             uuid not null,
  company_name             text not null check (char_length(company_name) <= 300),
  company_name_normalized  text generated always as (public.normalize_company_name(company_name)) stored,
  title                    text check (char_length(title) <= 300),
  description              text check (char_length(description) <= 5000),
  location                 text check (char_length(location) <= 200),
  started_on               date,                       -- first of month when export gives "Jan 2020"
  ended_on                 date,                       -- null = current position
  is_current               boolean generated always as (ended_on is null) stored,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz,
  foreign key (import_id, applicant_id) references public.linkedin_imports(id, applicant_id) on delete cascade,
  check (ended_on is null or started_on is null or ended_on >= started_on)
);
create index linkedin_positions_import_idx on public.linkedin_positions(import_id);

create table public.linkedin_skills (
  id            uuid primary key default gen_random_uuid(),
  import_id     uuid not null,
  applicant_id  uuid not null,
  name          text not null check (char_length(btrim(name)) between 1 and 200),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  foreign key (import_id, applicant_id) references public.linkedin_imports(id, applicant_id) on delete cascade
);
create unique index linkedin_skills_uq on public.linkedin_skills(import_id, lower(name));

create table public.linkedin_education (
  id            uuid primary key default gen_random_uuid(),
  import_id     uuid not null,
  applicant_id  uuid not null,
  school        text not null check (char_length(school) <= 300),
  degree        text check (char_length(degree) <= 300),
  notes         text check (char_length(notes) <= 2000),
  started_on    date,
  ended_on      date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  foreign key (import_id, applicant_id) references public.linkedin_imports(id, applicant_id) on delete cascade
);
create index linkedin_education_import_idx on public.linkedin_education(import_id);

-- THIRD-PARTY PII. Minimal columns only (§7.2). No email, no URL, no URL hash.
create table public.connections (
  id                       uuid primary key default gen_random_uuid(),
  import_id                uuid not null,
  applicant_id             uuid not null,
  first_name               text not null default '' check (char_length(first_name) <= 100),
  last_name                text not null default '' check (char_length(last_name) <= 100),
  company_name             text check (char_length(company_name) <= 300),
  company_name_normalized  text generated always as (public.normalize_company_name(company_name)) stored,
  position                 text check (char_length(position) <= 300),
  connected_on             date,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz,
  foreign key (import_id, applicant_id) references public.linkedin_imports(id, applicant_id) on delete cascade,
  check (first_name <> '' or last_name <> '')
);
create index connections_match_idx on public.connections(applicant_id, import_id, company_name_normalized);
create index connections_norm_trgm on public.connections using gin (company_name_normalized extensions.gin_trgm_ops);
create index connections_import_idx on public.connections(import_id);
```

### 3.7 Resumes (`…_0006_resumes.sql`)

```sql
create table public.resumes (
  id                 uuid primary key default gen_random_uuid(),
  applicant_id       uuid not null references public.profiles(id) on delete cascade,
  storage_path       text not null unique,              -- '{applicant_id}/{id}.pdf' inside bucket 'resumes'
  original_filename  text check (char_length(original_filename) <= 255),
  mime_type          text not null check (mime_type in (
                       'application/pdf',
                       'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes         integer not null check (size_bytes > 0 and size_bytes <= 5242880),   -- 5 MB, locked
  sha256             text check (sha256 ~ '^[0-9a-f]{64}$'),
  text_content       text check (char_length(text_content) <= 100000),
  parse_status       public.evaluation_status not null default 'pending',
  parse_error        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,
  unique (id, applicant_id),
  check (storage_path like applicant_id::text || '/%')
);
create index resumes_applicant_idx on public.resumes(applicant_id, created_at desc);

alter table public.applicant_profiles
  add constraint applicant_profiles_active_resume_fk
  foreign key (active_resume_id, profile_id)
  references public.resumes(id, applicant_id)
  on delete set null (active_resume_id);
```

### 3.8 Evaluations and applications (`…_0007_applications.sql`)

```sql
create table public.fit_evaluations (
  id                  uuid primary key default gen_random_uuid(),
  applicant_id        uuid not null references public.profiles(id) on delete cascade,
  job_id              uuid not null references public.jobs(id) on delete cascade,
  input_hash          text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  status              public.evaluation_status not null default 'pending',
  confidence_score    smallint check (confidence_score between 0 and 100),
  explanation         text check (char_length(explanation) <= 4000),
  model               text,
  prompt_version      text not null,
  resume_id           uuid references public.resumes(id) on delete set null,          -- provenance
  linkedin_import_id  uuid references public.linkedin_imports(id) on delete set null,
  error               text,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz,
  unique (id, applicant_id, job_id),
  check (status <> 'succeeded' or (confidence_score is not null and explanation is not null and completed_at is not null))
);
create index fit_evaluations_cache_idx on public.fit_evaluations(applicant_id, job_id, input_hash, created_at desc)
  where status = 'succeeded';
create index fit_evaluations_sweep_idx on public.fit_evaluations(created_at)
  where status in ('pending', 'running');

create table public.applications (
  id                 uuid primary key default gen_random_uuid(),
  job_id             uuid not null references public.jobs(id) on delete restrict,   -- jobs with applications are archived, never deleted
  applicant_id       uuid not null references public.profiles(id) on delete cascade,
  status             public.application_status not null default 'submitted',
  token_cost         smallint not null check (token_cost between 1 and 3),        -- snapshot of jobs.token_cost
  github_repo_url    text check (github_repo_url ~ '^https://github\.com/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}$'),
  resume_id          uuid,                                                           -- D1 snapshot
  fit_evaluation_id  uuid,
  idempotency_key    uuid not null,
  request_hash       text not null check (request_hash ~ '^[0-9a-f]{64}$'),      -- detects IDEMPOTENCY_KEY_REUSED
  submitted_at       timestamptz not null default now(),
  status_changed_at  timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,
  unique (job_id, applicant_id),
  unique (applicant_id, idempotency_key),
  foreign key (resume_id, applicant_id) references public.resumes(id, applicant_id)
    on delete set null (resume_id),
  foreign key (fit_evaluation_id, applicant_id, job_id) references public.fit_evaluations(id, applicant_id, job_id)
    on delete set null (fit_evaluation_id)
);
create index applications_job_idx       on public.applications(job_id, submitted_at, id);
create index applications_applicant_idx on public.applications(applicant_id, submitted_at desc);

create table public.application_events (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications(id) on delete cascade,
  actor_id        uuid references public.profiles(id) on delete set null,
  from_status     public.application_status,
  to_status       public.application_status not null,
  note            text check (char_length(note) <= 2000),     -- recruiter-internal; never shown to applicants
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);
create index application_events_app_idx on public.application_events(application_id, created_at);

create table public.repo_evaluations (
  id                  uuid primary key default gen_random_uuid(),
  application_id      uuid not null unique references public.applications(id) on delete cascade,
  repo_url            text not null,
  commit_sha          text check (commit_sha ~ '^[0-9a-f]{40}$'),
  status              public.evaluation_status not null default 'pending',
  security_score      smallint check (security_score     between 1 and 10),
  organization_score  smallint check (organization_score between 1 and 10),
  performance_score   smallint check (performance_score  between 1 and 10),
  testing_score       smallint check (testing_score      between 1 and 10),
  overall_score       numeric(4,2) generated always as
                        ((security_score + organization_score + performance_score + testing_score)::numeric / 4) stored,
  rationale           jsonb,     -- {"security":{"summary":"…","evidence":[{"path":"…","lines":"10-24","note":"…"}]}, …}
  files_analyzed      integer check (files_analyzed >= 0),
  bytes_analyzed      bigint  check (bytes_analyzed >= 0),
  failure_code        text,      -- values defined by Backend in ai-evaluation.md
  error               text,
  attempt_count       smallint not null default 0,
  model               text,
  prompt_version      text,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz,
  check (status <> 'succeeded' or (security_score is not null and organization_score is not null
                                   and performance_score is not null and testing_score is not null
                                   and rationale is not null))
);
create index repo_evaluations_sweep_idx on public.repo_evaluations(created_at) where status in ('pending', 'running');

-- terminal evaluations are immutable (the ranking snapshot must not drift)
create or replace function private.guard_terminal_evaluation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status in ('succeeded') and current_user <> 'postgres' then
    raise exception 'evaluation is final' using errcode = 'P0001', hint = 'CONFLICT';
  end if;
  return new;
end $$;
create trigger fit_evaluations_final  before update on public.fit_evaluations
  for each row execute function private.guard_terminal_evaluation();
create trigger repo_evaluations_final before update on public.repo_evaluations
  for each row execute function private.guard_terminal_evaluation();
```

A failed `repo_evaluations` row can be moved back to `pending` (admin re-run). A succeeded row cannot be changed; a re-review would be a new feature with its own history.

### 3.9 Tokens, AI usage, audit (`…_0008_ledger_audit.sql`)

```sql
create table public.token_ledger (
  id              uuid primary key default gen_random_uuid(),
  applicant_id    uuid not null references public.profiles(id) on delete cascade,
  period          text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),     -- 'YYYY-MM' UTC
  kind            public.token_entry_kind not null,
  amount          integer not null,
  application_id  uuid references public.applications(id) on delete set null,
  note            text check (char_length(note) <= 500),
  created_by      uuid references public.profiles(id) on delete set null,          -- admin for adjustments
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  check (
    (kind = 'monthly_grant'     and amount = 10 and application_id is null) or
    (kind = 'application_spend' and amount between -3 and -1 and application_id is not null) or
    (kind = 'refund'            and amount between 1 and 3) or
    (kind = 'adjustment'        and amount <> 0 and note is not null)
  )
);
create unique index token_ledger_grant_uq on public.token_ledger(applicant_id, period) where kind = 'monthly_grant';
create unique index token_ledger_spend_uq on public.token_ledger(application_id)        where kind = 'application_spend';
create index token_ledger_balance_idx on public.token_ledger(applicant_id, period);

create table public.ai_usage (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.profiles(id) on delete set null,
  task           text not null check (task in ('fit', 'repo', 'resume_parse')),
  subject_id     uuid,                       -- fit_evaluations.id / repo_evaluations.id / resumes.id (no FK)
  model          text not null,
  input_tokens   integer check (input_tokens  >= 0),
  output_tokens  integer check (output_tokens >= 0),
  cost_usd       numeric(10,6) check (cost_usd >= 0),
  latency_ms     integer check (latency_ms >= 0),
  status         text not null check (status in ('succeeded', 'failed')),
  error_code     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz
);
create index ai_usage_user_idx on public.ai_usage(user_id, created_at desc);
create index ai_usage_time_idx on public.ai_usage(created_at);

-- NEW (D7). Append-only. actor_id/subject_id have no FK so the record survives account deletion
-- as a pseudonymous trace.
create table public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid,
  action        text not null check (action in (
                  'resume.signed_url', 'application.status_changed', 'application.withdrawn',
                  'company.verification_changed', 'membership.verification_changed',
                  'linkedin.import_replaced', 'linkedin.import_deleted', 'resume.deleted',
                  'account.export', 'account.delete_requested', 'account.deleted',
                  'contact.revealed', 'admin.repo_eval_rerun', 'admin.token_adjustment')),
  subject_type  text,
  subject_id    uuid,
  company_id    uuid,
  metadata      jsonb not null default '{}'::jsonb,   -- never contains PII values; ids and codes only
  request_id    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);
create index audit_log_subject_idx on public.audit_log(subject_id, created_at desc);
create index audit_log_actor_idx   on public.audit_log(actor_id, created_at desc);
create index audit_log_time_idx    on public.audit_log(created_at);

-- append-only tables: no UPDATE, even for service role (cascade DELETE remains possible)
create or replace function private.forbid_update() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception '% is append-only', tg_table_name using errcode = 'P0001', hint = 'FORBIDDEN'; end $$;
create trigger token_ledger_no_update       before update on public.token_ledger       for each row execute function private.forbid_update();
create trigger application_events_no_update before update on public.application_events for each row execute function private.forbid_update();
create trigger audit_log_no_update          before update on public.audit_log          for each row execute function private.forbid_update();

create or replace function private.log_audit(
  p_action text, p_subject_type text, p_subject_id uuid,
  p_company_id uuid default null, p_metadata jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, subject_type, subject_id, company_id, metadata, request_id)
  values ((select auth.uid()), p_action, p_subject_type, p_subject_id, p_company_id, p_metadata,
          nullif(current_setting('request.headers', true)::jsonb->>'x-request-id', ''));
$$;
```

### 3.10 Delete behaviour summary

| Parent deleted | Child | On delete |
|---|---|---|
| `auth.users` | `profiles` | CASCADE (account deletion entry point) |
| `profiles` (applicant) | `applicant_profiles`, `linkedin_imports` → positions/skills/education/connections, `resumes`, `fit_evaluations`, `applications` → `application_events`, `repo_evaluations`; `token_ledger` | CASCADE |
| `profiles` | `ai_usage.user_id`, `jobs.created_by`, `companies.created_by`, `application_events.actor_id`, `recruiter_memberships.verified_by`, `token_ledger.created_by` | SET NULL |
| `profiles` (recruiter) | `recruiter_memberships` | CASCADE |
| `companies` | `company_domains`, `company_aliases`, `recruiter_memberships`, `jobs` | CASCADE (company deletion is admin-only and blocked by `applications.job_id RESTRICT` if any job has applications) |
| `jobs` | `applications` | **RESTRICT** (jobs with applications are archived) |
| `jobs` | `fit_evaluations` | CASCADE |
| `linkedin_imports` | its rows | CASCADE; `applicant_profiles.active_linkedin_import_id` and `fit_evaluations.linkedin_import_id` SET NULL |
| `resumes` | `applications.resume_id`, `applicant_profiles.active_resume_id`, `fit_evaluations.resume_id` | SET NULL (column) |
| `applications` | `application_events`, `repo_evaluations` | CASCADE; `token_ledger.application_id` SET NULL |
| `fit_evaluations` | `applications.fit_evaluation_id` | SET NULL (column) |
| `audit_log` | (no FKs) | survives, pseudonymous |

---

## 4. RLS

### 4.1 Helper functions (`…_0009_rls_helpers.sql`)

```sql
create or replace function public.current_user_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = (select auth.uid())), false)
$$;

-- canonical RLS helper (MASTER_PLAN §4)
create or replace function public.is_company_member(p_company_id uuid, p_require_verified boolean default true)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.recruiter_memberships m
    where m.company_id = p_company_id
      and m.profile_id = (select auth.uid())
      and (not p_require_verified or m.verification_status = 'verified')
  )
$$;

create or replace function private.is_job_member(p_job_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.jobs j
    join public.recruiter_memberships m on m.company_id = j.company_id
    where j.id = p_job_id and m.profile_id = (select auth.uid()) and m.verification_status = 'verified'
  )
$$;

-- recruiter may see this applicant because they applied to one of the recruiter's company jobs
create or replace function private.is_applicant_to_my_company(p_applicant_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.applications a
    join public.jobs j on j.id = a.job_id
    join public.recruiter_memberships m on m.company_id = j.company_id
    where a.applicant_id = p_applicant_id
      and m.profile_id = (select auth.uid()) and m.verification_status = 'verified'
  )
$$;

create or replace function private.has_applied_to_job(p_job_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.applications a
                 where a.job_id = p_job_id and a.applicant_id = (select auth.uid()))
$$;

create or replace function private.company_is_verified(p_company_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.companies c where c.id = p_company_id and c.verification_status = 'verified')
$$;

grant execute on function public.current_user_role(), public.is_admin(),
  public.is_company_member(uuid, boolean) to authenticated;
grant execute on all functions in schema private to authenticated;
```

### 4.2 Matrix

S = select, I = insert, U = update, D = delete. "own" means `applicant_id`/`profile_id = auth.uid()`. "co" means rows tied to a company where the caller is a **verified** member. "—" means no policy (denied). `anon` has no grants on any table, so it is omitted. `service_role` bypasses RLS everywhere.

| Table | Applicant | Recruiter (member) | Recruiter (pending) | Admin |
|---|---|---|---|---|
| `profiles` | S own; U own (`full_name`, `avatar_url` only, via column grant) | S own; S colleagues in co; S applicants who applied to co jobs; U own | S own; U own | S all |
| `applicant_profiles` | S/U own (`headline`, `target_seniority`, `location_pref`, `active_resume_id`) | S for applicants to co jobs | — | — |
| `companies` | S verified companies; S companies of jobs they applied to (`companies_select_applied`) | S own company (any status); U own company `website`, `logo_url` if `is_company_admin` | S own company | S/U all |
| `company_aliases` | S for verified companies (needed by `connections_at_company`) | S co | — | S/I/U/D all |
| `company_domains` | — | S co | S own company | S/U all |
| `recruiter_memberships` | — | S own; S co | S own | S/U all |
| `jobs` | S `status='open'`; S jobs they applied to (any status) | S co (all statuses); I co (company verified, `created_by = uid`, status `draft`/`open`); U co; D co when `draft` | — | S all |
| `linkedin_imports` | S own; I own (status must be `pending`); D own | — | — | — |
| `linkedin_positions` / `linkedin_skills` / `linkedin_education` | S own | — (D3) | — | — |
| **`connections`** | **S own only** | **— (never)** | — | **— (never)** |
| `resumes` | S/I/D own | S resumes snapshotted on an application to a co job | — | — |
| `fit_evaluations` | S own; I own (`status='pending'`, no score) | S rows linked from an application to a co job | — | — |
| `applications` | S own (writes via `apply_to_job` / `withdraw_application` RPCs only) | S co (writes via `set_application_status` RPC only) | — | — |
| `application_events` | **—** (status comes from `my_applications`) | S co | — | — |
| **`repo_evaluations`** | **— (never)** | S co | — | — |
| `token_ledger` | S own | — | — | S all |
| `ai_usage` | — | — | — | S all |
| `audit_log` | — | — | — | S all |
| view `my_applications` | own rows | 0 rows | 0 rows | 0 rows |
| view `job_applicant_rankings` | **0 rows** | co jobs | 0 rows | 0 rows |

Admins deliberately get **no** access to applicant PII (resumes, LinkedIn data, connections, applications). Support work on PII uses the service role through audited scripts.

### 4.3 Key policy SQL (`…_0010_rls_policies.sql`)

```sql
-- enable RLS everywhere (repeat for every table in §3)
alter table public.profiles enable row level security;
-- … (all 19 tables)

------------------------------------------------------------------ profiles
grant select (id, role, full_name, avatar_url, onboarded_at, created_at, updated_at)
  on public.profiles to authenticated;                   -- email deliberately not granted
grant update (full_name, avatar_url) on public.profiles to authenticated;

create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_select_applicants on public.profiles for select to authenticated
  using (private.is_applicant_to_my_company(id));
create policy profiles_select_colleagues on public.profiles for select to authenticated
  using (exists (select 1 from public.recruiter_memberships m
                 where m.profile_id = profiles.id and m.verification_status = 'verified'
                   and public.is_company_member(m.company_id)));
create policy profiles_select_admin on public.profiles for select to authenticated
  using (public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

------------------------------------------------------------------ jobs
grant select, insert, update, delete on public.jobs to authenticated;

create policy jobs_select_open on public.jobs for select to authenticated
  using (status = 'open' and public.current_user_role() = 'applicant');
create policy jobs_select_applied on public.jobs for select to authenticated
  using (private.has_applied_to_job(id));
create policy jobs_select_member on public.jobs for select to authenticated
  using (public.is_company_member(company_id));
create policy jobs_insert_member on public.jobs for insert to authenticated
  with check (public.is_company_member(company_id)
              and private.company_is_verified(company_id)
              and created_by = (select auth.uid())
              and status in ('draft', 'open'));
create policy jobs_update_member on public.jobs for update to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id) and private.company_is_verified(company_id));
create policy jobs_delete_draft on public.jobs for delete to authenticated
  using (public.is_company_member(company_id) and status = 'draft');

------------------------------------------------------------------ connections (third-party PII)
grant select on public.connections to authenticated;     -- no insert/update/delete grant: service role only
create policy connections_select_own on public.connections for select to authenticated
  using (applicant_id = (select auth.uid()));
-- intentionally no other policy. Recruiters and admins get zero rows.

------------------------------------------------------------------ resumes
grant select, insert, delete on public.resumes to authenticated;
create policy resumes_select_own on public.resumes for select to authenticated
  using (applicant_id = (select auth.uid()));
create policy resumes_insert_own on public.resumes for insert to authenticated
  with check (applicant_id = (select auth.uid())
              and public.current_user_role() = 'applicant'
              and parse_status = 'pending' and text_content is null);
create policy resumes_delete_own on public.resumes for delete to authenticated
  using (applicant_id = (select auth.uid()));
create policy resumes_select_recruiter on public.resumes for select to authenticated
  using (exists (select 1 from public.applications a
                 where a.resume_id = resumes.id and private.is_job_member(a.job_id)));

------------------------------------------------------------------ fit_evaluations
grant select, insert on public.fit_evaluations to authenticated;
create policy fit_select_own on public.fit_evaluations for select to authenticated
  using (applicant_id = (select auth.uid()));
create policy fit_insert_own on public.fit_evaluations for insert to authenticated
  with check (applicant_id = (select auth.uid()) and status = 'pending'
              and confidence_score is null and explanation is null);
create policy fit_select_recruiter on public.fit_evaluations for select to authenticated
  using (exists (select 1 from public.applications a
                 where a.fit_evaluation_id = fit_evaluations.id and private.is_job_member(a.job_id)));

------------------------------------------------------------------ applications
grant select on public.applications to authenticated;    -- no client writes: RPCs only
create policy applications_select_own on public.applications for select to authenticated
  using (applicant_id = (select auth.uid()));
create policy applications_select_member on public.applications for select to authenticated
  using (private.is_job_member(job_id));

------------------------------------------------------------------ repo_evaluations (recruiter-only)
grant select on public.repo_evaluations to authenticated;
create policy repo_eval_select_member on public.repo_evaluations for select to authenticated
  using (exists (select 1 from public.applications a
                 where a.id = repo_evaluations.application_id and private.is_job_member(a.job_id)));
-- NO applicant policy. This is the rating-visibility rule (SPEC: hidden from applicant).

------------------------------------------------------------------ application_events
grant select on public.application_events to authenticated;
create policy app_events_select_member on public.application_events for select to authenticated
  using (exists (select 1 from public.applications a
                 where a.id = application_events.application_id and private.is_job_member(a.job_id)));

------------------------------------------------------------------ linkedin_imports
grant select, insert, delete on public.linkedin_imports to authenticated;
create policy li_imports_select_own on public.linkedin_imports for select to authenticated
  using (applicant_id = (select auth.uid()));
create policy li_imports_insert_own on public.linkedin_imports for insert to authenticated
  with check (applicant_id = (select auth.uid()) and status = 'pending'
              and public.current_user_role() = 'applicant');
create policy li_imports_delete_own on public.linkedin_imports for delete to authenticated
  using (applicant_id = (select auth.uid()));

------------------------------------------------------------------ token_ledger
grant select on public.token_ledger to authenticated;
create policy ledger_select_own on public.token_ledger for select to authenticated
  using (applicant_id = (select auth.uid()));
create policy ledger_select_admin on public.token_ledger for select to authenticated
  using (public.is_admin());

------------------------------------------------------------------ ai_usage, audit_log
grant select on public.ai_usage, public.audit_log to authenticated;
create policy ai_usage_admin  on public.ai_usage  for select to authenticated using (public.is_admin());
create policy audit_log_admin on public.audit_log for select to authenticated using (public.is_admin());
```

The remaining policies (`applicant_profiles`, `companies`, `company_aliases`, `company_domains`, `recruiter_memberships`, LinkedIn row tables) follow the matrix with the same patterns. `applicant_profiles` gets `grant update (headline, target_seniority, location_pref, active_resume_id)`; the composite FK guarantees `active_resume_id` belongs to the same applicant. `active_linkedin_import_id` is set only by the service role during import activation.

---

## 5. Views and functions (`…_0011_views_functions.sql`)

### 5.1 `my_applications` (applicant-safe)

```sql
create view public.my_applications with (security_invoker = true) as
select
  a.id, a.job_id,
  j.title        as job_title,
  j.status       as job_status,
  j.is_technical,
  j.company_id,
  c.name         as company_name,
  c.logo_url     as company_logo_url,
  a.status, a.token_cost, a.github_repo_url,
  a.submitted_at, a.status_changed_at
from public.applications a
join public.jobs j      on j.id = a.job_id
join public.companies c on c.id = j.company_id
where a.applicant_id = (select auth.uid());

grant select on public.my_applications to authenticated;
```

No confidence score, no GitHub rating, no GitHub review status, no recruiter notes. (The applicant already sees their own confidence on Check fit through `fit_evaluations`; it is not repeated here so the view stays the single "applicant-safe" surface.) The applicant needs SELECT on `companies` for the job's company; `companies_select_applied` covers companies of jobs they applied to, in case a company is later unverified.

### 5.2 `job_applicant_rankings` (recruiter-only)

Full definition, sort keys and pagination RPC are in [applicant-ranking.md §Design](../subplans/applicant-ranking.md). Properties enforced here:
- `security_invoker = true`, so every joined table's RLS applies.
- `where public.is_company_member(j.company_id)` inside the view, so applicants get 0 rows even for their own applications.
- It does **not** join `connections`, `linkedin_*`, or `profiles.email`.

### 5.3 Functions

| Function | Kind | Purpose |
|---|---|---|
| `normalize_company_name(text) → text` | IMMUTABLE, invoker | §3.2 |
| `is_company_member(company_id, require_verified default true) → bool` | STABLE, definer | RLS helper (§4.1) |
| `current_user_role()`, `is_admin()` | STABLE, definer | RLS helpers |
| `connections_at_company(p_company_id uuid)` | STABLE, **invoker** | Applicant's own connections at a company. Definition in linkedin-ingestion.md. |
| `job_applicant_rankings_page(p_job_id, p_limit, p_cursor, …)` | STABLE, invoker | Keyset pagination over the ranking view. Definition in applicant-ranking.md. |
| `apply_to_job(p_job_id, p_idempotency_key, p_github_repo_url)` | definer | **Specified by Backend** (token-system.md); implemented and pgTAP-tested by Data. Data's requirements for it: sets `applications.resume_id` from `active_resume_id` (D1), stores `request_hash`, rejects when the company is not verified or the job is not `open`, requires `github_repo_url` iff `jobs.is_technical`, inserts the `repo_evaluations` row (`pending`) in the same transaction. |
| `get_token_balance()` | definer | Backend spec. Reads `token_ledger` for the current UTC period. |
| `set_application_status(p_application_id, p_to_status, p_note)` | definer | Recruiter shortlist/reject. Checks `is_job_member`; allowed: `submitted ⇄ shortlisted`, `submitted|shortlisted → rejected`, `rejected → shortlisted`; never from `withdrawn`. Updates `status`, `status_changed_at`, inserts `application_events`, calls `log_audit('application.status_changed')`. Backend owns the server action. |
| `withdraw_application(p_application_id)` | definer | Applicant. From `submitted`/`shortlisted` only. No refund. |
| `get_applicant_contact(p_application_id) → text` | definer | D2. Returns `profiles.email` if the caller is a job member and the application is `shortlisted`; logs `contact.revealed`. |
| `set_my_role(p_role user_role)` | definer | Sets role once (`applicant` or `recruiter`); creates `applicant_profiles` for applicants. |
| `mark_onboarded()` | definer | Sets `onboarded_at` only if prerequisites hold: applicant has an `active_resume_id` with `parse_status='succeeded'` and an active LinkedIn import (`succeeded`); recruiter has a non-rejected membership. Returns the missing items otherwise. |
| `activate_linkedin_import(p_import_id)` | definer, **service role only** | Flips `active_linkedin_import_id` and deletes older imports in one transaction (linkedin-ingestion.md). |
| `export_my_data() → jsonb` | definer | §7.5. |
| `private.log_audit(...)` | definer | §3.9. |

All definer functions: `set search_path = ''`, fully qualified names, `revoke execute … from public`, explicit `grant execute … to authenticated` (or to `service_role` only).

---

## 6. Storage buckets and policies (`…_0012_storage.sql`)

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('resumes', 'resumes', false, 5242880,
   array['application/pdf',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('linkedin-exports', 'linkedin-exports', false, 52428800,          -- 50 MB
   array['application/zip', 'application/x-zip-compressed',
         'text/csv', 'application/vnd.ms-excel', 'application/octet-stream']);
```

| Bucket | Path | Applicant | Recruiter (member) | Others |
|---|---|---|---|---|
| `resumes` | `{user_id}/{resume_id}.{pdf\|docx}` | INSERT/SELECT/DELETE in own folder. No UPDATE (no overwrite; a new resume is a new object). | SELECT the object only if it is the resume snapshotted on an application to a co job (used to create 60 s signed URLs). | — |
| `linkedin-exports` | `{user_id}/{import_id}/{file}` | INSERT only into a folder whose `import_id` is one of their `pending` imports; SELECT/DELETE own folder. | — | — |

```sql
create policy resumes_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and public.current_user_role() = 'applicant');
create policy resumes_obj_select_own on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy resumes_obj_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy resumes_obj_select_recruiter on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and exists (
           select 1 from public.resumes r
           join public.applications a on a.resume_id = r.id
           where r.storage_path = storage.objects.name and private.is_job_member(a.job_id)));

create policy li_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'linkedin-exports'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and exists (select 1 from public.linkedin_imports i
                          where i.id::text = (storage.foldername(name))[2]
                            and i.applicant_id = (select auth.uid()) and i.status = 'pending'));
create policy li_obj_select_own on storage.objects for select to authenticated
  using (bucket_id = 'linkedin-exports' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy li_obj_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'linkedin-exports' and (storage.foldername(name))[1] = (select auth.uid())::text);
```

Uploads use `createSignedUploadUrl` issued by the upload-init endpoint, so the server picks the path. The bucket limits are a backstop; the server re-checks size and magic bytes (`file-type`) before parsing. The resume signed-URL server action also writes `audit_log` (`resume.signed_url`).

---

## 7. Privacy of personal data

### 7.1 PII classification

| Class | Data | Subject | Location | Who can read |
|---|---|---|---|---|
| **A. Applicant identity** | name, email, avatar | applicant | `profiles`, `auth.users` | self; recruiters see name/avatar for co applicants; email only after shortlist (D2) |
| **B. Applicant career data** | resume file + text, LinkedIn profile/positions/skills/education | applicant | `resumes`, Storage, `linkedin_*` | self; recruiters see the **resume** only, for co applications |
| **C. Inferences about the applicant** | confidence score + explanation, GitHub ratings + rationale | applicant | `fit_evaluations`, `repo_evaluations` | confidence: self + co recruiters; GitHub ratings: co recruiters only (locked) |
| **D. Third-party PII** | connections' names, employer, position, connected date | the connections (non-users) | `connections` | **the uploading applicant only** |
| **E. Transactional** | applications, ledger, events, ai_usage | applicant | as named | per matrix |
| **F. Recruiter identity** | name, work email, company membership | recruiter | `profiles`, `recruiter_memberships` | self, colleagues, admin |
| **Dropped at parse** | connection email, connection profile URL; Profile.csv address, birth date, zip, maiden name, Twitter, IM handles, websites | — | never stored | — |

### 7.2 Data minimisation: Connections.csv

| Column | Decision | Why |
|---|---|---|
| First Name, Last Name | **Keep** | The applicant must recognise the person. |
| Company | **Keep** (+ generated normalised form) | The only matching key. |
| Position | **Keep** | Shown to the applicant ("Senior Engineer at Acme"). Short, low risk. |
| Connected On | **Keep** as `date` | Lets the applicant judge relationship strength. |
| Email Address | **Drop** at parse time; never written to Storage-derived tables, logs or Sentry | Not needed; most sensitive field; often a personal address. |
| URL | **Drop entirely; no hash** | No MVP feature uses it. An unsalted hash of a public, guessable URL is reversible by dictionary, and it would let us join the same person across many applicants' graphs (a shadow social graph). A per-user salted HMAC would block that but then has no use at all. Revisit only with a concrete feature (e.g. "Request intro"). |

Parsers must also never log row contents (pino redaction on `row`, `record`; Sentry `beforeSend` strips request bodies for upload routes).

### 7.3 Encryption

- **At rest:** Supabase encrypts databases, backups and Storage with AES-256. **In transit:** TLS everywhere (Supabase, Vercel, Inngest, OpenRouter).
- **Column-level (pgsodium TCE / Vault): not used for PII in MVP.** Reasons: (1) the threat we care about is other users of the app, which RLS handles; column encryption does not protect against a compromised service role, since that role holds the key; (2) `connections.company_name` must be matched with `=` and trigram similarity, which encrypted columns cannot do; (3) Supabase has marked pgsodium's TCE as pending deprecation, so building on it adds migration risk.
- **Vault is used** for secrets that SQL needs: the Inngest event key used by the pg_cron sweeper's `pg_net` call.
- **Revisit trigger:** if we start storing anything not needed for queries that is highly sensitive (e.g. government IDs, demographic data for bias audits), encrypt it application-side with a KMS key, not in Postgres.

### 7.4 Retention

| Data | Retention | Mechanism |
|---|---|---|
| Raw LinkedIn upload (ZIP/CSVs) | **Deleted as the last step of a successful parse.** Failed or abandoned imports: deleted after **7 days**. | Inngest step `delete-raw` (Storage API) sets `raw_deleted_at`; Inngest daily cron `purge-linkedin-raw` catches leftovers (`raw_deleted_at is null and created_at < now() - 7 days`). |
| Superseded LinkedIn imports (parsed rows) | Deleted when a new import is activated (replace-all) | `activate_linkedin_import` |
| Old resumes | A replaced resume is deleted immediately **unless** an application references it; referenced resumes live as long as the application | Server action on new upload + Inngest cleanup |
| `fit_evaluations` not referenced by an application | 180 days (cache only) | pg_cron daily |
| `linkedin_imports` stuck in `pending` (never uploaded) | 24 hours | pg_cron hourly → marks `failed` (`ABANDONED`); raw purge follows |
| `audit_log` | 365 days | pg_cron daily |
| `ai_usage` | 400 days (cost reporting), `user_id` nulled on account deletion | pg_cron daily |
| Everything user-owned | Until the user deletes it or the account | cascade |
| Backups | Supabase PITR window (7 days). Deleted data may persist in backups until it expires; disclosed in the privacy notice. | Supabase |

### 7.5 Data subject rights

**Delete my data (account deletion).** `DELETE /api/v1/me` (Backend route; Data specifies the sequence). The route re-authenticates (recent sign-in < 5 min), writes `audit_log('account.delete_requested')`, then sends Inngest `account/delete.requested`. The function runs:
1. Recruiters only: if they are the last verified member of a company with open jobs, close those jobs (`status = 'closed'`).
2. Delete all Storage objects under `resumes/{uid}/` and `linkedin-exports/{uid}/` (Storage API, paged).
3. `supabase.auth.admin.deleteUser(uid)`. This cascades `auth.users → profiles → everything` per §3.10.
4. Insert `audit_log('account.deleted', subject_id = uid)` (no FK, so it survives).
5. Send a confirmation email to the address captured in step 0 (address not stored afterwards).
Target: completed within minutes; SLA promised to users is 30 days (GDPR Art. 12).

**Partial deletion** (also self-service): delete LinkedIn data (deletes all `linkedin_imports` → cascade + raw files), delete connections only (deletes `connections` rows of the active import; keeps positions), delete a resume (never blocked; any application's `resume_id` goes null).

**Data export.** `GET /api/v1/me/export` → `export_my_data()` returns one JSON document: profile, applicant profile, LinkedIn data including connections (it is the applicant's own upload), resumes metadata + text (and 10-minute signed URLs for the files), fit evaluations, `my_applications`, token ledger. **It excludes `repo_evaluations` and `application_events.note`** (locked decision; see D5 for formal DSARs). Rate-limited to 1/hour; logs `account.export`.

**Audit logging** covers: resume signed URLs issued (who, which application), status changes, contact reveal, verification decisions, exports, deletions, token adjustments, re-runs. `metadata` holds ids and codes only.

### 7.6 GDPR / CCPA notes (for counsel review; not legal advice)

- **Roles.** We are the controller for applicant data and for connection data we store. Recruiters' companies are separate controllers for what they do with shortlisted candidates.
- **Lawful basis.** Applicant data: contract (providing the matching service) plus consent for the optional LinkedIn upload. Connections: our legitimate interest in providing the applicant a feature they requested, balanced by strict minimisation, no recruiter or third-party access, no profiling, no contact. The connections are never notified (Art. 14(5)(b) disproportionate effort argument), so the balancing test must be documented.
- **Connections' rights.** A non-user can ask us to delete them. Support runs a service-role script that deletes `connections` rows matching first + last name (and company, if given) across all applicants, and logs it. Documented in the privacy notice.
- **Automated decisions (Art. 22).** Ranking is advisory; a human recruiter makes every shortlist/reject decision; no auto-reject exists. See applicant-ranking.md §Bias and fairness.
- **EU AI Act.** AI systems used to rank or filter job candidates are high-risk (Annex III §4). Confirm the applicable date and obligations with counsel before an EU launch.
- **NYC Local Law 144 (AEDT).** If used for NYC-based roles, a bias audit and candidate notice are required before use. Launch blocker for NYC; flagged to the Lead.
- **CCPA/CPRA.** Notice at collection (consent copy below), right to know/delete/correct, no sale or sharing for cross-context advertising (we do neither). Our LLM provider (OpenRouter and the routed model vendor) is a service provider/processor; DPA required, and zero-retention routing where available (Backend config).
- **International transfers.** Single US region (assumption); EU users need SCCs in the privacy notice.

**Consent copy at LinkedIn upload** (Frontend renders verbatim; checkbox required before upload):

> **What we do with your LinkedIn export**
> We read your profile, positions, skills and education to estimate how well you fit each job. From Connections.csv we keep only each connection's **name, current company, position and the date you connected**, so we can show you who you know at a company. We **discard their email addresses and profile links**.
> Your connections are **visible only to you**. Recruiters never see them. We never contact them.
> We delete the uploaded file as soon as it is processed. You can delete this data or your account at any time in Settings.
> ☐ I understand, and I have the right to share this data for this purpose.

**Consent copy at resume upload:**

> Recruiters at companies you apply to will see this resume. We use its text to estimate your fit for jobs. PDF or DOCX, up to 5 MB.

**At Apply on a technical job:**

> We will run an automated static review of this public repository (the code is never executed). The review is shared with the hiring company's recruiters and is not shown to you.

### 7.7 What recruiters see (summary)

Name, avatar, headline, status, applied-at, confidence + explanation, the four GitHub ratings + rationale + overall (technical jobs), the snapshotted resume via signed URL, and email only after shortlisting. They never see connections, LinkedIn tables, token balances, other companies' applications, or the applicant's Check-fit history for other jobs.

---

## 8. API endpoints

Data owns no route handlers. The PostgREST/RPC surface below is what Backend and Frontend call; the HTTP routes are proposals for Backend's endpoint list.

| Surface | Method / path | Auth | Request → response | Errors |
|---|---|---|---|---|
| RPC | `rpc('set_my_role', {p_role})` | authenticated, role null | → `{role}` | `FORBIDDEN` (already set / admin) |
| RPC | `rpc('mark_onboarded')` | authenticated | → `{onboarded_at}` or `{missing: ['resume','linkedin']}` | `VALIDATION_FAILED` |
| RPC | `rpc('set_application_status', {p_application_id, p_to_status, p_note})` | verified member | → application row | `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` (bad transition) |
| RPC | `rpc('withdraw_application', {p_application_id})` | applicant owner | → `{status:'withdrawn'}` | `NOT_FOUND`, `CONFLICT` |
| RPC | `rpc('get_applicant_contact', {p_application_id})` | verified member | → `{email}` | `FORBIDDEN` (not shortlisted) |
| RPC | `rpc('connections_at_company', {p_company_id})` | applicant | → rows | — (empty set) |
| RPC | `rpc('job_applicant_rankings_page', …)` | verified member | see applicant-ranking.md | `FORBIDDEN` via empty set |
| HTTP (proposal) | `GET /api/v1/me/export` | applicant/recruiter, rate 1/h | → `200 application/json` attachment | `RATE_LIMITED` |
| HTTP (proposal) | `DELETE /api/v1/me` | re-auth < 5 min | → `202 {status:'scheduled'}` | `UNAUTHENTICATED`, `FORBIDDEN` (stale auth) |
| HTTP (proposal) | `DELETE /api/v1/linkedin-imports/active` / `?scope=connections` | applicant | → `204` | `NOT_FOUND` |

RPC errors are raised as `SQLSTATE P0001` with the API code in `HINT`, per MASTER_PLAN §5.

---

## 9. Migration and seed strategy

- **Tooling:** Supabase CLI. `supabase migration new <name>` → `supabase/migrations/<timestamp>_<name>.sql`. Local: `supabase start`, `supabase db reset` (applies all migrations + `seed.sql`). CI: `supabase db reset && supabase test db` on every PR, then `supabase gen types typescript --local > lib/supabase/database.types.ts` and fail if the diff is dirty.
- **Order:** `0001_foundation`, `0002_normalize`, `0003_identity`, `0004_companies` (+jobs), `0005_linkedin`, `0006_resumes`, `0007_applications`, `0008_ledger_audit`, `0009_rls_helpers`, `0010_rls_policies`, `0011_views_functions` (incl. `apply_to_job`), `0012_storage`, `0013_cron` (pg_cron jobs, Vault secret reference).
- **Rules:** migrations are forward-only and never edited after merge; every new table ships with `enable row level security` + policies + pgTAP in the same PR; destructive changes go in two steps (expand, then contract in a later release); `supabase db lint` and Supabase Advisors (security + performance) must be clean.
- **Deploy:** GitHub Action on `main` runs `supabase db push` against staging, then production after approval. Remote branches (Supabase Branching) for preview deployments if budget allows.
- **Seed (`supabase/seed.sql`, local/dev only, never run in prod).** Deterministic UUIDs (`00000000-0000-0000-0000-0000000000xx`) and password `password123` for every user, inserted into `auth.users` + `auth.identities`. Fictional names only:
  - 1 admin; companies: **Acme Payments, Inc.** (verified, domain `acmepay.test`, alias "Acme"), **Globex GmbH** (verified), **Initech LLC** (pending);
  - 3 recruiters (2 verified at Acme, 1 pending at Initech);
  - 6 jobs: Acme open technical (cost 3), Acme open non-technical (cost 1), Acme draft, Acme closed, Globex open technical (cost 2), Globex archived;
  - 8 applicants covering: no uploads; resume only; full LinkedIn import with 40 connections (6 at "Acme Payments Inc", "ACME PAYMENTS", "Acme"; 2 at "Globex"; 1 fuzzy "Acme Paymnts"); token states 10/3/0 for the current period plus last month's grant (to prove no rollover);
  - applications on the Acme technical job matching the ranking fixture in applicant-ranking.md (succeeded, pending, failed repo reviews, ties);
  - `fit_evaluations` and `repo_evaluations` with fixed scores.
- **Fixture files:** `supabase/tests/fixtures/linkedin/*.csv|zip` (listed in linkedin-ingestion.md) are shared by Vitest parser tests and the seed script (`scripts/seed-linkedin.ts` parses them with the real parser into the seed users).

---

## 10. Edge cases

- **Role not chosen yet:** `current_user_role()` is null → applicant-only and recruiter-only policies fail closed; the user can read only their own profile.
- **Recruiter membership revoked or rejected:** `is_company_member` returns false immediately; they lose job and applicant access on the next query. Signed URLs already issued live 60 s.
- **Two recruiters edit a job concurrently:** last write wins; `updated_at` is returned so Frontend can warn on stale edits (optional optimistic check `eq('updated_at', …)`).
- **Job toggled technical after applications:** blocked by trigger (`CONFLICT`).
- **Company unverified after jobs were opened:** existing open jobs stay visible; recruiters cannot open new ones (`company_is_verified` in policy). Admin decides whether to close them.
- **Applicant deletes resume used in an application:** recruiter sees "Resume removed by applicant"; ranking unaffected (confidence is snapshotted).
- **Applicant deletes account mid-evaluation:** Inngest update hits zero rows (cascaded); functions must treat "row not found" as success-and-stop.
- **Same email in two auth identities (Google + email):** Supabase links identities by verified email; one profile. If not linked, two profiles; role choice is per profile.
- **Admin is also a recruiter:** not supported; an admin account has role `admin` only.
- **Timezone at month boundary:** period is computed with `to_char(now() at time zone 'utc', 'YYYY-MM')` everywhere (one SQL helper, `private.current_period()`).
- **`select *` on profiles from the client:** permission error by design (email not granted). Use explicit columns.
- **Very large connection sets (30k):** inserts are chunked by the parser (1,000 rows per request); matching uses the btree index for exact and the trigram index for fuzzy.

---

## 11. Testing approach

**pgTAP** (`supabase/tests/database/*.test.sql`, run by `supabase test db` in CI). Tests impersonate users with `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);` via a shared helper `tests.authenticate_as(uuid)`.

| File | Asserts |
|---|---|
| `00_schema.test.sql` | every table in `public` has RLS enabled (`pg_class.relrowsecurity`); every view has `security_invoker=true`; every SECURITY DEFINER function has `search_path=''`; `anon` has no table privileges; `profiles.email` not selectable by `authenticated` |
| `01_rating_visibility.test.sql` | applicant: `select count(*) from repo_evaluations` = 0 even for their own application; `job_applicant_rankings` returns 0 rows; `my_applications` has no column matching `%score%`, `%rating%`, `%rationale%`, `%github_status%` (checked via `information_schema.columns`); export JSON has no `repo_evaluations` key |
| `02_recruiter_scope.test.sql` | Acme recruiter sees Acme applicants only; Globex recruiter sees 0 Acme applications, 0 Acme repo evaluations, 0 Acme resumes (table and `storage.objects`); pending Initech recruiter sees 0 applications and cannot insert a job |
| `03_connections_privacy.test.sql` | recruiter and admin: `connections` count = 0; applicant B cannot read applicant A's connections; `connections_at_company` as a recruiter returns 0 rows; `job_applicant_rankings` has no connection columns |
| `04_writes_denied.test.sql` | applicant cannot insert/update `applications`, `token_ledger`, `repo_evaluations`, `fit_evaluations` with a score; cannot change own `role`; cannot set `role='admin'`; cannot UPDATE `token_ledger`/`audit_log` |
| `05_apply_to_job.test.sql` | Backend's contract: balance math, no rollover (last month's grant ignored), `INSUFFICIENT_TOKENS`, `ALREADY_APPLIED`, idempotent replay, `IDEMPOTENCY_KEY_REUSED`, closed job, `resume_id` snapshot, `repo_evaluations` row only for technical jobs |
| `06_status_transitions.test.sql` | `set_application_status` matrix; withdrawn terminal; events written; non-member forbidden |
| `07_normalize.test.sql` | all vectors in linkedin-ingestion.md |
| `08_ranking.test.sql` | expected order of the ranking fixture (applicant-ranking.md), page boundaries, tie-breaks |
| `09_cascade.test.sql` | deleting an applicant's `auth.users` row removes rows from every user-owned table and nulls `ai_usage.user_id`; `audit_log` rows survive; deleting a job with applications fails |
| `10_storage.test.sql` | object policies: own folder only; LinkedIn upload denied unless a `pending` import with that id exists; recruiter select limited to snapshotted resumes |

**Fixture CSVs** and parser tests are in linkedin-ingestion.md §Testing. **Advisors:** `supabase db lint` and the Security Advisor run in CI and must report no RLS-disabled tables or definer views.

---

## Proposed additions for the Decision log

1. NEW table `audit_log` (D7). 2. NEW table `company_aliases` (D8). 3. NEW columns `applications.resume_id`, `applications.request_hash`, `applications.status_changed_at` (D1). 4. Profile.csv fields as columns on `linkedin_imports` (D9). 5. NEW functions `set_application_status`, `withdraw_application`, `get_applicant_contact`, `set_my_role`, `mark_onboarded`, `activate_linkedin_import`, `export_my_data`, `connections_at_company`, `job_applicant_rankings_page`, `current_user_role`, `is_admin`. 6. `profiles.email` hidden by column grant (D2). 7. GitHub scaling `(avg − 1) / 9 × 100` and incomplete-tier ranking (see applicant-ranking.md; changes MASTER_PLAN §3.3 and OQ2).

## Review notes

## Resolution
