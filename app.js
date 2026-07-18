import { MENU_ITEMS } from "./menu-data.js";

const STORAGE_KEYS = {
  customers: "mainstreet.customers.v1",
  transactions: "mainstreet.transactions.v1",
};

const state = {
  mode: "invoice",
  category: "All",
  customer: null,
  invoiceItems: new Map(),
  customers: readStorage(STORAGE_KEYS.customers, []),
  transactions: readStorage(STORAGE_KEYS.transactions, []),
};

const elements = {
  modeButtons: [...document.querySelectorAll(".mode-button")],
  transactionDate: document.querySelector("#transactionDate"),
  customerName: document.querySelector("#customerName"),
  clearCustomer: document.querySelector("#clearCustomer"),
  customerSuggestions: document.querySelector("#customerSuggestions"),
  customerHint: document.querySelector("#customerHint"),
  invoicePanel: document.querySelector("#invoicePanel"),
  paymentPanel: document.querySelector("#paymentPanel"),
  menuSearch: document.querySelector("#menuSearch"),
  clearMenuSearch: document.querySelector("#clearMenuSearch"),
  categoryChips: document.querySelector("#categoryChips"),
  menuSuggestions: document.querySelector("#menuSuggestions"),
  menuCount: document.querySelector("#menuCount"),
  addCustomItem: document.querySelector("#addCustomItem"),
  clearInvoice: document.querySelector("#clearInvoice"),
  emptyInvoice: document.querySelector("#emptyInvoice"),
  invoiceItems: document.querySelector("#invoiceItems"),
  paymentAmount: document.querySelector("#paymentAmount"),
  paymentNote: document.querySelector("#paymentNote"),
  actionLabel: document.querySelector("#actionLabel"),
  actionTotal: document.querySelector("#actionTotal"),
  submitTransaction: document.querySelector("#submitTransaction"),
  toastRegion: document.querySelector("#toastRegion"),
  customItemDialog: document.querySelector("#customItemDialog"),
  customItemForm: document.querySelector("#customItemForm"),
  customItemName: document.querySelector("#customItemName"),
  customItemRate: document.querySelector("#customItemRate"),
  successDialog: document.querySelector("#successDialog"),
  successTitle: document.querySelector("#successTitle"),
  successMessage: document.querySelector("#successMessage"),
  newTransaction: document.querySelector("#newTransaction"),
  rowTemplate: document.querySelector("#invoiceRowTemplate"),
};

initialize();

function initialize() {
  elements.transactionDate.value = todayLocal();
  buildCategoryChips();
  renderMenuResults();
  renderInvoice();
  updateCustomerStatus();
  bindEvents();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {
        // Billing remains fully usable if service-worker registration is unavailable.
      });
    });
  }
}

function bindEvents() {
  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  elements.customerName.addEventListener("input", handleCustomerInput);
  elements.customerName.addEventListener("focus", handleCustomerInput);
  elements.customerName.addEventListener("blur", () => {
    window.setTimeout(() => hideCustomerSuggestions(), 120);
  });

  elements.clearCustomer.addEventListener("click", () => {
    elements.customerName.value = "";
    state.customer = null;
    elements.customerName.focus();
    hideCustomerSuggestions();
    updateCustomerStatus();
    updateActionBar();
  });

  elements.menuSearch.addEventListener("input", () => {
    elements.clearMenuSearch.hidden = !elements.menuSearch.value;
    renderMenuResults();
  });

  elements.clearMenuSearch.addEventListener("click", () => {
    elements.menuSearch.value = "";
    elements.clearMenuSearch.hidden = true;
    elements.menuSearch.focus();
    renderMenuResults();
  });

  elements.addCustomItem.addEventListener("click", openCustomItemDialog);
  elements.clearInvoice.addEventListener("click", clearInvoice);
  elements.paymentAmount.addEventListener("input", updateActionBar);
  elements.submitTransaction.addEventListener("click", submitTransaction);

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });

  elements.customItemForm.addEventListener("submit", saveCustomItem);
  elements.newTransaction.addEventListener("click", resetAfterSuccess);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideCustomerSuggestions();
  });
}

function setMode(mode) {
  if (!["invoice", "payment"].includes(mode)) return;
  state.mode = mode;

  elements.modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  elements.invoicePanel.hidden = mode !== "invoice";
  elements.paymentPanel.hidden = mode !== "payment";
  updateActionBar();

  if (mode === "payment") {
    window.setTimeout(() => elements.paymentAmount.focus(), 80);
  } else {
    window.setTimeout(() => elements.menuSearch.focus(), 80);
  }
}

