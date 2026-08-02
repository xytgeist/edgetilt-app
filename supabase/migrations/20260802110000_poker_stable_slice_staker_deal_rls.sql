-- Player-initiated multi-slice deals: slice backers must read/update the parent deal row.
-- v2 wired child tables through poker_stable_user_can_access_deal but left deals SELECT/UPDATE
-- on the bones policy (staker_user_id / stakee_user_id only), so Edge slice invites never loaded.

drop policy if exists "poker_stable_deals_select" on public.poker_stable_deals;
create policy "poker_stable_deals_select"
  on public.poker_stable_deals for select
  using (public.poker_stable_user_can_access_deal(id, auth.uid()));

drop policy if exists "poker_stable_deals_update" on public.poker_stable_deals;
create policy "poker_stable_deals_update"
  on public.poker_stable_deals for update
  using (public.poker_stable_user_can_access_deal(id, auth.uid()));

drop policy if exists "poker_deal_bankroll_profiles_select" on public.poker_deal_bankroll_profiles;
create policy "poker_deal_bankroll_profiles_select"
  on public.poker_deal_bankroll_profiles for select
  using (public.poker_stable_user_can_access_deal(deal_id, auth.uid()));
