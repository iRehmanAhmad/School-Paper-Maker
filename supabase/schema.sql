-- Supabase schema for Paper Generator

create extension if not exists pgcrypto;

create type user_role as enum ('admin', 'teacher');
create type exam_type as enum ('weekly', 'monthly', 'chapterwise', 'quarterly', 'half_yearly', 'annual');
create type question_type as enum ('mcq', 'true_false', 'fill_blanks', 'short', 'long', 'matching', 'diagram');
create type difficulty as enum ('easy', 'medium', 'hard');
create type bloom_level as enum ('remember', 'understand', 'apply', 'analyze', 'evaluate');

create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role user_role not null default 'teacher',
  school_id uuid references schools(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists exam_bodies (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  exam_body_id uuid not null references exam_bodies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (school_id, exam_body_id, name)
);

create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (class_id, name)
);

create table if not exists chapters (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  title text not null,
  chapter_number int not null,
  created_at timestamptz not null default now(),
  unique (subject_id, chapter_number)
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  question_type question_type not null,
  question_text text not null,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  correct_answer text,
  difficulty difficulty not null,
  bloom_level bloom_level not null,
  marks int not null check (marks > 0),
  diagram_url text,
  explanation text,
  created_at timestamptz not null default now()
);

create table if not exists chapter_weightage (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters(id) on delete cascade,
  exam_type exam_type not null,
  weight_percent numeric(5,2) not null,
  unique (chapter_id, exam_type)
);

create table if not exists blueprints (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  exam_type exam_type not null,
  name text not null,
  structure_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists papers (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references users(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  exam_type exam_type not null,
  total_marks int not null,
  time_limit int not null,
  settings_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists paper_questions (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references papers(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  order_number int not null,
  paper_set text not null,
  shuffled_options jsonb,
  unique (paper_id, paper_set, order_number)
);

create table if not exists question_usage (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  paper_id uuid not null references papers(id) on delete cascade,
  used_at timestamptz not null default now()
);

create table if not exists paper_templates (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references users(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,
  settings_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_questions_chapter on questions(chapter_id);
create index if not exists idx_questions_difficulty on questions(difficulty);
create index if not exists idx_questions_type on questions(question_type);
create index if not exists idx_questions_school on questions(school_id);
create index if not exists idx_usage_question on question_usage(question_id, used_at desc);

alter table schools enable row level security;
alter table users enable row level security;
alter table exam_bodies enable row level security;
alter table classes enable row level security;
alter table subjects enable row level security;
alter table chapters enable row level security;
alter table questions enable row level security;
alter table chapter_weightage enable row level security;
alter table blueprints enable row level security;
alter table papers enable row level security;
alter table paper_questions enable row level security;
alter table question_usage enable row level security;
alter table paper_templates enable row level security;

create or replace function public.current_school_id()
returns uuid
language sql
stable
as $$
  select school_id from users where id = auth.uid()
$$;

create policy "users can read own profile" on users
for select using (id = auth.uid());

create policy "school data read" on schools for select using (id = public.current_school_id());

create policy "classes scoped" on classes for all using (school_id = public.current_school_id()) with check (school_id = public.current_school_id());
create policy "exam bodies scoped" on exam_bodies for all using (school_id = public.current_school_id()) with check (school_id = public.current_school_id());

create policy "subjects scoped" on subjects
for all using (
  class_id in (select id from classes where school_id = public.current_school_id())
) with check (
  class_id in (select id from classes where school_id = public.current_school_id())
);

create policy "chapters scoped" on chapters
for all using (
  subject_id in (
    select s.id from subjects s join classes c on c.id = s.class_id where c.school_id = public.current_school_id()
  )
) with check (
  subject_id in (
    select s.id from subjects s join classes c on c.id = s.class_id where c.school_id = public.current_school_id()
  )
);

create policy "questions scoped" on questions for all using (school_id = public.current_school_id()) with check (school_id = public.current_school_id());

create policy "weightage scoped" on chapter_weightage
for all using (
  chapter_id in (
    select ch.id from chapters ch join subjects s on s.id = ch.subject_id join classes c on c.id = s.class_id where c.school_id = public.current_school_id()
  )
) with check (
  chapter_id in (
    select ch.id from chapters ch join subjects s on s.id = ch.subject_id join classes c on c.id = s.class_id where c.school_id = public.current_school_id()
  )
);

create policy "blueprints scoped" on blueprints
for all using (
  class_id in (select id from classes where school_id = public.current_school_id())
) with check (
  class_id in (select id from classes where school_id = public.current_school_id())
);

create policy "papers scoped" on papers
for all using (
  class_id in (select id from classes where school_id = public.current_school_id())
) with check (
  class_id in (select id from classes where school_id = public.current_school_id())
);

create policy "paper questions scoped" on paper_questions
for all using (
  paper_id in (select id from papers where class_id in (select id from classes where school_id = public.current_school_id()))
) with check (
  paper_id in (select id from papers where class_id in (select id from classes where school_id = public.current_school_id()))
);

create policy "usage scoped" on question_usage
for all using (
  paper_id in (select id from papers where class_id in (select id from classes where school_id = public.current_school_id()))
) with check (
  paper_id in (select id from papers where class_id in (select id from classes where school_id = public.current_school_id()))
);

create policy "templates scoped" on paper_templates for all using (school_id = public.current_school_id()) with check (school_id = public.current_school_id());
