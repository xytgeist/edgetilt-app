-- Poker Stable v2c: Edge backer in-app + push via activity_events.
-- Emits on slice invite, session complete, settle, and payment claim lifecycle.

begin;

alter table public.activity_events
  add column if not exists poker_stable_deal_id uuid
    references public.poker_stable_deals(id) on delete set null;

alter table public.activity_events
  add column if not exists poker_stable_payment_claim_id uuid
    references public.poker_stable_payment_claims(id) on delete set null;

create index if not exists activity_events_poker_stable_deal_idx
  on public.activity_events (poker_stable_deal_id)
  where poker_stable_deal_id is not null;

create index if not exists activity_events_poker_stable_claim_idx
  on public.activity_events (poker_stable_payment_claim_id)
  where poker_stable_payment_claim_id is not null;

comment on column public.activity_events.poker_stable_deal_id is
  'Deep link to Poker Stable deal detail (slice invite, session, settle).';

comment on column public.activity_events.poker_stable_payment_claim_id is
  'Payment claim awaiting confirm/contest (poker_stable_payment_claim).';

alter table public.activity_events
  drop constraint if exists activity_events_event_type_check;

alter table public.activity_events
  add constraint activity_events_event_type_check
  check (
    event_type in (
      'comment_on_post',
      'reply_to_comment',
      'mention_in_post',
      'mention_in_comment',
      'follow',
      'repost',
      'quote_repost',
      'bookmark',
      'like',
      'play_log_shared',
      'play_log_partner_paid',
      'play_log_partner_unpaid',
      'chat_dm',
      'chat_group_invite',
      'chat_call_invite',
      'chat_call_missed',
      'chat_mention',
      'starter_weekly_guide_drop',
      'creator_fan_sub',
      'poker_tournament_swap',
      'poker_tournament_swap_result',
      'ap_guide_released',
      'poker_stable_slice_invite',
      'poker_stable_session_complete',
      'poker_stable_settled',
      'poker_stable_payment_claim',
      'poker_stable_payment_claim_resolved'
    )
  );

