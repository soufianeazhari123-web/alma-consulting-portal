-- 0012: Fix receipts.seq not-null (same as invoices) — compute seq AFTER next_billing_number
create or replace function verify_payment(p_payment uuid, p_approve boolean, p_reason text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare pay record; rid uuid; yr int := extract(year from now())::int;
        rnum text; rseq int;
begin
  select * into pay from payments where id = p_payment and status <> 'void';
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  if not (is_super_admin() or is_director_of(pay.agency_id)) then
    raise exception 'FORBIDDEN_VERIFIER';
  end if;

  if not p_approve then
    update payments set status='rejected', verified_by=auth.uid(), verified_at=now(),
           rejection_reason=coalesce(p_reason,'—')
    where id = p_payment;
    return null;
  end if;

  rnum := next_billing_number(pay.agency_id,'RECEIPT',yr,'REC');
  select last_number into rseq from billing_sequences where agency_id=pay.agency_id and doc_type='RECEIPT';

  insert into receipts (number, agency_id, year, seq, payment_id, invoice_id, student_id,
                        amount, currency, method, verified_by)
  values (
    rnum,
    pay.agency_id, yr,
    rseq,
    pay.id, pay.invoice_id, pay.student_id,
    pay.amount, pay.currency, pay.method, auth.uid()
  ) returning id into rid;

  update payments set status='verified', verified_by=auth.uid(), verified_at=now(), receipt_id=rid
  where id = p_payment;

  update invoices i set status = case
      when (select coalesce(sum(amount),0) from payments where invoice_id=i.id and status='verified') >= i.amount
      then 'paid' else 'partially_paid' end
  where id = pay.invoice_id;

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
grant execute on function verify_payment(uuid,boolean,text) to authenticated;
