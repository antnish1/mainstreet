import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const headers={apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${SUPABASE_ANON_KEY}`,'Content-Type':'application/json'};
const sessionKey='mainstreet.staff-session.v3';
const queueKey='mainstreet.counter-sales.queue.v1';
const getSession=()=>JSON.parse(localStorage.getItem(sessionKey)||'null');
const token=()=>getSession()?.token||null;
const money=n=>`₹${Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const today=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)};
const clean=v=>String(v||'').trim().replace(/\s+/g,' ');
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;

async function request(path,options={}){const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{...headers,...(options.headers||{})}});const text=await r.text();let data;try{data=text?JSON.parse(text):null}catch{data=text}if(!r.ok)throw Error(data?.message||data?.hint||`Request failed (${r.status})`);return data}
const rpc=(name,body)=>request(`rpc/${name}`,{method:'POST',body:JSON.stringify(body)});
function notify(message){const host=$('#toastRegion');if(!host)return;const row=document.createElement('div');row.className='toast';row.textContent=message;host.append(row);setTimeout(()=>row.remove(),3200)}

const state={menu:[],filtered:[],category:'All',cart:new Map(),paymentMode:'cash',quick:false,syncing:false};

function inject(){const tabs=$('.top-tabs'),main=$('#mainContent');if(!tabs||!main||$('#counterTab'))return;
  const tab=document.createElement('button');tab.id='counterTab';tab.className='tab';tab.type='button';tab.innerHTML='⚡<span>Counter</span>';tabs.prepend(tab);
  const view=document.createElement('section');view.id='counterView';view.className='counter-view view';view.hidden=true;view.innerHTML=`
    <section class="card counter-head"><div><p class="eyebrow">Fast walk-in billing</p><h2>Counter sale</h2></div><span id="counterSync" class="counter-sync">Synced</span></section>
    <section class="card counter-summary"><article><span>Today sales</span><b id="counterTodayTotal">₹0.00</b></article><article><span>Cash</span><b id="counterTodayCash">₹0.00</b></article><article><span>UPI</span><b id="counterTodayUpi">₹0.00</b></article></section>
    <section class="card counter-search-card"><div class="section-head"><div><p class="eyebrow">Quick items</p><h2>Tap to add</h2></div><button id="counterRefresh" class="icon-btn" type="button">↻</button></div><div class="counter-search"><input id="counterSearch" type="search" autocomplete="off" placeholder="Search menu item"><button id="counterClearSearch" class="btn secondary" type="button">Clear</button></div><div id="counterCategories" class="counter-category-strip"></div><div id="counterItems" class="counter-item-grid"></div></section>
    <section class="card counter-cart"><div class="section-head"><div><p class="eyebrow">Current sale</p><h2>Selected items</h2></div><button id="counterClearCart" class="text-btn danger" type="button">Clear</button></div><div id="counterCartList" class="counter-cart-list"></div><div class="counter-total"><span>Total</span><b id="counterTotal">₹0.00</b></div></section>
    <section class="card counter-payment"><div class="section-head"><div><p class="eyebrow">Immediate payment</p><h2>Payment mode</h2></div></div><div class="counter-payment-modes"><button data-mode="cash" class="active" type="button">Cash</button><button data-mode="upi" type="button">UPI</button><button data-mode="split" type="button">Split</button></div><div id="counterSplit" class="counter-split" hidden><label>Cash amount<input id="counterCashAmount" type="number" min="0" step="0.01" inputmode="decimal"></label><label>UPI amount<input id="counterUpiAmount" type="number" min="0" step="0.01" inputmode="decimal"></label></div><div class="counter-actions"><button id="counterQuickToggle" class="btn secondary" type="button">Quick amount sale</button><button id="counterSave" class="btn primary" type="button">Save & new sale</button></div></section>
    <section id="counterQuickPanel" class="card counter-quick" hidden><div><p class="eyebrow">Rush mode</p><h2>Quick amount sale</h2></div><input id="counterQuickAmount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="Enter complete bill amount"><input id="counterQuickNote" maxlength="160" placeholder="Optional note"><p class="muted">Use only when item entry is not practical. The sale is still included in Cash/UPI totals.</p></section>
    <section class="card counter-recent"><div class="section-head"><div><p class="eyebrow">Today</p><h2>Recent counter sales</h2></div></div><div id="counterRecent" class="counter-recent-list"></div></section>`;
  main.prepend(view);bind(tab);loadMenu();refreshSummary();updateSync();processQueue();
}

