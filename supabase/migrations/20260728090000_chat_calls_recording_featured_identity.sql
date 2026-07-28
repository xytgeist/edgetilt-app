-- Featured LiveKit identity locked at Record start (pin → focus layout).
alter table public.chat_calls
  add column if not exists recording_featured_identity text;

comment on column public.chat_calls.recording_featured_identity is
  'LiveKit participant identity featured in RoomComposite recording (focus:<id> layout); set at start_recording.';
