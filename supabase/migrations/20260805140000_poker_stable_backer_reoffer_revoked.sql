-- Lead backer may replace slices when re-offering a revoked Create Stake (avoid duplicate deal rows).

drop policy if exists "poker_stable_deal_slices_delete_backer_reoffer" on public.poker_stable_deal_slices;
create policy "poker_stable_deal_slices_delete_backer_reoffer"
  on public.poker_stable_deal_slices for delete
  using (
    exists (
      select 1
      from public.poker_stable_deals d
      where d.id = deal_id
        and d.staker_user_id = auth.uid()
        and d.status = 'revoked'
    )
  );
