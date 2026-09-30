-- Cross-isolate cache for Edge Functions (scoreboard board/detail, Odds API packs, game news, share card).
-- Each Edge isolate keeps its own memory cache; this row is the shared layer behind it so N warm isolates
-- make one upstream fetch per TTL instead of N. Service role only (no RLS policies, no client grants).

create table if not exists public.edge_shared_cache (
  key text primary key,
  payload jsonb,
  fetched_at timestamptz,
  lease_until timestamptz
);

alter table public.edge_shared_cache enable row level security;
revoke all on public.edge_shared_cache from anon, authenticated;

create index if not exists edge_shared_cache_fetched_at_idx on public.edge_shared_cache (fetched_at);

-- One caller wins the rebuild lease for an expired key; everyone else serves stale or waits.
create or replace function public.edge_shared_cache_claim(p_key text, p_lease_ms integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  insert into public.edge_shared_cache (key, lease_until)
  values (p_key, now() + make_interval(secs => greatest(p_lease_ms, 1000) / 1000.0))
  on conflict (key) do update
    set lease_until = excluded.lease_until
    where public.edge_shared_cache.lease_until is null
       or public.edge_shared_cache.lease_until < now()
  returning true into v_claimed;

  if random() < 0.005 then
    delete from public.edge_shared_cache
    where fetched_at < now() - interval '3 days'
      and (lease_until is null or lease_until < now());
  end if;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.edge_shared_cache_claim(text, integer) from public, anon, authenticated;
grant execute on function public.edge_shared_cache_claim(text, integer) to service_role;
