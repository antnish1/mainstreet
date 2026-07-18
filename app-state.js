import { MENU_ITEMS as LOCAL_MENU_ITEMS } from "./menu-data.js";

export const KEYS = {
  session: "mainstreet.staff-session.v2",
  pending: "mainstreet.pending-sync.v2",
  customers: "mainstreet.customer-cache.v2",
};

export const CATEGORY_ICONS = {
  Starters: "🥟", "Fried Rice": "🍚", Noodles: "🍜", Pasta: "🍝",
  Burgers: "🍔", Sandwiches: "🥪", "Snacks/Fries": "🍟", Maggi: "🍲",
  Momos: "🥟", Water: "💧", Cigarette: "▥", Biscuits: "🍪", Tea: "☕",
  "Cold Coffee": "🥤", Torando: "🌪️", Mojito: "🍹", Custom: "✦",
};

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

const storedSession = readJson(KEYS.session, null);

export const state = {
  view: "invoice",
  sessionToken: storedSession?.token || null,
  sessionExpiresAt: storedSession?.expires_at || null,
  menuItems: LOCAL_MENU_ITEMS.map((item) => ({ ...item })),
  invoiceItems: new Map(),
  customer: null,
  selectedCategory: null,
  customerSearchTimer: null,
  customerBalanceTimer: null,
  pending: readJson(KEYS.pending, []),
  customerCache: readJson(KEYS.customers, []),
  cloudState: "checking",
  saving: false,
};

const q = (selector) => document.querySelector(selector);

export const el = {
  loginScreen: q("#loginScreen"), loginForm: q("#loginForm"), loginButton: q("#loginButton"),
  staffPin: q("#staffPin"), loginError: q("#loginError"), appShell: q("#appShell"),
  cloudStatus: q("#cloudStatus"), cloudStatusText: q("#cloudStatus .status-text"),
  tabs: [...document.querySelectorAll(".tab-button")], transactionHeader: q("#transactionHeader"),
  transactionDate: q("#transactionDate"), customerName: q("#customerName"), clearCustomer: q("#clearCustomer"),
  customerSuggestions: q("#customerSuggestions"), customerHint: q("#customerHint"),
  invoiceView: q("#invoiceView"), paymentView: q("#paymentView"), reportView: q("#reportView"),
  openMenu: q("#openMenu"), clearInvoice: q("#clearInvoice"), emptyInvoice: q("#emptyInvoice"),
  invoiceItems: q("#invoiceItems"), rowTemplate: q("#invoiceRowTemplate"),
  paymentAmount: q("#paymentAmount"), paymentNote: q("#paymentNote"), paymentBalance: q("#paymentBalance"),
  actionBar: q("#actionBar"), actionLabel: q("#actionLabel"), actionTotal: q("#actionTotal"),
  submitTransaction: q("#submitTransaction"), menuDialog: q("#menuDialog"),
  menuDialogTitle: q("#menuDialogTitle"), menuBack: q("#menuBack"), closeMenu: q("#closeMenu"),
  doneMenu: q("#doneMenu"), menuSearch: q("#menuSearch"), clearMenuSearch: q("#clearMenuSearch"),
  categoryGrid: q("#categoryGrid"), menuItemList: q("#menuItemList"), selectedItemCount: q("#selectedItemCount"),
  addCustomItem: q("#addCustomItem"), customItemDialog: q("#customItemDialog"),
  customItemForm: q("#customItemForm"), customItemName: q("#customItemName"), customItemRate: q("#customItemRate"),
  successDialog: q("#successDialog"), successTitle: q("#successTitle"), successMessage: q("#successMessage"),
  newTransaction: q("#newTransaction"), reportFrom: q("#reportFrom"), reportTo: q("#reportTo"),
  refreshReport: q("#refreshReport"), quickRanges: [...document.querySelectorAll("[data-range]")],
  reportSales: q("#reportSales"), reportPayments: q("#reportPayments"), reportNet: q("#reportNet"),
  reportCount: q("#reportCount"), reportLoading: q("#reportLoading"), reportEmpty: q("#reportEmpty"),
  reportList: q("#reportList"), changePinForm: q("#changePinForm"), currentPin: q("#currentPin"),
  newPin: q("#newPin"), toastRegion: q("#toastRegion"),
};
