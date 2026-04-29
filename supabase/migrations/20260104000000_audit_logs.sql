create table if not exists audit_logs (
  id            bigserial primary key,
  user_id       uuid references auth.users on delete set null,
  action        text not null,
  resource_type text,
  resource_id   text,
  details       jsonb,
  ip_hash       text,
  user_agent    text,
  created_at    timestamptz default now()
);
create index if not exists audit_logs_user_idx on audit_logs (user_id, created_at desc);
create index if not exists audit_logs_action_idx on audit_logs (action, created_at desc);
