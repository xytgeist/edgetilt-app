-- Allow classic group calls to use media_mode = video (kind stays group_audio for leave/join).

begin;

alter table public.chat_calls
  drop constraint if exists chat_calls_media_mode_kind;

alter table public.chat_calls
  add constraint chat_calls_media_mode_kind check (
    (kind = 'group_audio' and media_mode in ('audio', 'video'))
    or kind = 'dm_av'
  );

comment on table public.chat_calls is
  'LiveKit-backed DM A/V and group audio/video calls. Membership gated via chat_room_members.';

commit;
