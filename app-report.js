import { changeStaffPin, getReports } from "./supabase-api.js";
import { el, state } from "./app-state.js";
import { requireLogin } from "./app-customer.js";
import {
  escapeHtml, formatDisplayDate, formatMoney, friendlyError, isSessionError,
  setButtonBusy, showToast, toDateInput, todayLocal, updateCloudFromError, updateCloudState,
} from "./app-utils.js";

export function bindReportEvents() {
  el.refreshReport.addEventListener("click", loadReport);
  el.reportFrom.addEventListener("change", markCustomDateRange);
  el.reportTo.addEventListener("change", markCustomDateRange);
  el.quickRanges.forEach((button) => button.addEventListener("click", () => setReportRange(button.dataset.range)));
  el.changePinForm.addEventListener("submit", submitPinChange);
}

export async function loadReport() {
  if (state.view !== "report") return;
  el.reportLoading.hidden = false;
  el.reportEmpty.hidden = true;
  el.reportList.replaceChildren();
  try {
    const rows = await getReports(state.sessionToken, el.reportFrom.value, el.reportTo.value);
    renderReport(Array.isArray(rows) ? rows : []);
    updateCloudState("online");
  } catch (error) {
    updateCloudFromError(error);
    if (isSessionError(error)) requireLogin();
    else showToast(friendlyError(error, "Could not load the report."));
  } finally { el.reportLoading.hidden = true; }
}

function renderReport(rows) {
  const sales = rows.filter((row) => row.transaction_type === "invoice")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const payments = rows.filter((row) => row.transaction_type === "payment")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  el.reportSales.textContent = formatMoney(sales);
  el.reportPayments.textContent = formatMoney(payments);
  el.reportNet.textContent = formatMoney(sales - payments);
  el.reportCount.textContent = String(rows.length);
  el.reportEmpty.hidden = rows.length > 0;
  el.reportList.replaceChildren();
  const fragment = document.createDocumentFragment();
  rows.forEach((row) => {
    const article = document.createElement("article");
    article.className = `report-row ${row.transaction_type}`;
    article.innerHTML = `
      <span class="report-type">${row.transaction_type === "invoice" ? "▤" : "₹"}</span>
      <span class="report-copy"><strong>${escapeHtml(row.customer_name)}</strong><small>${escapeHtml(row.reference)} · ${formatDisplayDate(row.transaction_date)}</small></span>
      <strong class="report-amount">${row.transaction_type === "payment" ? "−" : ""}${formatMoney(row.amount)}</strong>`;
    fragment.append(article);
  });
  el.reportList.append(fragment);
}

function setReportRange(range) {
  const today = new Date(`${todayLocal()}T12:00:00`);
  const from = new Date(today);
  if (range === "week") from.setDate(from.getDate() - 6);
  if (range === "month") from.setDate(from.getDate() - 29);
  el.reportFrom.value = toDateInput(from);
  el.reportTo.value = toDateInput(today);
  el.quickRanges.forEach((button) => button.classList.toggle("is-active", button.dataset.range === range));
  loadReport();
}

function markCustomDateRange() {
  el.quickRanges.forEach((button) => button.classList.remove("is-active"));
  if (el.reportFrom.value && el.reportTo.value) loadReport();
}

async function submitPinChange(event) {
  event.preventDefault();
  const current = el.currentPin.value.trim();
  const next = el.newPin.value.trim();
  if (!/^\d{4,8}$/.test(next)) return showToast("The new PIN must contain 4–8 digits.");
  const button = el.changePinForm.querySelector("button[type=submit]");
  setButtonBusy(button, true, "Changing…");
  try {
    await changeStaffPin(state.sessionToken, current, next);
    el.changePinForm.reset();
    showToast("Business PIN changed successfully.");
  } catch (error) {
    updateCloudFromError(error);
    showToast(friendlyError(error, "Could not change the PIN."));
  } finally { setButtonBusy(button, false, "Change PIN"); }
}
