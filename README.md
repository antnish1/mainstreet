# Mainstreet Business Billing

A compact mobile-first billing application for **Mainstreet Meals & Coffee**.

## Current features

- Invoice, Payment and Report tabs
- Supabase-backed customer autocomplete, invoices, invoice items, payments and reports
- Secure staff PIN before business data can be read or written
- Search-first invoice flow with a full-screen two-column category picker
- Half and Full quantity controls inside the menu picker and current invoice
- Editable item value on every invoice line
- Automatic customer creation and live customer balance
- Payment-only entries for old bills
- Date-range reports with sales, payments, net due and activity
- Offline app shell and queued transaction sync when the connection returns
- Mobile PWA installation support

## Supabase setup

Open the Supabase project, go to **SQL Editor**, and run these files in order:

1. [`supabase/01-schema.sql`](./supabase/01-schema.sql)
2. [`supabase/02-seed-menu.sql`](./supabase/02-seed-menu.sql)
3. [`supabase/03-auth-functions.sql`](./supabase/03-auth-functions.sql)
4. [`supabase/04-transaction-functions.sql`](./supabase/04-transaction-functions.sql)

The initial staff PIN is `2580`. After opening the deployed app, go to **Report → Business security** and change it immediately.

The scripts create and configure:

- `app_settings`
- `staff_sessions`
- `customers`
- `menu_items`
- `invoices`
- `invoice_items`
- `payments`
- secured RPC functions used by the web app

Direct access to customer and transaction tables is blocked by Row Level Security. The browser uses the public Supabase anon key only to read the active menu and call PIN-protected database functions. Never add a Supabase `service_role` key to this repository or frontend code.

## Deployment

This is a static application. For Vercel use:

- Framework preset: **Other**
- Root directory: `./`
- Build command: blank
- Output directory: blank or `.`
- Install command: blank

Every push to `main` will redeploy automatically when Vercel is connected to the repository.
