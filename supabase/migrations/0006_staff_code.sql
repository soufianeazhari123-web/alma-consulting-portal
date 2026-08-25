-- ============================================================
-- ALMA CONSULTING PLATFORM — 0006: Staff ID sequence helper
-- ============================================================
create or replace function next_staff_code()
returns text language sql security definer set search_path = public as $$
  select 'ALMA-' || lpad(nextval('staff_code_seq')::text, 4, '0');
$$;
