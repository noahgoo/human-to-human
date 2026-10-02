-- NexusPulse MVP schema. Table and column names follow docs/sections/data.md §3.
-- Access model for the MVP: the Next.js server reads and writes with the secret
-- (service_role) key after checking the session, so anon/authenticated get no table
-- grants and RLS is on everywhere with no client policies. Client-facing policies
-- from data.md §4 can be layered on later without changing the tables.

-- ---------- foundation ----------

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to service_role;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

create type public.user_role              as enum ('applicant', 'recruiter', 'admin');
create type public.application_status     as enum ('submitted', 'shortlisted', 'rejected', 'withdrawn');
create type public.job_status             as enum ('draft', 'open', 'closed', 'archived');
create type public.verification_status    as enum ('pending', 'verified', 'rejected');
create type public.evaluation_status      as enum ('pending', 'running', 'succeeded', 'failed');
create type public.token_entry_kind       as enum ('monthly_grant', 'application_spend', 'refund', 'adjustment');
create type public.linkedin_import_source as enum ('zip', 'csv');

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

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
  s := regexp_replace(s, '\.(com|io|ai|co|net|org)\b', '', 'g');
  s := replace(s, '&', ' and ');
  s := replace(s, '.', '');
  s := regexp_replace(s, '[^a-z0-9]+', ' ', 'g');
  s := btrim(regexp_replace(s, '\s+', ' ', 'g'));
  s := regexp_replace(s, '^the\s', '');
  loop
    prev := s;
    s := btrim(regexp_replace(s, suffix_re, ''));
    exit when s = prev or s = '';
  end loop;
  if s in ('self employed','self','freelance','freelancer','independent','independent consultant',
           'stealth','stealth startup','stealth mode','retired','unemployed','confidential','none',
           'n a','na','various','student','open to work','seeking opportunities') then
    return null;
  end if;
  if s = '' then
    s := btrim(regexp_replace(regexp_replace(lower(p_name), '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g'));
  end if;
  return nullif(s, '');
end $$;

-- ---------- identity ----------

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          public.user_role,
  full_name     text check (char_length(full_name) <= 200),
  avatar_url    text check (char_length(avatar_url) <= 2048),
  email         text not null,
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);
create index profiles_role_idx on public.profiles(role);

create table public.applicant_profiles (
  profile_id                 uuid primary key references public.profiles(id) on delete cascade,
  headline                   text check (char_length(headline) <= 220),
  target_seniority           text check (char_length(target_seniority) <= 80),
  location_pref              text check (char_length(location_pref) <= 200),
  active_resume_id           uuid,
  active_linkedin_import_id  uuid,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz
);

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          new.raw_user_meta_data->>'avatar_url',
          case when new.raw_user_meta_data->>'role' in ('applicant','recruiter')
               then (new.raw_user_meta_data->>'role')::public.user_role end);
  if new.raw_user_meta_data->>'role' = 'applicant' then
    insert into public.applicant_profiles (profile_id) values (new.id);
  end if;
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

create or replace function private.guard_profile_role() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.role is distinct from old.role then
    if old.role is not null and current_user not in ('postgres', 'service_role', 'supabase_admin') then
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

-- ---------- companies and recruiters ----------

create table public.companies (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (char_length(btrim(name)) between 1 and 200),
  name_normalized      text generated always as (public.normalize_company_name(name)) stored,
  website              text check (website ~* '^https://'),
  logo_url             text check (char_length(logo_url) <= 2048),
  description          text check (char_length(description) <= 2000),
  verification_status  public.verification_status not null default 'pending',
  verified_at          timestamptz,
  created_by           uuid references public.profiles(id) on delete set null,
  review_reason        text check (review_reason in ('domain_mismatch','name_collision','free_mail','manual_request')),
  rejected_reason      text check (char_length(rejected_reason) <= 1000),
  reviewed_by          uuid references public.profiles(id) on delete set null,
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz,
  check (verification_status <> 'verified' or verified_at is not null)
);
create index companies_name_norm_idx  on public.companies(name_normalized);
create index companies_name_norm_trgm on public.companies using gin (name_normalized extensions.gin_trgm_ops);

