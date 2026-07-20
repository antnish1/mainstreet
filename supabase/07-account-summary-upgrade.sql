-- Mainstreet customer summary upgrade
-- Run after 06-report-ledger-edit-upgrade.sql

begin;

drop function if exists public.get_customer_summary(uuid);

create function public.get_customer_summary(p_token uuid)
returns table(
  id uuid,
  name text,
  phone text,
  balance numeric,
  last_activity date
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_staff_session(p_token);

  return query
  select
    c.id,
    c.name,
    c.phone,
    public.customer_balance_value(c.id) as balance,
    greatest(
      coalesce((select max(i.invoice_date) from public.invoices i where i.customer_id = c.id), date '1900-01-01'),
      coalesce((select max(p.payment_date) from public.payments p where p.customer_id = c.id), date '1900-01-01')
    ) as last_activity
  from public.customers c
  order by
    case when public.customer_balance_value(c.id) > 0 then 0 else 1 end,
    abs(public.customer_balance_value(c.id)) desc,
    c.name;
end;
$$;

grant execute on function public.get_customer_summary(uuid)
to anon, authenticated;

commit;
notify pgrst, 'reload schema';
