-- Run after 02-seed-menu.sql

create or replace function public.normalize_customer_name(p_name text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.assert_staff_session(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.staff_sessions where expires_at <= now();
  if p_token is null or not exists (
    select 1 from public.staff_sessions s
    where s.token = p_token and s.expires_at > now()
  ) then
    raise exception 'Invalid or expired staff session' using errcode = '28000';
  end if;
end;
$$;

revoke all on function public.assert_staff_session(uuid) from public, anon, authenticated;

create or replace function public.staff_login(p_pin text)
returns table(token uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pin is null or not exists (
    select 1 from public.app_settings a
    where a.id = 1 and a.pin_hash = crypt(p_pin, a.pin_hash)
  ) then
    raise exception 'Invalid PIN' using errcode = '28000';
  end if;

  delete from public.staff_sessions where expires_at <= now();
  return query
    insert into public.staff_sessions default values
    returning staff_sessions.token, staff_sessions.expires_at;
end;
$$;

grant execute on function public.staff_login(text) to anon, authenticated;

create or replace function public.change_staff_pin(
  p_token uuid,
  p_current_pin text,
  p_new_pin text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_staff_session(p_token);
  if p_new_pin !~ '^[0-9]{4,8}$' then
    raise exception 'New PIN must contain 4 to 8 digits';
  end if;
  if not exists (
    select 1 from public.app_settings a
    where a.id = 1 and a.pin_hash = crypt(p_current_pin, a.pin_hash)
  ) then
    raise exception 'Current PIN is incorrect' using errcode = '28000';
  end if;

  update public.app_settings
  set pin_hash = crypt(p_new_pin, gen_salt('bf')), updated_at = now()
  where id = 1;

  delete from public.staff_sessions where token <> p_token;
  return true;
end;
$$;

grant execute on function public.change_staff_pin(uuid, text, text) to anon, authenticated;

create or replace function public.customer_balance_value(p_customer_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select round(
    coalesce((select sum(i.total_amount) from public.invoices i where i.customer_id = p_customer_id), 0)
    - coalesce((select sum(p.amount) from public.payments p where p.customer_id = p_customer_id), 0),
    2
  );
$$;

revoke all on function public.customer_balance_value(uuid) from public, anon, authenticated;

create or replace function public.search_customers(p_token uuid, p_query text default '')
returns table(id uuid, name text, balance numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_staff_session(p_token);
  return query
  select c.id, c.name, public.customer_balance_value(c.id) as balance
  from public.customers c
  where coalesce(trim(p_query), '') = ''
     or c.name_key like '%' || public.normalize_customer_name(p_query) || '%'
  order by
    case when c.name_key like public.normalize_customer_name(p_query) || '%' then 0 else 1 end,
    c.name
  limit 8;
end;
$$;

grant execute on function public.search_customers(uuid, text) to anon, authenticated;

create or replace function public.get_customer_balance(p_token uuid, p_customer_name text)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
begin
  perform public.assert_staff_session(p_token);
  select c.id into v_customer_id
  from public.customers c
  where c.name_key = public.normalize_customer_name(p_customer_name)
  limit 1;
  if v_customer_id is null then return 0; end if;
  return public.customer_balance_value(v_customer_id);
end;
$$;

grant execute on function public.get_customer_balance(uuid, text) to anon, authenticated;
