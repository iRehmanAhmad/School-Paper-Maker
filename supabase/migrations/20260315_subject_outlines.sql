create table if not exists subject_outlines (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  exam_body_id uuid not null references exam_bodies(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  source_name text not null,
  source_path text,
  source_type text not null default 'pdf',
  outline_json jsonb not null,
  status text not null default 'draft',
  created_by uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_subject_outlines_subject on subject_outlines(subject_id, created_at desc);

alter table subject_outlines enable row level security;

create policy "subject outlines scoped" on subject_outlines
for all using (school_id = public.current_school_id()) with check (school_id = public.current_school_id());
