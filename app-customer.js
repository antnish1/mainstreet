import { getCustomerBalance, searchCustomers, staffLogin } from "./supabase-api.js";
import { KEYS, el, state } from "./app-state.js";
import {
  cacheCustomer, cleanName, extractNumeric, formatMoney, friendlyError, isSessionError,
  mergeCustomerCache, normalize, notifyState, setButtonBusy, showToast, updateCloudFromError,
  updateCloudState, writeJson,
} from "./app-utils.js";

export function bindCustomerEvents(openApp) {
  el.loginForm.addEventListener("submit", (event) => login(event, openApp));
  el.customerName.addEventListener("input", handleCustomerInput);
  el.customerName.addEventListener("focus", handleCustomerInput);
  el.customerName.addEventListener("blur", () => {
    window.setTimeout(hideCustomerSuggestions, 150);
    scheduleBalanceLookup();
  });
  el.clearCustomer.addEventListener("click", clearCustomer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideCustomerSuggestions();
  });
}

async function login(event, openApp) {
  event.preventDefault();
  const pin = el.staffPin.value.trim();
  if (!/^\d{4,8}$/.test(pin)) return showLoginError("Enter a valid 4–8 digit PIN.");
  setButtonBusy(el.loginButton, true, "Checking…");
  el.loginError.hidden = true;
  try {
    const result = await staffLogin(pin);
    const session = Array.isArray(result) ? result[0] : result;
    if (!session?.token) throw new Error("The PIN was not accepted.");
    state.sessionToken = session.token;
    state.sessionExpiresAt = session.expires_at || null;
    writeJson(KEYS.session, session);
    el.staffPin.value = "";
    await openApp();
  } catch (error) {
    updateCloudFromError(error);
    showLoginError(friendlyError(error, "Could not open the app."));
  } finally {
    setButtonBusy(el.loginButton, false, "Open app");
  }
}

export async function validateStoredSession() {
  try {
    await searchCustomers(state.sessionToken, "");
    updateCloudState("online");
    return true;
  } catch (error) {
    if (error?.code === "NETWORK" && cachedSessionIsCurrent()) {
      updateCloudState("offline");
      return true;
    }
    if (isSessionError(error)) clearSession();
    updateCloudFromError(error);
    return false;
  }
}

export function showLogin() {
  el.appShell.hidden = true;
  el.loginScreen.hidden = false;
  window.setTimeout(() => el.staffPin.focus(), 100);
}

function showLoginError(message) {
  el.loginError.textContent = message;
  el.loginError.hidden = false;
}

function handleCustomerInput() {
  const name = el.customerName.value.trim();
  el.clearCustomer.hidden = !name;
  state.customer = null;
  updateCustomerHint();
  notifyState();
  window.clearTimeout(state.customerSearchTimer);
  if (name.length < 2) return hideCustomerSuggestions();
  state.customerSearchTimer = window.setTimeout(() => fetchCustomerSuggestions(name), 220);
}

async function fetchCustomerSuggestions(query) {
  const cached = state.customerCache
    .filter((customer) => normalize(customer.name).includes(normalize(query))).slice(0, 6);
  renderCustomerSuggestions(cached);
  try {
    const rows = await searchCustomers(state.sessionToken, query);
    const results = Array.isArray(rows) ? rows : [];
    mergeCustomerCache(results);
    renderCustomerSuggestions(results);
    updateCloudState("online");
  } catch (error) {
    updateCloudFromError(error);
    if (isSessionError(error)) requireLogin();
  }
}

function renderCustomerSuggestions(customers) {
  el.customerSuggestions.replaceChildren();
  if (!customers.length) return hideCustomerSuggestions();
  const fragment = document.createDocumentFragment();
  customers.forEach((customer) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "option");
    button.innerHTML = `<span><strong>${escapeText(customer.name)}</strong><small>Saved customer</small></span><b>${formatMoney(customer.balance || 0)}</b>`;
    button.addEventListener("click", () => selectCustomer(customer));
    fragment.append(button);
  });
  el.customerSuggestions.append(fragment);
  el.customerSuggestions.hidden = false;
}

function selectCustomer(customer) {
  state.customer = customer;
  el.customerName.value = customer.name;
  el.clearCustomer.hidden = false;
  hideCustomerSuggestions();
  updateCustomerHint();
  renderPaymentBalance(customer.balance || 0);
  notifyState();
}

function clearCustomer() {
  state.customer = null;
  el.customerName.value = "";
  el.clearCustomer.hidden = true;
  el.paymentBalance.hidden = true;
  hideCustomerSuggestions();
  updateCustomerHint();
  notifyState();
  el.customerName.focus();
}

function hideCustomerSuggestions() { el.customerSuggestions.hidden = true; }

export function updateCustomerHint() {
  const name = cleanName(el.customerName.value);
  if (!name) {
    el.customerHint.textContent = "New customers are saved automatically.";
    el.customerHint.className = "field-hint";
  } else if (state.customer) {
    el.customerHint.textContent = `Saved customer · Balance ${formatMoney(state.customer.balance || 0)}`;
    el.customerHint.className = "field-hint is-known";
  } else {
    el.customerHint.textContent = "New customer · Will be saved on submit";
    el.customerHint.className = "field-hint is-new";
  }
}

function scheduleBalanceLookup() {
  window.clearTimeout(state.customerBalanceTimer);
  const name = cleanName(el.customerName.value);
  if (name.length < 2 || state.customer) return;
  state.customerBalanceTimer = window.setTimeout(() => lookupBalance(name), 250);
}

async function lookupBalance(name) {
  try {
    const result = await getCustomerBalance(state.sessionToken, name);
    const balance = extractNumeric(result);
    if (normalize(name) !== normalize(el.customerName.value)) return;
    if (balance !== 0) {
      state.customer = { name, balance };
      cacheCustomer(state.customer);
      updateCustomerHint();
      renderPaymentBalance(balance);
      notifyState();
    }
  } catch (error) { updateCloudFromError(error); }
}

function renderPaymentBalance(balance) {
  el.paymentBalance.innerHTML = `<span>Current customer balance</span><strong>${formatMoney(balance)}</strong>`;
  el.paymentBalance.hidden = false;
}

export function requireLogin() {
  clearSession();
  showToast("Your staff session expired. Enter the PIN again.");
  showLogin();
}

export function clearSession() {
  state.sessionToken = null;
  state.sessionExpiresAt = null;
  localStorage.removeItem(KEYS.session);
}

function cachedSessionIsCurrent() {
  if (!state.sessionToken || !state.sessionExpiresAt) return false;
  const expires = new Date(state.sessionExpiresAt).getTime();
  return Number.isFinite(expires) && expires > Date.now();
}

function escapeText(value) {
  const span = document.createElement("span");
  span.textContent = String(value || "");
  return span.innerHTML;
}
