-- Mainstreet reporting, ledger and invoice-edit upgrade
-- Run after 05-business-suite.sql. Safe to rerun.

begin;

create table if not exists public.expense_categories (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.expense_categories(name)
values ('Daily Needs'), ('Cigarette')
on conflict(name) do nothing;

alter table public.expense_categories enable row level security;
revoke all on public.expense_categories from anon, authenticated;

-- Remove the original fixed two-category check so new categories can be used.
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.expenses'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%Daily Needs%'
  loop
    execute format('alter table public.expenses drop constraint %I', r.conname);
  end loop;
end;
$$;

create or replace function public.add_expense_category(
  p_token uuid,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_name text;
begin
  perform public.assert_staff_session(p_token);
  v_name := trim(regexp_replace(coalesce(p_name,''), '\s+', ' ', 'g'));
  if v_name = '' then raise exception 'Category name required'; end if;
  insert into public.expense_categories(name)
  values(v_name)
  on conflict(name) do update set is_active = true
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.add_expense_category(uuid,text)
to anon, authenticated;

create or replace function public.get_expense_categories(p_token uuid)
returns table(id uuid,name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_staff_session(p_token);
  return query
  select e.id,e.name
  from public.expense_categories e
  where e.is_active
  order by e.name;
end;
$$;

grant execute on function public.get_expense_categories(uuid)
to anon, authenticated;

create or replace function public.create_expense(
  p_token uuid,
  p_expense_date date,
  p_category text,
  p_description text,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_description text; v_category text;
begin
  perform public.assert_staff_session(p_token);
  v_category := trim(coalesce(p_category,''));
  v_description := trim(coalesce(p_description,''));
  if p_expense_date is null then raise exception 'Expense date required'; end if;
  if v_category = '' or not exists(select 1 from public.expense_categories e where lower(e.name)=lower(v_category) and e.is_active) then raise exception 'Invalid expense category'; end if;
  if v_description = '' then raise exception 'Expense description required'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'Expense amount must be greater than zero'; end if;
  insert into public.expenses(expense_date,category,description,amount)
  values(p_expense_date,v_category,v_description,round(p_amount,2))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.create_expense(uuid,date,text,text,numeric)
to anon, authenticated;

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
  select coalesce(jsonb_agg(to_jsonb(x) order by x.transaction_date,x.created_at),'[]'::jsonb)
  into v_result
  from (
    select
      'invoice'::text transaction_type,
      i.id,
      i.invoice_no reference,
      i.invoice_date transaction_date,
      i.total_amount amount,
      i.created_at,
      coalesce((select jsonb_agg(jsonb_build_object(
        'id',ii.id,
        'menu_item_id',ii.menu_item_id,
        'item_name',ii.item_name,
        'category',ii.category,
        'half_rate',ii.half_rate,
        'full_rate',ii.full_rate,
        'half_qty',ii.half_qty,
        'full_qty',ii.full_qty,
        'amount',ii.amount
      ) order by ii.created_at) from public.invoice_items ii where ii.invoice_id=i.id),'[]'::jsonb) items
    from public.invoices i
    join public.customers c on c.id=i.customer_id
    where c.name_key=public.normalize_customer_name(p_customer_name)
      and i.invoice_date between p_from and p_to
    union all
    select
      'payment'::text,
      p.id,
      p.payment_no,
      p.payment_date,
      p.amount,
      p.created_at,
      '[]'::jsonb
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

create or replace function public.get_invoice_for_edit(
  p_token uuid,
  p_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_result jsonb;
begin
  perform public.assert_staff_session(p_token);
  select jsonb_build_object(
    'id',i.id,
    'invoice_no',i.invoice_no,
    'invoice_date',i.invoice_date,
    'customer_name',c.name,
    'total_amount',i.total_amount,
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',ii.id,
      'menu_item_id',ii.menu_item_id,
      'item_name',ii.item_name,
      'category',ii.category,
      'half_rate',ii.half_rate,
      'full_rate',ii.full_rate,
      'half_qty',ii.half_qty,
      'full_qty',ii.full_qty,
      'amount',ii.amount
    ) order by ii.created_at) from public.invoice_items ii where ii.invoice_id=i.id),'[]'::jsonb)
  ) into v_result
  from public.invoices i
  join public.customers c on c.id=i.customer_id
  where i.id=p_invoice_id and i.invoice_date=current_date;
  if v_result is null then raise exception 'Today invoice not found'; end if;
  return v_result;
end;
$$;

grant execute on function public.get_invoice_for_edit(uuid,uuid)
to anon, authenticated;

create or replace function public.update_today_invoice_detailed(
  p_token uuid,
  p_invoice_id uuid,
  p_invoice_date date,
  p_customer_name text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_item jsonb;
  v_total numeric(12,2):=0;
  v_amount numeric(12,2);
  v_half_qty integer;
  v_full_qty integer;
  v_clean text;
begin
  perform public.assert_staff_session(p_token);
  if p_invoice_date<>current_date then raise exception 'Only today invoices can be edited'; end if;
  if not exists(select 1 from public.invoices i where i.id=p_invoice_id and i.invoice_date=current_date) then raise exception 'Today invoice not found'; end if;
  v_clean:=trim(regexp_replace(coalesce(p_customer_name,''),'\s+',' ','g'));
  if v_clean='' then raise exception 'Customer required'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'At least one item is required'; end if;
  insert into public.customers(name,name_key)
  values(v_clean,public.normalize_customer_name(v_clean))
  on conflict(name_key) do update set name=excluded.name,updated_at=now()
  returning id into v_customer_id;
  delete from public.invoice_items where invoice_id=p_invoice_id;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_half_qty:=greatest(coalesce((v_item->>'half_qty')::integer,0),0);
    v_full_qty:=greatest(coalesce((v_item->>'full_qty')::integer,0),0);
    if v_half_qty=0 and v_full_qty=0 then continue; end if;
    v_amount:=round(
      coalesce((v_item->>'half_rate')::numeric,0)*v_half_qty+
      coalesce((v_item->>'full_rate')::numeric,0)*v_full_qty,2
    );
    insert into public.invoice_items(invoice_id,menu_item_id,item_name,category,half_rate,full_rate,half_qty,full_qty,amount)
    values(
      p_invoice_id,
      nullif(v_item->>'menu_item_id',''),
      coalesce(nullif(trim(v_item->>'item_name'),''),'Item'),
      coalesce(nullif(trim(v_item->>'category'),''),'Custom'),
      nullif((v_item->>'half_rate')::numeric,0),
      coalesce((v_item->>'full_rate')::numeric,0),
      v_half_qty,
      v_full_qty,
      v_amount
    );
    v_total:=v_total+v_amount;
  end loop;
  if v_total<=0 then raise exception 'Invoice total must be greater than zero'; end if;
  update public.invoices set invoice_date=p_invoice_date,customer_id=v_customer_id,total_amount=v_total where id=p_invoice_id;
  return jsonb_build_object('id',p_invoice_id,'total',v_total);
end;
$$;

grant execute on function public.update_today_invoice_detailed(uuid,uuid,date,text,jsonb)
to anon, authenticated;

create or replace function public.get_detailed_business_report(
  p_token uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_transactions jsonb; v_expenses jsonb;
begin
  perform public.assert_staff_session(p_token);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.transaction_date desc,x.created_at desc),'[]'::jsonb)
  into v_transactions
  from (
    select
      'invoice'::text transaction_type,i.id,i.invoice_no reference,i.invoice_date transaction_date,
      c.name customer_name,c.phone,i.total_amount amount,''::text note,i.created_at,
      coalesce((select jsonb_agg(jsonb_build_object(
        'item_name',ii.item_name,'category',ii.category,'half_rate',ii.half_rate,'full_rate',ii.full_rate,
        'half_qty',ii.half_qty,'full_qty',ii.full_qty,'amount',ii.amount
      ) order by ii.created_at) from public.invoice_items ii where ii.invoice_id=i.id),'[]'::jsonb) items
    from public.invoices i join public.customers c on c.id=i.customer_id
    where i.invoice_date between p_from and p_to
    union all
    select 'payment',p.id,p.payment_no,p.payment_date,c.name,c.phone,p.amount,p.note,p.created_at,'[]'::jsonb
    from public.payments p join public.customers c on c.id=p.customer_id
    where p.payment_date between p_from and p_to
  ) x;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.expense_date desc,e.created_at desc),'[]'::jsonb)
  into v_expenses
  from public.expenses e where e.expense_date between p_from and p_to;
  return jsonb_build_object('transactions',v_transactions,'expenses',v_expenses);
end;
$$;

grant execute on function public.get_detailed_business_report(uuid,date,date)
to anon, authenticated;

commit;
notify pgrst,'reload schema';
