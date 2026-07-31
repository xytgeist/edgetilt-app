-- Edge Monitor lounge bots: expose all configured personas (not just first market_news row).

create or replace function public.admin_lounge_bot_ops_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal jsonb;
  v_bots jsonb;
  v_market_news jsonb;
begin
  v_portal := public.admin_lounge_bot_portal_snapshot();

  select coalesce(jsonb_agg(compact order by compact->>'slug'), '[]'::jsonb)
  into v_bots
  from (
    select jsonb_build_object(
      'configured', true,
      'slug', elem->>'slug',
      'user_id', elem->>'user_id',
      'pipeline', elem->>'pipeline',
      'review_mode', elem->>'review_mode',
      'display_name', elem->>'display_name',
      'handle', elem->>'handle',
      'enabled', elem->'enabled',
      'run_state', elem->>'run_state',
      'last_poll_at', elem->>'last_poll_at',
      'last_publish_at', elem->>'last_publish_at',
      'max_posts_per_day', elem->'max_posts_per_day',
      'max_posts_per_hour', elem->'max_posts_per_hour',
      'publish_score_threshold', elem->'publish_score_threshold',
      'posts_today', elem->'posts_today',
      'posts_last_hour', elem->'posts_last_hour',
      'pending_review', elem->'pending_review',
      'sources_enabled', (
        select count(*)::int
        from jsonb_array_elements(coalesce(elem->'sources', '[]'::jsonb)) s
        where (s->>'enabled')::boolean = true
      ),
      'x_sources_enabled', (
        select count(*)::int
        from jsonb_array_elements(coalesce(elem->'x_sources', '[]'::jsonb)) xs
        where (xs->>'enabled')::boolean = true
      ),
      'recent_publishes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', l->>'id',
          'caption', l->>'caption',
          'score', l->>'score',
          'post_id', l->>'post_id',
          'created_at', l->>'created_at'
        ))
        from jsonb_array_elements(coalesce(elem->'recent_log', '[]'::jsonb)) l
        where l->>'status' = 'published'
      ), '[]'::jsonb),
      'recent_errors', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', l->>'id',
          'error_message', l->>'error_message',
          'created_at', l->>'created_at'
        ))
        from jsonb_array_elements(coalesce(elem->'recent_log', '[]'::jsonb)) l
        where l->>'status' = 'failed'
      ), '[]'::jsonb)
    ) as compact
    from jsonb_array_elements(coalesce(v_portal->'bots', '[]'::jsonb)) elem
  ) t;

  select elem into v_market_news
  from jsonb_array_elements(v_bots) elem
  where elem->>'pipeline' = 'market_news'
  order by elem->>'slug'
  limit 1;

  return jsonb_build_object(
    'generated_at', v_portal->'generated_at',
    'editorial_pending', v_portal->'editorial_pending',
    'editorial_scheduled', v_portal->'editorial_scheduled',
    'bots', v_bots,
    'market_news', coalesce(v_market_news, jsonb_build_object('configured', false)),
    'financial_wire', coalesce(v_market_news, jsonb_build_object('configured', false))
  );
end;
$$;
