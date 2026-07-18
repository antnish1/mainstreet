import { KEYS, el, state } from "./app-state.js";

export function notifyState() {
  document.dispatchEvent(new CustomEvent("mainstreet:statechange"));
}

export function updateCloudState(value) {
  state.cloudState = value;
  el.cloudStatus.dataset.state = value;
  const pending = state.pending.length;
  if (pending) el.cloudStatusText.textContent = `${pending} pending`;
  else if (value === "online") el.cloudStatusText.textContent = "Cloud";
  else if (value === "offline") el.cloudStatusText.textContent = "Offline";
  else if (value === "setup") el.cloudStatusText.textContent = "Setup";
  else el.cloudStatusText.textContent = "Checking";
}

export function updateCloudFromError(error) {
  if (error?.code === "NETWORK" || !navigator.onLine) updateCloudState("offline");
  else if (["PGRST202", "42883", "42P01"].includes(error?.code)) updateCloudState("setup");
}

export function friendlyError(error, fallback) {
  if (!error) return fallback;
  if (["PGRST202", "42883", "42P01"].includes(error.code)) {
    return "Supabase tables are not installed yet. Run supabase/schema.sql in the Supabase SQL Editor.";
  }
  if (error.code === "NETWORK") return "No internet connection.";
  if (/invalid pin/i.test(error.message || "")) return "Incorrect business PIN.";
  return error.message || fallback;
}

export function isSessionError(error) {
  return error?.status === 401 || /invalid or expired staff session/i.test(error?.message || "");
}

export function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  el.toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

export function setButtonBusy(button, busy, text) {
  button.disabled = busy;
  button.textContent = text;
}

export function formatMoney(value) {
  const amount = roundMoney(Number(value || 0));
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function moneyInputValue(value) {
  const amount = roundMoney(value);
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

export function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function todayLocal() { return toDateInput(new Date()); }

export function toDateInput(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function formatDisplayDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ")
    .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("en-IN"));
}

export function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase("en-IN").replace(/\s+/g, " ");
}

export function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

export function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function escapeHtml(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function mergeCustomerCache(customers) { customers.forEach(cacheCustomer); }

export function cacheCustomer(customer) {
  if (!customer?.name) return;
  const key = normalize(customer.name);
  const current = state.customerCache.find((item) => normalize(item.name) === key);
  if (current) Object.assign(current, customer);
  else state.customerCache.push({ name: customer.name, balance: Number(customer.balance || 0) });
  state.customerCache = state.customerCache.slice(-100);
  writeJson(KEYS.customers, state.customerCache);
}

export function extractNumeric(result) {
  if (typeof result === "number") return result;
  if (Array.isArray(result)) return Number(result[0]?.balance ?? result[0] ?? 0);
  if (result && typeof result === "object") return Number(result.balance ?? result.value ?? 0);
  return Number(result || 0);
}

export function normalizeRpcResult(result) {
  if (Array.isArray(result)) return result[0] || {};
  return result && typeof result === "object" ? result : {};
}
