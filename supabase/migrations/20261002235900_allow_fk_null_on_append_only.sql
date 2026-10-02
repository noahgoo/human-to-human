-- Deleting a profile sets application_events.actor_id and token_ledger.created_by
-- to null. Those tables are append-only, so the update was rejected and
-- auth.users deletes failed in the dashboard.
create or replace function private.forbid_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'application_events'
     and new.actor_id is null
     and old.actor_id is not null
     and new.id is not distinct from old.id
     and new.application_id is not distinct from old.application_id
     and new.from_status is not distinct from old.from_status
     and new.to_status is not distinct from old.to_status
     and new.note is not distinct from old.note
     and new.created_at is not distinct from old.created_at
  then
    return new;
  end if;

  if tg_table_name = 'token_ledger'
     and new.created_by is null
     and old.created_by is not null
     and new.id is not distinct from old.id
     and new.applicant_id is not distinct from old.applicant_id
     and new.period is not distinct from old.period
     and new.kind is not distinct from old.kind
     and new.amount is not distinct from old.amount
     and new.application_id is not distinct from old.application_id
     and new.reason is not distinct from old.reason
     and new.created_at is not distinct from old.created_at
  then
    return new;
  end if;

  raise exception '% is append-only', tg_table_name using errcode = 'P0001', hint = 'FORBIDDEN';
end $$;
