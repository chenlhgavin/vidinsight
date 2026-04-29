-- M1: Core tables (profiles / video_analyses / user_videos)
-- RLS is enabled later (M8) once endpoints route writes through service role.

create extension if not exists pgcrypto;

create table if not exists profiles (
  id                        uuid primary key references auth.users on delete cascade,
  email                     text not null,
  full_name                 text,
  avatar_url                text,
  topic_generation_mode     text default 'smart' check (topic_generation_mode in ('smart')),
  preferred_target_language text default 'en',
  free_generations_used     int default 0,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);

create table if not exists video_analyses (
  id                  uuid primary key default gen_random_uuid(),
  youtube_id          text unique not null,
  title               text,
  author              text,
  duration            int,
  thumbnail_url       text,
  transcript          jsonb,
  topics              jsonb,
  topic_candidates    jsonb,
  summary             jsonb,
  top_quotes          jsonb,
  suggested_questions jsonb,
  source_language     text,
  available_languages jsonb,
  model_used          text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);
create index if not exists video_analyses_youtube_id_idx on video_analyses (youtube_id);
create index if not exists video_analyses_updated_at_idx on video_analyses (updated_at desc);

create table if not exists user_videos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles on delete cascade,
  video_id    uuid references video_analyses on delete cascade,
  is_favorite boolean default false,
  accessed_at timestamptz default now(),
  unique (user_id, video_id)
);
create index if not exists user_videos_user_idx on user_videos (user_id, accessed_at desc);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated on profiles;
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();

drop trigger if exists trg_video_analyses_updated on video_analyses;
create trigger trg_video_analyses_updated before update on video_analyses
  for each row execute function set_updated_at();
