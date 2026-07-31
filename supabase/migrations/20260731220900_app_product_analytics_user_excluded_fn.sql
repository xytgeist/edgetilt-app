create or replace function public.app_product_analytics_user_excluded(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = p_user_id
      and (
        p.role = 'admin'
        or lower(btrim(coalesce(p.handle, ''))) in (
          select e.handle
          from public.app_product_analytics_excluded_handles e
        )
      )
  );
$$;

comment on function public.app_product_analytics_user_excluded(uuid) is
  'True when user is admin or handle is in app_product_analytics_excluded_handles (Monitor product analytics).';

revoke all on function public.app_product_analytics_user_excluded(uuid) from public;
