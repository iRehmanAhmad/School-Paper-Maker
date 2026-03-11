create table if not exists subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('basic', 'advanced')),
  name text not null,
  description text null,
  max_paper_sets int not null default 1 check (max_paper_sets > 0),
  allow_worksheets boolean not null default false,
  allow_lesson_plans boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null unique references schools(id) on delete cascade,
  plan_id uuid not null references subscription_plans(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'expired', 'suspended')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_by uuid null references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);

create index if not exists idx_subscriptions_status_ends on subscriptions(status, ends_at);
create index if not exists idx_subscriptions_plan_id on subscriptions(plan_id);

alter table subscription_plans enable row level security;
alter table subscriptions enable row level security;

drop policy if exists "subscription plans read" on subscription_plans;
create policy "subscription plans read" on subscription_plans
for select using (auth.role() = 'authenticated');

drop policy if exists "subscriptions scoped" on subscriptions;
create policy "subscriptions scoped" on subscriptions
for all using (school_id = public.current_school_id())
with check (school_id = public.current_school_id());

insert into subscription_plans (code, name, description, max_paper_sets, allow_worksheets, allow_lesson_plans)
values
  ('basic', 'Basic', 'Unlimited papers, single variation only.', 1, false, false),
  ('advanced', 'Advanced', 'Multiple paper variations with worksheets and lesson plans.', 10, true, true)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  max_paper_sets = excluded.max_paper_sets,
  allow_worksheets = excluded.allow_worksheets,
  allow_lesson_plans = excluded.allow_lesson_plans;
