-- ============================================================
-- ALMA CONSULTING PLATFORM — 0004: Private document storage
-- Bucket is PRIVATE. Access checked against profiles/students.
-- Path convention: {student_id}/{case_id}/{item_id}/{uuid}.ext
-- ============================================================

insert into storage.buckets (id, name, public)
values ('case-documents','case-documents', false)
on conflict (id) do nothing;

-- Download / read:
--   Staff: any document of a case they may access.
--   Students (Q12 owner decision): ONLY documents APPROVED by staff —
--   never raw rejected/pending uploads, and nothing from other students.
create policy docs_download_staff on storage.objects for select to authenticated
  using (
    bucket_id = 'case-documents'
    and public.my_role() in ('super_admin','director','agent')
    and public.can_access_case((split_part(name,'/',2))::uuid)
  );

create policy docs_download_student_approved on storage.objects for select to authenticated
  using (
    bucket_id = 'case-documents'
    and public.my_role() = 'student'
    and public.can_access_case((split_part(name,'/',2))::uuid)
    and exists (
      select 1 from public.case_documents d
      where d.storage_path = name and d.review_status = 'approved'
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
