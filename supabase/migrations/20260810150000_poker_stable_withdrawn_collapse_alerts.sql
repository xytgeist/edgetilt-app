-- Cancel was rewriting every invite/nudge (and terms_edited) for a deal in place,
-- so Alerts showed N identical "withdrew the stake offer" rows. Keep one per recipient.

begin;

create or replace function public.poker_stable_cancel_stake_deal(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_label text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select d.status, d.label
  into v_status, v_label
  from public.poker_stable_deals d
  where d.id = p_deal_id
    and d.stakee_user_id = v_uid
    and d.status in ('pending', 'active');

  if v_status is null then
    raise exception 'You cannot delete this stake';
  end if;

  if exists (
    select 1
    from public.poker_stable_deal_slices s
    where s.deal_id = p_deal_id
      and s.counterparty_kind = 'user'
      and s.status = 'active'
  ) then
    raise exception 'Cannot delete after an Edge backer has accepted';
  end if;

  if exists (
    select 1
    from public.poker_stable_deal_settlements
    where deal_id = p_deal_id
  ) then
    raise exception 'Cannot delete a stake that has been settled';
  end if;

  -- Collapse invite / nudge / terms-edited Alerts for this deal into one withdrawn row
  -- per recipient. UPDATE does not enqueue push; bump created_at + clear read_at.
  with ranked as (
    select
      ae.id,
      ae.recipient_user_id,
      row_number() over (
        partition by ae.recipient_user_id
        order by ae.created_at desc nulls last, ae.id desc
      ) as rn
    from public.activity_events ae
    where ae.poker_stable_deal_id = p_deal_id
      and ae.event_type in (
        'poker_stable_slice_invite',
        'poker_stable_slice_nudge',
        'poker_stable_terms_edited',
        'poker_stable_offer_withdrawn'
      )
  ),
  dropped as (
    delete from public.activity_events ae
    using ranked r
    where ae.id = r.id
      and r.rn > 1
    returning ae.id
  )
  update public.activity_events ae
  set
    event_type = 'poker_stable_offer_withdrawn',
    detail_text = coalesce(nullif(trim(v_label), ''), nullif(trim(ae.detail_text), ''), 'Stake offer'),
    created_at = now(),
    read_at = null
  from ranked r
  where ae.id = r.id
    and r.rn = 1;

  delete from public.poker_bankroll_sessions
  where deal_id = p_deal_id
    and user_id = v_uid;

  delete from public.poker_stable_deals
  where id = p_deal_id
    and stakee_user_id = v_uid;
end;
$$;

comment on function public.poker_stable_cancel_stake_deal(uuid) is
  'Stakee deletes a pending stake before any Edge backer accepts; collapses invite/nudge/terms Alerts to one offer_withdrawn per recipient.';

revoke all on function public.poker_stable_cancel_stake_deal(uuid) from public;
grant execute on function public.poker_stable_cancel_stake_deal(uuid) to authenticated;

-- One-time: collapse duplicate withdrawn Alerts already written (deal_id often null after cancel).
with ranked as (
  select
    ae.id,
    row_number() over (
      partition by
        ae.recipient_user_id,
        ae.actor_user_id,
        coalesce(ae.detail_text, ''),
        ae.created_at
      order by ae.id desc
    ) as rn
  from public.activity_events ae
  where ae.event_type = 'poker_stable_offer_withdrawn'
)
delete from public.activity_events ae
using ranked r
where ae.id = r.id
  and r.rn > 1;

commit;