function bind(tab){tab.addEventListener('click',activateCounter);$$('.top-tabs .tab:not(#counterTab)').forEach(b=>b.addEventListener('click',deactivateCounter));
  $('#counterSearch').addEventListener('input',renderItems);$('#counterClearSearch').onclick=()=>{$('#counterSearch').value='';state.category='All';renderCategories();renderItems()};
  $('#counterRefresh').onclick=()=>{loadMenu();refreshSummary();processQueue()};$('#counterClearCart').onclick=clearCart;
  $$('.counter-payment-modes button').forEach(b=>b.onclick=()=>setPaymentMode(b.dataset.mode));
  $('#counterQuickToggle').onclick=()=>{state.quick=!state.quick;$('#counterQuickPanel').hidden=!state.quick;$('#counterQuickToggle').textContent=state.quick?'Use item sale':'Quick amount sale';renderCart()};
  $('#counterSave').onclick=saveSale;$('#counterCashAmount').addEventListener('input',syncSplit);$('#counterUpiAmount').addEventListener('input',syncSplit);
  window.addEventListener('online',()=>processQueue());document.addEventListener('mainstreet-role-ready',()=>updateSync());
}
function activateCounter(){const view=$('#counterView');if(!view)return;$$('.top-tabs .tab').forEach(x=>x.classList.toggle('active',x.id==='counterTab'));['#invoiceView','#paymentView','#reportView'].forEach(s=>{const el=$(s);if(el)el.hidden=true});$('#transactionHeader').hidden=true;$('#actionBar').hidden=true;view.hidden=false;refreshSummary();processQueue()}
function deactivateCounter(){const view=$('#counterView');if(view)view.hidden=true}

async function loadMenu(){try{const rows=await request('menu_items?select=id,category,name,half_rate,full_rate&is_active=eq.true&order=category.asc,name.asc');state.menu=(rows||[]).map(r=>({id:r.id,category:r.category,name:r.name,halfRate:r.half_rate==null?null:Number(r.half_rate),fullRate:Number(r.full_rate)}));renderCategories();renderItems()}catch(e){notify(e.message)}}
function renderCategories(){const host=$('#counterCategories');if(!host)return;const cats=['All',...new Set(state.menu.map(x=>x.category))];host.innerHTML=cats.map(c=>`<button type="button" class="${state.category===c?'active':''}" data-category="${safe(c)}">${safe(c)}</button>`).join('');host.querySelectorAll('button').forEach(b=>b.onclick=()=>{state.category=b.dataset.category;renderCategories();renderItems()})}
function renderItems(){const host=$('#counterItems');if(!host)return;const q=clean($('#counterSearch')?.value).toLowerCase();state.filtered=state.menu.filter(x=>(state.category==='All'||x.category===state.category)&&(!q||(x.name+' '+x.category).toLowerCase().includes(q))).slice(0,80);host.innerHTML=state.filtered.length?state.filtered.map(x=>`<article class="counter-item"><div><b>${safe(x.name)}</b><small>${safe(x.category)} · ${x.halfRate!=null?`H ${money(x.halfRate)} · `:''}F ${money(x.fullRate)}</small></div><div class="counter-item-actions">${x.halfRate!=null?`<button type="button" data-id="${safe(x.id)}" data-part="half">+ Half</button>`:''}<button type="button" class="${x.halfRate==null?'full-only':''}" data-id="${safe(x.id)}" data-part="full">+ Full</button></div></article>`).join(''):'<div class="counter-empty">No menu items found</div>';host.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>addItem(b.dataset.id,b.dataset.part))}
function addItem(id,part){const item=state.menu.find(x=>x.id===id);if(!item)return;const row=state.cart.get(id)||{...item,halfQty:0,fullQty:0};row[part+'Qty']++;state.cart.set(id,row);renderCart()}
function reduceItem(id){const row=state.cart.get(id);if(!row)return;if(row.fullQty>0)row.fullQty--;else if(row.halfQty>0)row.halfQty--;if(!row.fullQty&&!row.halfQty)state.cart.delete(id);else state.cart.set(id,row);renderCart()}
function removeItem(id){state.cart.delete(id);renderCart()}
function itemAmount(x){return Number((((x.halfRate||0)*x.halfQty)+(x.fullRate*x.fullQty)).toFixed(2))}
function cartTotal(){return [...state.cart.values()].reduce((s,x)=>s+itemAmount(x),0)}
function saleTotal(){return state.quick?Number($('#counterQuickAmount')?.value||0):cartTotal()}
function renderCart(){const host=$('#counterCartList');if(!host)return;if(state.quick){host.innerHTML='<div class="counter-empty">Quick amount mode does not require item selection.</div>'}else host.innerHTML=state.cart.size?[...state.cart.values()].map(x=>`<div class="counter-cart-row"><div><b>${safe(x.name)}</b><small>${x.halfQty?`H × ${x.halfQty}`:''}${x.halfQty&&x.fullQty?' · ':''}${x.fullQty?`F × ${x.fullQty}`:''}</small></div><div class="counter-cart-controls"><button type="button" data-action="minus" data-id="${safe(x.id)}">−</button><button type="button" data-action="remove" data-id="${safe(x.id)}">×</button><strong>${money(itemAmount(x))}</strong></div></div>`).join(''):'<div class="counter-empty">Tap menu items to start a counter sale.</div>';host.querySelectorAll('[data-action="minus"]').forEach(b=>b.onclick=()=>reduceItem(b.dataset.id));host.querySelectorAll('[data-action="remove"]').forEach(b=>b.onclick=()=>removeItem(b.dataset.id));updateTotal()}
function updateTotal(){const total=saleTotal();$('#counterTotal').textContent=money(total);if(state.paymentMode==='cash'){$('#counterCashAmount').value=total||'';$('#counterUpiAmount').value=''}else if(state.paymentMode==='upi'){$('#counterUpiAmount').value=total||'';$('#counterCashAmount').value=''}else syncSplit()}
function clearCart(){state.cart.clear();$('#counterQuickAmount').value='';$('#counterQuickNote').value='';renderCart()}
function setPaymentMode(mode){state.paymentMode=mode;$$('.counter-payment-modes button').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));$('#counterSplit').hidden=mode!=='split';updateTotal()}
function syncSplit(){if(state.paymentMode!=='split')return;const total=saleTotal(),cash=Number($('#counterCashAmount').value||0);if(document.activeElement===$('#counterCashAmount'))$('#counterUpiAmount').value=Math.max(0,total-cash).toFixed(2);else if(document.activeElement===$('#counterUpiAmount'))$('#counterCashAmount').value=Math.max(0,total-Number($('#counterUpiAmount').value||0)).toFixed(2)}

