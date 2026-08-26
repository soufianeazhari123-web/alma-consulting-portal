-- ============================================================
-- 0007 — Owner decisions batch:
--  A) Invoice #1 issues when the SIGNED AGREEMENT date is recorded
--     (not at case creation). Free-retake students are unaffected
--     because retake cases never reach invoicing anyway.
--  B) Audited CSV export helper (spec §14: exports must be audited).
-- ============================================================

-- A) Retire the 'draft' auto-trigger for installment 1
update installment_rules set service_scope = 'agreement_signed' where id = 1;

create or replace function auto_issue_installments()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.stage is distinct from old.stage then
    for r in select id, service_scope from installment_rules
             where trigger_stage = new.stage and is_active loop
      continue when r.service_scope = 'agreement_signed'; -- handled by students trigger
      perform issue_invoice(new.id, r.id);
    end loop;
  end if;
  return new;
end $$;

-- Issue an invoice bound only to the student (case_id null)
create or replace function issue_invoice_for_student(p_student uuid, p_installment int)
returns uuid
language plpgsql security definer set search_path = public as $$
declare s record; inv_id uuid; amt numeric; yr int := extract(year from now())::int;
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

  insert into invoices (
    number, agency_id, year, seq, student_id, installment_no, amount, issued_by,
    due_date
  ) values (
    next_billing_number(s.agency_id,'INVOICE',yr,'FAC'),
    s.agency_id, yr,
    (select last_number from billing_sequences where agency_id=s.agency_id and doc_type='INVOICE'),
    p_student, p_installment, amt, auth.uid(),
    current_date + (select invoice_due_days from company_settings where id)
  ) returning id into inv_id;
  return inv_id;
end $$;

-- Q4 owner decision: reminder policy = 7 days before due date + overdue.
-- Staff review/approval REQUIRED before any reminder is actually sent.
create or replace function draft_installment_reminders()
returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  if not is_staff() then raise exception 'FORBIDDEN'; end if;
  for r in
    select i.id, i.number, i.due_date, s.email, s.preferred_language, s.full_name
    from invoices i join students s on s.id = i.student_id
    where i.status in ('issued','partially_paid')
      and i.due_date <= current_date + interval '7 days'
      and not exists (
        select 1 from email_queue q
        where q.event_key = 'billing.installment_reminder'
          and q.payload->>'invoice_number' = i.number
      )
  loop
    insert into email_queue (event_key, recipient, lang, payload, requires_approval, status)
    values ('billing.installment_reminder', r.email, r.preferred_language,
            jsonb_build_object('invoice_number', r.number, 'student_name', r.full_name,
                               'due_date', r.due_date),
            true, 'pending');
    n := n + 1;
  end loop;
  return n;
end $$;

grant execute on function draft_installment_reminders() to authenticated;

-- Trigger: recording the in-agency signed-agreement date issues invoice #1 once.
create or replace function on_agreement_signed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.agreement_signed_at is not null
     and (tg_op = 'INSERT' or old.agreement_signed_at is null) then
    perform issue_invoice_for_student(new.id, 1);
  end if;
  return new;
end $$;

drop trigger if exists trg_agreement_invoice on students;
create trigger trg_agreement_invoice after insert or update on students
  for each row execute procedure on_agreement_signed();

-- B) Audit helper for sensitive exports (CSV etc.)
create or replace function log_export(p_scope text, p_rows int default 0)
returns void
language sql security definer set search_path = public as $$
  insert into audit_logs (actor_id, actor_staff_code, actor_role, action, entity, meta)
  values (auth.uid(), my_staff_code(), my_role(), 'export:csv', p_scope,
          jsonb_build_object('rows', p_rows));
$$;

grant execute on function issue_invoice_for_student(uuid,int), log_export(text,int) to authenticated;
