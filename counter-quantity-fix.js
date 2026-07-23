const $=selector=>document.querySelector(selector);

function selectedUnits(){
  let total=0;
  document.querySelectorAll('#counterCartList .counter-cart-row small').forEach(meta=>{
    const text=meta.textContent||'';
    for(const match of text.matchAll(/[HF]\s*×\s*(\d+)/g)) total+=Number(match[1]||0);
  });
  return total;
}

function syncCounterPickerTotals(){
  if(!document.body.classList.contains('counter-picker-active'))return;
  const units=selectedUnits();
  const countText=`${units} ${units===1?'item':'items'}`;
  const totalText=$('#counterTotal')?.textContent||'₹0.00';
  [['#selectedItemCount',countText],['#itemDialogCount',countText],['#menuRunningTotal',totalText],['#itemDialogTotal',totalText]].forEach(([selector,value])=>{
    const element=$(selector);
    if(element&&element.textContent!==value)element.textContent=value;
  });
}

function repeatSelectedPortion(id,part,name){
  const search=$('#counterQuickMenuSearch');
  if(!search)return;
  const previous=search.value;
  search.value=name;
  search.dispatchEvent(new Event('input',{bubbles:true}));
  const button=document.querySelector(`#counterQuickMenuResults [data-quick-id="${CSS.escape(id)}"][data-quick-part="${part}"]`);
  if(button){
    button.click();
  }
  search.value=previous;
  search.dispatchEvent(new Event('input',{bubbles:true}));
  search.blur();
  syncCounterPickerTotals();
}

function enhanceCounterCartRows(){
  document.querySelectorAll('#counterCartList .counter-cart-row').forEach(row=>{
    const controls=row.querySelector('.counter-cart-controls');
    const id=controls?.querySelector('[data-id]')?.dataset.id;
    if(!controls||!id)return;
    const name=row.querySelector(':scope > div:first-child b')?.textContent?.trim()||'';
    const meta=row.querySelector(':scope > div:first-child small')?.textContent||'';
    const amount=controls.querySelector('strong');
    const remove=controls.querySelector('[data-action="remove"]');
    controls.querySelectorAll('.counter-qty-plus').forEach(button=>button.remove());
    const portions=[];
    if(/H\s*×\s*\d+/.test(meta))portions.push(['half','+H','Increase half quantity']);
    if(/F\s*×\s*\d+/.test(meta))portions.push(['full','+F','Increase full quantity']);
    portions.forEach(([part,label,aria])=>{
      const button=document.createElement('button');
      button.type='button';
      button.className='counter-qty-plus';
      button.textContent=label;
      button.setAttribute('aria-label',`${aria} for ${name}`);
      button.addEventListener('click',()=>repeatSelectedPortion(id,part,name));
      controls.insertBefore(button,remove||amount||null);
    });
  });
  syncCounterPickerTotals();
}

const observer=new MutationObserver(()=>enhanceCounterCartRows());
function start(){
  enhanceCounterCartRows();
  observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['open','class']});
  document.addEventListener('click',()=>setTimeout(syncCounterPickerTotals,0),true);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
