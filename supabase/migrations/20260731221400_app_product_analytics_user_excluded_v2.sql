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
    left join auth.users u on u.id = p.user_id
    where p.user_id = p_user_id
      and (
        p.role = 'admin'
        or lower(btrim(coalesce(p.handle, ''))) in (
          select e.handle
          from public.app_product_analytics_excluded_handles e
        )
        or lower(btrim(coalesce(u.email, ''))) in (
          select em.email
          from public.app_product_analytics_excluded_emails em
        )
        or lower(btrim(coalesce(u.email, ''))) like '%@bots.edgetilt.local'
      )
  );
$$;

comment on function public.app_product_analytics_user_excluded(uuid) is
  'True when user is admin, blocklisted handle/email, or bot service account (@bots.edgetilt.local).';

revoke all on function public.app_product_analytics_user_excluded(uuid) from public;
