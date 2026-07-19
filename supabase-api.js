import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';
const H={apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${SUPABASE_ANON_KEY}`,'Content-Type':'application/json'};
export class ApiError extends Error{constructor(message,status=0,code=''){super(message);this.status=status;this.code=code}}
async function req(path,options={}){let r;try{r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{...H,...(options.headers||{})}})}catch{throw new ApiError('Network unavailable',0,'NETWORK')}const t=await r.text();let p=null;try{p=t?JSON.parse(t):null}catch{p=t}if(!r.ok)throw new ApiError(p?.message||p?.hint||`Request failed (${r.status})`,r.status,p?.code||'');return p}
const rpc=(name,body)=>req(`rpc/${name}`,{method:'POST',body:JSON.stringify(body)});
export const staffLogin=p_pin=>rpc('staff_login',{p_pin});
export const searchCustomers=(p_token,p_query)=>rpc('search_customers',{p_token,p_query});
export const getCustomerBalance=(p_token,p_customer_name)=>rpc('get_customer_balance',{p_token,p_customer_name});
export const getMenuItems=()=>req('menu_items?select=id,category,name,half_rate,full_rate&is_active=eq.true&order=category.asc,name.asc');
export const createInvoice=(p_token,p)=>rpc('create_invoice_transaction',{p_token,p_client_reference:p.clientReference,p_invoice_date:p.date,p_customer_name:p.customerName,p_customer_phone:p.customerPhone||'',p_items:p.items});
export const createPayment=(p_token,p)=>rpc('create_payment_transaction',{p_token,p_client_reference:p.clientReference,p_payment_date:p.date,p_customer_name:p.customerName,p_customer_phone:p.customerPhone||'',p_amount:p.amount,p_note:p.note||''});
export const getReport=(p_token,p_from,p_to)=>rpc('get_business_report',{p_token,p_from,p_to});
export const addMenuItem=(p_token,p)=>rpc('add_menu_item',{p_token,p_category:p.category,p_item_name:p.name,p_half_rate:p.halfRate||null,p_full_rate:p.fullRate});
export const getLedger=(p_token,p_customer_name,p_from,p_to)=>rpc('get_customer_ledger',{p_token,p_customer_name,p_from,p_to});
export const saveExpense=(p_token,p)=>rpc('create_expense',{p_token,p_expense_date:p.date,p_category:p.category,p_description:p.description,p_amount:p.amount});
export const getExpenses=(p_token,p_from,p_to)=>rpc('get_expenses',{p_token,p_from,p_to});
export const editTransaction=(p_token,p)=>rpc('edit_today_transaction',{p_token,p_type:p.type,p_id:p.id,p_date:p.date,p_customer_name:p.customerName,p_amount:p.amount,p_note:p.note||''});
export const deleteTransaction=(p_token,p_type,p_id)=>rpc('delete_today_transaction',{p_token,p_type,p_id});
export const changeStaffPin=(p_token,p_current_pin,p_new_pin)=>rpc('change_staff_pin',{p_token,p_current_pin,p_new_pin});