function buildCategoryChips() {
  const categories = ["All", ...new Set(MENU_ITEMS.map((item) => item.category))];
  elements.categoryChips.replaceChildren(
    ...categories.map((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `category-chip${category === state.category ? " is-active" : ""}`;
      button.textContent = category;
      button.addEventListener("click", () => {
        state.category = category;
        [...elements.categoryChips.children].forEach((chip) => {
          chip.classList.toggle("is-active", chip.textContent === category);
        });
        renderMenuResults();
      });
      return button;
    }),
  );
}

function renderMenuResults() {
  const query = normalize(elements.menuSearch.value);
  const filtered = MENU_ITEMS.filter((item) => {
    const categoryMatch = state.category === "All" || item.category === state.category;
    const queryMatch =
      !query || normalize(item.name).includes(query) || normalize(item.category).includes(query);
    return categoryMatch && queryMatch;
  }).slice(0, 14);

  elements.menuSuggestions.replaceChildren();

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "menu-empty";
    empty.textContent = "No menu item found. Use “Add custom item” below.";
    elements.menuSuggestions.append(empty);
    elements.menuCount.textContent = "0 items";
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "menu-result";
    button.setAttribute("role", "option");
    button.innerHTML = `
      <span class="menu-result-copy">
        <strong>${escapeHtml(item.name)}</strong>
        <small>${escapeHtml(item.category)} · H ${formatMoney(item.fullRate / 2)}</small>
      </span>
      <span class="menu-result-rate">${formatMoney(item.fullRate)}</span>
    `;
    button.addEventListener("click", () => addInvoiceItem(item));
    fragment.append(button);
  });
  elements.menuSuggestions.append(fragment);
  elements.menuCount.textContent = `${filtered.length} item${filtered.length === 1 ? "" : "s"}`;
}

function addInvoiceItem(item) {
  const existing = state.invoiceItems.get(item.id);
  if (existing) {
    scrollToInvoiceItem(item.id);
    showToast(`${item.name} is already in the invoice.`);
    return;
  }

  state.invoiceItems.set(item.id, {
    ...item,
    halfQty: 0,
    fullQty: 0,
    history: [],
  });

  renderInvoice();
  scrollToInvoiceItem(item.id);
}

function renderInvoice() {
  elements.invoiceItems.replaceChildren();
  const items = [...state.invoiceItems.values()];
  elements.emptyInvoice.hidden = items.length > 0;
  elements.clearInvoice.disabled = items.length === 0;

  items.forEach((item) => {
    const row = elements.rowTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.itemId = item.id;

    row.querySelector(".item-name").textContent = item.name;
    row.querySelector(".item-rate").textContent =
      `H ${formatMoney(item.fullRate / 2)} · F ${formatMoney(item.fullRate)}`;
    row.querySelector(".half-count").textContent = item.halfQty;
    row.querySelector(".full-count").textContent = item.fullQty;
    row.querySelector(".item-amount").textContent = formatMoney(itemAmount(item));

    const halfButton = row.querySelector(".half-button");
    const fullButton = row.querySelector(".full-button");
    const undoButton = row.querySelector(".undo-button");
    const removeButton = row.querySelector(".remove-button");

    halfButton.classList.toggle("has-quantity", item.halfQty > 0);
    fullButton.classList.toggle("has-quantity", item.fullQty > 0);
    undoButton.disabled = item.history.length === 0;

    halfButton.addEventListener("click", () => incrementPortion(item.id, "half"));
    fullButton.addEventListener("click", () => incrementPortion(item.id, "full"));
    undoButton.addEventListener("click", () => undoLastPortion(item.id));
    removeButton.addEventListener("click", () => removeInvoiceItem(item.id));

    elements.invoiceItems.append(row);
  });

  updateActionBar();
}

function incrementPortion(itemId, portion) {
  const item = state.invoiceItems.get(itemId);
  if (!item) return;

  if (portion === "half") item.halfQty += 1;
  if (portion === "full") item.fullQty += 1;
  item.history.push(portion);
  renderInvoice();
}

function undoLastPortion(itemId) {
  const item = state.invoiceItems.get(itemId);
  if (!item || !item.history.length) return;

  const portion = item.history.pop();
  if (portion === "half" && item.halfQty > 0) item.halfQty -= 1;
  if (portion === "full" && item.fullQty > 0) item.fullQty -= 1;
  renderInvoice();
}

