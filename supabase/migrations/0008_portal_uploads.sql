-- ============================================================
-- 0008 — STUDENT PORTAL UPLOADS (owner decision: portal upload now)
-- Students may upload files ONLY into their own case folders.
-- ============================================================

-- Registration RPC for students (mirrors register_upload but scoped to self)
create or replace function portal_register_upload(
  p_item uuid, p_path text, p_file_name text, p_mime text, p_size bigint
) returns uuid
language plpgsql security definer set search_path = public as $$
declare it record; docid uuid;
begin
  if my_role() <> 'student' then raise exception 'STUDENT_ONLY'; end if;

  select c.* into it from cases c
  join case_checklist_items ci on ci.case_id = c.id
  where ci.id = p_item and c.student_id = my_student_id();
  if not found then raise exception 'FORBIDDEN'; end if;

  update case_documents set status='superseded'
  where checklist_item_id = p_item and status='current';

  insert into case_documents (
    case_id, checklist_item_id, version, storage_path, file_name,
    mime_type, size_bytes, uploaded_by
  ) values (
    it.id, p_item,
    coalesce((select max(version)+1 from case_documents where checklist_item_id=p_item),1),
    p_path, p_file_name, p_mime, p_size, auth.uid()
  ) returning id into docid;

  update case_checklist_items set status='uploaded', current_version=current_version+1
  where id = p_item;

  return docid;
end $$;

-- Allow students in the documents insert policy
drop policy if exists docs_insert on case_documents;
create policy docs_insert on case_documents for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      my_role() in ('super_admin','director','agent')
      or (my_role() = 'student')
    )
    and exists (select 1 from cases c where c.id = case_id and can_access_case(c.id))
  );

-- Storage: allow authenticated students to write inside their own folder tree.
drop policy if exists docs_upload on storage.objects;
create policy docs_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'case-documents'
    and public.can_access_student((split_part(name,'/',1))::uuid)
    and public.can_access_case((split_part(name,'/',2))::uuid)
    and public.my_role() in ('super_admin','director','agent','student')
  );

grant execute on function portal_register_upload(uuid,text,text,text,bigint) to authenticated;
