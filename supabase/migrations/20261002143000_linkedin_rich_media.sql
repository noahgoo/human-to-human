create table if not exists public.linkedin_rich_media (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.linkedin_imports(id) on delete cascade,
  applicant_id uuid not null references public.profiles(id) on delete cascade,
  occurred_at text,
  description text not null check (char_length(description) <= 5000),
  media_link text check (media_link is null or char_length(media_link) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists linkedin_rich_media_import_idx on public.linkedin_rich_media(import_id);

alter table public.linkedin_rich_media enable row level security;

drop policy if exists linkedin_rich_media_select_own on public.linkedin_rich_media;
create policy linkedin_rich_media_select_own on public.linkedin_rich_media
  for select to authenticated
  using (applicant_id = auth.uid());

grant select on public.linkedin_rich_media to authenticated;

alter table public.linkedin_imports drop constraint if exists linkedin_imports_files_present_check;
alter table public.linkedin_imports add constraint linkedin_imports_files_present_check
  check (files_present <@ array[
    'Profile.csv','Positions.csv','Skills.csv','Education.csv','Connections.csv','Rich_Media.csv'
  ]::text[]);
