-- Mobile-first cafe business reporting
-- Run after 12-fast-counter-sales.sql. Safe to rerun.
begin;

create or replace function public.get_cafe_business_report(
  p_token uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_result jsonb;
begin
  perform public.assert_staff_session(p_token);
  if p_from is null or p_to is null or p_from>p_to then raise exception 'Select a valid report period'; end if;

  with
  credit_sales as (
    select coalesce(sum(i.total_amount),0)::numeric total, count(*)::int bills
    from public.invoices i where i.invoice_date between p_from and p_to
  ),
  counter as (
    select coalesce(sum(s.gross_amount),0)::numeric total,
           coalesce(sum(s.cash_amount),0)::numeric cash,
           coalesce(sum(s.upi_amount),0)::numeric upi,
           count(*)::int bills,
           coalesce(sum(s.gross_amount) filter(where s.entry_type='item_sale'),0)::numeric item_sales,
           coalesce(sum(s.gross_amount) filter(where s.entry_type='quick_amount'),0)::numeric quick_sales,
           coalesce(sum(s.gross_amount) filter(where s.entry_type='daily_adjustment'),0)::numeric adjustments
    from public.counter_sales s where s.sale_date between p_from and p_to
  ),
  collections as (
    select coalesce(sum(p.amount),0)::numeric total, count(*)::int entries
    from public.payments p where p.payment_date between p_from and p_to
  ),
  expense_totals as (
    select coalesce(sum(e.amount),0)::numeric total, count(*)::int entries
    from public.expenses e where e.expense_date between p_from and p_to
  ),
  receivable as (
    select coalesce(sum(greatest(public.customer_balance_value(c.id),0)),0)::numeric total,
           count(*) filter(where public.customer_balance_value(c.id)>0)::int debit_customers,
           count(*)::int customers
    from public.customers c
  ),
  sales_activity as (
    select 'counter_sale'::text type,s.id,s.sale_no reference,s.sale_date tx_date,''::text party,s.gross_amount amount,s.payment_mode detail,s.entry_type subtype,s.created_at
    from public.counter_sales s where s.sale_date between p_from and p_to
    union all
    select 'credit_invoice',i.id,i.invoice_no,i.invoice_date,c.name,i.total_amount,'credit','invoice',i.created_at
    from public.invoices i join public.customers c on c.id=i.customer_id where i.invoice_date between p_from and p_to
  ),
  all_activity as (
    select * from sales_activity
    union all
    select 'payment',p.id,p.payment_no,p.payment_date,c.name,p.amount,coalesce(nullif(p.note,''),'Mode not classified'),'collection',p.created_at
    from public.payments p join public.customers c on c.id=p.customer_id where p.payment_date between p_from and p_to
    union all
    select 'expense',e.id,e.category,e.expense_date,e.description,e.amount,e.category,'expense',e.created_at
    from public.expenses e where e.expense_date between p_from and p_to
  ),
  item_rows as (
    select ii.item_name,ii.category,coalesce(ii.half_qty,0) half_qty,coalesce(ii.full_qty,0) full_qty,ii.amount
    from public.invoice_items ii join public.invoices i on i.id=ii.invoice_id where i.invoice_date between p_from and p_to
    union all
    select ci.item_name,ci.category,coalesce(ci.half_qty,0),coalesce(ci.full_qty,0),ci.amount
    from public.counter_sale_items ci join public.counter_sales cs on cs.id=ci.counter_sale_id where cs.sale_date between p_from and p_to
  ),
  item_summary as (
    select item_name,category,sum(half_qty)::int half_qty,sum(full_qty)::int full_qty,sum(half_qty+full_qty)::int qty,sum(amount)::numeric sales
    from item_rows group by item_name,category order by sales desc limit 50
  ),
  category_summary as (
    select category,sum(half_qty+full_qty)::int qty,sum(amount)::numeric sales
    from item_rows group by category order by sales desc
  ),
  expense_summary as (
    select e.category,sum(e.amount)::numeric amount,count(*)::int entries
    from public.expenses e where e.expense_date between p_from and p_to group by e.category order by amount desc
  ),
  customer_summary as (
    select c.id,c.name,c.phone,public.customer_balance_value(c.id)::numeric balance,
      (select max(i.invoice_date) from public.invoices i where i.customer_id=c.id) last_invoice,
      (select max(p.payment_date) from public.payments p where p.customer_id=c.id) last_payment
    from public.customers c
    order by public.customer_balance_value(c.id) desc,c.name limit 100
  )
  select jsonb_build_object(
    'period',jsonb_build_object('from',p_from,'to',p_to),
    'overview',jsonb_build_object(
      'total_sales',cs.total+ct.total,
      'counter_sales',ct.total,
      'credit_sales',cs.total,
      'customer_collections',cl.total,
      'total_collections',ct.total+cl.total,
      'expenses',ex.total,
      'sales_less_expenses',cs.total+ct.total-ex.total,
      'receivable',rc.total,
      'cash_received',ct.cash,
      'upi_received',ct.upi,
      'unclassified_collections',cl.total,
      'bill_count',cs.bills+ct.bills,
      'average_bill',case when cs.bills+ct.bills=0 then 0 else round((cs.total+ct.total)/(cs.bills+ct.bills),2) end,
      'expense_entries',ex.entries,
      'customers',rc.customers,
      'debit_customers',rc.debit_customers
    ),
    'sales',jsonb_build_object('counter_item_sales',ct.item_sales,'counter_quick_sales',ct.quick_sales,'counter_adjustments',ct.adjustments,'credit_sales',cs.total,'counter_bills',ct.bills,'credit_bills',cs.bills,'cash',ct.cash,'upi',ct.upi),
    'collections',jsonb_build_object('counter_cash',ct.cash,'counter_upi',ct.upi,'customer_collections',cl.total,'customer_collection_entries',cl.entries),
    'expenses',jsonb_build_object('total',ex.total,'entries',ex.entries,'by_category',coalesce((select jsonb_agg(to_jsonb(x)) from expense_summary x),'[]'::jsonb)),
    'items',jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(x)) from item_summary x),'[]'::jsonb),'categories',coalesce((select jsonb_agg(to_jsonb(x)) from category_summary x),'[]'::jsonb),'unclassified_quick_sales',ct.quick_sales),
    'customers',jsonb_build_object('receivable',rc.total,'total_customers',rc.customers,'debit_customers',rc.debit_customers,'rows',coalesce((select jsonb_agg(to_jsonb(x)) from customer_summary x),'[]'::jsonb)),
    'sales_activity',coalesce((select jsonb_agg(to_jsonb(x) order by x.tx_date desc,x.created_at desc) from sales_activity x),'[]'::jsonb),
    'activity',coalesce((select jsonb_agg(to_jsonb(x) order by x.tx_date desc,x.created_at desc) from all_activity x),'[]'::jsonb)
  ) into v_result
  from credit_sales cs,counter ct,collections cl,expense_totals ex,receivable rc;

  return v_result;
end;
$$;

grant execute on function public.get_cafe_business_report(uuid,date,date) to anon,authenticated;
commit;
notify pgrst,'reload schema';