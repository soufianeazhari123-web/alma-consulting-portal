-- ============================================================
-- ALMA CONSULTING PLATFORM — 0003: Additional RPCs + RLS POLICIES
-- Deny-by-default. No policy = no access. Students never see
-- internal notes / audit / other students' rows.
-- ============================================================

-- ---------- helper: current student id ----------
create or replace function my_student_id()
returns uuid language sql stable security definer set search_path = public as $$
  select student_id from profiles where id = auth.uid();
$$;

create or replace function is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(my_role() in ('super_admin','director','agent'), false);
$$;

-- ============================================================
-- EXTRA BUSINESS FUNCTIONS
-- ============================================================

-- Edit non-sensitive case fields (staff with access; frozen after submission except SA)
create or replace function update_case_details(
  p_case uuid, p_university text default null, p_program text default null,
  p_study_level text default null, p_intake text default null,
  p_deadline date default null
) returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from cases where id = p_case;
  if not found then raise exception 'CASE_NOT_FOUND'; end if;
  if not can_access_case(p_case) then raise exception 'FORBIDDEN'; end if;
  if c.stage in ('submitted','accepted','rejected','visa_approved','visa_refused','closed')
     and not is_super_admin() then raise exception 'CASE_FROZEN'; end if;

  update cases set
    university         = coalesce(p_university, university),
    program            = coalesce(p_program, program),
    study_level        = coalesce(p_study_level, study_level),
    intake             = coalesce(p_intake, intake),
    application_deadline = coalesce(p_deadline, application_deadline),
    submission_owner   = coalesce(submission_owner,
                         case when is_super_admin() then auth.uid() end)
  where id = p_case;
end $$;

