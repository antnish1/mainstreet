const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];

const icons={
  counter:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16l-1-5H5l-1 5Zm1 0v9h14v-9M8 19v-5h4v5"/></svg>',
  invoice:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6M9 12h6"/></svg>',
  payment:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v11H4zM4 10h16M8 15h3"/></svg>',
  report:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9M12 19V5M19 19v-7"/></svg>',
  search:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>',
  grid:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>',
  close:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  back:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  refresh:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5M4 18v-5h5M18 9a7 7 0 0 0-12-2M6 15a7 7 0 0 0 12 2"/></svg>',
  logout:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"/></svg>'
};

function icon(name){return `<span class="workspace-icon">${icons[name]||''}</span>`}
function setButton(button,name,label){if(!button)return;button.innerHTML=`${icon(name)}<span>${label}</span>`;button.setAttribute('aria-label',label)}

function buildShell(){
  const shell=$('#appShell'),bar=$('.brand-bar'),tabs=$('.top-tabs'),main=$('#mainContent');
  if(!shell||!bar||!tabs||!main||$('#workspacePageTitle'))return;
  const title=document.createElement('div');title.id='workspacePageTitle';title.className='workspace-page-title';title.innerHTML='<b>Credit Sale</b><small>Customer billing</small>';
  bar.querySelector('.brand-lockup')?.after(title);
  tabs.classList.add('workspace-bottom-nav');shell.append(tabs);
  setButton($('#logoutButton'),'logout','Logout');
  const map=[['#counterTab','counter','Counter'],['.tab[data-view="invoice"]','invoice','Credit'],['.tab[data-view="payment"]','payment','Payment'],['.tab[data-view="report"]','report','Reports']];
  map.forEach(([selector,name,label])=>setButton($(selector),name,label));
  $('#cloudStatus span')&&($('#cloudStatus span').textContent='Online');
  simplifyCopy();
  updateTitle();
  tabs.addEventListener('click',()=>setTimeout(updateTitle,0));
  new MutationObserver(updateTitle).observe(tabs,{subtree:true,attributes:true,attributeFilter:['class']});
}

function simplifyCopy(){
  const text={
    '#openMenu b':'Menu', '#openMenu small':'Search or browse categories',
    '#counterOpenPicker b':'Categories', '#counterOpenPicker small':'Browse full menu',
    '#counterQuickMenuSearch':'Search menu', '#paymentNote':'Optional reference',
    '#newTransaction':'Done', '#doneMenu':'Add items', '#doneItemDialog':'Add items'
  };
  Object.entries(text).forEach(([selector,value])=>{const el=$(selector);if(!el)return;if(el.matches('input,textarea'))el.placeholder=value;else el.textContent=value});
  $$('.eyebrow').forEach(el=>{if(!el.closest('.login-card,.ledger-brand,.counter-quick-screen'))el.hidden=true});
  setButton($('#openMenu'),'search','Menu');
  setButton($('#counterOpenPicker'),'grid','Categories');
  ['#closeMenu','#closeItemDialog','#closeExpenseEdit','#logoutButton'].forEach(s=>{const b=$(s);if(b&&!b.querySelector('svg'))b.innerHTML=icon(s==='#logoutButton'?'logout':'close')});
  ['#menuBack','#closeLedgerWindow'].forEach(s=>{const b=$(s);if(b)b.innerHTML=icon('back')});
  ['#counterRefresh','#cafeReportRefresh','#refreshReport'].forEach(s=>{const b=$(s);if(b)b.innerHTML=icon('refresh')});
}

function updateTitle(){
  const active=$('.workspace-bottom-nav .tab.active');
  const title=$('#workspacePageTitle');if(!title)return;
  const values=active?.id==='counterTab'?['Counter Sale','Fast walk-in billing']:
    active?.dataset.view==='payment'?['Payment','Receive customer payment']:
    active?.dataset.view==='report'?['Reports','Business overview']:
    ['Credit Sale','Customer billing'];
  title.innerHTML=`<b>${values[0]}</b><small>${values[1]}</small>`;
}

function compactDynamicContent(){
  $$('.counter-title .eyebrow,.counter-quick-menu-search .eyebrow,.counter-cart .eyebrow,.counter-payment .eyebrow,.counter-recent .eyebrow').forEach(el=>el.hidden=true);
  const sync=$('#counterSync');if(sync)sync.setAttribute('aria-label',sync.textContent||'Sync status');
}

function start(){buildShell();compactDynamicContent();new MutationObserver(compactDynamicContent).observe(document.body,{subtree:true,childList:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();