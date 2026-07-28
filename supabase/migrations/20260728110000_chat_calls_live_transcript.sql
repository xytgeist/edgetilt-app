-- Live voice-call STT draft (merged onto call_summary at end; no recording card).

begin;

alter table public.chat_calls
  add column if not exists live_transcript jsonb not null default '{}'::jsonb;

comment on column public.chat_calls.live_transcript is
  'In-progress Deepgram live STT for audio calls. Shape: { status, language, utterances[], error }. Copied onto call_summary.link_preview at end.';

commit;
