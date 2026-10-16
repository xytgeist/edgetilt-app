-- Needs human is an elevation, not the birth state.
-- Classifier / never-auto rule / classify failure flips it on.

alter table public.lounge_reports
  alter column needs_human set default false;

update public.lounge_reports
  set needs_human = false
  where needs_human = true
    and status in ('open', 'reviewing')
    and triage_status = 'pending';

comment on column public.lounge_reports.needs_human is
  'True only after the classifier or a never-auto rule elevates the row, or a classify attempt fails. New reports start false.';