function removeInvoiceItem(itemId) {
  state.invoiceItems.delete(itemId);
  renderInvoice();
}

function clearInvoice() {
  if (!state.invoiceItems.size) return;
  state.invoiceItems.clear();
  renderInvoice();
  showToast("Invoice items cleared.");
}

function scrollToInvoiceItem(itemId) {
  window.setTimeout(() => {
    const row = elements.invoiceItems.querySelector(`[data-item-id="${CSS.escape(itemId)}"]`);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 50);
}

function handleCustomerInput() {
  const value = elements.customerName.value.trim();
  elements.clearCustomer.hidden = value.length === 0;

  const exact = state.customers.find((customer) => normalize(customer.name) === normalize(value));
  state.customer = exact || null;
  updateCustomerStatus();
  updateActionBar();

  if (value.length < 2) {
    hideCustomerSuggestions();
    return;
  }

  const matches = state.customers
    .filter((customer) => normalize(customer.name).includes(normalize(value)))
    .slice(0, 6);

  if (!matches.length) {
    hideCustomerSuggestions();
    return;
  }

  elements.customerSuggestions.replaceChildren(
    ...matches.map((customer) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "suggestion-option";
      button.setAttribute("role", "option");
      button.innerHTML = `
        <strong>${escapeHtml(customer.name)}</strong>
        <span>Balance ${formatMoney(customerBalance(customer.name))}</span>
      `;
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => selectCustomer(customer));
      return button;
    }),
  );
  elements.customerSuggestions.hidden = false;
}

function selectCustomer(customer) {
  state.customer = customer;
  elements.customerName.value = customer.name;
  elements.clearCustomer.hidden = false;
  hideCustomerSuggestions();
  updateCustomerStatus();
  updateActionBar();
}

function hideCustomerSuggestions() {
  elements.customerSuggestions.hidden = true;
}

function updateCustomerStatus() {
  const name = elements.customerName.value.trim();
  elements.customerHint.classList.remove("is-known", "is-new");

  if (!name) {
    elements.customerHint.textContent = "New customers are saved automatically.";
    return;
  }

  const known = state.customers.find((customer) => normalize(customer.name) === normalize(name));
  if (known) {
    const balance = customerBalance(known.name);
    elements.customerHint.textContent = `Saved customer · Balance ${formatMoney(balance)}`;
    elements.customerHint.classList.add("is-known");
  } else {
    elements.customerHint.textContent = "New customer · Will be saved on submit";
    elements.customerHint.classList.add("is-new");
  }
}

function customerBalance(customerName) {
  const key = normalize(customerName);
  return state.transactions.reduce((balance, transaction) => {
    if (normalize(transaction.customerName) !== key) return balance;
    if (transaction.type === "invoice") return balance + Number(transaction.total || 0);
    if (transaction.type === "payment") return balance - Number(transaction.total || 0);
    return balance;
  }, 0);
}

function updateActionBar() {
  const customerReady = elements.customerName.value.trim().length > 0;
  const dateReady = Boolean(elements.transactionDate.value);

  if (state.mode === "invoice") {
    const total = invoiceTotal();
    const hasQuantity = [...state.invoiceItems.values()].some(
      (item) => item.halfQty > 0 || item.fullQty > 0,
    );
    elements.actionLabel.textContent = "Invoice total";
    elements.actionTotal.textContent = formatMoney(total);
    elements.submitTransaction.textContent = "Save Invoice";
    elements.submitTransaction.disabled = !(customerReady && dateReady && hasQuantity && total > 0);
  } else {
    const amount = Number(elements.paymentAmount.value || 0);
    elements.actionLabel.textContent = "Payment amount";
    elements.actionTotal.textContent = formatMoney(amount);
    elements.submitTransaction.textContent = "Save Payment";
    elements.submitTransaction.disabled = !(customerReady && dateReady && amount > 0);
  }
}