create table public.company_domains (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id) on delete cascade,
  domain               text not null unique
                         check (domain = lower(domain)
                                and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  verification_status  public.verification_status not null default 'pending',
  verification_method  text check (verification_method in ('email_link', 'admin', 'dns_txt')),
  verified_at          timestamptz,
  verified_by          uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz
);
create index company_domains_company_idx on public.company_domains(company_id);

create table public.recruiter_memberships (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references public.companies(id) on delete cascade,
  profile_id             uuid not null references public.profiles(id) on delete cascade,
  verification_status    public.verification_status not null default 'pending',
  verified_via           text check (verified_via in ('email_domain', 'admin', 'company_admin')),
  verified_at            timestamptz,
  verified_by            uuid references public.profiles(id) on delete set null,
  is_company_admin       boolean not null default false,
  work_email             text check (work_email = lower(work_email) and char_length(work_email) <= 320),
  work_email_verified_at timestamptz,
  evidence               jsonb,
  approved_by            uuid references public.profiles(id) on delete set null,
  removed_at             timestamptz,
  removed_by             uuid references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz,
  unique (company_id, profile_id),
  check (verification_status <> 'verified' or (verified_at is not null and verified_via is not null))
);
create unique index recruiter_memberships_one_live_uq on public.recruiter_memberships(profile_id)
  where verification_status <> 'rejected';
create unique index recruiter_memberships_one_per_company_uq on public.recruiter_memberships(company_id)
  where verification_status <> 'rejected';

