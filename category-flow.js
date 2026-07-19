const categoryGrid=document.querySelector('#categoryGrid');
const menuList=document.querySelector('#menuItemList');
const menuDialog=document.querySelector('#menuDialog');
const itemDialog=document.querySelector('#itemDialog');
const itemDialogTitle=document.querySelector('#itemDialogTitle');
const itemDialogBody=document.querySelector('#itemDialogBody');
const itemDialogTotal=document.querySelector('#itemDialogTotal');
const itemDialogCount=document.querySelector('#itemDialogCount');
const invoiceItems=document.querySelector('#invoiceItems');
const menuTotal=document.querySelector('#menuRunningTotal');
const selectedCount=document.querySelector('#selectedItemCount');

function openItemPopup(category){
  if(!itemDialog||!menuList||!itemDialogBody)return;
  itemDialogTitle.textContent=category;
  itemDialogBody.append(menuList);
  menuList.hidden=false;
  itemDialog.showModal();
  requestAnimationFrame(updateSelectionCounters);
}

function closeItemPopup(){
  if(!itemDialog?.open)return;
  const grid=document.querySelector('#categoryGrid');
  grid?.insertAdjacentElement('afterend',menuList);
  menuList.hidden=true;
  itemDialog.close();
}

categoryGrid?.addEventListener('click',event=>{
  const card=event.target.closest('.category-card');
  if(!card)return;
  const category=card.querySelector('b')?.textContent?.trim()||'Items';
  setTimeout(()=>openItemPopup(category),0);
});

document.querySelector('#closeItemDialog')?.addEventListener('click',closeItemPopup);
document.querySelector('#doneItemDialog')?.addEventListener('click',closeItemPopup);
itemDialog?.addEventListener('cancel',event=>{event.preventDefault();closeItemPopup()});

function invoiceCounts(){
  const counts=new Map();
  invoiceItems?.querySelectorAll('.invoice-row').forEach(row=>{
    const name=row.querySelector('.item-name')?.textContent?.trim();
    if(!name)return;
    counts.set(name,{
      half:row.querySelector('.half i')?.textContent?.trim()||'0',
      full:row.querySelector('.full i')?.textContent?.trim()||'0'
    });
  });
  return counts;
}

function updateSelectionCounters(){
  const counts=invoiceCounts();
  menuList?.querySelectorAll('.menu-item').forEach(row=>{
    const name=row.querySelector(':scope > div:first-child b')?.textContent?.trim();
    const count=counts.get(name)||{half:'0',full:'0'};
    const half=row.querySelector('.menu-item-actions .half');
    const full=row.querySelector('.menu-item-actions .full');
    if(half){half.dataset.count=count.half;half.classList.toggle('has-count',Number(count.half)>0)}
    if(full){full.dataset.count=count.full;full.classList.toggle('has-count',Number(count.full)>0)}
  });
  if(itemDialogCount&&selectedCount)itemDialogCount.textContent=selectedCount.textContent;
  if(itemDialogTotal&&menuTotal)itemDialogTotal.textContent=menuTotal.textContent;
}

const observer=new MutationObserver(()=>requestAnimationFrame(updateSelectionCounters));
if(menuList)observer.observe(menuList,{childList:true,subtree:true,characterData:true,attributes:true});
if(invoiceItems)observer.observe(invoiceItems,{childList:true,subtree:true,characterData:true});
if(menuTotal)observer.observe(menuTotal,{childList:true,subtree:true,characterData:true});
updateSelectionCounters();
