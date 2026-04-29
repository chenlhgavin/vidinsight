alter table profiles       enable row level security;
alter table video_analyses enable row level security;
alter table user_videos    enable row level security;
alter table user_notes     enable row level security;
alter table rate_limits    enable row level security;
alter table audit_logs     enable row level security;

drop policy if exists "video_analyses_read" on video_analyses;
create policy "video_analyses_read" on video_analyses for select using (true);

drop policy if exists "profiles_self" on profiles;
create policy "profiles_self" on profiles
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "user_videos_self" on user_videos;
create policy "user_videos_self" on user_videos
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_notes_self" on user_notes;
create policy "user_notes_self" on user_notes
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- rate_limits and audit_logs: service_role only (no policies → bypassed only by service key)
