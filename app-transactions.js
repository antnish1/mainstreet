import { SupabaseApiError, createInvoice, createPayment } from "./supabase-api.js";
import { KEYS, el, state } from "./app-state.js";
import { requireLogin, updateCustomerHint } from "./app-customer.js";
import { invoiceTotal, itemAmount, renderInvoice } from "./app-invoice.js";
import {
  cacheCustomer, cleanName, formatMoney, friendlyError, isSessionError, normalizeRpcResult,
  roundMoney, showToast, todayLocal, updateCloudFromError, updateCloudState, writeJson,
} from "./app-utils.js";

export function bindTransactionEvents() {
  el.paymentAmount.addEventListener("input", updateActionBar);
  el.submitTransaction.addEventListener("click", submitTransaction);
  el.newTransaction.addEventListener("click", resetAfterSuccess);
  el.cloudStatus.addEventListener("click", () => {
    if (state.pending.length) processPendingQueue();
    else showToast(state.cloudState === "online" ? "Cloud connection is active." : "Cloud is not connected.");
  });
  window.addEventListener("online", () => {
    updateCloudState("checking");
    processPendingQueue();
  });
  window.addEventListener("offline", () => updateCloudState("offline"));
}

export function updateActionBar() {
  if (state.view === "report") return;
  const customerReady = cleanName(el.customerName.value).length > 0;
  const dateReady = Boolean(el.transactionDate.value);
  if (state.view === "invoice") {
    const total = invoiceTotal();
    el.actionLabel.textContent = "Invoice total";
    el.actionTotal.textContent = formatMoney(total);
    el.submitTransaction.textContent = state.saving ? "Saving…" : "Save Invoice";
    el.submitTransaction.disabled = state.saving || !(customerReady && dateReady && state.invoiceItems.size && total > 0);
  } else {
    const amount = roundMoney(Number(el.paymentAmount.value || 0));
    el.actionLabel.textContent = "Payment amount";
    el.actionTotal.textContent = formatMoney(amount);
    el.submitTransaction.textContent = state.saving ? "Saving…" : "Save Payment";
    el.submitTransaction.disabled = state.saving || !(customerReady && dateReady && amount > 0);
  }
}

async function submitTransaction() {
  if (state.saving) return;
  const customerName = cleanName(el.customerName.value);
  const date = el.transactionDate.value;
  if (!customerName || !date) return showToast("Enter the date and customer name.");

  let entry;
  if (state.view === "invoice") {
    if (!state.invoiceItems.size) return showToast("Add at least one item.");
    entry = {
      type: "invoice",
      payload: {
        clientReference: crypto.randomUUID(), date, customerName,
        items: [...state.invoiceItems.values()].map((item) => ({
          menu_item_id: item.id.startsWith("custom-") ? null : item.id,
          item_name: item.name, category: item.category, full_rate: roundMoney(item.fullRate),
          half_qty: item.halfQty, full_qty: item.fullQty, amount: roundMoney(itemAmount(item)),
        })),
      },
    };
  } else {
    const amount = roundMoney(Number(el.paymentAmount.value || 0));
    if (amount <= 0) return showToast("Enter a valid payment amount.");
    entry = {
      type: "payment",
      payload: {
        clientReference: crypto.randomUUID(), date, customerName, amount,
        note: el.paymentNote.value.trim(),
      },
    };
  }

  state.saving = true;
  updateActionBar();
  try {
    const result = await sendEntry(entry);
    updateCloudState("online");
    cacheCustomer({ name: customerName, balance: extractBalanceFromResult(result) });
    showSuccess(entry.type, result, false);
  } catch (error) {
    if (error instanceof SupabaseApiError && error.code === "NETWORK") {
      state.pending.push(entry);
      writeJson(KEYS.pending, state.pending);
      updateCloudState("offline");
      showSuccess(entry.type, { reference: "Pending sync", total: entryTotal(entry) }, true);
    } else {
      updateCloudFromError(error);
      if (isSessionError(error)) requireLogin();
      else showToast(friendlyError(error, "The transaction could not be saved."));
    }
  } finally {
    state.saving = false;
    updateActionBar();
  }
}

function sendEntry(entry) {
  return entry.type === "invoice"
    ? createInvoice(state.sessionToken, entry.payload)
    : createPayment(state.sessionToken, entry.payload);
}

export async function processPendingQueue() {
  if (!state.sessionToken || !navigator.onLine || !state.pending.length) return;
  const remaining = [];
  for (const entry of state.pending) {
    try {
      await sendEntry(entry);
      updateCloudState("online");
    } catch (error) {
      remaining.push(entry);
      updateCloudFromError(error);
      if (isSessionError(error)) break;
    }
  }
  const synced = state.pending.length - remaining.length;
  state.pending = remaining;
  writeJson(KEYS.pending, remaining);
  updateCloudState(remaining.length ? "offline" : "online");
  if (synced) showToast(`${synced} pending entr${synced === 1 ? "y" : "ies"} synced.`);
}

function showSuccess(type, result, queued) {
  const normalized = normalizeRpcResult(result);
  el.successTitle.textContent = queued ? "Saved on this device" : type === "invoice" ? "Invoice saved" : "Payment saved";
  const reference = normalized.reference || normalized.invoice_no || normalized.payment_no || normalized.id || "Saved";
  const total = normalized.total ?? normalized.amount ?? 0;
  el.successMessage.textContent = `${reference} · ${cleanName(el.customerName.value)} · ${formatMoney(total)}`
    + (queued ? " · Will sync when online" : "");
  el.successDialog.showModal();
}

export function resetAfterSuccess() {
  el.successDialog.close();
  state.invoiceItems.clear();
  state.customer = null;
  el.customerName.value = "";
  el.clearCustomer.hidden = true;
  el.paymentAmount.value = "";
  el.paymentNote.value = "";
  el.paymentBalance.hidden = true;
  el.transactionDate.value = todayLocal();
  renderInvoice();
  updateCustomerHint();
  updateActionBar();
  el.customerName.focus();
}

function entryTotal(entry) {
  return entry.type === "invoice"
    ? entry.payload.items.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    : entry.payload.amount;
}

function extractBalanceFromResult(result) {
  const normalized = normalizeRpcResult(result);
  return Number(normalized.customer_balance || normalized.balance || 0);
}
