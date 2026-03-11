create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid null references schools(id) on delete cascade,
  actor_id uuid null references users(id) on delete set null,
  actor_name text null,
  action text not null,
  target_type text null,
  target_id text null,
  details jsonb null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_school_created
  on audit_logs(school_id, created_at desc);

create index if not exists idx_audit_logs_action_created
  on audit_logs(action, created_at desc);

alter table audit_logs enable row level security;

drop policy if exists "audit logs scoped" on audit_logs;
create policy "audit logs scoped" on audit_logs
for all using (
  school_id is null or school_id = public.current_school_id()
)
with check (
  school_id is null or school_id = public.current_school_id()
);
