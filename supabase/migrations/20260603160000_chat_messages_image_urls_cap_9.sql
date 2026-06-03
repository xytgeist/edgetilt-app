-- Raise the chat_messages image_urls array cap from 4 → 12.
alter table public.chat_messages
  drop constraint if exists chat_messages_image_urls_len;

alter table public.chat_messages
  add constraint chat_messages_image_urls_len check (
    image_urls is null or coalesce(cardinality(image_urls), 0) <= 12
  );
