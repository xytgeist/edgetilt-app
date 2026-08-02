-- Fix player Create stake: INSERT … RETURNING must pass SELECT RLS on the new deal row.
-- 20260802110000 replaced direct stakee/staker SELECT with poker_stable_user_can_access_deal()
-- only; PostgREST .insert().select().single() then fails with RLS on poker_stable_deals
-- even when INSERT WITH CHECK passes (stakee_user_id = auth.uid()).

drop policy if exists "poker_stable_deals_select" on public.poker_stable_deals;
create policy "poker_stable_deals_select"
  on public.poker_stable_deals for select
  using (
    auth.uid() = stakee_user_id
    or auth.uid() = staker_user_id
    or exists (
      select 1
      from public.poker_stable_deal_slices s
      where s.deal_id = poker_stable_deals.id
        and s.staker_user_id = auth.uid()
    )
  );

-- Stakee delete uses poker_stable_cancel_stake_deal RPC; allow read-path parity on UPDATE.
drop policy if exists "poker_stable_deals_update" on public.poker_stable_deals;
create policy "poker_stable_deals_update"
  on public.poker_stable_deals for update
  using (
    auth.uid() = stakee_user_id
    or auth.uid() = staker_user_id
    or exists (
      select 1
      from public.poker_stable_deal_slices s
      where s.deal_id = poker_stable_deals.id
        and s.staker_user_id = auth.uid()
    )
  );

drop policy if exists "poker_stable_deals_delete" on public.poker_stable_deals;
create policy "poker_stable_deals_delete"
  on public.poker_stable_deals for delete
  using (auth.uid() = stakee_user_id or auth.uid() = staker_user_id);
