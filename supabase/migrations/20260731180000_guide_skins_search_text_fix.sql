-- Fix skins_search_text extraction for emoji-prefixed ## headers (e.g. ## 🎭 Skins ...).
-- Mirror parseGuideMarkdown: /Skins/i.test(header), not ^Skins anchor.

create or replace function public.guide_extract_skins_search_text(p_markdown text)
returns text
language plpgsql
immutable
as $$
declare
  v_cleaned text;
  v_chunk text;
  v_header text;
  v_nl int;
  v_body text;
  v_skins text := '';
begin
  if p_markdown is null or btrim(p_markdown) = '' then
    return '';
  end if;

  v_cleaned := regexp_replace(p_markdown, '^#\s[^\n]*\n+', '', 'n');
  v_cleaned := regexp_replace(v_cleaned, '^---\s*\n', '', 'gm');

  for v_chunk in
    select unnest(regexp_split_to_array(v_cleaned, E'\n## '))
  loop
    if btrim(v_chunk) = '' then
      continue;
    end if;
    v_nl := strpos(v_chunk, E'\n');
    if v_nl = 0 then
      v_header := btrim(v_chunk);
      v_body := '';
    else
      v_header := btrim(substring(v_chunk from 1 for v_nl - 1));
      v_body := btrim(substring(v_chunk from v_nl + 1));
    end if;
    if v_header ~* 'Skins' then
      v_skins := v_body;
      exit;
    end if;
  end loop;

  return v_skins;
end;
$$;

-- Re-backfill all published guides (emoji headers left many rows empty).
update public.guides g
set skins_search_text = lower(public.guide_extract_skins_search_text(g.content_markdown));
