-- Public profile website/link URL. Run after profile_location.sql.

do $$
begin
  alter table public.profiles add column if not exists website_url text;
  alter table public.profiles drop constraint if exists profiles_website_url_len;
  alter table public.profiles add constraint profiles_website_url_len check (website_url is null or char_length(website_url) <= 200);
  comment on column public.profiles.website_url is 'Optional website or link URL shown on Lounge profile (max 200 chars).';

  update public.profiles
  set website_url = 'https://sharpesyndicate.com'
  where handle = 'sharpesignal' and (website_url is null or website_url = '');
end $$;
