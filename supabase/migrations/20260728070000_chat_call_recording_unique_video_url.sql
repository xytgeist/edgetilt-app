-- One call_recording chat card per R2 object (blocks webhook + poll double-insert).

begin;

create unique index if not exists chat_messages_call_recording_video_url_uidx
  on public.chat_messages (video_url)
  where content_encoding = 'call_recording'
    and video_url is not null
    and nullif(trim(video_url), '') is not null;

commit;
