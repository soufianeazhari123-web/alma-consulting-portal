-- ============================================================
-- ALMA CONSULTING PLATFORM — 0002: Functions & triggers
-- All authorization-critical logic lives here (server-enforced).
-- ============================================================

-- ---------- updated_at maintenance ----------
create extension if not exists moddatetime;

create trigger trg_touch_agencies   before update on agencies          for each row execute procedure moddatetime(updated_at);
create trigger trg_touch_profiles   before update on profiles          for each row execute procedure moddatetime(updated_at);
create trigger trg_touch_students   before update on students          for each row execute procedure moddatetime(updated_at);
create trigger trg_touch_cases      before update on cases             for each row execute procedure moddatetime(updated_at);
create trigger trg_touch_tasks      before update on tasks             for each row execute procedure moddatetime(updated_at);

-- ============================================================
-- BOOTSTRAP OWNER (spec §3.1: first account = ALMA-0001,
-- never silently create a second owner)
-- ============================================================
create sequence staff_code_seq start 2; -- 0001 reserved for owner

create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  owner_exists boolean;
begin
  select exists(select 1 from profiles where role = 'super_admin') into owner_exists;

  if owner_exists then
    -- Account was NOT provisioned by an authorized admin flow -> dormant.
    insert into profiles (id, email, full_name, role, is_active)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name',''),
      'pending',
      false
    );
  else
    -- Very first account becomes the permanent owner ALMA-0001.
    insert into profiles (id, email, full_name, role, staff_code, is_active)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name','Super Admin'),
      'super_admin',
      'ALMA-0001',
      true
    );
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- RLS HELPER FUNCTIONS (STABLE, SECURITY DEFINER)
-- ============================================================
create or replace function my_role()
returns text language sql stable security definer set search_path = public as $$
  select role::text from profiles where id = auth.uid();
$$;

create or replace function my_agency_id()
returns uuid language sql stable security definer set search_path = public as $$
  select agency_id from profiles where id = auth.uid();
$$;

create or replace function my_staff_code()
returns text language sql stable security definer set search_path = public as $$
  select staff_code from profiles where id = auth.uid();
$$;

create or replace function is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' and is_active from profiles where id = auth.uid()), false);
$$;

create or replace function is_director_of(p_agency uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select role = 'director' and is_active and agency_id = p_agency
    from profiles where id = auth.uid()
  ), false);
$$;

create or replace function is_active_agent_of(p_agency uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select role = 'agent' and is_active and agency_id = p_agency
    from profiles where id = auth.uid()
  ), false);
$$;

