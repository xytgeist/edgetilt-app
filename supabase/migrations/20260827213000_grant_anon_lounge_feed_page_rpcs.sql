-- Grant execute back to anon on public lounge feed reading RPCs so logged-out/anonymous
-- viewers can browse the public lounge feed.

grant execute on function public.lounge_feed_posts_page(
  text, uuid[], integer, timestamp with time zone, timestamp with time zone, uuid, numeric, text[]
) to anon, authenticated, service_role;

grant execute on function public.lounge_feed_pinned_for_viewer(
  uuid[], text[]
) to anon, authenticated, service_role;
