const $=selector=>document.querySelector(selector);
const openMenu=$('#openMenu');
const invoiceView=$('#invoiceView');
const menuDialog=$('#menuDialog');
const menuSearch=$('#menuSearch');
const menuList=$('#menuItemList');
const categoryGrid=$('#categoryGrid');
const itemDialog=$('#itemDialog');

if(openMenu&&invoiceView&&menuSearch&&menuList&&categoryGrid){
  const style=document.createElement('style');
  style.textContent=`
    #menuDialog .dialog-search{display:none!important}
    .dashboard-item-search{margin:10px 0 12px;position:relative}
    .dashboard-search-box{display:grid;grid-template-columns:34px minmax(0,1fr) 34px;align-items:center;gap:4px;height:50px;padding:0 8px;border:1px solid #30343b;border-radius:16px;background:#15171a;box-shadow:0 8px 22px rgba(0,0,0,.2)}
    .dashboard-search-box:focus-within{border-color:#ff7a1a;box-shadow:0 0 0 3px rgba(255,122,26,.12)}
    .dashboard-search-box>span{display:grid;place-items:center;color:#9ca3ad;font-size:20px}
    .dashboard-search-box input{width:100%;height:46px;border:0!important;outline:0!important;background:transparent!important;color:#fff!important;font-size:15px;padding:0!important;box-shadow:none!important}
    .dashboard-search-box input::placeholder{color:#858c96}
    .dashboard-search-box button{width:32px;height:32px;border:0;border-radius:10px;background:#262a30;color:#c7ccd3;font-size:18px}
    .dashboard-search-results{margin-top:8px;overflow:hidden;border:1px solid #2b3037;border-radius:16px;background:#111316;box-shadow:0 14px 32px rgba(0,0,0,.3)}
    .dashboard-search-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #292d33;color:#9da4ae;font-size:11px}
    .dashboard-search-head b{color:#f2f3f5;font-size:12px}
    #dashboardSearchItems{max-height:52vh;overflow-y:auto;padding:6px}
    #dashboardSearchItems #menuItemList{display:grid!important;position:static!important;width:100%!important;max-height:none!important;overflow:visible!important;padding:0!important;background:transparent!important}
    #dashboardSearchItems .menu-item{margin:0 0 6px}
    #dashboardSearchItems .menu-item:last-child{margin-bottom:0}
    .dashboard-search-empty{padding:22px 14px;text-align:center;color:#9299a3;font-size:13px}
  `;
  document.head.append(style);

  const searchPanel=document.createElement('section');
  searchPanel.className='dashboard-item-search';
  searchPanel.innerHTML=`
    <div class="dashboard-search-box">
      <span>⌕</span>
      <input id="dashboardItemSearch" type="search" autocomplete="off" placeholder="Quick search menu items" aria-label="Search menu items">
      <button id="clearDashboardSearch" type="button" aria-label="Clear search" hidden>×</button>
    </div>
    <div id="dashboardSearchResults" class="dashboard-search-results" hidden>
      <div class="dashboard-search-head"><b>Search results</b><span id="dashboardSearchCount"></span></div>
      <div id="dashboardSearchItems"></div>
      <div id="dashboardSearchEmpty" class="dashboard-search-empty" hidden>No matching menu items</div>
    </div>`;
  openMenu.insertAdjacentElement('afterend',searchPanel);

  const input=$('#dashboardItemSearch');
  const clear=$('#clearDashboardSearch');
  const results=$('#dashboardSearchResults');
  const itemsHost=$('#dashboardSearchItems');
  const empty=$('#dashboardSearchEmpty');
  const count=$('#dashboardSearchCount');

  function restoreMenuList(){
    if(menuList.parentElement!==categoryGrid.parentElement){
      categoryGrid.insertAdjacentElement('afterend',menuList);
    }
  }

  function clearSearch(){
    input.value='';
    clear.hidden=true;
    results.hidden=true;
    empty.hidden=true;
    restoreMenuList();
    menuSearch.value='';
    menuSearch.dispatchEvent(new Event('input',{bubbles:true}));
  }

  function renderDashboardResults(){
    const query=input.value.trim();
    clear.hidden=!query;
    if(!query){clearSearch();return}

    if(itemDialog?.open)itemDialog.close();
    menuSearch.value=query;
    menuSearch.dispatchEvent(new Event('input',{bubbles:true}));
    itemsHost.append(menuList);
    menuList.hidden=false;
    results.hidden=false;

    const rows=[...menuList.querySelectorAll('.menu-item')];
    count.textContent=`${rows.length} result${rows.length===1?'':'s'}`;
    empty.hidden=rows.length>0;
    itemsHost.hidden=rows.length===0;
  }

  input.addEventListener('input',()=>requestAnimationFrame(renderDashboardResults));
  clear.addEventListener('click',()=>{clearSearch();input.focus()});
  openMenu.addEventListener('click',clearSearch,{capture:true});

  menuDialog?.addEventListener('close',()=>{
    if(input.value.trim())requestAnimationFrame(renderDashboardResults);
  });
}
