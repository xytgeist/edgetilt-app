-- ============================================================================
-- Edge Pro Platform Tier & Gated Reply Settings
-- Spec: docs/entitlements-matrix.md §2.1 - §2.2
-- 1. Adds reply_gate_edge_pro boolean column to public.community_feed_posts
-- 2. Creates helper public.has_edge_pro_entitlement(p_user_id)
-- 3. Enforces reply gate on feed_comments INSERT (author / staff / Edge Pro subscribers only)
-- 4. Expands get_my_entitlements() to include Edge Pro platform status
-- ============================================================================

begin;

-- 1. Post author reply gating setting
alter table public.community_feed_posts
  add column if not exists reply_gate_edge_pro boolean not null default false;

comment on column public.community_feed_posts.reply_gate_edge_pro is
  'When true, only Edge Pro subscribers, the author, and staff may reply/comment on this post thread.';

-- 2. Helper to check if a user has active Edge Pro entitlement
create or replace function public.has_edge_pro_entitlement(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.user_subscriptions us
    where us.user_id = p_user_id
      and us.product_slug in ('edge-pro', 'slots-edge-lifetime')
      and us.status in ('active', 'trialing')
  )
  or exists (
    select 1
    from public.profiles pr
    where pr.user_id = p_user_id
      and pr.role in ('admin', 'moderator')
  );
$$;

revoke all on function public.has_edge_pro_entitlement(uuid) from public;
grant execute on function public.has_edge_pro_entitlement(uuid) to authenticated, anon, service_role;

comment on function public.has_edge_pro_entitlement(uuid) is
  'True if the user has an active edge-pro subscription, lifetime subscription, or staff role.';

-- 3. Function to check if viewer is allowed to insert a comment on a given post
create or replace function public.lounge_viewer_can_insert_feed_comment(p_post_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    (
      select
        -- Author can always reply
        p.user_id = p_user_id
        -- Staff can always reply
        or exists (
          select 1 from public.profiles pr
          where pr.user_id = p_user_id
            and pr.role in ('admin', 'moderator')
        )
        -- Creator fan check (if fan-only)
        or (
          (not coalesce(p.creator_fan_only, false) or public.has_creator_fan_sub(p_user_id, p.user_id))
          and
          -- Edge Pro reply gate check (if author enabled reply gating)
          (not coalesce(p.reply_gate_edge_pro, false) or public.has_edge_pro_entitlement(p_user_id))
        )
      from public.community_feed_posts p
      where p.id = p_post_id
        and p.hidden_at is null
    ),
    false
  );
$$;

revoke all on function public.lounge_viewer_can_insert_feed_comment(uuid, uuid) from public;
grant execute on function public.lounge_viewer_can_insert_feed_comment(uuid, uuid) to authenticated, service_role;

-- 4. Update feed_comments INSERT policy
drop policy if exists feed_comments_insert_own on public.feed_comments;
create policy feed_comments_insert_own on public.feed_comments
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and public.lounge_viewer_can_insert_feed_comment(post_id, auth.uid())
  );

-- 5. Expand get_my_entitlements()
create or replace function public.get_my_entitlements()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'platform', jsonb_build_object(
      'edge_pro', exists (
        select 1 from public.user_subscriptions us
        where us.user_id = auth.uid()
          and us.product_slug in ('edge-pro', 'slots-edge-lifetime')
          and us.status in ('active', 'trialing')
      ),
      'slots_edge_tier', coalesce(
        (
          select case
            when 'slots-edge-lifetime' in (select product_slug from public.user_subscriptions where user_id = auth.uid() and status in ('active', 'trialing')) then 'lifetime'
            when 'slots-edge' in (select product_slug from public.user_subscriptions where user_id = auth.uid() and status in ('active', 'trialing')) then 'pro'
            when 'slots-edge-starter' in (select product_slug from public.user_subscriptions where user_id = auth.uid() and status in ('active', 'trialing')) then 'starter'
            else 'none'
          end
        ),
        'none'
      ),
      'has_active_subscription', exists (
        select 1 from public.user_subscriptions us
        where us.user_id = auth.uid()
          and us.status in ('active', 'trialing')
      )
    ),
    'subscriptions', coalesce(
      (
        select jsonb_object_agg(
          us.product_slug,
          jsonb_build_object(
            'active', true,
            'status', us.status,
            'current_period_end', us.current_period_end,
            'cancel_at_period_end', us.cancel_at_period_end,
            'price_interval', us.price_interval
          )
        )
        from public.user_subscriptions us
        where us.user_id = auth.uid()
          and us.status in ('active', 'trialing')
      ),
      '{}'::jsonb
    ),
    'staff', jsonb_build_object(
      'is_staff', exists (
        select 1 from public.profiles pr
        where pr.user_id = auth.uid()
          and pr.role in ('admin', 'moderator')
      ),
      'is_admin', exists (
        select 1 from public.profiles pr
        where pr.user_id = auth.uid()
          and pr.role = 'admin'
      )
    )
  );
$$;

revoke all on function public.get_my_entitlements() from public;
grant execute on function public.get_my_entitlements() to authenticated, anon, service_role;

commit;
