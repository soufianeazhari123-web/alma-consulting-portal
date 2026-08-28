-- 0015: Allow directors to grant discounts (adjust invoice amount) — same rules as SA
create or replace function adjust_invoice_amount(p_invoice uuid, p_amount numeric, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare inv record;
begin
  select * into inv from invoices where id = p_invoice for update;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
  if not (is_super_admin() or is_director_of(inv.agency_id)) then raise exception 'FORBIDDEN'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'REASON_MANDATORY'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'BAD_AMOUNT'; end if;

  if inv.status <> 'issued' or exists (
       select 1 from payments where invoice_id = p_invoice and status <> 'rejected'
     ) then raise exception 'INVOICE_LOCKED_BY_PAYMENTS'; end if;

  update invoices set amount = p_amount where id = p_invoice;
  insert into audit_logs (actor_id, actor_staff_code, actor_role, action, entity, entity_id,
                          old_values, new_values, meta)
  values (auth.uid(), my_staff_code(), my_role(), 'invoice:amount_adjusted',
          'invoices', p_invoice::text,
          jsonb_build_object('amount', inv.amount),
          jsonb_build_object('amount', p_amount),
          jsonb_build_object('reason', p_reason));
end $$;
grant execute on function adjust_invoice_amount(uuid,numeric,text) to authenticated;
