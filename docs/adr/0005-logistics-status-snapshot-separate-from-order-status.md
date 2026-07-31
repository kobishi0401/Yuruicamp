# Logistics Status Snapshot is separate from Order Status

ECPay logistics notify carries carrier progress (`RtnCode` / `RtnMsg`). We persist the latest values on the order as a **Logistics Status Snapshot** for Admin display, but we do **not** auto-transition **Order Status** (for example `shipped` → `completed`) from those callbacks.

Auto-completion would couple carrier codes (FAMI vs TCAT, retries, exception cases) to business rules such as manual completion and COD settlement. Keeping completion as an explicit Admin action is easier to reason about and safer to reverse than encoding a fragile status map into notify handling.
