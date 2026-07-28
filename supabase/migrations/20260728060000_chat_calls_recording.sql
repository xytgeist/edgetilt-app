-- Manual LiveKit RoomComposite recording state on open calls.

begin;

alter table public.chat_calls
  add column if not exists recording_status text not null default 'idle'
    check (recording_status in ('idle', 'recording', 'stopping', 'ready', 'failed')),
  add column if not exists recording_started_by uuid references auth.users (id) on delete set null,
  add column if not exists recording_started_at timestamptz,
  add column if not exists recording_egress_id text,
  add column if not exists recording_r2_key text;

create index if not exists chat_calls_recording_egress_id_idx
  on public.chat_calls (recording_egress_id)
  where recording_egress_id is not null;

comment on column public.chat_calls.recording_status is
  'Manual RoomComposite egress: idle | recording | stopping | ready | failed.';
comment on column public.chat_calls.recording_egress_id is
  'LiveKit egress id while a recording is active or stopping.';
comment on column public.chat_calls.recording_r2_key is
  'R2 object key for the composite MP4 (call-recordings/{callId}/...).';

commit;
