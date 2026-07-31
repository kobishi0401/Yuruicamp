# Yuruicamp

Camping gear e-commerce with site bookings, Admin operations, ECPay payments, and domestic logistics.

## Language

### Orders & fulfillment

**Order Status**:
Business fulfillment state on the order (`unshipped`, `shipped`, `completed`, `cancelled`, `returned`, …). Changed by Admin actions or existing business rules—not by raw carrier callbacks alone.
_Avoid_: logistics status, 出貨狀態（當綠界碼用）

**Ship**:
Admin action that moves an order from `unshipped` to `shipped`, and may create a Logistics Order with ECPay for `cvs` / `delivery`.
_Avoid_: 列印託運單, print label

**Logistics Order**:
The ECPay logistics booking identified by `AllPayLogisticsID`, stored as the order’s logistics id after Ship.
_Avoid_: 託運單, 出貨單, Trade Document

**Trade Document**:
The printable ECPay waybill/label opened via `printTradeDocument`（UI：列印託運單）.
_Avoid_: 物流單, 出貨單, Logistics Order

**Logistics Status Snapshot**:
The latest ECPay notify `RtnCode` / `RtnMsg` (and time) overwritten onto the order for Admin display. Not Order Status.
_Avoid_: Order Status, auto-complete

### Shipping methods

**cvs**:
Buyer store-pickup logistics via ECPay CVS (FamilyMart FAMI in current scope).
_Avoid_: ecpay-cvs (that is a **payment** method)

**delivery**:
Home delivery; Admin Ship creates ECPay HOME/TCAT Logistics Order.

**pickup**:
Own-branch pickup; does not call ECPay logistics.
