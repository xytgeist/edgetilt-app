-- Live Mark paid → other party's session card updates without reload.

begin;

alter table public.poker_tournament_swaps replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'poker_tournament_swaps'
    ) then
      alter publication supabase_realtime add table public.poker_tournament_swaps;
    end if;
  end if;
end $$;

commit;
