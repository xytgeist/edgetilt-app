-- Play Logbook — allow admins to manage primary (is_system) game templates from the app.

create or replace function public.play_log_viewer_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
  );
$$;

revoke all on function public.play_log_viewer_is_admin() from public;
grant execute on function public.play_log_viewer_is_admin() to authenticated;

drop policy if exists "play_log_templates_admin_insert_system" on public.play_log_game_templates;
create policy "play_log_templates_admin_insert_system"
  on public.play_log_game_templates for insert
  to authenticated
  with check (
    public.play_log_viewer_is_admin()
    and is_system = true
    and user_id is null
    and slug is not null
    and btrim(slug) <> ''
  );

drop policy if exists "play_log_templates_admin_update_system" on public.play_log_game_templates;
create policy "play_log_templates_admin_update_system"
  on public.play_log_game_templates for update
  to authenticated
  using (is_system = true and public.play_log_viewer_is_admin())
  with check (
    is_system = true
    and user_id is null
    and slug is not null
    and btrim(slug) <> ''
  );

drop policy if exists "play_log_templates_admin_delete_system" on public.play_log_game_templates;
create policy "play_log_templates_admin_delete_system"
  on public.play_log_game_templates for delete
  to authenticated
  using (is_system = true and public.play_log_viewer_is_admin());
