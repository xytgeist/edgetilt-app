-- Stakee may log stake sessions while deal is pending; backers see them after accept activates the deal.

do $migration$
begin
  drop policy if exists "poker_bankroll_sessions_insert" on public.poker_bankroll_sessions;
  create policy "poker_bankroll_sessions_insert"
    on public.poker_bankroll_sessions for insert
    with check (
      auth.uid() = user_id
      and (
        deal_id is null
        or exists (
          select 1
          from public.poker_stable_deals d
          where d.id = deal_id
            and d.stakee_user_id = auth.uid()
            and d.status in ('pending', 'active')
        )
      )
    );
end
$migration$;
