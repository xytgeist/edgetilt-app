-- One-play ledger settle uses the existing paid Alert copy + entry deep link.
-- Multi-play Settle All still emits play_log_ledger_settled.

create or replace function public.play_log_ledger_settled_activity()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_session uuid;
  v_entry_id uuid;
begin
  if new.counterpart_kind is distinct from 'user' then
    return new;
  end if;
  if new.counterpart_user_id is null or new.counterpart_user_id = new.actor_user_id then
    return new;
  end if;

  if coalesce(new.play_count, 0) = 1 then
    v_session := nullif(new.session_ids[1], null);
    if v_session is not null then
      select e.id
      into v_entry_id
      from public.play_log_entries e
      where e.session_id = v_session
        and e.user_id = new.counterpart_user_id
      limit 1;
    end if;

    if v_entry_id is not null then
      perform public.activity_events_insert_safe(
        new.counterpart_user_id,
        new.actor_user_id,
        'play_log_partner_paid',
        null,
        null,
        v_entry_id
      );
      return new;
    end if;
  end if;

  insert into public.activity_events (
    recipient_user_id,
    actor_user_id,
    event_type,
    detail_text
  )
  values (
    new.counterpart_user_id,
    new.actor_user_id,
    'play_log_ledger_settled',
    nullif(btrim(coalesce(new.message, '')), '')
  );
  return new;
exception
  when others then
    raise warning 'play_log_ledger_settled_activity: %', sqlerrm;
    return new;
end;
$$;

comment on function public.play_log_ledger_settled_activity() is
  'Settle All Alert: one play → play_log_partner_paid with entry id; several plays → play_log_ledger_settled.';

notify pgrst, 'reload schema';
