create table if not exists school_ai_settings (
  school_id uuid primary key references schools(id) on delete cascade,
  provider text not null default 'gemini',
  model text not null default 'gemini-1.5-flash',
  openai_api_key text not null default '',
  groq_api_key text not null default '',
  openrouter_api_key text not null default '',
  together_api_key text not null default '',
  gemini_api_key text not null default '',
  deepseek_api_key text not null default '',
  anthropic_api_key text not null default '',
  updated_by uuid null references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_school_ai_settings_updated_at on school_ai_settings(updated_at desc);

alter table school_ai_settings enable row level security;

drop policy if exists "school ai settings scoped" on school_ai_settings;
create policy "school ai settings scoped" on school_ai_settings
for all using (school_id = public.current_school_id())
with check (school_id = public.current_school_id());
