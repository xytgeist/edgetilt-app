-- Optional contact phone on profiles (Settings → Account info).

begin;

alter table public.profiles
  add column if not exists phone_number text;

alter table public.profiles
  drop constraint if exists profiles_phone_number_len;

alter table public.profiles
  add constraint profiles_phone_number_len check (
    phone_number is null or char_length(trim(phone_number)) between 7 and 20
  );

comment on column public.profiles.phone_number is
  'Optional contact phone (digits/+ only after client normalize). Editable in Settings → Account info.';

commit;
