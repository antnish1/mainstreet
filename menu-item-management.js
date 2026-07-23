const $=selector=>document.querySelector(selector);

const itemDialog=$('#itemDialog');
const itemDialogBody=$('#itemDialogBody');
const itemDialogTitle=$('#itemDialogTitle');
const categoryDialog=$('#categoryDialog');
const categoryForm=$('#categoryForm');
const addCategory=$('#addCategory');
const categoryName=$('#newCategoryName');
const itemName=$('#newItemName');
const halfPrice=$('#newHalfPrice');
const fullPrice=$('#newFullPrice');

let itemMode=false;
let submittedCategory='';

function currentRole(){
  return window.mainstreetRole||document.body.dataset.role||JSON.parse(localStorage.getItem('mainstreet.staff-session.v3')||'null')?.user_role||'';
}

function modalTitle(){return categoryDialog?.querySelector('h2')}
function modalEyebrow(){return categoryDialog?.querySelector('.eyebrow')}

function restoreCategoryMode(){
  itemMode=false;
  submittedCategory='';
  if(categoryName){categoryName.readOnly=false;categoryName.removeAttribute('aria-readonly')}
  if(modalTitle())modalTitle().textContent='Add category & item';
  if(modalEyebrow())modalEyebrow().textContent='Menu setup';
}

function openAddItem(){
  if(currentRole()!=='admin'||!categoryDialog||!categoryForm)return;
  const category=(itemDialogTitle?.textContent||'').trim();
  if(!category||category.toLowerCase()==='items')return;
  itemMode=true;
  submittedCategory='';
  categoryForm.reset();
  categoryName.value=category;
  categoryName.readOnly=true;
  categoryName.setAttribute('aria-readonly','true');
  if(modalTitle())modalTitle().textContent=`Add item to ${category}`;
  if(modalEyebrow())modalEyebrow().textContent='Menu item setup';
  categoryDialog.showModal();
  setTimeout(()=>itemName?.focus(),80);
}

function ensureToolbar(){
  if(!itemDialogBody||$('#itemManagementBar'))return;
  const bar=document.createElement('div');
  bar.id='itemManagementBar';
  bar.className='item-management-bar';
  bar.innerHTML='<button id="addItemInsidePopup" class="btn secondary add-menu-item-button" type="button"><span aria-hidden="true">＋</span><span>Add new item in this category</span></button>';
  itemDialogBody.prepend(bar);
  $('#addItemInsidePopup').addEventListener('click',openAddItem);
  applyRole();
}

function applyRole(){
  const button=$('#addItemInsidePopup');
  if(button)button.hidden=currentRole()!=='admin';
}

function refreshSelectedCategory(category){
  if(!category)return;
  const cards=[...document.querySelectorAll('#categoryGrid .category-card')];
  const card=cards.find(row=>row.querySelector('b')?.textContent.trim().toLowerCase()===category.toLowerCase());
  if(card)card.click();
}

categoryForm?.addEventListener('submit',()=>{
  if(!itemMode)return;
  submittedCategory=categoryName.value.trim();
},true);

categoryDialog?.addEventListener('close',()=>{
  const category=submittedCategory;
  const shouldRefresh=itemMode&&Boolean(category);
  restoreCategoryMode();
  if(shouldRefresh)setTimeout(()=>refreshSelectedCategory(category),180);
});

addCategory?.addEventListener('click',restoreCategoryMode,true);
itemDialog?.addEventListener('close',()=>{if(categoryDialog?.open)categoryDialog.close()});
document.addEventListener('mainstreet-role-ready',applyRole);

ensureToolbar();
applyRole();
