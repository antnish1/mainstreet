# Mainstreet Billing

A compact mobile-first billing PWA for **Mainstreet Meals & Coffee**.

## Current first-page scope

- Editable invoice date, defaulting to today.
- Customer autocomplete after two characters.
- New customers are automatically saved on the device.
- Menu items generated from `Menu-data.xlsx`.
- Half and full quantity buttons:
  - Half = `0.5 × full rate`
  - Full = `1 × full rate`
  - Repeated taps accumulate quantities and value.
- Invoice total and local invoice history.
- Payment-only mode for receiving money against old bills.
- Customer balance calculated from invoices minus payments saved on the device.
- Offline-ready PWA shell.

## Run locally

No build step is required.

```bash
python -m http.server 8080
```

Open `http://localhost:8080`.

## Data storage

This first version uses browser `localStorage` so it works immediately without backend credentials. The storage keys are:

- `mainstreet.customers.v1`
- `mainstreet.transactions.v1`

A shared cloud database can replace this layer in a later phase.
