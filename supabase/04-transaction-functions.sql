-- Run after 03-auth-functions.sql

create or replace function public.create_invoice_transaction(
  p_token uuid,
  p_client_reference uuid,
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
  v_invoice_id uuid;
  v_invoice_no text;
  v_item jsonb;
  v_amount numeric(12,2);
  v_total numeric(12,2) := 0;
  v_existing public.invoices%rowtype;
  v_clean_name text;
begin
  perform public.assert_staff_session(p_token);
  if p_client_reference is null or p_invoice_date is null then
    raise exception 'Invoice reference and date are required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one invoice item is required';
  end if;

  select * into v_existing from public.invoices where client_reference = p_client_reference;
  if found then
    return jsonb_build_object(
      'reference', v_existing.invoice_no,
      'total', v_existing.total_amount,
      'customer_balance', public.customer_balance_value(v_existing.customer_id)
    );
  end if;

  v_clean_name := regexp_replace(trim(coalesce(p_customer_name, '')), '\s+', ' ', 'g');
  if v_clean_name = '' then raise exception 'Customer name is required'; end if;

  insert into public.customers (name, name_key)
  values (v_clean_name, public.normalize_customer_name(v_clean_name))
  on conflict (name_key) do update set name = excluded.name, updated_at = now()
  returning customers.id into v_customer_id;

  perform pg_advisory_xact_lock(hashtext('mainstreet-invoice-' || p_invoice_date::text));
  select 'INV-' || to_char(p_invoice_date, 'YYYYMMDD') || '-' ||
         lpad((count(*) + 1)::text, 3, '0')
  into v_invoice_no
  from public.invoices
  where invoice_date = p_invoice_date;

  insert into public.invoices (invoice_no, client_reference, invoice_date, customer_id)
  values (v_invoice_no, p_client_reference, p_invoice_date, v_customer_id)
  returning id into v_invoice_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_amount := round(coalesce((v_item->>'amount')::numeric, 0), 2);
    if v_amount < 0 then raise exception 'Item amount cannot be negative'; end if;
    if coalesce((v_item->>'half_qty')::integer, 0) <= 0
       and coalesce((v_item->>'full_qty')::integer, 0) <= 0 then
      raise exception 'Every item needs a Half or Full quantity';
    end if;

    insert into public.invoice_items (
      invoice_id, menu_item_id, item_name, category, full_rate,
      half_qty, full_qty, amount
    ) values (
      v_invoice_id,
      nullif(v_item->>'menu_item_id', ''),
      coalesce(nullif(trim(v_item->>'item_name'), ''), 'Item'),
      coalesce(nullif(trim(v_item->>'category'), ''), 'Custom'),
      round(coalesce((v_item->>'full_rate')::numeric, 0), 2),
      coalesce((v_item->>'half_qty')::integer, 0),
      coalesce((v_item->>'full_qty')::integer, 0),
      v_amount
    );
    v_total := v_total + v_amount;
  end loop;

  if v_total <= 0 then raise exception 'Invoice total must be greater than zero'; end if;
  update public.invoices set total_amount = round(v_total, 2) where id = v_invoice_id;

  return jsonb_build_object(
    'reference', v_invoice_no,
    'total', round(v_total, 2),
    'customer_balance', public.customer_balance_value(v_customer_id)
  );
end;
$$;

grant execute on function public.create_invoice_transaction(uuid, uuid, date, text, jsonb) to anon, authenticated;

create or replace function public.create_payment_transaction(
  p_token uuid,
  p_client_reference uuid,
  p_payment_date date,
  p_customer_name text,
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
  v_payment_id uuid;
  v_payment_no text;
  v_existing public.payments%rowtype;
  v_clean_name text;
begin
  perform public.assert_staff_session(p_token);
  if p_client_reference is null or p_payment_date is null then
    raise exception 'Payment reference and date are required';
  end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Payment amount must be greater than zero'; end if;

  select * into v_existing from public.payments where client_reference = p_client_reference;
  if found then
    return jsonb_build_object(
      'reference', v_existing.payment_no,
      'amount', v_existing.amount,
      'customer_balance', public.customer_balance_value(v_existing.customer_id)
    );
  end if;

  v_clean_name := regexp_replace(trim(coalesce(p_customer_name, '')), '\s+', ' ', 'g');
  if v_clean_name = '' then raise exception 'Customer name is required'; end if;

  insert into public.customers (name, name_key)
  values (v_clean_name, public.normalize_customer_name(v_clean_name))
  on conflict (name_key) do update set name = excluded.name, updated_at = now()
  returning customers.id into v_customer_id;

  perform pg_advisory_xact_lock(hashtext('mainstreet-payment-' || p_payment_date::text));
  select 'PAY-' || to_char(p_payment_date, 'YYYYMMDD') || '-' ||
         lpad((count(*) + 1)::text, 3, '0')
  into v_payment_no
  from public.payments
  where payment_date = p_payment_date;

  insert into public.payments (payment_no, client_reference, payment_date, customer_id, amount, note)
  values (v_payment_no, p_client_reference, p_payment_date, v_customer_id, round(p_amount, 2), left(coalesce(p_note, ''), 120))
  returning id into v_payment_id;

  return jsonb_build_object(
    'reference', v_payment_no,
    'amount', round(p_amount, 2),
    'customer_balance', public.customer_balance_value(v_customer_id)
  );
end;
$$;

grant execute on function public.create_payment_transaction(uuid, uuid, date, text, numeric, text) to anon, authenticated;

create or replace function public.get_transaction_report(
  p_token uuid,
  p_from date,
  p_to date
)
returns table(
  transaction_type text,
  reference text,
  transaction_date date,
  customer_name text,
  amount numeric,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_staff_session(p_token);
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'A valid report date range is required';
  end if;
  return query
  select x.transaction_type, x.reference, x.transaction_date, x.customer_name, x.amount, x.created_at
  from (
    select 'invoice'::text as transaction_type, i.invoice_no as reference,
           i.invoice_date as transaction_date, c.name as customer_name,
           i.total_amount as amount, i.created_at
    from public.invoices i
    join public.customers c on c.id = i.customer_id
    where i.invoice_date between p_from and p_to
    union all
    select 'payment'::text, p.payment_no, p.payment_date, c.name,
           p.amount, p.created_at
    from public.payments p
    join public.customers c on c.id = p.customer_id
    where p.payment_date between p_from and p_to
  ) x
  order by x.transaction_date desc, x.created_at desc;
end;
$$;

grant execute on function public.get_transaction_report(uuid, date, date) to anon, authenticated;

-- Keep direct business data private. The app accesses it only through the secured RPC functions above.
