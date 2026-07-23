-- Mainstreet fast counter sales
-- Run after 11-secure-menu-item-management.sql. Safe to rerun.
begin;

create table if not exists public.counter_sales (
  id uuid primary key default extensions.gen_random_uuid(),
  client_reference uuid not null unique,
  sale_no text not null unique,
  sale_date date not null,
  payment_mode text not null check (payment_mode in ('cash','upi','split')),
  entry_type text not null check (entry_type in ('item_sale','quick_amount','daily_adjustment')),
  gross_amount numeric(12,2) not null check (gross_amount > 0),
  cash_amount numeric(12,2) not null default 0 check (cash_amount >= 0),
  upi_amount numeric(12,2) not null default 0 check (upi_amount >= 0),
  staff_user_id uuid references public.staff_users(id),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.counter_sale_items (
  id uuid primary key default extensions.gen_random_uuid(),
  counter_sale_id uuid not null references public.counter_sales(id) on delete cascade,
  menu_item_id text references public.menu_items(id),
  item_name text not null,
  category text not null,
  half_qty integer not null default 0 check (half_qty >= 0),
  full_qty integer not null default 0 check (full_qty >= 0),
  half_rate numeric(12,2),
  full_rate numeric(12,2) not null default 0,
  amount numeric(12,2) not null check (amount >= 0)
);

create index if not exists counter_sales_date_idx on public.counter_sales(sale_date desc,created_at desc);
create index if not exists counter_sale_items_sale_idx on public.counter_sale_items(counter_sale_id);
alter table public.counter_sales enable row level security;
alter table public.counter_sale_items enable row level security;
revoke all on public.counter_sales,public.counter_sale_items from anon,authenticated;

create or replace function public.create_counter_sale(
  p_token uuid,
  p_client_reference uuid,
  p_sale_date date,
  p_payment_mode text,
  p_entry_type text,
  p_gross_amount numeric,
  p_cash_amount numeric,
  p_upi_amount numeric,
  p_items jsonb default '[]'::jsonb,
  p_note text default ''
)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_staff_id uuid;
  v_sale_id uuid;
  v_sale_no text;
  v_existing public.counter_sales%rowtype;
  v_item jsonb;
  v_items_total numeric(12,2):=0;
  v_amount numeric(12,2);
begin
  perform public.assert_staff_session(p_token);
  select s.staff_user_id into v_staff_id from public.staff_sessions s where s.token=p_token and s.expires_at>now();
  select * into v_existing from public.counter_sales where client_reference=p_client_reference;
  if found then return jsonb_build_object('id',v_existing.id,'reference',v_existing.sale_no,'total',v_existing.gross_amount,'duplicate',true); end if;
  if p_sale_date is null then raise exception 'Sale date required'; end if;
  if p_payment_mode not in ('cash','upi','split') then raise exception 'Select Cash, UPI or Split'; end if;
  if p_entry_type not in ('item_sale','quick_amount','daily_adjustment') then raise exception 'Invalid counter sale type'; end if;
  if coalesce(p_gross_amount,0)<=0 then raise exception 'Sale amount must be greater than zero'; end if;
  if round(coalesce(p_cash_amount,0)+coalesce(p_upi_amount,0),2)<>round(p_gross_amount,2) then raise exception 'Cash and UPI amounts must equal sale total'; end if;
  if p_payment_mode='cash' and coalesce(p_upi_amount,0)<>0 then raise exception 'Cash sale cannot contain UPI amount'; end if;
  if p_payment_mode='upi' and coalesce(p_cash_amount,0)<>0 then raise exception 'UPI sale cannot contain cash amount'; end if;
  if p_entry_type='daily_adjustment' then perform public.assert_admin_session(p_token); end if;
  if p_entry_type='item_sale' and jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'Add at least one item'; end if;

  perform pg_advisory_xact_lock(hashtext('mainstreet-counter-'||p_sale_date::text));
  select 'CS-'||to_char(p_sale_date,'YYYYMMDD')||'-'||lpad((count(*)+1)::text,4,'0') into v_sale_no from public.counter_sales where sale_date=p_sale_date;
  insert into public.counter_sales(client_reference,sale_no,sale_date,payment_mode,entry_type,gross_amount,cash_amount,upi_amount,staff_user_id,note)
  values(p_client_reference,v_sale_no,p_sale_date,p_payment_mode,p_entry_type,round(p_gross_amount,2),round(coalesce(p_cash_amount,0),2),round(coalesce(p_upi_amount,0),2),v_staff_id,left(trim(coalesce(p_note,'')),160))
  returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_amount:=round(coalesce((v_item->>'amount')::numeric,0),2);
    if v_amount<0 then raise exception 'Invalid item amount'; end if;
    insert into public.counter_sale_items(counter_sale_id,menu_item_id,item_name,category,half_qty,full_qty,half_rate,full_rate,amount)
    values(v_sale_id,nullif(v_item->>'menu_item_id',''),coalesce(nullif(trim(v_item->>'item_name'),''),'Item'),coalesce(nullif(trim(v_item->>'category'),''),'Custom'),coalesce((v_item->>'half_qty')::integer,0),coalesce((v_item->>'full_qty')::integer,0),nullif(v_item->>'half_rate','')::numeric,coalesce((v_item->>'full_rate')::numeric,0),v_amount);
    v_items_total:=v_items_total+v_amount;
  end loop;
  if p_entry_type='item_sale' and round(v_items_total,2)<>round(p_gross_amount,2) then raise exception 'Item total does not match sale total'; end if;
  return jsonb_build_object('id',v_sale_id,'reference',v_sale_no,'total',round(p_gross_amount,2),'duplicate',false);
end;
$$;
grant execute on function public.create_counter_sale(uuid,uuid,date,text,text,numeric,numeric,numeric,jsonb,text) to anon,authenticated;

create or replace function public.get_counter_sales_summary(p_token uuid,p_from date,p_to date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v jsonb;
begin
  perform public.assert_staff_session(p_token);
  select jsonb_build_object(
    'total_sales',coalesce(sum(gross_amount),0),
    'cash_sales',coalesce(sum(cash_amount),0),
    'upi_sales',coalesce(sum(upi_amount),0),
    'sale_count',count(*),
    'item_sales',coalesce(sum(gross_amount) filter(where entry_type='item_sale'),0),
    'quick_sales',coalesce(sum(gross_amount) filter(where entry_type='quick_amount'),0),
    'adjustments',coalesce(sum(gross_amount) filter(where entry_type='daily_adjustment'),0)
  ) into v from public.counter_sales where sale_date between p_from and p_to;
  return v;
end;
$$;
grant execute on function public.get_counter_sales_summary(uuid,date,date) to anon,authenticated;

create or replace function public.get_recent_counter_sales(p_token uuid,p_from date,p_to date)
returns table(id uuid,sale_no text,sale_date date,payment_mode text,entry_type text,gross_amount numeric,cash_amount numeric,upi_amount numeric,note text,created_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_staff_session(p_token);
  return query select s.id,s.sale_no,s.sale_date,s.payment_mode,s.entry_type,s.gross_amount,s.cash_amount,s.upi_amount,s.note,s.created_at from public.counter_sales s where s.sale_date between p_from and p_to order by s.sale_date desc,s.created_at desc limit 200;
end;
$$;
grant execute on function public.get_recent_counter_sales(uuid,date,date) to anon,authenticated;

commit;
notify pgrst,'reload schema';