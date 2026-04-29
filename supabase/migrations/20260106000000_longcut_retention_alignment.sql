alter table video_analyses
  add column if not exists slug text,
  add column if not exists created_by uuid references auth.users(id);

create or replace function build_video_slug(p_title text, p_video_id text)
returns text
language sql
immutable
as $$
  select case
    when p_video_id is null or p_video_id !~ '^[A-Za-z0-9_-]{11}$' then null
    else
      coalesce(
        nullif(
          trim(both '-' from left(regexp_replace(lower(coalesce(p_title, '')), '[^a-z0-9]+', '-', 'g'), 80)),
          ''
        ),
        'video'
      ) || '-' || p_video_id
  end
$$;

update video_analyses
set slug = build_video_slug(title, youtube_id)
where slug is null
  and youtube_id is not null;

create index if not exists video_analyses_slug_idx on video_analyses (slug);
create index if not exists video_analyses_created_by_idx on video_analyses (created_by);
create unique index if not exists video_analyses_slug_unique
  on video_analyses (slug)
  where slug is not null;

alter table profiles
  drop constraint if exists profiles_topic_generation_mode_check;

alter table profiles
  add constraint profiles_topic_generation_mode_check
  check (topic_generation_mode in ('smart', 'fast'));
