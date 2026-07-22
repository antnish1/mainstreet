-- Ensures opening balances remain part of a customer's running balance
-- even when the opening date is earlier than the selected ledger period.
-- Run after 08-customer-opening-balance.sql. Safe to rerun.

begin;

create or replace function public.get_customer_ledger_detailed(
  p_token uuid,
  p_customer_name text,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_result jsonb;
begin
  perform public.assert_staff_session(p_token);
  if trim(coalesce(p_customer_name,''))='' then raise exception 'Customer name required'; end if;
  if p_from is null or p_to is null or p_from>p_to then raise exception 'Valid ledger date range required'; end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.transaction_date,x.sort_order,x.created_at),'[]'::jsonb)
  into v_result
  from (
    select
      case when o.balance_type='debit' then 'opening_debit' else 'opening_credit' end::text transaction_type,
      o.id,
      case when o.balance_date<p_from then 'BALANCE B/F' else 'OPENING' end::text reference,
      greatest(o.balance_date,p_from) transaction_date,
      o.amount,
      o.created_at,
      '[]'::jsonb items,
      case when o.balance_date<p_from
        then trim(concat('Opening balance dated ',o.balance_date::text,'. ',o.note))
        else o.note end note,
      0 sort_order
    from public.customer_opening_balances o
    join public.customers c on c.id=o.customer_id
    where c.name_key=public.normalize_customer_name(p_customer_name)
      and o.balance_date<=p_to

    union all

    select
      'invoice'::text,i.id,i.invoice_no,i.invoice_date,i.total_amount,i.created_at,
      coalesce((select jsonb_agg(jsonb_build_object(
        'id',ii.id,'menu_item_id',ii.menu_item_id,'item_name',ii.item_name,'category',ii.category,
        'half_rate',ii.half_rate,'full_rate',ii.full_rate,'half_qty',ii.half_qty,'full_qty',ii.full_qty,'amount',ii.amount
      ) order by ii.created_at) from public.invoice_items ii where ii.invoice_id=i.id),'[]'::jsonb),
      ''::text,
      1
    from public.invoices i
    join public.customers c on c.id=i.customer_id
    where c.name_key=public.normalize_customer_name(p_customer_name)
      and i.invoice_date between p_from and p_to

    union all

    select 'payment'::text,p.id,p.payment_no,p.payment_date,p.amount,p.created_at,'[]'::jsonb,p.note,2
    from public.payments p
    join public.customers c on c.id=p.customer_id
    where c.name_key=public.normalize_customer_name(p_customer_name)
      and p.payment_date between p_from and p_to
  ) x;

  return v_result;
end;
$$;

grant execute on function public.get_customer_ledger_detailed(uuid,text,date,date)
to anon, authenticated;

commit;
notify pgrst,'reload schema';
