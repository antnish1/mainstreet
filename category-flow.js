import './business-enhancements.js';
import './dashboard-item-search.js';
import './account-summary.js';
import './opening-balance.js';
import './role-access.js';
const categoryGrid=document.querySelector('#categoryGrid');
const menuList=document.querySelector('#menuItemList');
const itemDialog=document.querySelector('#itemDialog');
const itemDialogTitle=document.querySelector('#itemDialogTitle');
const itemDialogBody=document.querySelector('#itemDialogBody');
function openItemPopup(category){if(!itemDialog||!menuList||!itemDialogBody)return;itemDialogTitle.textContent=category;itemDialogBody.append(menuList);menuList.hidden=false;if(!itemDialog.open)itemDialog.showModal()}
function closeItemPopup(){if(!itemDialog?.open)return;categoryGrid?.insertAdjacentElement('afterend',menuList);itemDialog.close();document.querySelector('#menuBack')?.click()}
categoryGrid?.addEventListener('click',event=>{const card=event.target.closest('.category-card');if(!card)return;const category=card.querySelector('b')?.textContent?.trim()||'Items';setTimeout(()=>openItemPopup(category),0)});
document.querySelector('#closeItemDialog')?.addEventListener('click',closeItemPopup);
document.querySelector('#doneItemDialog')?.addEventListener('click',closeItemPopup);
itemDialog?.addEventListener('cancel',event=>{event.preventDefault();closeItemPopup()});