-- Custom checklist item: Super Admin only (spec §8)
create or replace function add_custom_checklist_item(
  p_case uuid, p_name_fr text, p_name_en text,
  p_required boolean default true, p_translation boolean default false,
  p_legalisation boolean default false, p_mode text default null,
  p_guidance_fr text default null, p_guidance_en text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare iid uuid;
begin
  if not is_super_admin() then raise exception 'SUPER_ADMIN_ONLY'; end if;
  insert into case_checklist_items (
    case_id, name_fr, name_en, guidance_fr, guidance_en, is_required,
    translation_required, legalisation_required, legalisation_mode,
    is_custom, added_by, sort_order
  ) values (
    p_case, p_name_fr, p_name_en, p_guidance_fr, p_guidance_en, p_required,
    p_translation, p_legalisation, p_mode, true, auth.uid(), 900
  ) returning id into iid;
  return iid;
end $$;

-- Document review: director of the agency or SA (owner decision, batch 2)
create or replace function review_checklist_item(
  p_item uuid, p_status text, p_comment text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare it record;
begin
  select * into it from case_checklist_items where id = p_item;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  select * into it from cases where id = it.case_id;
  if not (is_super_admin()
          or is_director_of((select agency_id from students s join cases c on c.student_id=s.id where c.id=it.case_id)))
  then raise exception 'REVIEWER_FORBIDDEN'; end if;
  if p_status not in ('approved','changes_requested','waived','requested') then
    raise exception 'BAD_STATUS';
  end if;

  update case_checklist_items set
    status = p_status::doc_item_status,
    review_comment = p_comment,
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_item;
end $$;

-- Versioning: new upload supersedes previous (spec §9)
create or replace function register_upload(
  p_item uuid, p_path text, p_file_name text, p_mime text, p_size bigint
) returns uuid
language plpgsql security definer set search_path = public as $$
declare it record; docid uuid;
begin
  select * into it from case_checklist_items where id = p_item;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  select * into it from cases where id = it.case_id;
  if not can_access_case(it.id) then raise exception 'FORBIDDEN'; end if;
  if my_role() = 'student' then raise exception 'STUDENT_UPLOAD_VIA_PORTAL_ONLY'; end if;

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

  update case_checklist_items set
    status = 'under_review', current_version = current_version + 1
  where id = p_item;

  return docid;
end $$;

-- Save readiness snapshot
create or replace function save_readiness(p_case uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare res jsonb;
begin
  if not can_access_case(p_case) then raise exception 'FORBIDDEN'; end if;
  res := compute_readiness(p_case);
  insert into readiness_evaluations (case_id, score, breakdown, blockers, rule_version, computed_by)
  values (p_case, (res->>'score')::int, res->'breakdown', res->'blockers',
          res->>'rule_version', auth.uid());
  return res;
end $$;

-- Messages (student-visible thread §12)
create or replace function send_message(p_student uuid, p_body text, p_case uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_access_student(p_student) then raise exception 'FORBIDDEN'; end if;
  insert into messages (student_id, case_id, sender_id, body)
  values (p_student, p_case, auth.uid(), p_body);
end $$;

grant execute on all functions in schema public to authenticated;

-- ============================================================
-- ENABLE RLS EVERYWHERE
-- ============================================================
alter table agencies             enable row level security;
alter table profiles             enable row level security;
alter table countries            enable row level security;
alter table service_types        enable row level security;
alter table service_templates    enable row level security;
alter table document_templates   enable row level security;
alter table students             enable row level security;
alter table cases                enable row level security;
alter table case_checklist_items enable row level security;
alter table case_documents       enable row level security;
alter table tasks                enable row level security;
alter table installment_rules    enable row level security;
alter table billing_sequences    enable row level security;
alter table invoices             enable row level security;
alter table payments             enable row level security;
alter table receipts             enable row level security;
alter table readiness_evaluations enable row level security;
alter table messages             enable row level security;
alter table internal_notes       enable row level security;
alter table email_queue          enable row level security;
alter table audit_logs           enable row level security;
alter table login_security       enable row level security;
alter table company_settings     enable row level security;
alter table case_history         enable row level security;

-- ---------- AGENCIES ----------
create policy agencies_read_staff on agencies for select to authenticated
  using (is_super_admin() or id = my_agency_id());
create policy agencies_write_sa on agencies for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------- PROFILES ----------
create policy profiles_read on profiles for select to authenticated
  using (
    id = auth.uid()
    or is_super_admin()
    or (is_staff() and agency_id = my_agency_id())
    or (my_role() = 'student' and false)
  );
create policy profiles_update_self_limited on profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from profiles p where p.id = auth.uid())
    and agency_id = (select agency_id from profiles p where p.id = auth.uid())
  );
-- No insert/delete policies: staff accounts are provisioned ONLY via the
-- privileged server function (Netlify Function with service key).

-- ---------- REFERENCE DATA (readable by staff) ----------
create policy countries_read on countries for select to authenticated using (true);
create policy stypes_read on service_types for select to authenticated using (true);
create policy rules_read on installment_rules for select to authenticated using (true);
create policy cfg_read on company_settings for select to authenticated using (is_staff());
create policy cfg_write_sa on company_settings for update to authenticated
  using (is_super_admin()) with check (is_super_admin());
create policy tpl_read on service_templates for select to authenticated using (is_staff());
create policy dtpl_read on document_templates for select to authenticated using (is_staff());
create policy tpl_write_sa on service_templates for all to authenticated
  using (is_super_admin()) with check (is_super_admin());
create policy dtpl_write_sa on document_templates for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------- STUDENTS ----------
create policy students_select on students for select to authenticated
  using (can_access_student(id));
create policy students_insert on students for insert to authenticated
  with check (
    is_super_admin()
    or (my_role() in ('director','agent')
        and agency_id = my_agency_id()
        and (my_role() = 'director' or main_agent_id = auth.uid()))
  );
create policy students_update on students for update to authenticated
  using (can_access_student(id) and is_staff())
  with check (can_access_student(id));

-- ---------- CASES ----------
create policy cases_select on cases for select to authenticated
  using (can_access_case(id));
create policy cases_insert on cases for insert to authenticated
  with check (
    is_super_admin()
    or ((my_role() = 'director' and agency_id = my_agency_id())
        or (my_role() = 'agent' and agent_id = auth.uid() and agency_id = my_agency_id()))
  );
-- NO update/delete policy: stage changes ONLY via transition_case/review_case;
-- detail edits ONLY via update_case_details.

-- ---------- CHECKLISTS & DOCUMENTS ----------
create policy items_select on case_checklist_items for select to authenticated
  using (exists (select 1 from cases c where c.id = case_id and can_access_case(c.id)));
-- No direct writes: add_custom_checklist_item / review_checklist_item only.
create policy docs_select on case_documents for select to authenticated
  using (exists (select 1 from cases c where c.id = case_id and can_access_case(c.id)));
create policy docs_insert on case_documents for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (select 1 from cases c where c.id = case_id and can_access_case(c.id))
    and my_role() in ('super_admin','director','agent')
  );
-- No update/delete: immutability + supersession via register_upload.

-- ---------- TASKS ----------
create policy tasks_select on tasks for select to authenticated
  using (
    is_super_admin()
    or agency_id = my_agency_id()
  );
create policy tasks_insert on tasks for insert to authenticated
  with check (
    (my_role() in ('super_admin','director','agent'))
    and (is_super_admin() or agency_id = my_agency_id())
    and (created_by = auth.uid())
  );
create policy tasks_update on tasks for update to authenticated
  using (is_super_admin() or agency_id = my_agency_id());

-- ---------- BILLING (reads scoped; writes via functions only) ----------
create policy invoices_select on invoices for select to authenticated
  using (
    (is_staff() and can_access_student(student_id))
    or student_id = my_student_id()
  );
create policy payments_select on payments for select to authenticated
  using (
    (is_staff() and can_access_student(student_id))
    or student_id = my_student_id()
  );
create policy receipts_select on receipts for select to authenticated
  using (
    (is_staff() and can_access_student(student_id))
    or student_id = my_student_id()
  );

-- ---------- READINESS ----------
create policy readiness_select on readiness_evaluations for select to authenticated
  using (exists (select 1 from cases c where c.id = case_id and can_access_case(c.id)));

-- ---------- COMMUNICATION ----------
create policy messages_select on messages for select to authenticated
  using (
    student_id = my_student_id()
    or (is_staff() and can_access_student(student_id))
  );
create policy notes_select on internal_notes for select to authenticated
  using (is_staff() and (student_id is null or can_access_student(student_id)));
-- inserts go through send_message(); notes inserted directly by staff:
create policy notes_insert on internal_notes for insert to authenticated
  with check (
    author_id = auth.uid()
    and is_staff()
    and (student_id is null or can_access_student(student_id))
  );

-- ---------- EMAIL QUEUE ----------
create policy emailq_staff on email_queue for select to authenticated using (is_staff());
create policy emailq_insert on email_queue for insert to authenticated
  with check (is_staff());
create policy emailq_approve on email_queue for update to authenticated
  using (is_super_admin() or my_role() = 'director');

-- ---------- AUDIT / HISTORY / SECURITY (append-only) ----------
create policy audit_read_sa on audit_logs for select to authenticated
  using (is_super_admin());
create policy history_read_staff on case_history for select to authenticated
  using (is_staff() and exists (
    select 1 from cases c where c.id = case_id and can_access_case(c.id)
  ));
-- audit_logs / billing_sequences / login_security: NO write policies ever.
