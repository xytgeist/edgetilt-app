-- Stop routine SEC EDGAR 8-K filing posts (noise; not market-moving for Lounge wire bots).

update public.lounge_news_sources
set enabled = false,
    updated_at = now()
where name = 'SEC EDGAR 8-K'
  and kind = 'edgar';
