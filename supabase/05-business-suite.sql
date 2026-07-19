-- Mainstreet Business Suite upgrade
-- Run once after 01-04 scripts. Safe to rerun.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.menu_items add column if not exists half_rate numeric(12,2);
alter table public.customers add column if not exists phone text not null default '';

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category text not null check (category in ('Daily Needs','Cigarette')),
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists expenses_date_idx on public.expenses(expense_date desc);
alter table public.expenses enable row level security;
revoke all on public.expenses from anon, authenticated;

create or replace function public.staff_login(p_pin text)
returns table(token uuid, expires_at timestamptz)
language plpgsql security definer set search_path=public,extensions as $$
begin
  if p_pin is null or not exists(select 1 from public.app_settings a where a.id=1 and a.pin_hash=extensions.crypt(p_pin,a.pin_hash)) then
    raise exception 'Invalid PIN' using errcode='28000';
  end if;
  delete from public.staff_sessions where staff_sessions.expires_at<=now();
  return query insert into public.staff_sessions default values returning staff_sessions.token,staff_sessions.expires_at;
end$$;
grant execute on function public.staff_login(text) to anon,authenticated;

create or replace function public.add_menu_item(p_token uuid,p_category text,p_item_name text,p_half_rate numeric,p_full_rate numeric)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id text;
begin
  perform public.assert_staff_session(p_token);
  if trim(coalesce(p_category,''))='' or trim(coalesce(p_item_name,''))='' or coalesce(p_full_rate,0)<=0 then raise exception 'Category, item and full price are required'; end if;
  v_id:='menu-custom-'||replace(gen_random_uuid()::text,'-','');
  insert into public.menu_items(id,category,name,half_rate,full_rate,is_active) values(v_id,trim(p_category),trim(p_item_name),case when coalesce(p_half_rate,0)>0 then round(p_half_rate,2) else null end,round(p_full_rate,2),true);
  return jsonb_build_object('id',v_id);
end$$;
grant execute on function public.add_menu_item(uuid,text,text,numeric,numeric) to anon,authenticated;

