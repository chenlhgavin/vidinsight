create table if not exists rate_limits (
  id          bigserial primary key,
  key         text not null,
  identifier  text not null,
  timestamp   timestamptz not null default now(),
  created_at  timestamptz default now()
);
create index if not exists rate_limits_lookup on rate_limits (key, timestamp desc);
