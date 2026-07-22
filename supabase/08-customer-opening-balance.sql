-- Mainstreet customer opening balance upgrade
-- Run after 07-account-summary-upgrade.sql. Safe to rerun.

begin;

create table if not exists public.customer_opening_balances (
  id uuid primary key default extensions.gen_random_uuid(),
  customer_id uuid not null unique references public.customers(id) on delete cascade,
  balance_date date not null,
  balance_type text not null check (balance_type in ('debit','credit')),
  amount numeric(12,2) not null check (amount > 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_opening_balance_date_idx
  on public.customer_opening_balances(balance_date desc);

alter table public.customer_opening_balances enable row level security;
revoke all on public.customer_opening_balances from anon, authenticated;

create or replace function public.customer_balance_value(p_customer_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, extensions
as $$
  select round(
    coalesce((select sum(case when o.balance_type='debit' then o.amount else -o.amount end) from public.customer_opening_balances o where o.customer_id=p_customer_id),0)
    + coalesce((select sum(i.total_amount) from public.invoices i where i.customer_id=p_customer_id),0)
    - coalesce((select sum(p.amount) from public.payments p where p.customer_id=p_customer_id),0),
    2
  );
$$;

revoke all on function public.customer_balance_value(uuid) from public, anon, authenticated;

create or replace function public.upsert_customer_opening_balance(
  p_token uuid,
  p_customer_name text,
  p_customer_phone text,
  p_balance_date date,
  p_balance_type text,
  p_amount numeric,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_name text;
  v_id uuid;
begin
  perform public.assert_staff_session(p_token);
  v_name:=trim(regexp_replace(coalesce(p_customer_name,''),'\s+',' ','g'));
  if v_name='' then raise exception 'Customer name required'; end if;
  if p_balance_date is null then raise exception 'Opening balance date required'; end if;
  if p_balance_type not in ('debit','credit') then raise exception 'Balance type must be debit or credit'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'Opening balance amount must be greater than zero'; end if;

  insert into public.customers(name,name_key,phone)
  values(v_name,public.normalize_customer_name(v_name),trim(coalesce(p_customer_phone,'')))
  on conflict(name_key) do update set
    name=excluded.name,
    phone=case when excluded.phone<>'' then excluded.phone else public.customers.phone end,
    updated_at=now()
  returning id into v_customer_id;

  insert into public.customer_opening_balances(customer_id,balance_date,balance_type,amount,note)
  values(v_customer_id,p_balance_date,p_balance_type,round(p_amount,2),left(trim(coalesce(p_note,'')),240))
  on conflict(customer_id) do update set
    balance_date=excluded.balance_date,
    balance_type=excluded.balance_type,
    amount=excluded.amount,
    note=excluded.note,
    updated_at=now()
  returning id into v_id;

  return jsonb_build_object(
    'id',v_id,
    'customer_id',v_customer_id,
    'balance',public.customer_balance_value(v_customer_id)
  );
end;
$$;

grant execute on function public.upsert_customer_opening_balance(uuid,text,text,date,text,numeric,text)
to anon, authenticated;

create or replace function public.get_customer_opening_balance(
  p_token uuid,
  p_customer_name text
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
    'id',o.id,
    'customer_name',c.name,
    'phone',c.phone,
    'balance_date',o.balance_date,
    'balance_type',o.balance_type,
    'amount',o.amount,
    'note',o.note
  ) into v_result
  from public.customer_opening_balances o
  join public.customers c on c.id=o.customer_id
  where c.name_key=public.normalize_customer_name(p_customer_name)
  limit 1;
  return v_result;
end;
$$;

grant execute on function public.get_customer_opening_balance(uuid,text)
to anon, authenticated;

create or replace function public.delete_customer_opening_balance(
  p_token uuid,
  p_customer_name text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_staff_session(p_token);
  delete from public.customer_opening_balances o
  using public.customers c
  where o.customer_id=c.id
    and c.name_key=public.normalize_customer_name(p_customer_name);
  return found;
end;
$$;

grant execute on function public.delete_customer_opening_balance(uuid,text)
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
      case when o.balance_type='debit' then 'opening_debit' else 'opening_credit' end::text transaction_type,
      o.id,
      'OPENING'::text reference,
      o.balance_date transaction_date,
      o.amount,
      o.created_at,
      '[]'::jsonb items,
      o.note
    from public.customer_opening_balances o
    join public.customers c on c.id=o.customer_id
    where c.name_key=public.normalize_customer_name(p_customer_name)
      and o.balance_date between p_from and p_to
    union all
    select
      'invoice'::text,i.id,i.invoice_no,i.invoice_date,i.total_amount,i.created_at,
      coalesce((select jsonb_agg(jsonb_build_object(
        'id',ii.id,'menu_item_id',ii.menu_item_id,'item_name',ii.item_name,'category',ii.category,
        'half_rate',ii.half_rate,'full_rate',ii.full_rate,'half_qty',ii.half_qty,'full_qty',ii.full_qty,'amount',ii.amount
      ) order by ii.created_at) from public.invoice_items ii where ii.invoice_id=i.id),'[]'::jsonb),
      ''::text
    from public.invoices i
    join public.customers c on c.id=i.customer_id
    where c.name_key=public.normalize_customer_name(p_customer_name)
      and i.invoice_date between p_from and p_to
    union all
    select 'payment'::text,p.id,p.payment_no,p.payment_date,p.amount,p.created_at,'[]'::jsonb,p.note
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

create or replace function public.get_customer_summary(p_token uuid)
returns table(id uuid,name text,phone text,balance numeric,last_activity date)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_staff_session(p_token);
  return query
  select c.id,c.name,c.phone,public.customer_balance_value(c.id),greatest(
    coalesce((select max(o.balance_date) from public.customer_opening_balances o where o.customer_id=c.id),date '1900-01-01'),
    coalesce((select max(i.invoice_date) from public.invoices i where i.customer_id=c.id),date '1900-01-01'),
    coalesce((select max(p.payment_date) from public.payments p where p.customer_id=c.id),date '1900-01-01')
  )
  from public.customers c
  order by case when public.customer_balance_value(c.id)>0 then 0 else 1 end,
    abs(public.customer_balance_value(c.id)) desc,c.name;
end;
$$;

grant execute on function public.get_customer_summary(uuid) to anon, authenticated;

commit;
notify pgrst,'reload schema';
