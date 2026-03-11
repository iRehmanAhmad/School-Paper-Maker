-- Content ingestion + generation pipeline for questions, worksheets, and lesson plans.
-- Safe to run on existing databases.

create extension if not exists pgcrypto;

do $$
begin
  create type artifact_type as enum ('question', 'worksheet', 'lesson_plan');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type ingest_status as enum ('uploaded', 'processing', 'ready', 'failed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type job_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type candidate_status as enum ('pending_review', 'approved', 'rejected', 'published');
exception
  when duplicate_object then null;
end $$;

create table if not exists content_sources (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  exam_body_id uuid not null references exam_bodies(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  chapter_id uuid not null references chapters(id) on delete cascade,
  topic_id uuid null,
  title text not null,
  file_path text not null,
  file_hash text not null,
  version_no int not null default 1 check (version_no > 0),
  status ingest_status not null default 'uploaded',
  pages int null,
  error_message text null,
  created_by uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (school_id, file_hash)
);

create table if not exists content_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references content_sources(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  exam_body_id uuid not null references exam_bodies(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  chapter_id uuid not null references chapters(id) on delete cascade,
  topic_id uuid null,
  chunk_no int not null check (chunk_no > 0),
  page_from int null,
  page_to int null,
  content text not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  unique (source_id, chunk_no),
  unique (source_id, content_hash)
);

create table if not exists generation_jobs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  exam_body_id uuid not null references exam_bodies(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  chapter_id uuid not null references chapters(id) on delete cascade,
  topic_id uuid null,
  artifact artifact_type not null,
  request_json jsonb not null default '{}'::jsonb,
  status job_status not null default 'queued',
  provider text null,
  model text null,
  attempts int not null default 0 check (attempts >= 0),
  error_message text null,
  created_by uuid not null references users(id) on delete cascade,
  started_at timestamptz null,
  finished_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists generation_candidates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references generation_jobs(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  artifact artifact_type not null,
  payload jsonb not null default '{}'::jsonb,
  validation_errors jsonb null,
  status candidate_status not null default 'pending_review',
  approved_by uuid null references users(id) on delete set null,
  approved_at timestamptz null,
  published_table text null,
  published_id uuid null,
  created_at timestamptz not null default now()
);

create table if not exists worksheets (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  exam_body_id uuid not null references exam_bodies(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  chapter_id uuid not null references chapters(id) on delete cascade,
  topic_id uuid null,
  title text not null,
  settings_json jsonb not null default '{}'::jsonb,
  created_by uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists worksheet_items (
  id uuid primary key default gen_random_uuid(),
  worksheet_id uuid not null references worksheets(id) on delete cascade,
  order_no int not null check (order_no > 0),
  item_type text not null,
  prompt text not null,
  options jsonb null,
  answer_key text null,
  marks int null,
  bloom_level text null,
  difficulty text null
);

create table if not exists lesson_plans (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  exam_body_id uuid not null references exam_bodies(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  chapter_id uuid not null references chapters(id) on delete cascade,
  topic_id uuid null,
  title text not null,
  duration_minutes int null,
  objectives jsonb not null default '[]'::jsonb,
  created_by uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists lesson_plan_blocks (
  id uuid primary key default gen_random_uuid(),
  lesson_plan_id uuid not null references lesson_plans(id) on delete cascade,
  order_no int not null check (order_no > 0),
  block_type text not null,
  duration_minutes int null,
  content text not null,
  resources jsonb not null default '[]'::jsonb
);

create index if not exists idx_content_sources_scope on content_sources(school_id, exam_body_id, class_id, subject_id, chapter_id);
create index if not exists idx_content_chunks_scope on content_chunks(school_id, exam_body_id, class_id, subject_id, chapter_id);
create index if not exists idx_content_chunks_source on content_chunks(source_id, chunk_no);
create index if not exists idx_generation_jobs_scope on generation_jobs(school_id, status, created_at desc);
create index if not exists idx_generation_candidates_scope on generation_candidates(school_id, status, created_at desc);
create index if not exists idx_generation_candidates_job on generation_candidates(job_id, status);
create index if not exists idx_worksheets_scope on worksheets(school_id, class_id, subject_id, chapter_id, topic_id);
create index if not exists idx_lesson_plans_scope on lesson_plans(school_id, class_id, subject_id, chapter_id, topic_id);

alter table content_sources enable row level security;
alter table content_chunks enable row level security;
alter table generation_jobs enable row level security;
alter table generation_candidates enable row level security;
alter table worksheets enable row level security;
alter table worksheet_items enable row level security;
alter table lesson_plans enable row level security;
alter table lesson_plan_blocks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'content_sources' and policyname = 'content sources scoped'
  ) then
    create policy "content sources scoped" on content_sources
    for all using (school_id = public.current_school_id()) with check (school_id = public.current_school_id());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'content_chunks' and policyname = 'content chunks scoped'
  ) then
    create policy "content chunks scoped" on content_chunks
    for all using (school_id = public.current_school_id()) with check (school_id = public.current_school_id());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'generation_jobs' and policyname = 'generation jobs scoped'
  ) then
    create policy "generation jobs scoped" on generation_jobs
    for all using (school_id = public.current_school_id()) with check (school_id = public.current_school_id());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'generation_candidates' and policyname = 'generation candidates scoped'
  ) then
    create policy "generation candidates scoped" on generation_candidates
    for all using (school_id = public.current_school_id()) with check (school_id = public.current_school_id());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'worksheets' and policyname = 'worksheets scoped'
  ) then
    create policy "worksheets scoped" on worksheets
    for all using (school_id = public.current_school_id()) with check (school_id = public.current_school_id());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'worksheet_items' and policyname = 'worksheet items scoped'
  ) then
    create policy "worksheet items scoped" on worksheet_items
    for all using (
      worksheet_id in (select id from worksheets where school_id = public.current_school_id())
    ) with check (
      worksheet_id in (select id from worksheets where school_id = public.current_school_id())
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'lesson_plans' and policyname = 'lesson plans scoped'
  ) then
    create policy "lesson plans scoped" on lesson_plans
    for all using (school_id = public.current_school_id()) with check (school_id = public.current_school_id());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'lesson_plan_blocks' and policyname = 'lesson blocks scoped'
  ) then
    create policy "lesson blocks scoped" on lesson_plan_blocks
    for all using (
      lesson_plan_id in (select id from lesson_plans where school_id = public.current_school_id())
    ) with check (
      lesson_plan_id in (select id from lesson_plans where school_id = public.current_school_id())
    );
  end if;
end $$;
