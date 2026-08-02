-- Backers with deal access may read on-stake sessions for active, settled, and revoked deals.

begin;

drop policy if exists "poker_bankroll_sessions_select" on public.poker_bankroll_sessions;
create policy "poker_bankroll_sessions_select"
  on public.poker_bankroll_sessions for select
  using (
    auth.uid() = user_id
    or (
      deal_id is not null
      and public.poker_stable_user_can_access_deal(deal_id, auth.uid())
    )
  );

commit;
