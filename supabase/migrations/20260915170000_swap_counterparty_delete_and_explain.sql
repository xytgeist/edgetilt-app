-- Account delete SET NULLs poker_tournament_swaps.counterparty_user_id.
-- The counterparty_present check still requires kind=user => user_id not null,
-- so GoTrue dies with "Database error deleting user" (internal 23514).
-- Flip the row back to guest and keep the label so the settled swap survives.

create or replace function public.poker_tournament_swaps_on_counterparty_user_nulled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.counterparty_user_id is null
     and old.counterparty_user_id is not null then
    new.counterparty_kind := 'guest';
    if nullif(trim(coalesce(new.counterparty_guest_label, '')), '') is null then
      new.counterparty_guest_label := 'Deleted account';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_poker_tournament_swaps_counterparty_user_nulled
  on public.poker_tournament_swaps;

create trigger trg_poker_tournament_swaps_counterparty_user_nulled
  before update of counterparty_user_id on public.poker_tournament_swaps
  for each row
  execute function public.poker_tournament_swaps_on_counterparty_user_nulled();

-- GoTrue strips the real SQL. This rolls back a postgres DELETE and returns SQLERRM.
create or replace function public.explain_auth_user_delete_block(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  err text;
begin
  if p_user_id is null then
    return 'missing user id';
  end if;

  begin
    perform set_config('lock_timeout', '2s', true);
    delete from auth.users where id = p_user_id;
    raise exception 'ET_DELETE_WOULD_SUCCEED';
  exception
    when others then
      err := sqlerrm;
      if err = 'ET_DELETE_WOULD_SUCCEED' then
        return null;
      end if;
      return sqlstate || ': ' || err;
  end;
end;
$$;

revoke all on function public.explain_auth_user_delete_block(uuid) from public, anon, authenticated;
grant execute on function public.explain_auth_user_delete_block(uuid) to service_role;

comment on function public.explain_auth_user_delete_block(uuid) is
  'Diagnostic: attempts DELETE FROM auth.users in a rolled-back subblock and returns the SQL error. Service role only.';
