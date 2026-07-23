-- Mainstreet secure menu item management
-- Run after 10-user-roles-expense-edit.sql. Safe to rerun.

begin;

drop function if exists public.add_menu_item(uuid,text,text,numeric,numeric);

create function public.add_menu_item(
  p_token uuid,
  p_category text,
  p_item_name text,
  p_half_rate numeric,
  p_full_rate numeric
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_id text;
  v_category text;
  v_name text;
  v_half numeric(12,2);
  v_full numeric(12,2);
  v_result jsonb;
begin
  perform public.assert_admin_session(p_token);

  v_category:=trim(regexp_replace(coalesce(p_category,''),'\s+',' ','g'));
  v_name:=trim(regexp_replace(coalesce(p_item_name,''),'\s+',' ','g'));
  v_half:=case when coalesce(p_half_rate,0)>0 then round(p_half_rate,2) else null end;
  v_full:=round(coalesce(p_full_rate,0),2);

  if v_category='' then raise exception 'Category is required'; end if;
  if v_name='' then raise exception 'Item name is required'; end if;
  if length(v_name)>80 then raise exception 'Item name cannot exceed 80 characters'; end if;
  if v_full<=0 then raise exception 'Full price must be greater than zero'; end if;
  if v_half is not null and v_half>=v_full then
    raise exception 'Half price must be lower than full price';
  end if;

  select m.category into v_category
  from public.menu_items m
  where m.is_active
    and lower(trim(m.category))=lower(v_category)
  order by m.category
  limit 1;

  if v_category is null then
    raise exception 'Select an existing active category';
  end if;

  if exists(
    select 1 from public.menu_items m
    where m.is_active
      and lower(trim(m.category))=lower(v_category)
      and lower(trim(regexp_replace(m.name,'\s+',' ','g')))=lower(v_name)
      and round(m.full_rate,2)=v_full
  ) then
    raise exception 'This item already exists in the selected category at the same price';
  end if;

  v_id:='menu-custom-'||replace(extensions.gen_random_uuid()::text,'-','');

  insert into public.menu_items(id,category,name,half_rate,full_rate,is_active)
  values(v_id,v_category,v_name,v_half,v_full,true)
  returning jsonb_build_object(
    'id',id,
    'category',category,
    'name',name,
    'half_rate',half_rate,
    'full_rate',full_rate,
    'is_active',is_active
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.add_menu_item(uuid,text,text,numeric,numeric)
to anon,authenticated;

commit;
notify pgrst,'reload schema';
