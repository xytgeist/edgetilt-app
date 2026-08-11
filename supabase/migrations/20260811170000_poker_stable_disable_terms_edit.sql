-- Phase 1: terms renegotiation removed. Accept/Decline only; decline + create a new stake.
-- These RPCs stay callable but always error so stale clients cannot revise terms.

begin;

create or replace function public.poker_stable_propose_terms(p_deal_id uuid, p_terms jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  raise exception 'Terms editing is disabled. Decline the stake and create a new one.';
end;
$fn$;

drop function if exists public.poker_stable_stakee_accept_proposed_terms(uuid);
create function public.poker_stable_stakee_accept_proposed_terms(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  raise exception 'Terms editing is disabled. Decline the stake and create a new one.';
end;
$fn$;

create or replace function public.poker_stable_clear_proposed_terms(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  raise exception 'Terms editing is disabled. Decline the stake and create a new one.';
end;
$fn$;

create or replace function public.poker_stable_stakee_propose_counter_terms(p_deal_id uuid, p_terms jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  raise exception 'Terms editing is disabled. Decline the stake and create a new one.';
end;
$fn$;

drop function if exists public.poker_stable_staker_accept_counter_terms(uuid);
create function public.poker_stable_staker_accept_counter_terms(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  raise exception 'Terms editing is disabled. Decline the stake and create a new one.';
end;
$fn$;

drop function if exists public.poker_stable_staker_decline_counter_terms(uuid);
create function public.poker_stable_staker_decline_counter_terms(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  raise exception 'Terms editing is disabled. Decline the stake and create a new one.';
end;
$fn$;

create or replace function public.poker_stable_apply_stakee_terms(
  p_deal_id uuid,
  p_deal jsonb,
  p_slices jsonb,
  p_clear_proposal boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  raise exception 'Terms editing is disabled. Decline the stake and create a new one.';
end;
$fn$;

comment on function public.poker_stable_propose_terms(uuid, jsonb) is
  'Disabled: terms renegotiation removed (Accept/Decline or create a new stake).';
comment on function public.poker_stable_apply_stakee_terms(uuid, jsonb, jsonb, boolean) is
  'Disabled: terms renegotiation removed (Accept/Decline or create a new stake).';

commit;
