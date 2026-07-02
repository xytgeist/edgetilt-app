-- Slots Edge Lifetime Founding Pass — one-time purchase, full Slots vertical access incl. future tools.
insert into public.subscription_products (slug, display_name, description, active, sort_order)
values (
  'slots-edge-lifetime',
  'Slots Edge Lifetime',
  'One-time payment: full AP Slots access today plus future Slots Edge tools and guides without add-on paywalls.',
  true,
  15
)
on conflict (slug) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  active = excluded.active,
  sort_order = excluded.sort_order;

-- Legacy boolean mirrors active Full subscription OR active lifetime pass.
create or replace function public.sync_profile_has_active_subscription(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  active_full boolean;
begin
  if p_user_id is null then
    return;
  end if;

  select exists (
    select 1
    from public.user_subscriptions us
    where us.user_id = p_user_id
      and us.product_slug in ('slots-edge', 'slots-edge-lifetime')
      and us.status in ('active', 'trialing')
  )
  into active_full;

  update public.profiles p
  set has_active_subscription = active_full
  where p.user_id = p_user_id
    and p.has_active_subscription is distinct from active_full;
end;
$$;

comment on function public.sync_profile_has_active_subscription(uuid) is
  'Keeps profiles.has_active_subscription in sync with active slots-edge or slots-edge-lifetime.';
