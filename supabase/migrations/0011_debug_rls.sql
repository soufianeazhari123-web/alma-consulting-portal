create or replace function public.debug_students_insert(p_agency_id uuid, p_main_agent_id uuid)
returns json
language sql
security invoker
stable
as $$
  select json_build_object(
    'auth_uid', auth.uid(),
    'my_role', get_my_role(),
    'my_agency_id', get_my_agency_id(),
    'is_super_admin', is_super_admin(),
    'p_agency_id', p_agency_id,
    'p_main_agent_id', p_main_agent_id,
    'agency_match', (p_agency_id = get_my_agency_id()),
    'main_agent_match', (p_main_agent_id = auth.uid()),
    'role_ok', (get_my_role() = any(array['director','agent'])),
    'final_check', (
      is_super_admin()
      or (
        get_my_role() = any(array['director','agent'])
        and p_agency_id = get_my_agency_id()
        and (get_my_role() = 'director' or p_main_agent_id = auth.uid())
      )
    )
  );
$$;
grant execute on function public.debug_students_insert(uuid, uuid) to authenticated;
