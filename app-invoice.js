import { getMenuItems } from "./supabase-api.js";
import { CATEGORY_ICONS, el, state } from "./app-state.js";
import {
  cleanName, escapeHtml, formatMoney, moneyInputValue, normalize, notifyState,
  roundMoney, showToast, updateCloudFromError, updateCloudState,
} from "./app-utils.js";

export function bindInvoiceEvents() {
  el.openMenu.addEventListener("click", openMenuDialog);
  el.clearInvoice.addEventListener("click", clearInvoice);
  el.closeMenu.addEventListener("click", () => el.menuDialog.close());
  el.doneMenu.addEventListener("click", () => el.menuDialog.close());
  el.menuBack.addEventListener("click", showCategories);
  el.menuSearch.addEventListener("input", handleMenuSearch);
  el.clearMenuSearch.addEventListener("click", () => {
    el.menuSearch.value = "";
    el.clearMenuSearch.hidden = true;
    showCategories();
    el.menuSearch.focus();
  });
  el.addCustomItem.addEventListener("click", openCustomItemDialog);
  el.customItemForm.addEventListener("submit", saveCustomItem);
  document.querySelectorAll("[data-close-custom]")
    .forEach((button) => button.addEventListener("click", () => el.customItemDialog.close()));
}

export async function syncMenu() {
  try {
    const rows = await getMenuItems();
    if (Array.isArray(rows) && rows.length) {
      state.menuItems = rows.map((row) => ({
        id: row.id, category: row.category, name: row.name, fullRate: Number(row.full_rate),
      }));
      renderCategoryGrid();
    }
    updateCloudState("online");
  } catch (error) {
    updateCloudFromError(error);
    showToast("Using the menu saved in the app.");
  }
}

function openMenuDialog() {
  el.menuSearch.value = "";
  el.clearMenuSearch.hidden = true;
  showCategories();
  updateSelectedCount();
  el.menuDialog.showModal();
  window.setTimeout(() => el.menuSearch.focus(), 120);
}

function showCategories() {
  state.selectedCategory = null;
  el.menuDialogTitle.textContent = "Choose category";
  el.menuBack.hidden = true;
  el.categoryGrid.hidden = false;
  el.menuItemList.hidden = true;
  renderCategoryGrid();
}

export function renderCategoryGrid() {
  const counts = new Map();
  state.menuItems.forEach((item) => counts.set(item.category, (counts.get(item.category) || 0) + 1));
  el.categoryGrid.replaceChildren();
  const fragment = document.createDocumentFragment();
  [...counts.entries()].forEach(([category, count]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-card";
    button.innerHTML = `<span class="category-picture">${CATEGORY_ICONS[category] || "🍽️"}</span><span><strong>${escapeHtml(category)}</strong><small>${count} items</small></span><b>›</b>`;
    button.addEventListener("click", () => showCategoryItems(category));
    fragment.append(button);
  });
  el.categoryGrid.append(fragment);
}

function showCategoryItems(category) {
  state.selectedCategory = category;
  el.menuDialogTitle.textContent = category;
  el.menuBack.hidden = false;
  el.categoryGrid.hidden = true;
  el.menuItemList.hidden = false;
  renderMenuItemList(state.menuItems.filter((item) => item.category === category));
}

function handleMenuSearch() {
  const query = normalize(el.menuSearch.value);
  el.clearMenuSearch.hidden = !query;
  if (!query) return showCategories();
  state.selectedCategory = null;
  el.menuDialogTitle.textContent = "Search results";
  el.menuBack.hidden = false;
  el.categoryGrid.hidden = true;
  el.menuItemList.hidden = false;
  renderMenuItemList(state.menuItems.filter((item) => normalize(`${item.name} ${item.category}`).includes(query)));
}

function renderMenuItemList(items) {
  el.menuItemList.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "menu-list-empty";
    empty.textContent = "No matching menu items.";
    el.menuItemList.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const selected = state.invoiceItems.get(item.id);
    const row = document.createElement("article");
    row.className = "menu-picker-row";
    row.dataset.itemId = item.id;
    row.innerHTML = `
      <div class="picker-copy"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.category)} · Full ${formatMoney(item.fullRate)}</span></div>
      <div class="picker-portions">
        <button type="button" data-portion="half"><span>H</span><b>${selected?.halfQty || 0}</b></button>
        <button type="button" data-portion="full"><span>F</span><b>${selected?.fullQty || 0}</b></button>
      </div>`;
    row.querySelectorAll("[data-portion]").forEach((button) => {
      button.addEventListener("click", () => {
        addPortion(item, button.dataset.portion);
        const current = state.invoiceItems.get(item.id);
        row.querySelector('[data-portion="half"] b').textContent = current?.halfQty || 0;
        row.querySelector('[data-portion="full"] b').textContent = current?.fullQty || 0;
      });
    });
    fragment.append(row);
  });
  el.menuItemList.append(fragment);
}