drop function if exists public.create_invoice_transaction(uuid,uuid,date,text,jsonb);
create or replace function public.create_invoice_transaction(p_token uuid,p_client_reference uuid,p_invoice_date date,p_customer_name text,p_customer_phone text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_customer_id uuid;v_invoice_id uuid;v_invoice_no text;v_item jsonb;v_amount numeric(12,2);v_total numeric(12,2):=0;v_existing public.invoices%rowtype;v_clean text;
begin
 perform public.assert_staff_session(p_token);select * into v_existing from public.invoices where client_reference=p_client_reference;if found then return jsonb_build_object('reference',v_existing.invoice_no,'total',v_existing.total_amount);end if;
 v_clean:=regexp_replace(trim(coalesce(p_customer_name,'')),'\s+',' ','g');if v_clean='' then raise exception 'Customer required';end if;
 insert into public.customers(name,name_key,phone) values(v_clean,public.normalize_customer_name(v_clean),coalesce(p_customer_phone,'')) on conflict(name_key) do update set name=excluded.name,phone=case when excluded.phone<>'' then excluded.phone else customers.phone end,updated_at=now() returning customers.id into v_customer_id;
 perform pg_advisory_xact_lock(hashtext('mainstreet-invoice-'||p_invoice_date::text));select 'INV-'||to_char(p_invoice_date,'YYYYMMDD')||'-'||lpad((count(*)+1)::text,3,'0') into v_invoice_no from public.invoices where invoice_date=p_invoice_date;
 insert into public.invoices(invoice_no,client_reference,invoice_date,customer_id) values(v_invoice_no,p_client_reference,p_invoice_date,v_customer_id) returning id into v_invoice_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
   v_amount:=round(coalesce((v_item->>'amount')::numeric,0),2);if v_amount<0 then raise exception 'Invalid item amount';end if;
   insert into public.invoice_items(invoice_id,menu_item_id,item_name,category,full_rate,half_qty,full_qty,amount) values(v_invoice_id,nullif(v_item->>'menu_item_id',''),coalesce(nullif(trim(v_item->>'item_name'),''),'Item'),coalesce(nullif(trim(v_item->>'category'),''),'Custom'),round(coalesce((v_item->>'full_rate')::numeric,0),2),coalesce((v_item->>'half_qty')::integer,0),coalesce((v_item->>'full_qty')::integer,0),v_amount);v_total:=v_total+v_amount;
 end loop;if v_total<=0 then raise exception 'Invoice total must be greater than zero';end if;update public.invoices set total_amount=round(v_total,2) where id=v_invoice_id;return jsonb_build_object('reference',v_invoice_no,'total',round(v_total,2),'customer_balance',public.customer_balance_value(v_customer_id));
end$$;
grant execute on function public.create_invoice_transaction(uuid,uuid,date,text,text,jsonb) to anon,authenticated;

drop function if exists public.create_payment_transaction(uuid,uuid,date,text,numeric,text);
create or replace function public.create_payment_transaction(p_token uuid,p_client_reference uuid,p_payment_date date,p_customer_name text,p_customer_phone text,p_amount numeric,p_note text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_customer_id uuid;v_no text;v_existing public.payments%rowtype;v_clean text;
begin perform public.assert_staff_session(p_token);if coalesce(p_amount,0)<=0 then raise exception 'Payment amount required';end if;select * into v_existing from public.payments where client_reference=p_client_reference;if found then return jsonb_build_object('reference',v_existing.payment_no,'amount',v_existing.amount);end if;
 v_clean:=regexp_replace(trim(coalesce(p_customer_name,'')),'\s+',' ','g');insert into public.customers(name,name_key,phone) values(v_clean,public.normalize_customer_name(v_clean),coalesce(p_customer_phone,'')) on conflict(name_key) do update set name=excluded.name,phone=case when excluded.phone<>'' then excluded.phone else customers.phone end,updated_at=now() returning customers.id into v_customer_id;
 perform pg_advisory_xact_lock(hashtext('mainstreet-payment-'||p_payment_date::text));select 'PAY-'||to_char(p_payment_date,'YYYYMMDD')||'-'||lpad((count(*)+1)::text,3,'0') into v_no from public.payments where payment_date=p_payment_date;insert into public.payments(payment_no,client_reference,payment_date,customer_id,amount,note) values(v_no,p_client_reference,p_payment_date,v_customer_id,round(p_amount,2),left(coalesce(p_note,''),120));return jsonb_build_object('reference',v_no,'amount',round(p_amount,2),'customer_balance',public.customer_balance_value(v_customer_id));end$$;
grant execute on function public.create_payment_transaction(uuid,uuid,date,text,text,numeric,text) to anon,authenticated;

create or replace function public.create_expense(p_token uuid,p_expense_date date,p_category text,p_description text,p_amount numeric)
returns uuid language plpgsql security definer set search_path=public as $$declare v uuid;begin perform public.assert_staff_session(p_token);insert into public.expenses(expense_date,category,description,amount) values(p_expense_date,p_category,trim(p_description),round(p_amount,2)) returning id into v;return v;end$$;
grant execute on function public.create_expense(uuid,date,text,text,numeric) to anon,authenticated;

create or replace function public.get_expenses(p_token uuid,p_from date,p_to date)
returns table(id uuid,expense_date date,category text,description text,amount numeric,created_at timestamptz) language plpgsql security definer set search_path=public as $$begin perform public.assert_staff_session(p_token);return query select e.id,e.expense_date,e.category,e.description,e.amount,e.created_at from public.expenses e where e.expense_date between p_from and p_to order by e.expense_date desc,e.created_at desc;end$$;
grant execute on function public.get_expenses(uuid,date,date) to anon,authenticated;

create or replace function public.get_business_report(p_token uuid,p_from date,p_to date)
returns jsonb language plpgsql security definer set search_path=public as $$declare tx jsonb;ex jsonb;begin perform public.assert_staff_session(p_token);select coalesce(jsonb_agg(t order by t.transaction_date desc,t.created_at desc),'[]'::jsonb) into tx from (select 'invoice'::text transaction_type,i.id,i.invoice_no reference,i.invoice_date transaction_date,c.name customer_name,c.phone,i.total_amount amount,''::text note,i.created_at from public.invoices i join public.customers c on c.id=i.customer_id where i.invoice_date between p_from and p_to union all select 'payment',p.id,p.payment_no,p.payment_date,c.name,c.phone,p.amount,p.note,p.created_at from public.payments p join public.customers c on c.id=p.customer_id where p.payment_date between p_from and p_to)t;select coalesce(jsonb_agg(e order by e.expense_date desc,e.created_at desc),'[]'::jsonb) into ex from public.expenses e where e.expense_date between p_from and p_to;return jsonb_build_object('transactions',tx,'expenses',ex);end$$;
grant execute on function public.get_business_report(uuid,date,date) to anon,authenticated;

create or replace function public.get_customer_ledger(p_token uuid,p_customer_name text,p_from date,p_to date)
returns table(transaction_type text,reference text,transaction_date date,amount numeric,created_at timestamptz) language plpgsql security definer set search_path=public as $$begin perform public.assert_staff_session(p_token);return query select x.transaction_type,x.reference,x.transaction_date,x.amount,x.created_at from (select 'invoice'::text transaction_type,i.invoice_no reference,i.invoice_date transaction_date,i.total_amount amount,i.created_at from public.invoices i join public.customers c on c.id=i.customer_id where c.name_key=public.normalize_customer_name(p_customer_name) and i.invoice_date between p_from and p_to union all select 'payment',p.payment_no,p.payment_date,p.amount,p.created_at from public.payments p join public.customers c on c.id=p.customer_id where c.name_key=public.normalize_customer_name(p_customer_name) and p.payment_date between p_from and p_to)x order by x.transaction_date,x.created_at;end$$;
grant execute on function public.get_customer_ledger(uuid,text,date,date) to anon,authenticated;

create or replace function public.edit_today_transaction(p_token uuid,p_type text,p_id uuid,p_date date,p_customer_name text,p_amount numeric,p_note text default '')
returns boolean language plpgsql security definer set search_path=public as $$declare cid uuid;begin perform public.assert_staff_session(p_token);if p_date<>current_date then raise exception 'Only today transactions can be edited';end if;insert into public.customers(name,name_key) values(trim(p_customer_name),public.normalize_customer_name(p_customer_name)) on conflict(name_key) do update set name=excluded.name,updated_at=now() returning customers.id into cid;if p_type='payment' then update public.payments set payment_date=p_date,customer_id=cid,amount=round(p_amount,2),note=left(coalesce(p_note,''),120) where id=p_id and payment_date=current_date;elsif p_type='invoice' then update public.invoices set invoice_date=p_date,customer_id=cid,total_amount=round(p_amount,2) where id=p_id and invoice_date=current_date;else raise exception 'Invalid transaction type';end if;return found;end$$;
grant execute on function public.edit_today_transaction(uuid,text,uuid,date,text,numeric,text) to anon,authenticated;

create or replace function public.delete_today_transaction(p_token uuid,p_type text,p_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$begin perform public.assert_staff_session(p_token);if p_type='payment' then delete from public.payments where id=p_id and payment_date=current_date;elsif p_type='invoice' then delete from public.invoices where id=p_id and invoice_date=current_date;else raise exception 'Invalid transaction type';end if;return found;end$$;
grant execute on function public.delete_today_transaction(uuid,text,uuid) to anon,authenticated;

update public.menu_items set half_rate=v.half_rate from (values
('menu-001',70::numeric),('menu-002',100),('menu-003',90),('menu-004',70),('menu-005',70),('menu-006',80),('menu-007',90),('menu-008',70),('menu-009',90),('menu-010',60),('menu-011',80),('menu-012',80),('menu-013',90),('menu-014',70)
) v(id,half_rate) where menu_items.id=v.id;
update public.menu_items set half_rate=null where id not in ('menu-001','menu-002','menu-003','menu-004','menu-005','menu-006','menu-007','menu-008','menu-009','menu-010','menu-011','menu-012','menu-013','menu-014') and id not like 'menu-custom-%';

create or replace function public.search_customers(p_token uuid,p_query text default '')
returns table(id uuid,name text,phone text,balance numeric)
language plpgsql security definer set search_path=public as $$
begin perform public.assert_staff_session(p_token);return query select c.id,c.name,c.phone,public.customer_balance_value(c.id) from public.customers c where coalesce(trim(p_query),'')='' or c.name_key like '%'||public.normalize_customer_name(p_query)||'%' order by case when c.name_key like public.normalize_customer_name(p_query)||'%' then 0 else 1 end,c.name limit 8;end$$;
grant execute on function public.search_customers(uuid,text) to anon,authenticated;
notify pgrst,'reload schema';
