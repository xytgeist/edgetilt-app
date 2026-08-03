-- Backer Create stake: deal INSERT allows staker_user_id = auth.uid(), but slice INSERT
-- only allowed stakee_user_id = auth.uid(). Guest-stakee deals (stakee_user_id null) and
-- legacy backer-led requests then fail on poker_stable_deal_slices insert.

drop policy if exists "poker_stable_deal_slices_insert" on public.poker_stable_deal_slices;
create policy "poker_stable_deal_slices_insert"
  on public.poker_stable_deal_slices for insert
  with check (
    exists (
      select 1
      from public.poker_stable_deals d
      where d.id = deal_id
        and (
          d.stakee_user_id = auth.uid()
          or d.staker_user_id = auth.uid()
        )
    )
  );