function addPortion(item, portion) {
  const existing = state.invoiceItems.get(item.id) || {
    ...item, halfQty: 0, fullQty: 0, history: [], manualAmount: null,
  };
  if (portion === "half") existing.halfQty += 1;
  else existing.fullQty += 1;
  existing.history.push(portion);
  existing.manualAmount = null;
  state.invoiceItems.set(item.id, existing);
  renderInvoice();
}

export function renderInvoice() {
  el.invoiceItems.replaceChildren();
  const items = [...state.invoiceItems.values()];
  el.emptyInvoice.hidden = items.length > 0;
  el.clearInvoice.disabled = items.length === 0;
  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const row = el.rowTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.itemId = item.id;
    row.querySelector(".item-name").textContent = item.name;
    row.querySelector(".item-meta").textContent = `Full ${formatMoney(item.fullRate)} · H ${item.halfQty} · F ${item.fullQty}`;
    row.querySelector(".half-count").textContent = item.halfQty;
    row.querySelector(".full-count").textContent = item.fullQty;
    const valueInput = row.querySelector(".item-value");
    valueInput.value = moneyInputValue(itemAmount(item));
    valueInput.classList.toggle("is-edited", item.manualAmount !== null);
    row.querySelector(".half-button").addEventListener("click", () => incrementExisting(item.id, "half"));
    row.querySelector(".full-button").addEventListener("click", () => incrementExisting(item.id, "full"));
    row.querySelector(".undo-button").addEventListener("click", () => undoPortion(item.id));
    row.querySelector(".remove-button").addEventListener("click", () => removeInvoiceItem(item.id));
    valueInput.addEventListener("input", () => editItemValue(item.id, valueInput.value));
    valueInput.addEventListener("blur", () => {
      valueInput.value = moneyInputValue(itemAmount(state.invoiceItems.get(item.id)));
    });
    fragment.append(row);
  });
  el.invoiceItems.append(fragment);
  updateSelectedCount();
  notifyState();
}

function incrementExisting(id, portion) {
  const item = state.invoiceItems.get(id);
  if (!item) return;
  if (portion === "half") item.halfQty += 1;
  else item.fullQty += 1;
  item.history.push(portion);
  item.manualAmount = null;
  renderInvoice();
}

function undoPortion(id) {
  const item = state.invoiceItems.get(id);
  if (!item) return;
  const last = item.history.pop();
  if (last === "half") item.halfQty = Math.max(0, item.halfQty - 1);
  if (last === "full") item.fullQty = Math.max(0, item.fullQty - 1);
  item.manualAmount = null;
  if (item.halfQty === 0 && item.fullQty === 0) state.invoiceItems.delete(id);
  renderInvoice();
}

function editItemValue(id, value) {
  const item = state.invoiceItems.get(id);
  if (!item) return;
  const amount = Number(value);
  item.manualAmount = Number.isFinite(amount) && amount >= 0 ? roundMoney(amount) : 0;
  notifyState();
}

function removeInvoiceItem(id) {
  state.invoiceItems.delete(id);
  renderInvoice();
}

function clearInvoice() {
  if (!state.invoiceItems.size || !window.confirm("Clear every item from this invoice?")) return;
  state.invoiceItems.clear();
  renderInvoice();
}

function updateSelectedCount() {
  el.selectedItemCount.textContent = String(state.invoiceItems.size);
}

function openCustomItemDialog() {
  el.customItemForm.reset();
  el.customItemDialog.showModal();
  window.setTimeout(() => el.customItemName.focus(), 100);
}

function saveCustomItem(event) {
  event.preventDefault();
  const name = cleanName(el.customItemName.value);
  const rate = roundMoney(Number(el.customItemRate.value || 0));
  if (!name || rate <= 0) return showToast("Enter the item name and full rate.");
  addPortion({ id: `custom-${crypto.randomUUID()}`, category: "Custom", name, fullRate: rate }, "full");
  el.customItemDialog.close();
  showToast(`${name} added as Full.`);
}

export function invoiceTotal() {
  return roundMoney([...state.invoiceItems.values()].reduce((sum, item) => sum + itemAmount(item), 0));
}

export function itemAmount(item) {
  if (!item) return 0;
  if (item.manualAmount !== null && item.manualAmount !== undefined) return roundMoney(item.manualAmount);
  return roundMoney(item.fullRate * item.fullQty + item.fullRate * 0.5 * item.halfQty);
}
