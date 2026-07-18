import { el, state } from "./app-state.js";
import { bindCustomerEvents, showLogin, validateStoredSession } from "./app-customer.js";
import { bindInvoiceEvents, renderCategoryGrid, renderInvoice, syncMenu } from "./app-invoice.js";
import { bindReportEvents, loadReport } from "./app-report.js";
import { bindTransactionEvents, processPendingQueue, updateActionBar } from "./app-transactions.js";
import { todayLocal, updateCloudState } from "./app-utils.js";

initialize();

async function initialize() {
  const today = todayLocal();
  el.transactionDate.value = today;
  el.reportFrom.value = today;
  el.reportTo.value = today;

  bindCustomerEvents(openApp);
  bindInvoiceEvents();
  bindTransactionEvents();
  bindReportEvents();
  bindNavigation();
  document.addEventListener("mainstreet:statechange", updateActionBar);

  renderInvoice();
  renderCategoryGrid();
  updateActionBar();
  updateCloudState("checking");

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }

  if (state.sessionToken && await validateStoredSession()) await openApp();
  else showLogin();
}

function bindNavigation() {
  el.tabs.forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
}

async function openApp() {
  el.loginScreen.hidden = true;
  el.appShell.hidden = false;
  await syncMenu();
  await processPendingQueue();
  updateActionBar();
  window.setTimeout(() => el.customerName.focus(), 100);
}

function setView(view) {
  if (!["invoice", "payment", "report"].includes(view)) return;
  state.view = view;
  el.tabs.forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  el.invoiceView.hidden = view !== "invoice";
  el.paymentView.hidden = view !== "payment";
  el.reportView.hidden = view !== "report";
  el.transactionHeader.hidden = view === "report";
  el.actionBar.hidden = view === "report";
  updateActionBar();
  if (view === "report") loadReport();
  else window.setTimeout(() => el.customerName.focus(), 80);
}
