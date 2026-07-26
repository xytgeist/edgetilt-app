-- Sub chat deliveries on publish_log (dedupe for sub-chat-only Scott alerts).

alter table public.lounge_bot_publish_log
  add column if not exists sub_chat_message_id uuid references public.chat_messages (id) on delete set null;

comment on column public.lounge_bot_publish_log.sub_chat_message_id is
  'Creator fan room chat message when alert routed sub-chat-only or alongside feed. Counts for dedupe when post_id is null.';

create index if not exists lounge_bot_publish_log_sub_chat_msg_idx
  on public.lounge_bot_publish_log (bot_user_id, created_at desc)
  where sub_chat_message_id is not null;
