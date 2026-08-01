-- Bankroll profile row is created when a deal goes active (not while pending).
-- Allow any deal participant to bootstrap the row on activation (stakee create or last slice accept).

drop policy if exists "poker_deal_bankroll_profiles_insert" on public.poker_deal_bankroll_profiles;
create policy "poker_deal_bankroll_profiles_insert"
  on public.poker_deal_bankroll_profiles for insert
  with check (
    exists (
      select 1
      from public.poker_stable_deals d
      where d.id = deal_id
        and d.status = 'active'
        and public.poker_stable_user_can_access_deal(d.id, auth.uid())
    )
  );

drop policy if exists "poker_deal_bankroll_profiles_update" on public.poker_deal_bankroll_profiles;
create policy "poker_deal_bankroll_profiles_update"
  on public.poker_deal_bankroll_profiles for update
  using (
    exists (
      select 1
      from public.poker_stable_deals d
      where d.id = deal_id
        and d.stakee_user_id = auth.uid()
        and d.status = 'active'
    )
  );
