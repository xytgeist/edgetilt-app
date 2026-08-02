-- Slice accept/decline: UPDATE policy referenced deal.staker_user_id inside EXISTS,
-- which is null on player-created stakes — slice backers could not update their row
-- (.single() → "cannot coerce the result to a single JSON object").

drop policy if exists "poker_stable_deal_slices_update" on public.poker_stable_deal_slices;
create policy "poker_stable_deal_slices_update"
  on public.poker_stable_deal_slices for update
  using (
    poker_stable_deal_slices.staker_user_id = auth.uid()
    or exists (
      select 1
      from public.poker_stable_deals d
      where d.id = poker_stable_deal_slices.deal_id
        and d.stakee_user_id = auth.uid()
    )
  );

-- Slice backer may bootstrap deal roll on activation (upsert conflict path).
drop policy if exists "poker_deal_bankroll_profiles_update" on public.poker_deal_bankroll_profiles;
create policy "poker_deal_bankroll_profiles_update"
  on public.poker_deal_bankroll_profiles for update
  using (public.poker_stable_user_can_access_deal(deal_id, auth.uid()));
