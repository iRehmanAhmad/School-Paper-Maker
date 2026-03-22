-- Add user profile policies and trigger for auto-profile creation

drop policy if exists "users can read own profile" on users;
drop policy if exists "users can insert own profile" on users;
drop policy if exists "users can update own profile" on users;

create policy "users can read own profile" on users
for select using (id = auth.uid());

create policy "users can insert own profile" on users
for insert with check (id = auth.uid());

create policy "users can update own profile" on users
for update using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.users (id, email, full_name, role, school_id)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), 'teacher', null)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Allow updating school profile for current school
drop policy if exists "school data update" on schools;
create policy "school data update" on schools
for update using (id = public.current_school_id()) with check (id = public.current_school_id());