function queue(){return JSON.parse(localStorage.getItem(queueKey)||'[]')}
function setQueue(rows){localStorage.setItem(queueKey,JSON.stringify(rows));updateSync()}
function buildPayload(){const total=saleTotal();if(total<=0)throw Error(state.quick?'Enter sale amount':'Add at least one item');let cash=0,upi=0;if(state.paymentMode==='cash')cash=total;else if(state.paymentMode==='upi')upi=total;else{cash=Number($('#counterCashAmount').value||0);upi=Number($('#counterUpiAmount').value||0);if(Number((cash+upi).toFixed(2))!==Number(total.toFixed(2)))throw Error('Cash and UPI amounts must equal sale total')}
  return {p_token:null,p_client_reference:uuid(),p_sale_date:today(),p_payment_mode:state.paymentMode,p_entry_type:state.quick?'quick_amount':'item_sale',p_gross_amount:total,p_cash_amount:cash,p_upi_amount:upi,p_items:state.quick?[]:[...state.cart.values()].map(x=>({menu_item_id:x.id,item_name:x.name,category:x.category,half_qty:x.halfQty,full_qty:x.fullQty,half_rate:x.halfRate,full_rate:x.fullRate,amount:itemAmount(x)})),p_note:state.quick?clean($('#counterQuickNote').value):''}
}
async function saveSale(){const btn=$('#counterSave');try{const payload=buildPayload();const rows=queue();rows.push({id:payload.p_client_reference,payload,createdAt:new Date().toISOString(),attempts:0});setQueue(rows);clearCart();state.quick=false;$('#counterQuickPanel').hidden=true;$('#counterQuickToggle').textContent='Quick amount sale';btn.textContent='Saved';notify('Counter sale saved. Ready for next customer.');setTimeout(()=>btn.textContent='Save & new sale',900);processQueue()}catch(e){notify(e.message)}}
async function processQueue(){if(state.syncing||!navigator.onLine||!token())return;state.syncing=true;updateSync();let rows=queue();for(const row of [...rows]){try{row.payload.p_token=token();await rpc('create_counter_sale',row.payload);rows=rows.filter(x=>x.id!==row.id);setQueue(rows)}catch(e){row.attempts=(row.attempts||0)+1;row.lastError=e.message;setQueue(rows);if(/session|permission|database upgrade|required/i.test(e.message))break}}state.syncing=false;updateSync();refreshSummary()}
function updateSync(){const el=$('#counterSync');if(!el)return;const count=queue().length;el.classList.toggle('pending',count>0||state.syncing);el.textContent=state.syncing?'Syncing…':count?`${count} pending`:'Synced'}
async function refreshSummary(){if(!token())return;try{const t=today();const [s,recent]=await Promise.all([rpc('get_counter_sales_summary',{p_token:token(),p_from:t,p_to:t}),rpc('get_recent_counter_sales',{p_token:token(),p_from:t,p_to:t})]);$('#counterTodayTotal').textContent=money(s?.total_sales);$('#counterTodayCash').textContent=money(s?.cash_sales);$('#counterTodayUpi').textContent=money(s?.upi_sales);renderRecent(recent||[])}catch(e){if(!/does not exist|PGRST|42883/i.test(e.message))notify(e.message)}}
function renderRecent(rows){const host=$('#counterRecent');if(!host)return;host.innerHTML=rows.length?rows.slice(0,20).map(x=>`<div class="counter-recent-row"><div><b>${safe(x.sale_no)}</b><small>${x.entry_type==='quick_amount'?'Quick amount':'Item sale'} · ${safe(x.payment_mode.toUpperCase())} · ${new Date(x.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</small></div><strong>${money(x.gross_amount)}</strong></div>`).join(''):'<div class="counter-empty">No counter sales recorded today</div>'}

const quickAmountObserver=new MutationObserver(()=>{});
function attachQuickListeners(){const amount=$('#counterQuickAmount');if(amount&&!amount.dataset.bound){amount.dataset.bound='1';amount.addEventListener('input',()=>{updateTotal();syncSplit()})}}
new MutationObserver(()=>attachQuickListeners()).observe(document.documentElement,{childList:true,subtree:true});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject);else inject();