create or replace function public.poker_stable_emit_activity_event(
  p_recipient_user_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_deal_id uuid default null,
  p_claim_id uuid default null,
  p_detail_text text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_recipient_user_id is null or p_actor_user_id is null then
    return null;
  end if;
  if p_recipient_user_id = p_actor_user_id then
    return null;
  end if;

  insert into public.activity_events (
    recipient_user_id,
    actor_user_id,
    event_type,
    poker_stable_deal_id,
    poker_stable_payment_claim_id,
    detail_text
  )
  values (
    p_recipient_user_id,
    p_actor_user_id,
    p_event_type,
    p_deal_id,
    p_claim_id,
    nullif(trim(coalesce(p_detail_text, '')), '')
  )
  returning id into v_id;

  return v_id;
exception
  when others then
    raise warning 'poker_stable_emit_activity_event: %', sqlerrm;
    return null;
end;
$$;

comment on function public.poker_stable_emit_activity_event(uuid, uuid, text, uuid, uuid, text) is
  'Insert Stable activity_events row (triggers push). SECURITY DEFINER.';

create or replace function public.poker_stable_slice_invite_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stakee uuid;
  v_label text;
begin
  if new.counterparty_kind is distinct from 'user' then
    return new;
  end if;
  if new.staker_user_id is null then
    return new;
  end if;
  if new.status not in ('pending', 'proposed') then
    return new;
  end if;

  select d.stakee_user_id, d.label
  into v_stakee, v_label
  from public.poker_stable_deals d
  where d.id = new.deal_id;

  if v_stakee is null then
    return new;
  end if;

  perform public.poker_stable_emit_activity_event(
    new.staker_user_id,
    v_stakee,
    'poker_stable_slice_invite',
    new.deal_id,
    null,
    coalesce(v_label, 'Backing invite')
  );

  return new;
end;
$$;

drop trigger if exists poker_stable_slice_invite_activity on public.poker_stable_deal_slices;
create trigger poker_stable_slice_invite_activity
  after insert on public.poker_stable_deal_slices
  for each row
  execute function public.poker_stable_slice_invite_activity();

create or replace function public.poker_stable_session_complete_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slice record;
  v_deal_label text;
  v_wl numeric;
  v_detail text;
begin
  if new.deal_id is null or new.status is distinct from 'completed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'completed' then
    return new;
  end if;
  if coalesce(new.notes, '') like '%seed:%' then
    return new;
  end if;

  select d.label into v_deal_label
  from public.poker_stable_deals d
  where d.id = new.deal_id;

  v_wl :=
    coalesce(new.cash_out, 0)
    - coalesce(new.buy_in, 0)
    - coalesce(new.rebuy_amount, 0)
    - coalesce(new.addon_amount, 0);

  v_detail := format(
    '%s · table %s%s',
    coalesce(v_deal_label, 'Stake session'),
    case when v_wl >= 0 then '+' else '' end,
    trim(to_char(v_wl, 'FM999,999,990.00'))
  );

  for v_slice in
    select s.staker_user_id
    from public.poker_stable_deal_slices s
    where s.deal_id = new.deal_id
      and s.counterparty_kind = 'user'
      and s.staker_user_id is not null
      and s.status in ('active', 'pending')
  loop
    perform public.poker_stable_emit_activity_event(
      v_slice.staker_user_id,
      new.user_id,
      'poker_stable_session_complete',
      new.deal_id,
      null,
      v_detail
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists poker_stable_session_complete_activity on public.poker_bankroll_sessions;
create trigger poker_stable_session_complete_activity
  after insert or update of status on public.poker_bankroll_sessions
  for each row
  execute function public.poker_stable_session_complete_activity();

create or replace function public.poker_stable_settled_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slice record;
  v_deal_label text;
  v_stakee uuid;
  v_detail text;
begin
  select d.label, d.stakee_user_id
  into v_deal_label, v_stakee
  from public.poker_stable_deals d
  where d.id = new.deal_id;

  if v_stakee is null then
    return new;
  end if;

  v_detail := format(
    '%s · profit above baseline %s',
    coalesce(v_deal_label, 'Stake'),
    trim(to_char(coalesce(new.profit_above_baseline, 0), 'FM999,999,990.00'))
  );

  for v_slice in
    select s.staker_user_id
    from public.poker_stable_deal_slices s
    where s.deal_id = new.deal_id
      and s.counterparty_kind = 'user'
      and s.staker_user_id is not null
      and s.status = 'active'
  loop
    perform public.poker_stable_emit_activity_event(
      v_slice.staker_user_id,
      v_stakee,
      'poker_stable_settled',
      new.deal_id,
      null,
      v_detail
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists poker_stable_settled_activity on public.poker_stable_deal_settlements;
create trigger poker_stable_settled_activity
  after insert on public.poker_stable_deal_settlements
  for each row
  execute function public.poker_stable_settled_activity();

create or replace function public.poker_stable_payment_claim_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stakee uuid;
  v_staker uuid;
  v_deal_label text;
  v_recipient uuid;
  v_detail text;
  v_event_type text;
begin
  select d.stakee_user_id, d.label
  into v_stakee, v_deal_label
  from public.poker_stable_deals d
  where d.id = new.deal_id;

  select s.staker_user_id
  into v_staker
  from public.poker_stable_deal_slices s
  where s.id = new.slice_id;

  if tg_op = 'INSERT' and new.status = 'pending' then
    if new.claim_kind = 'payment_made' then
      v_recipient := v_staker;
      v_detail := format(
        'Claims they paid %s on %s',
        trim(to_char(new.amount, 'FM999,999,990.00')),
        coalesce(v_deal_label, 'stake')
      );
    elsif new.claim_kind = 'payment_received' then
      v_recipient := v_stakee;
      v_detail := format(
        'Claims they received %s on %s',
        trim(to_char(new.amount, 'FM999,999,990.00')),
        coalesce(v_deal_label, 'stake')
      );
    else
      return new;
    end if;

    if v_recipient is null or v_recipient = new.actor_user_id then
      return new;
    end if;

    perform public.poker_stable_emit_activity_event(
      v_recipient,
      new.actor_user_id,
      'poker_stable_payment_claim',
      new.deal_id,
      new.id,
      v_detail
    );
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.status = 'pending'
    and new.status in ('confirmed', 'disputed')
  then
    v_recipient := new.actor_user_id;
    v_event_type := 'poker_stable_payment_claim_resolved';
    v_detail := format(
      'Your %s payment claim was %s on %s',
      trim(to_char(new.amount, 'FM999,999,990.00')),
      new.status,
      coalesce(v_deal_label, 'stake')
    );

    if v_recipient is null or v_recipient = new.responded_by_user_id then
      return new;
    end if;

    perform public.poker_stable_emit_activity_event(
      v_recipient,
      coalesce(new.responded_by_user_id, new.actor_user_id),
      v_event_type,
      new.deal_id,
      new.id,
      v_detail
    );
  end if;

  return new;
end;
$$;

drop trigger if exists poker_stable_payment_claim_activity on public.poker_stable_payment_claims;
create trigger poker_stable_payment_claim_activity
  after insert or update of status on public.poker_stable_payment_claims
  for each row
  execute function public.poker_stable_payment_claim_activity();

drop function if exists public.lounge_activity_events_page(integer, timestamptz, uuid);

create function public.lounge_activity_events_page(
  p_limit integer default 30,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  event_type text,
  post_id uuid,
  comment_id uuid,
  play_log_entry_id uuid,
  chat_room_id uuid,
  chat_call_id uuid,
  read_at timestamptz,
  created_at timestamptz,
  actor_user_id uuid,
  actor_handle text,
  actor_display_name text,
  actor_avatar_url text,
  actor_role text,
  actor_is_og boolean,
  play_log_game_name text,
  play_log_share_percent numeric,
  starter_weekly_unlock_id uuid,
  detail_text text,
  poker_tournament_swap_id uuid,
  guide_slug text,
  poker_stable_deal_id uuid,
  poker_stable_payment_claim_id uuid
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    ae.id,
    ae.event_type,
    ae.post_id,
    ae.comment_id,
    ae.play_log_entry_id,
    ae.chat_room_id,
    ae.chat_call_id,
    ae.read_at,
    ae.created_at,
    ae.actor_user_id,
    p.handle as actor_handle,
    p.display_name as actor_display_name,
    p.avatar_url as actor_avatar_url,
    p.role as actor_role,
    coalesce(p.is_og, false) as actor_is_og,
    tpl.display_name as play_log_game_name,
    sp.share_percent as play_log_share_percent,
    ae.starter_weekly_unlock_id,
    ae.detail_text,
    ae.poker_tournament_swap_id,
    ae.guide_slug,
    ae.poker_stable_deal_id,
    ae.poker_stable_payment_claim_id
  from public.activity_events ae
  join public.profiles p on p.user_id = ae.actor_user_id
  left join public.play_log_entries ple on ple.id = ae.play_log_entry_id
  left join public.play_log_game_templates tpl on tpl.id = ple.template_id
  left join public.play_log_session_partners sp
    on sp.session_id = ple.session_id
   and sp.user_id = auth.uid()
   and sp.participant_kind = 'user'
  where ae.recipient_user_id = auth.uid()
    and ae.event_type not in (
      'chat_dm',
      'chat_group_invite',
      'chat_call_invite'
    )
    and (
      p_before_created_at is null
      or p_before_id is null
      or (ae.created_at, ae.id) < (p_before_created_at, p_before_id)
    )
  order by ae.created_at desc, ae.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 50));
$$;

grant execute on function public.lounge_activity_events_page(integer, timestamptz, uuid) to authenticated;

comment on function public.lounge_activity_events_page(integer, timestamptz, uuid) is
  'Lounge notifications page. Includes poker_stable_* deal/claim deep links.';

commit;
