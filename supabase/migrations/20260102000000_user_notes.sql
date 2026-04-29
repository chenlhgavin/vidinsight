create table if not exists user_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles on delete cascade,
  video_id    uuid references video_analyses on delete cascade,
  source      text not null check (source in ('chat','takeaways','transcript','custom')),
  source_id   text,
  text        text not null,
  metadata    jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists user_notes_user_idx on user_notes (user_id, updated_at desc);
create index if not exists user_notes_video_idx on user_notes (video_id);

drop trigger if exists trg_user_notes_updated on user_notes;
create trigger trg_user_notes_updated before update on user_notes
  for each row execute function set_updated_at();