function submitTransaction() {
  const customerName = cleanName(elements.customerName.value);
  const date = elements.transactionDate.value;

  if (!customerName || !date) {
    showToast("Enter the date and customer name.");
    return;
  }

  const customer = upsertCustomer(customerName);
  let transaction;

  if (state.mode === "invoice") {
    const billableItems = [...state.invoiceItems.values()]
      .filter((item) => item.halfQty > 0 || item.fullQty > 0)
      .map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        fullRate: item.fullRate,
        halfQty: item.halfQty,
        fullQty: item.fullQty,
        amount: roundMoney(itemAmount(item)),
      }));

    if (!billableItems.length) {
      showToast("Add at least one half or full quantity.");
      return;
    }

    transaction = {
      id: nextTransactionId("INV", date),
      type: "invoice",
      date,
      customerId: customer.id,
      customerName: customer.name,
      items: billableItems,
      total: roundMoney(billableItems.reduce((sum, item) => sum + item.amount, 0)),
      createdAt: new Date().toISOString(),
    };
  } else {
    const amount = roundMoney(Number(elements.paymentAmount.value || 0));
    if (amount <= 0) {
      showToast("Enter a valid payment amount.");
      return;
    }

    transaction = {
      id: nextTransactionId("PAY", date),
      type: "payment",
      date,
      customerId: customer.id,
      customerName: customer.name,
      total: amount,
      note: elements.paymentNote.value.trim(),
      createdAt: new Date().toISOString(),
    };
  }

  state.transactions.push(transaction);
  writeStorage(STORAGE_KEYS.transactions, state.transactions);
  state.customer = customer;
  updateCustomerStatus();

  elements.successTitle.textContent = transaction.type === "invoice" ? "Invoice saved" : "Payment saved";
  elements.successMessage.textContent =
    `${transaction.id} · ${customer.name} · ${formatMoney(transaction.total)}`;
  elements.successDialog.showModal();
}

function upsertCustomer(name) {
  const key = normalize(name);
  const existing = state.customers.find((customer) => normalize(customer.name) === key);
  const now = new Date().toISOString();

  if (existing) {
    existing.name = name;
    existing.updatedAt = now;
    writeStorage(STORAGE_KEYS.customers, state.customers);
    return existing;
  }

  const customer = {
    id: `CUS-${String(state.customers.length + 1).padStart(4, "0")}`,
    name,
    createdAt: now,
    updatedAt: now,
  };
  state.customers.push(customer);
  state.customers.sort((a, b) => a.name.localeCompare(b.name));
  writeStorage(STORAGE_KEYS.customers, state.customers);
  return customer;
}

function resetAfterSuccess() {
  elements.successDialog.close();
  state.invoiceItems.clear();
  state.customer = null;
  elements.customerName.value = "";
  elements.clearCustomer.hidden = true;
  elements.paymentAmount.value = "";
  elements.paymentNote.value = "";
  elements.menuSearch.value = "";
  elements.clearMenuSearch.hidden = true;
  elements.transactionDate.value = todayLocal();
  renderMenuResults();
  renderInvoice();
  updateCustomerStatus();
  updateActionBar();
  elements.customerName.focus();
}

function openCustomItemDialog() {
  elements.customItemForm.reset();
  elements.customItemDialog.showModal();
  window.setTimeout(() => elements.customItemName.focus(), 80);
}

function saveCustomItem(event) {
  event.preventDefault();
  const name = cleanName(elements.customItemName.value);
  const rate = roundMoney(Number(elements.customItemRate.value || 0));

  if (!name || rate <= 0) {
    showToast("Enter a custom item name and full rate.");
    return;
  }

  const item = {
    id: `custom-${Date.now()}`,
    category: "Custom",
    name,
    fullRate: rate,
  };
  addInvoiceItem(item);
  elements.customItemDialog.close();
}

function invoiceTotal() {
  return roundMoney(
    [...state.invoiceItems.values()].reduce((sum, item) => sum + itemAmount(item), 0),
  );
}

function itemAmount(item) {
  return item.fullRate * item.fullQty + item.fullRate * 0.5 * item.halfQty;
}

function nextTransactionId(prefix, date) {
  const dateCode = date.replaceAll("-", "");
  const count = state.transactions.filter(
    (transaction) => transaction.type === (prefix === "INV" ? "invoice" : "payment") && transaction.date === date,
  ).length + 1;
  return `${prefix}-${dateCode}-${String(count).padStart(3, "0")}`;
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  elements.toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 2600);
}

function formatMoney(value) {
  const amount = roundMoney(Number(value || 0));
  const hasDecimals = !Number.isInteger(amount);
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function todayLocal() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase("en-IN").replace(/\s+/g, " ");
}

function cleanName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("en-IN"));
}

function readStorage(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    showToast("This device could not save the data.");
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
