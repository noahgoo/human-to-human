-- Recruiter repo scores now use the five categories from main
-- (data architecture, performance, deployment, code quality, team topology).
-- No-op when the init schema already created those columns.

do $$
declare
  constraint_name text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'repo_evaluations' and column_name = 'security_score'
  ) then
    for constraint_name in
      select con.conname
      from pg_constraint con
      where con.conrelid = 'public.repo_evaluations'::regclass
        and con.contype = 'c'
        and pg_get_constraintdef(con.oid) like '%security_score%'
    loop
      execute format('alter table public.repo_evaluations drop constraint %I', constraint_name);
    end loop;

    alter table public.repo_evaluations drop column if exists overall_score;
    alter table public.repo_evaluations
      add column data_architecture_score smallint check (data_architecture_score between 1 and 10),
      add column deployment_score smallint check (deployment_score between 1 and 10),
      add column code_quality_score smallint check (code_quality_score between 1 and 10),
      add column team_topology_score smallint check (team_topology_score between 1 and 10);

    update public.repo_evaluations
    set data_architecture_score = security_score,
        deployment_score = organization_score,
        code_quality_score = testing_score,
        team_topology_score = round((security_score + organization_score + performance_score + testing_score) / 4.0)::smallint
    where security_score is not null;

    alter table public.repo_evaluations drop column security_score;
    alter table public.repo_evaluations drop column organization_score;
    alter table public.repo_evaluations drop column testing_score;

    alter table public.repo_evaluations
      add column overall_score numeric(4,2) generated always as
        ((data_architecture_score + performance_score + deployment_score + code_quality_score + team_topology_score)::numeric / 5) stored;

    alter table public.repo_evaluations
      add constraint repo_evaluations_succeeded_scores_check
      check (status <> 'succeeded' or (
        data_architecture_score is not null and performance_score is not null
        and deployment_score is not null and code_quality_score is not null
        and team_topology_score is not null and rationale is not null
      ));
  end if;
end $$;
