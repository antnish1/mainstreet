import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase-config.js";

const BASE_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
};

export class SupabaseApiError extends Error {
  constructor(message, status = 0, code = "") {
    super(message);
    this.name = "SupabaseApiError";
    this.status = status;
    this.code = code;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: { ...BASE_HEADERS, ...(options.headers || {}) },
    });
  } catch (error) {
    throw new SupabaseApiError("Network unavailable. Your entry can be queued on this device.", 0, "NETWORK");
  }

  const text = await response.text();
  const payload = text ? safeJson(text) : null;
  if (!response.ok) {
    const message = payload?.message || payload?.hint || `Supabase request failed (${response.status})`;
    throw new SupabaseApiError(message, response.status, payload?.code || "");
  }
  return payload;
}

function safeJson(value) {
  try { return JSON.parse(value); } catch { return value; }
}

export function staffLogin(pin) {
  return request("rpc/staff_login", {
    method: "POST",
    body: JSON.stringify({ p_pin: pin }),
  });
}

export function searchCustomers(token, query) {
  return request("rpc/search_customers", {
    method: "POST",
    body: JSON.stringify({ p_token: token, p_query: query }),
  });
}

export function getCustomerBalance(token, customerName) {
  return request("rpc/get_customer_balance", {
    method: "POST",
    body: JSON.stringify({ p_token: token, p_customer_name: customerName }),
  });
}

export function getMenuItems() {
  return request("menu_items?select=id,category,name,full_rate&is_active=eq.true&order=category.asc,name.asc", {
    method: "GET",
  });
}

export function createInvoice(token, payload) {
  return request("rpc/create_invoice_transaction", {
    method: "POST",
    body: JSON.stringify({
      p_token: token,
      p_client_reference: payload.clientReference,
      p_invoice_date: payload.date,
      p_customer_name: payload.customerName,
      p_items: payload.items,
    }),
  });
}

export function createPayment(token, payload) {
  return request("rpc/create_payment_transaction", {
    method: "POST",
    body: JSON.stringify({
      p_token: token,
      p_client_reference: payload.clientReference,
      p_payment_date: payload.date,
      p_customer_name: payload.customerName,
      p_amount: payload.amount,
      p_note: payload.note || "",
    }),
  });
}

export function getReports(token, fromDate, toDate) {
  return request("rpc/get_transaction_report", {
    method: "POST",
    body: JSON.stringify({ p_token: token, p_from: fromDate, p_to: toDate }),
  });
}

export function changeStaffPin(token, currentPin, newPin) {
  return request("rpc/change_staff_pin", {
    method: "POST",
    body: JSON.stringify({ p_token: token, p_current_pin: currentPin, p_new_pin: newPin }),
  });
}
