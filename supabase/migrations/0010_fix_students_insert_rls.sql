drop policy if exists students_insert on students;
create policy students_insert
on students
for insert
to authenticated
with check (
  is_super_admin()
  or (
    get_my_role() in ('director', 'agent')
    and agency_id = get_my_agency_id()
    and (get_my_role() = 'director' or main_agent_id = auth.uid())
  )
);
