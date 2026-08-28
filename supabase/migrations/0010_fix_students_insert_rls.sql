-- 0010: Fix students INSERT RLS — ensure security definer helpers and permissive insert policy
create or replace function public.get_my_agency_id()
returns uuid language sql security definer stable set search_path = public as $$
  select agency_id from profiles where id = auth.uid();
$$;

create or replace function public.get_my_role()
returns text language sql security definer stable set search_path = public as $$
  select role::text from profiles where id = auth.uid();
$$;

drop policy if exists students_insert on students;
create policy students_insert on students
for insert to authenticated
with check (
  is_super_admin()
  or (
    public.get_my_role() in ('director','agent')
    and agency_id = public.get_my_agency_id()
    and (public.get_my_role() = 'director' or main_agent_id = auth.uid())
  )
);

-- Ensure RLS is enabled (no-op if already)
alter table students enable row level security;
