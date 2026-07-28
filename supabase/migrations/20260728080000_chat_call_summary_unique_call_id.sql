-- One durable call_summary card per chat_calls row (leave/end race safe).
create unique index if not exists chat_messages_call_summary_call_id_uidx
  on public.chat_messages ((link_preview->>'call_id'))
  where content_encoding = 'call_summary'
    and coalesce(link_preview->>'call_id', '') <> '';

comment on index public.chat_messages_call_summary_call_id_uidx is
  'Ensures a single in-thread call_summary card per call_id in link_preview.';
