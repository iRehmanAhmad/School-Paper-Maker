alter table if exists subscriptions add column if not exists payment_method text null;
alter table if exists subscriptions add column if not exists transaction_id text null;
alter table if exists subscriptions add column if not exists paid_at timestamptz null;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'subscriptions_status_check') then
    alter table subscriptions drop constraint subscriptions_status_check;
  end if;
exception
  when undefined_table then null;
end $$;

alter table if exists subscriptions
  add constraint subscriptions_status_check
  check (status in ('pending_payment', 'active', 'expired', 'suspended', 'cancelled'));

create unique index if not exists idx_subscriptions_transaction_id_unique
  on subscriptions(transaction_id)
  where transaction_id is not null;

create table if not exists payment_intents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  subscription_id uuid null references subscriptions(id) on delete set null,
  provider text not null check (provider in ('jazzcash', 'easypaisa', 'manual')),
  amount_pkr numeric(12,2) not null check (amount_pkr >= 0),
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'expired', 'cancelled')),
  merchant_txn_id text not null unique,
  provider_txn_id text null,
  payer_phone text null,
  notes text null,
  metadata jsonb null default '{}'::jsonb,
  created_by uuid null references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz null
);

create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  payment_intent_id uuid null references payment_intents(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  signature_valid boolean null,
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_intents_school_created on payment_intents(school_id, created_at desc);
create index if not exists idx_payment_intents_status on payment_intents(status, created_at desc);
create index if not exists idx_payment_events_school_created on payment_events(school_id, created_at desc);

alter table payment_intents enable row level security;
alter table payment_events enable row level security;

drop policy if exists "payment intents scoped" on payment_intents;
create policy "payment intents scoped" on payment_intents
for all using (school_id = public.current_school_id())
with check (school_id = public.current_school_id());

drop policy if exists "payment events scoped" on payment_events;
create policy "payment events scoped" on payment_events
for all using (school_id = public.current_school_id())
with check (school_id = public.current_school_id());