create or replace function can_access_student(p_student uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare s record;
begin
  if is_super_admin() then return true; end if;
  select agency_id, main_agent_id into s from students where id = p_student;
  if not found then return false; end if;
  return is_director_of(s.agency_id)
      or (is_active_agent_of(s.agency_id) and s.main_agent_id = auth.uid())
      or exists (select 1 from profiles where id = auth.uid() and student_id = p_student and role='student');
end $$;

create or replace function can_access_case(p_case uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(exists (
    select 1 from cases c where c.id = p_case and can_access_student(c.student_id)
  ), false);
$$;

-- ============================================================
-- AUDIT (append-only; spec §16)
-- ============================================================
create or replace function audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare old_j jsonb; new_j jsonb;
begin
  if tg_op = 'DELETE' then old_j := to_jsonb(old); new_j := null;
  elsif tg_op = 'INSERT' then old_j := null; new_j := to_jsonb(new);
  else old_j := to_jsonb(old); new_j := to_jsonb(new); end if;

  insert into audit_logs (actor_id, actor_staff_code, actor_role, action, entity, entity_id, old_values, new_values)
  values (
    auth.uid(), my_staff_code(), my_role(),
    lower(tg_table_name) || ':' || lower(tg_op),
    tg_table_name,
    coalesce(new_j->>'id', old_j->>'id'),
    old_j, new_j
  );
  return coalesce(new, old);
end $$;

drop trigger if exists audit_students on students;
create trigger audit_students after insert or update or delete on students
  for each row execute procedure audit_row_change();
drop trigger if exists audit_cases on cases;
create trigger audit_cases after insert or update or delete on cases
  for each row execute procedure audit_row_change();
drop trigger if exists audit_payments on payments;
create trigger audit_payments after insert or update or delete on payments
  for each row execute procedure audit_row_change();
drop trigger if exists audit_invoices on invoices;
create trigger audit_invoices after insert or update or delete on invoices
  for each row execute procedure audit_row_change();
drop trigger if exists audit_receipts on receipts;
create trigger audit_receipts after insert or update or delete on receipts
  for each row execute procedure audit_row_change();
drop trigger if exists audit_agencies on agencies;
create trigger audit_agencies after insert or update or delete on agencies
  for each row execute procedure audit_row_change();
drop trigger if exists audit_profiles on profiles;
create trigger audit_profiles after insert or update or delete on profiles
  for each row execute procedure audit_row_change();
drop trigger if exists audit_settings on company_settings;
create trigger audit_settings after insert or update or delete on company_settings
  for each row execute procedure audit_row_change();

-- Case history recorder for stage/status transitions
create or replace function log_case_stage_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stage is distinct from old.stage then
    insert into case_history (case_id, actor_id, actor_staff_code, field, old_value, new_value, reason)
    values (new.id, auth.uid(), my_staff_code(), 'stage', old.stage::text, new.stage::text, new.review_comment);
  end if;
  return new;
end $$;

drop trigger if exists trg_case_history on cases;
create trigger trg_case_history after update on cases
  for each row execute procedure log_case_stage_change();

-- ============================================================
-- CHECKLIST INSTANTIATION (per-case copy, version-pinned §8)
-- ============================================================
create or replace function init_case_checklist()
returns trigger language plpgsql security definer set search_path = public as $$
declare tpl record;
begin
  select id, version into tpl
  from service_templates
  where country_id = new.country_id
    and service_type_id = new.service_type_id
    and status = 'published'
  order by version desc limit 1;

  if tpl is null then return new; end if;

  update cases set template_id = tpl.id, template_version = tpl.version where id = new.id;

  insert into case_checklist_items (
    case_id, source_template_item, name_fr, name_en, guidance_fr, guidance_en,
    is_required, translation_required, legalisation_required, legalisation_mode,
    original_required, validity_rule, sort_order
  )
  select
    new.id, dt.id, dt.name_fr, dt.name_en, dt.guidance_fr, dt.guidance_en,
    dt.is_required, dt.translation_required, dt.legalisation_required, dt.legalisation_mode,
    dt.original_required, dt.validity_rule, dt.sort_order
  from document_templates dt
  where dt.template_id = tpl.id;

  return new;
end $$;

drop trigger if exists trg_init_checklist on cases;
create trigger trg_init_checklist after insert on cases
  for each row execute procedure init_case_checklist();

-- ============================================================
-- INVOICE NUMBERING (Q10: CONTINUOUS per agency — never resets,
-- gapless, per doc type). Display format keeps issue year:
--   OUJ-FAC-2026-0001 -> OUJ-FAC-2027-0474 ...
-- ============================================================
create or replace function next_billing_number(
  p_agency uuid, p_type text, p_year int, p_kind text
) returns text
language plpgsql security definer set search_path = public as $$
declare seqrow billing_sequences; prefix text; num int;
begin
  -- Continuous sequence: single row per agency/type (year kept as first-use info)
  insert into billing_sequences (agency_id, doc_type, year, last_number)
  values (p_agency, p_type, p_year, 0)
  on conflict (agency_id, doc_type) do nothing;

  select * into seqrow from billing_sequences
  where agency_id = p_agency and doc_type = p_type
  for update;

  update billing_sequences set last_number = last_number + 1
  where agency_id = p_agency and doc_type = p_type
  returning last_number into num;

  select invoice_prefix into prefix from agencies where id = p_agency;
  return prefix || '-' || p_kind || '-' || p_year::text || '-' || lpad(num::text, 4, '0');
end $$;

-- Issue one installment invoice for a case (skips free retakes).
create or replace function issue_invoice(p_case uuid, p_installment int, p_actor uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare c record; inv_id uuid; amt numeric; yr int := extract(year from now())::int; actor uuid;
begin
  actor := coalesce(p_actor, auth.uid());
  select * into c from cases where id = p_case;
  if not found then raise exception 'CASE_NOT_FOUND'; end if;

  -- Owner policy: free second chance => NO invoicing.
  if c.is_free_retake then
    insert into audit_logs (actor_id, actor_staff_code, actor_role, action, entity, entity_id, meta)
    values (actor, my_staff_code(), my_role(), 'invoice:waived_free_retake','cases',p_case::text,
            jsonb_build_object('installment',p_installment));
    return null;
  end if;

  if exists (select 1 from invoices where student_id=c.student_id and installment_no=p_installment and status<>'void') then
    return (select id from invoices where student_id=c.student_id and installment_no=p_installment and status<>'void');
  end if;

  select default_amount into amt from installment_rules where id = p_installment and is_active;

  insert into invoices (
    number, agency_id, year, seq, student_id, case_id, installment_no, amount, issued_by, due_date
  ) values (
    next_billing_number(c.agency_id,'INVOICE',yr,'FAC'),
    c.agency_id, yr,
    (select last_number from billing_sequences where agency_id=c.agency_id and doc_type='INVOICE'),
    c.student_id, c.id, p_installment, amt, actor,
    current_date + (select invoice_due_days from company_settings where id)
  ) returning id into inv_id;

  return inv_id;
end $$;

-- Auto-issue invoices when a case reaches a configured trigger stage (§11)
create or replace function auto_issue_installments()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.stage is distinct from old.stage then
    for r in select id from installment_rules where trigger_stage = new.stage and is_active loop
      perform issue_invoice(new.id, r.id);
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists trg_auto_invoice on cases;
create trigger trg_auto_invoice after update on cases
  for each row execute procedure auto_issue_installments();

-- ============================================================
-- PAYMENTS (§11): record -> verify -> receipt
-- ============================================================
create or replace function record_payment(
  p_invoice uuid, p_method payment_method, p_amount numeric,
  p_transfer_ref text default null, p_proof_path text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv record; pid uuid; already_paid numeric; pending_exists boolean;
begin
  select * into inv from invoices where id = p_invoice and status <> 'void';
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
  if not can_access_student(inv.student_id) then raise exception 'FORBIDDEN'; end if;
  if my_role() = 'student' then raise exception 'FORBIDDEN'; end if;

  -- Q1 owner decision: FULL installments only — one payment covers the
  -- exact open balance; no partial payments, no second pending payment.
  select coalesce(sum(amount),0) into already_paid from payments
  where invoice_id = inv.id and status = 'verified';
  select exists(select 1 from payments where invoice_id = inv.id and status='pending_verification')
    into pending_exists;
  if pending_exists then raise exception 'PAYMENT_ALREADY_PENDING'; end if;
  if p_amount <> (inv.amount - already_paid) then raise exception 'FULL_AMOUNT_REQUIRED'; end if;

  insert into payments (invoice_id, student_id, agency_id, case_id, method, amount,
                        recorded_by, transfer_ref, proof_path)
  values (inv.id, inv.student_id, inv.agency_id, inv.case_id, p_method, p_amount,
          auth.uid(), p_transfer_ref, p_proof_path)
  returning id into pid;
  return pid;
end $$;

create or replace function verify_payment(
  p_payment uuid, p_approve boolean, p_reason text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare pay record; rid uuid; yr int := extract(year from now())::int;
begin
  select * into pay from payments where id = p_payment for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if pay.status <> 'pending_verification' then raise exception 'ALREADY_PROCESSED'; end if;

  -- Only the agency director or Super Admin verifies (spec §3.2/§3.3)
  if not (is_super_admin() or is_director_of(pay.agency_id)) then
    raise exception 'FORBIDDEN_VERIFIER';
  end if;

  if not p_approve then
    update payments set status='rejected', verified_by=auth.uid(), verified_at=now(),
           rejection_reason=coalesce(p_reason,'—')
    where id = p_payment;
    return null;
  end if;

  -- Official receipt ONLY after verification
  insert into receipts (number, agency_id, year, seq, payment_id, invoice_id, student_id,
                        amount, currency, method, verified_by)
  values (
    next_billing_number(pay.agency_id,'RECEIPT',yr,'REC'),
    pay.agency_id, yr,
    (select last_number from billing_sequences where agency_id=pay.agency_id and doc_type='RECEIPT'),
    pay.id, pay.invoice_id, pay.student_id,
    pay.amount, pay.currency, pay.method, auth.uid()
  ) returning id into rid;

  update payments set status='verified', verified_by=auth.uid(), verified_at=now(), receipt_id=rid
  where id = p_payment;

  update invoices i set status = case
      when (select coalesce(sum(amount),0) from payments where invoice_id=i.id and status='verified') >= i.amount
      then 'paid' else 'partially_paid' end
  where id = pay.invoice_id;

  -- Q8 owner decision: verified receipt is auto-emailed to the student
  -- (transactional — no staff approval needed, unlike reminders).
  insert into email_queue (event_key, recipient, lang, payload, requires_approval, status)
  select 'payment.receipt_verified', coalesce(s.email, ''), s.preferred_language,
         jsonb_build_object('student_name', s.full_name, 'receipt_number',
                            (select number from receipts where id = rid),
                           'amount', pay.amount, 'method', pay.method),
         false, 'pending'
  from students s where s.id = pay.student_id
  on conflict do nothing;

  return rid;
end $$;

-- ============================================================
-- WORKFLOW TRANSITIONS (§6/§7) — role-restricted & audited
-- ============================================================
create or replace function transition_case(p_case uuid, p_new_stage text, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare c record; r text := my_role(); sens boolean;
begin
  select * into c from cases where id = p_case;
  if not found then raise exception 'CASE_NOT_FOUND'; end if;
  if not can_access_case(p_case) then raise exception 'FORBIDDEN'; end if;

  -- Terminal stages are frozen; only the Super Admin may leave them (audited reopen)
  if c.stage in ('accepted','rejected','visa_approved','visa_refused','closed','withdrawn')
     and not is_super_admin() then
    raise exception 'TERMINAL_STAGE_FROZEN';
  end if;
  if c.stage = 'ready_for_review' and r in ('agent','director') then
    raise exception 'LOCKED_IN_REVIEW_QUEUE';
  end if;

  -- Agent restrictions
  if r = 'agent' then
    if c.agent_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
    if not (
      (c.stage = 'draft' and p_new_stage = 'documents_in_progress') or
      (c.stage = 'documents_in_progress' and p_new_stage = 'ready_for_review') or
      (p_new_stage = 'withdrawn')
    ) then raise exception 'AGENT_TRANSITION_FORBIDDEN'; end if;
  end if;

  -- Directors cannot pass sensitive gates either (owner-only submissions §1/§3.1)
  sens := p_new_stage in ('approved_for_submission','submitted','accepted','rejected',
                          'visa_approved','visa_refused','closed');
  if r = 'director' and sens then raise exception 'SUPER_ADMIN_ONLY_STAGE'; end if;
  if r = 'student' then raise exception 'FORBIDDEN'; end if;

  update cases set
    stage = p_new_stage::case_stage,
    review_comment = nullif(p_reason,''),
    marked_ready_at = case when p_new_stage='ready_for_review' then now() else marked_ready_at end,
    reviewed_at     = case when p_new_stage='changes_requested' then now() else reviewed_at end,
    reviewed_by     = case when p_new_stage='changes_requested' then auth.uid() else reviewed_by end,
    submitted_at    = case when p_new_stage='submitted' then now() else submitted_at end,
    decision_at     = case when p_new_stage in ('accepted','rejected','visa_approved','visa_refused') then now() else decision_at end,
    decision_outcome= case when p_new_stage in ('accepted','rejected','visa_approved','visa_refused') then p_new_stage else decision_outcome end
  where id = p_case;
end $$;

-- Review queue decisions (SA only, spec §7)
create or replace function review_case(p_case uuid, p_decision text, p_comment text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'FORBIDDEN'; end if;
  if p_decision not in ('approved','returned') then raise exception 'BAD_DECISION'; end if;

  update cases set
    review_decision = p_decision,
    review_comment = p_comment,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    stage = case when p_decision='approved' then 'approved_for_submission'::case_stage
                 else 'changes_requested'::case_stage end
  where id = p_case and stage = 'ready_for_review';
  if not found then raise exception 'NOT_IN_REVIEW_QUEUE'; end if;
end $$;

-- Create free-retake case after refusal (owner policy)
create or replace function create_free_retake(
  p_source_case uuid, p_country uuid, p_service_type uuid,
  p_university text default null, p_program text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare src record; nid uuid;
begin
  select * into src from cases where id = p_source_case;
  if not found then raise exception 'CASE_NOT_FOUND'; end if;
  if not can_access_case(p_source_case) then raise exception 'FORBIDDEN'; end if;
  if src.decision_outcome not in ('rejected','visa_refused') then
    raise exception 'RETAKE_ONLY_AFTER_REFUSAL';
  end if;
  if not (is_super_admin() or is_director_of(src.agency_id)) then raise exception 'FORBIDDEN'; end if;

  insert into cases (student_id, agency_id, agent_id, country_id, service_type_id,
                     university, program, study_level, intake,
                     is_free_retake, retake_of_case_id, created_by)
  values (src.student_id, src.agency_id, src.agent_id, p_country, p_service_type,
          p_university, p_program, src.study_level, src.intake,
          true, src.id, auth.uid())
  returning id into nid;

  insert into audit_logs (actor_id, actor_staff_code, actor_role, action, entity, entity_id, meta)
  values (auth.uid(), my_staff_code(), my_role(), 'case:free_retake_created','cases',nid::text,
          jsonb_build_object('source_case',p_source_case));
  return nid;
end $$;

-- ============================================================
-- READINESS SCORE v1 (§13: 40/15/15/10/10/10)
-- ============================================================
create or replace function compute_readiness(p_case uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c record; b jsonb; blockers jsonb := '[]'::jsonb; score numeric := 0;
  req_total int; req_ok int; tl_total int; tl_ok int;
  has_missing_required boolean; has_unresolved_review boolean; deadline_passed boolean;
begin
  select * into c from cases where id = p_case;
  if not found then raise exception 'CASE_NOT_FOUND'; end if;

  select count(*) filter (where is_required) into req_total from case_checklist_items where case_id=p_case;
  select count(*) filter (where is_required and status in ('approved','waived')) into req_ok
    from case_checklist_items where case_id=p_case;

  select count(*) into tl_total from case_checklist_items
    where case_id=p_case and (translation_required or legalisation_required);
  select count(*) into tl_ok from case_checklist_items
    where case_id=p_case and (translation_required or legalisation_required)
      and status in ('approved','waived');

  -- Blockers (prevent misleading 100%)
  select exists (
    select 1 from case_checklist_items
    where case_id = p_case and is_required
      and status in ('not_requested','requested','changes_requested')
  ) into has_missing_required;
  select exists (
    select 1 from case_checklist_items
    where case_id = p_case and status = 'changes_requested'
  ) into has_unresolved_review;
  select (c.application_deadline < current_date) into deadline_passed;

  if deadline_passed then blockers := blockers || to_jsonb('deadline_passed'::text); end if;
  if has_missing_required then blockers := blockers || to_jsonb('missing_required_documents'::text); end if;
  if has_unresolved_review then blockers := blockers || to_jsonb('unresolved_review_request'::text); end if;

  -- Expired / soon-expiring passport blocker
  if exists (
    select 1 from students s where s.id = c.student_id
      and s.passport_expiry_date is not null
      and s.passport_expiry_date < current_date + interval '6 months'
  ) then blockers := blockers || to_jsonb('passport_expiring'::text); end if;

  -- 40% documents
  score += case when req_total = 0 then 40 else round(40.0 * req_ok / req_total) end;
  -- 15% translation/legalisation
  score += case when tl_total = 0 then 15 else round(15.0 * tl_ok / tl_total) end;
  -- 15% academic/language recorded
  score += case when c.program is not null and c.study_level is not null and c.intake is not null then 15 else 0 end;
  -- 10% financial stage
  score += case when exists(select 1 from payments where case_id=p_case and status='verified') then 10 else 0 end;
  -- 10% deadlines under control
  score += case when c.application_deadline is not null and c.application_deadline >= current_date then 10 else 0 end;
  -- 10% internal review fields complete
  score += case when c.submission_owner is not null and c.university is not null then 10 else 0 end;

  -- 40% documents
  score += case when req_total = 0 then 40 else round(40.0 * req_ok / req_total) end;
  -- 15% translation/legalisation
  score += case when tl_total = 0 then 15 else round(15.0 * tl_ok / tl_total) end;
  -- 15% academic/language recorded
  score += case when c.program is not null and c.study_level is not null and c.intake is not null then 15 else 0 end;
  -- 10% financial stage
  score += case when exists(select 1 from payments where case_id=p_case and status='verified') then 10 else 0 end;
  -- 10% deadlines under control
  score += case when c.application_deadline is not null and c.application_deadline >= current_date then 10 else 0 end;
  -- 10% internal review fields complete
  score += case when c.submission_owner is not null and c.university is not null then 10 else 0 end;

  b := jsonb_build_object(
    'documents',        case when req_total=0 then 40 else round(40.0*req_ok/req_total) end,
    'translations',     case when tl_total=0 then 15 else round(15.0*tl_ok/tl_total) end,
    'academic',         case when c.program is not null and c.study_level is not null and c.intake is not null then 15 else 0 end,
    'financial',        case when exists(select 1 from payments where case_id=p_case and status='verified') then 10 else 0 end,
    'deadlines',        case when c.application_deadline is not null and c.application_deadline >= current_date then 10 else 0 end,
    'submission_fields',case when c.submission_owner is not null and c.university is not null then 10 else 0 end
  );

  if jsonb_array_length(blockers) > 0 then score := least(score, 90); end if;

  return jsonb_build_object('score', least(greatest(score,0),100), 'breakdown', b, 'blockers', blockers, 'rule_version','v1');
end $$;

-- ============================================================
-- LOGIN LOCKOUT RPCs (5 fails -> 30 min, callable pre-auth)
-- ============================================================
create or replace function login_is_locked(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select locked_until > now() from login_security where email = lower(p_email)), false);
$$;

create or replace function login_register_failure(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare cur record;
begin
  select * into cur from login_security where email = lower(p_email) for update;

  if cur is null then
    insert into login_security (email, failed_count, locked_until, updated_at)
    values (lower(p_email), 1, null, now());
  elsif cur.locked_until > now() then
    -- still locked: keep the lock alive until the window ends
    update login_security set updated_at = now() where email = lower(p_email);
  else
    -- lock expired or normal state: start a fresh counting window
    if (cur.failed_count + 1) >= 5 then
      update login_security
      set failed_count = 5, locked_until = now() + interval '30 minutes', updated_at = now()
      where email = lower(p_email);
    else
      update login_security
      set failed_count = cur.failed_count + 1, locked_until = null, updated_at = now()
      where email = lower(p_email);
    end if;
  end if;
end $$;

create or replace function login_reset(p_email text)
returns void language sql security definer set search_path = public as $$
  delete from login_security where email = lower(p_email);
$$;

grant execute on function
  login_is_locked(text), login_register_failure(text), login_reset(text) to anon, authenticated;
grant execute on function
  transition_case(uuid,text,text), review_case(uuid,text,text),
  record_payment(uuid,payment_method,numeric,text,text),
  verify_payment(uuid,boolean,text),
  issue_invoice(uuid,int,uuid),
  create_free_retake(uuid,uuid,uuid,text,text),
  compute_readiness(uuid)
  to authenticated;
