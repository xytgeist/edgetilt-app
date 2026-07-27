-- Fix Android (and shared-endpoint) push enable: client upsert hits RLS USING on
-- UPDATE when the endpoint row already belongs to another user_id (unique on endpoint).
-- SECURITY DEFINER reclaim: delete by endpoint, insert for auth.uid().

begin;

create or replace function public.upsert_my_push_subscription(
  p_endpoint text,
  p_p256dh text default null,
  p_auth text default null,
  p_expiration_time bigint default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  rid uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_endpoint is null or length(trim(p_endpoint)) = 0 then
    raise exception 'Missing push endpoint';
  end if;

  delete from public.push_subscriptions
  where endpoint = trim(p_endpoint);

  insert into public.push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth,
    expiration_time,
    user_agent
  )
  values (
    uid,
    trim(p_endpoint),
    p_p256dh,
    p_auth,
    p_expiration_time,
    p_user_agent
  )
  returning id into rid;

  return rid;
end;
$$;

revoke all on function public.upsert_my_push_subscription(text, text, text, bigint, text) from public;
grant execute on function public.upsert_my_push_subscription(text, text, text, bigint, text) to authenticated;

comment on function public.upsert_my_push_subscription(text, text, text, bigint, text) is
  'Reclaim push endpoint for the signed-in user. Avoids RLS upsert failures when the endpoint row was owned by another account.';

commit;