create table public.blocked_email_domains (
  domain      text primary key check (domain = lower(domain)),
  reason      text not null check (reason in ('free_mail', 'disposable', 'manual')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

-- ---------- jobs ----------

create table public.jobs (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  created_by    uuid references public.profiles(id) on delete set null,
  title         text not null check (char_length(btrim(title)) between 3 and 150),
  description   text not null check (char_length(description) between 1 and 20000),
  requirements  text not null check (char_length(requirements) between 1 and 10000),
  location      text check (char_length(location) <= 200),
  work_mode     text check (work_mode in ('remote', 'hybrid', 'onsite')),
  token_cost    smallint not null default 2 check (token_cost between 1 and 3),
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

-- ---------- LinkedIn ----------

create table public.linkedin_imports (
  id              uuid primary key default gen_random_uuid(),
  applicant_id    uuid not null references public.profiles(id) on delete cascade,
  source          public.linkedin_import_source not null,
  status          public.evaluation_status not null default 'pending',
  files_present   text[] not null default '{}'
                    check (files_present <@ array['Profile.csv','Positions.csv','Skills.csv','Education.csv','Connections.csv','Rich_Media.csv']),
  counts          jsonb not null default '{}'::jsonb,
  warnings        jsonb not null default '[]'::jsonb,
  error           text,
  error_detail    jsonb,
  headline        text check (char_length(headline) <= 300),
  summary         text check (char_length(summary) <= 5000),
  industry        text check (char_length(industry) <= 200),
  geo_location    text check (char_length(geo_location) <= 200),
  raw_deleted_at  timestamptz,
  uploaded_at     timestamptz,
  started_at      timestamptz,
  parsed_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  unique (id, applicant_id),
  check (status <> 'failed' or error is not null),
  check (status <> 'succeeded' or parsed_at is not null)
);
create index linkedin_imports_applicant_idx on public.linkedin_imports(applicant_id, created_at desc);

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
  started_on               date,
  ended_on                 date,
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
create index connections_import_idx on public.connections(import_id);

create table if not exists public.linkedin_rich_media (
  id           uuid primary key default gen_random_uuid(),
  import_id    uuid not null references public.linkedin_imports(id) on delete cascade,
  applicant_id uuid not null references public.profiles(id) on delete cascade,
  occurred_at  text,
  description  text not null check (char_length(description) <= 5000),
  media_link   text check (media_link is null or char_length(media_link) <= 2000),
  created_at   timestamptz not null default now()
);
create index if not exists linkedin_rich_media_import_idx on public.linkedin_rich_media(import_id);
alter table public.linkedin_rich_media enable row level security;
drop policy if exists linkedin_rich_media_select_own on public.linkedin_rich_media;
create policy linkedin_rich_media_select_own on public.linkedin_rich_media
  for select to authenticated
  using (applicant_id = auth.uid());
grant select on public.linkedin_rich_media to authenticated;

-- ---------- resumes ----------

create table public.resumes (
  id                 uuid primary key default gen_random_uuid(),
  applicant_id       uuid not null references public.profiles(id) on delete cascade,
  storage_path       text not null unique,
  original_filename  text check (char_length(original_filename) <= 255),
  mime_type          text not null check (mime_type in (
                       'application/pdf',
                       'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes         integer not null check (size_bytes > 0 and size_bytes <= 5242880),
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

-- ---------- evaluations and applications ----------

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
  resume_id           uuid references public.resumes(id) on delete set null,
  linkedin_import_id  uuid references public.linkedin_imports(id) on delete set null,
  error               text,
  sub_scores          jsonb,
  requirements        jsonb check (pg_column_size(requirements) < 64000),   -- [{text, importance, status, evidence}]
  band                text check (band in ('strong', 'good', 'moderate', 'limited')),
  flags               jsonb,
  job_updated_at      timestamptz not null,
  attempt_count       smallint not null default 0,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz,
  unique (id, applicant_id, job_id),
  check (status <> 'succeeded' or (confidence_score is not null and explanation is not null and completed_at is not null))
);
create index fit_evaluations_cache_idx on public.fit_evaluations(applicant_id, job_id, input_hash, created_at desc)
  where status = 'succeeded';
create unique index fit_evaluations_inflight_dedupe on public.fit_evaluations(applicant_id, input_hash)
  where status in ('pending', 'running');

create table public.applications (
  id                 uuid primary key default gen_random_uuid(),
  job_id             uuid not null references public.jobs(id) on delete restrict,
  applicant_id       uuid not null references public.profiles(id) on delete cascade,
  status             public.application_status not null default 'submitted',
  token_cost         smallint not null check (token_cost between 1 and 3),
  github_repo_url    text check (github_repo_url ~ '^https://github\.com/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}$'),
  resume_id          uuid,
  fit_evaluation_id  uuid,
  idempotency_key    uuid not null,
  request_hash       text not null check (request_hash ~ '^[0-9a-f]{64}$'),
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
  note            text check (char_length(note) <= 2000),
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
  data_architecture_score smallint check (data_architecture_score between 1 and 10),
  performance_score       smallint check (performance_score       between 1 and 10),
  deployment_score        smallint check (deployment_score        between 1 and 10),
  code_quality_score      smallint check (code_quality_score      between 1 and 10),
  team_topology_score     smallint check (team_topology_score     between 1 and 10),
  overall_score           numeric(4,2) generated always as
                            ((data_architecture_score + performance_score + deployment_score + code_quality_score + team_topology_score)::numeric / 5) stored,
  rationale               jsonb,     -- {"dataArchitecture":{"summary":"…"}, …}
  repo_meta           jsonb,     -- {full_name, default_branch, stars, forks, is_fork, …}
  signals             jsonb,
  flags               jsonb,     -- {likely_template_or_fork, injection_suspected, insufficient_code}
  strategy            text check (strategy in ('single', 'map_reduce')),
  files_considered    integer check (files_considered >= 0),
  files_analyzed      integer check (files_analyzed >= 0),
  bytes_analyzed      bigint  check (bytes_analyzed >= 0),
  tokens_sent         integer check (tokens_sent >= 0),
  failure_code        text check (failure_code in ('not_found_or_private', 'too_large', 'too_many_files',
                        'archive_too_large', 'empty', 'no_reviewable_code', 'timeout', 'llm_failed',
                        'integrity', 'github_unavailable')),
  error               text,
  attempt_count       smallint not null default 0,
  model               text,
  prompt_version      text,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz,
  check (status <> 'succeeded' or (data_architecture_score is not null and performance_score is not null
                                   and deployment_score is not null and code_quality_score is not null
                                   and team_topology_score is not null and rationale is not null))
);
create index repo_evaluations_cache_idx on public.repo_evaluations(repo_url, commit_sha, prompt_version, completed_at desc)
  where status = 'succeeded';

-- ---------- tokens, AI usage, audit ----------

create table public.token_ledger (
  id              uuid primary key default gen_random_uuid(),
  applicant_id    uuid not null references public.profiles(id) on delete cascade,
  period          text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  kind            public.token_entry_kind not null,
  amount          integer not null,
  application_id  uuid references public.applications(id) on delete cascade,
  reason          text check (char_length(reason) between 1 and 500),
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  check (
    (kind = 'monthly_grant'     and amount = 10 and application_id is null) or
    (kind = 'application_spend' and amount between -3 and -1 and application_id is not null) or
    (kind = 'refund'            and amount between 1 and 3 and application_id is not null and reason is not null) or
    (kind = 'adjustment'        and amount <> 0 and reason is not null)
  )
);
create unique index token_ledger_grant_uq  on public.token_ledger(applicant_id, period) where kind = 'monthly_grant';
create unique index token_ledger_spend_uq  on public.token_ledger(application_id)        where kind = 'application_spend';
create unique index token_ledger_refund_uq on public.token_ledger(application_id)        where kind = 'refund';
create index token_ledger_balance_idx on public.token_ledger(applicant_id, period);

create table public.ai_usage (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.profiles(id) on delete set null,
  task             text not null check (task in ('fit', 'repo', 'resume_parse')),
  stage            text not null default 'single' check (stage in ('single', 'map', 'reduce', 'sanity_rerun')),
  subject_id       uuid,
  model            text not null,
  requested_model  text not null,
  prompt_version   text not null,
  provider         text,
  generation_id    text,
  input_tokens     integer not null default 0 check (input_tokens  >= 0),
  output_tokens    integer not null default 0 check (output_tokens >= 0),
  cost_usd         numeric(10,6) not null default 0 check (cost_usd >= 0),
  latency_ms       integer check (latency_ms >= 0),
  attempt          smallint not null default 1,
  status           text not null check (status in ('ok', 'error', 'schema_invalid', 'timeout', 'anomaly')),
  error_code       text,
  request_id       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz
);
create index ai_usage_user_idx    on public.ai_usage(user_id, created_at desc);
create index ai_usage_subject_idx on public.ai_usage(subject_id);

create table public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid,
  action        text not null,
  subject_type  text,
  subject_id    uuid,
  company_id    uuid,
  metadata      jsonb not null default '{}'::jsonb,
  request_id    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);
create index audit_log_subject_idx on public.audit_log(subject_id, created_at desc);

create or replace function private.forbid_update() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception '% is append-only', tg_table_name using errcode = 'P0001', hint = 'FORBIDDEN'; end $$;
create trigger token_ledger_no_update       before update on public.token_ledger       for each row execute function private.forbid_update();
create trigger application_events_no_update before update on public.application_events for each row execute function private.forbid_update();
create trigger audit_log_no_update          before update on public.audit_log          for each row execute function private.forbid_update();

-- ---------- updated_at triggers ----------

do $$
declare t text;
begin
  foreach t in array array['companies','company_domains','recruiter_memberships','blocked_email_domains','jobs',
                           'linkedin_imports','resumes','fit_evaluations','applications','repo_evaluations']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_updated_at', t);
  end loop;
end $$;

-- ---------- RLS: on everywhere, no client policies (server uses the secret key) ----------

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
