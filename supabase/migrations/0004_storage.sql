-- ============================================================
-- ALMA CONSULTING PLATFORM — 0004: Private document storage
-- Bucket is PRIVATE. Access checked against profiles/students.
-- Path convention: {student_id}/{case_id}/{item_id}/{uuid}.ext
-- ============================================================

insert into storage.buckets (id, name, public)
values ('case-documents','case-documents', false)
on conflict (id) do nothing;

-- Download / read: caller must have access to the owning case
create policy docs_download on storage.objects for select to authenticated
  using (
    bucket_id = 'case-documents'
    and public.can_access_case(
      (split_part(name,'/',2))::uuid
    )
  );

-- Upload: staff only, path must target a student/case they may access,
-- and folder must embed their identity-checked student id.
create policy docs_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'case-documents'
    and public.my_role() in ('super_admin','director','agent')
    and public.can_access_student((split_part(name,'/',1))::uuid)
    and public.can_access_case((split_part(name,'/',2))::uuid)
  );

-- No update/delete policies => uploaded files immutable (superseded instead).
