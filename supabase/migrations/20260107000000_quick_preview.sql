alter table video_analyses
  add column if not exists quick_preview jsonb;

update profiles
set topic_generation_mode = 'smart'
where topic_generation_mode is distinct from 'smart';

alter table profiles
  drop constraint if exists profiles_topic_generation_mode_check;

alter table profiles
  add constraint profiles_topic_generation_mode_check
  check (topic_generation_mode in ('smart'));
