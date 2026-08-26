-- ============================================================
-- 0009 — Fixes:
--  A) Invoice seq not-null violation: compute seq AFTER next_billing_number()
--     creates/increments the billing_sequences row (was read via a subquery
--     that could evaluate before the row existed -> NULL -> constraint error).
--  B) Enable email/password login for the owner account (created via Google
--     OAuth with no password). Idempotent: only sets a password if none yet.
-- ============================================================

-- A1) issue_invoice (case-bound) — robust seq computation
create or replace function issue_invoice(p_case uuid, p_installment int, p_actor uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare c record; inv_id uuid; amt numeric; yr int := extract(year from now())::int; actor uuid;
        num text; seqno int;
begin
  actor := coalesce(p_actor, auth.uid());
  select * into c from cases where id = p_case;
  if not found then raise exception 'CASE_NOT_FOUND'; end if;

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

  num := next_billing_number(c.agency_id,'INVOICE',yr,'FAC');
  select last_number into seqno from billing_sequences where agency_id=c.agency_id and doc_type='INVOICE';

  insert into invoices (
    number, agency_id, year, seq, student_id, case_id, installment_no, amount, issued_by, due_date
  ) values (
    num,
    c.agency_id, yr,
    seqno,
    c.student_id, c.id, p_installment, amt, actor,
    current_date + (select invoice_due_days from company_settings where id)
  ) returning id into inv_id;

  return inv_id;
end $$;

-- A2) issue_invoice_for_student (agreement-signed trigger) — robust seq computation
create or replace function issue_invoice_for_student(p_student uuid, p_installment int)
returns uuid
language plpgsql security definer set search_path = public as $$
declare s record; inv_id uuid; amt numeric; yr int := extract(year from now())::int;
        num text; seqno int;
begin
  select * into s from students where id = p_student;
  if not found then raise exception 'STUDENT_NOT_FOUND'; end if;
  if not (is_super_admin()
          or is_director_of(s.agency_id)
          or (is_active_agent_of(s.agency_id) and s.main_agent_id = auth.uid()))
  then raise exception 'FORBIDDEN'; end if;

  if exists (select 1 from invoices where student_id=p_student and installment_no=p_installment and status<>'void') then
    return (select id from invoices where student_id=p_student and installment_no=p_installment and status<>'void');
  end if;

  select default_amount into amt from installment_rules where id = p_installment and is_active;

  num := next_billing_number(s.agency_id,'INVOICE',yr,'FAC');
  select last_number into seqno from billing_sequences where agency_id=s.agency_id and doc_type='INVOICE';

  insert into invoices (
    number, agency_id, year, seq, student_id, installment_no, amount, issued_by, due_date
  ) values (
    num,
    s.agency_id, yr,
    seqno,
    p_student, p_installment, amt, auth.uid(),
    current_date + (select invoice_due_days from company_settings where id)
  ) returning id into inv_id;
  return inv_id;
end $$;

-- B) Enable email/password for owner (idempotent)
update auth.users
set encrypted_password = crypt('Alma2026!!Secure', gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    confirmed_at = coalesce(confirmed_at, now())
where email = 'info@almaconsulting.lt'
  and encrypted_password is null;

grant execute on function issue_invoice(uuid,int,uuid), issue_invoice_for_student(uuid,int) to authenticated;
