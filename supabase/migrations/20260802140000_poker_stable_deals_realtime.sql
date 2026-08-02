-- Stakee bankroll hero: live pending → active when backer accepts slice (no full page reload).

begin;

alter table public.poker_stable_deals replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'poker_stable_deals'
    ) then
      alter publication supabase_realtime add table public.poker_stable_deals;
    end if;
  end if;
end $$;

commit;
