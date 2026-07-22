-- Mainstreet staff roles, permissions and permanent expense editing
-- Run after 09-opening-balance-brought-forward.sql. Safe to rerun.

begin;

create table if not exists public.staff_users (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  role text not null check (role in ('admin','operator')),
  pin_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_users enable row level security;
revoke all on public.staff_users from anon, authenticated;

alter table public.staff_sessions add column if not exists staff_user_id uuid references public.staff_users(id) on delete cascade;

-- Preserve the existing business PIN as the administrator PIN.
insert into public.staff_users(name,role,pin_hash)
select 'Administrator','admin',a.pin_hash
from public.app_settings a where a.id=1
and not exists(select 1 from public.staff_users u where u.role='admin');

-- Initial operator PIN: 2468. Change it after first login through SQL or a later user-management screen.
insert into public.staff_users(name,role,pin_hash)
select 'Counter Staff','operator',extensions.crypt('2468',extensions.gen_salt('bf'))
where not exists(select 1 from public.staff_users u where u.role='operator');

delete from public.staff_sessions where staff_user_id is null;

-- Return user identity with every successful login.
drop function if exists public.staff_login(text);
create function public.staff_login(p_pin text)
returns table(token uuid,expires_at timestamptz,user_name text,user_role text)
language plpgsql security definer set search_path=public,extensions as $$
declare v_user public.staff_users%rowtype;
begin
  select * into v_user from public.staff_users u
  where u.is_active and u.pin_hash=extensions.crypt(p_pin,u.pin_hash)
  order by case when u.role='admin' then 0 else 1 end limit 1;
  if v_user.id is null then raise exception 'Invalid PIN' using errcode='28000'; end if;
  delete from public.staff_sessions s where s.expires_at<=now();
  return query
  insert into public.staff_sessions(staff_user_id) values(v_user.id)
  returning staff_sessions.token,staff_sessions.expires_at,v_user.name,v_user.role;
end;
$$;
grant execute on function public.staff_login(text) to anon,authenticated;

create or replace function public.get_current_staff(p_token uuid)
returns table(user_id uuid,user_name text,user_role text)
language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_staff_session(p_token);
  return query select u.id,u.name,u.role
  from public.staff_sessions s join public.staff_users u on u.id=s.staff_user_id
  where s.token=p_token and s.expires_at>now() and u.is_active;
end;
$$;
grant execute on function public.get_current_staff(uuid) to anon,authenticated;

create or replace function public.assert_admin_session(p_token uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_staff_session(p_token);
  if not exists(
    select 1 from public.staff_sessions s join public.staff_users u on u.id=s.staff_user_id
    where s.token=p_token and s.expires_at>now() and u.is_active and u.role='admin'
  ) then raise exception 'Administrator permission required' using errcode='42501'; end if;
end;
$$;
revoke all on function public.assert_admin_session(uuid) from public,anon,authenticated;

create or replace function public.update_expense(
  p_token uuid,p_id uuid,p_expense_date date,p_category text,p_description text,p_amount numeric
)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_admin_session(p_token);
  if p_expense_date is null then raise exception 'Expense date required'; end if;
  if trim(coalesce(p_category,''))='' then raise exception 'Expense category required'; end if;
  if trim(coalesce(p_description,''))='' then raise exception 'Expense description required'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'Expense amount must be greater than zero'; end if;
  update public.expenses set expense_date=p_expense_date,category=trim(p_category),description=trim(p_description),amount=round(p_amount,2),updated_at=now() where id=p_id;
  return found;
end;
$$;
grant execute on function public.update_expense(uuid,uuid,date,text,text,numeric) to anon,authenticated;

create or replace function public.delete_expense(p_token uuid,p_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_admin_session(p_token);
  delete from public.expenses where id=p_id;
  return found;
end;
$$;
grant execute on function public.delete_expense(uuid,uuid) to anon,authenticated;

-- Protect opening-balance changes from operator sessions.
create or replace function public.delete_customer_opening_balance(p_token uuid,p_customer_name text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_admin_session(p_token);
  delete from public.customer_opening_balances o using public.customers c
  where o.customer_id=c.id and c.name_key=public.normalize_customer_name(p_customer_name);
  return found;
end;
$$;
grant execute on function public.delete_customer_opening_balance(uuid,text) to anon,authenticated;

commit;
notify pgrst,'reload schema';