# Yuruicamp RAG Knowledge Packs

This directory contains fixed-knowledge files for the Yuruicamp LINE/MBA/n8n customer-service workflow.

The files intentionally exclude personal orders, personal bookings, live payment state, live logistics state, and live campground/rental availability. Those questions must route to APIs or human support.

## Files

- `storefront-kb.json`
  - Storefront products, categories, brands, payment methods, checkout rules, delivery/pickup notes, branches, invoice/order-status glossary.
- `booking-kb.json`
  - Campgrounds, zones, rental equipment, booking payment rules, booking policy, price tiers, status glossary, and trip-planning routing note.
- `router-intents.json`
  - Domain and intent routing rules for n8n/MBA before deciding whether to use RAG, API, clarification, planner, chat, modification handling, or human support.

## Item Format

Each RAG item uses this shape:

```json
{
  "id": "storefront.payment.methods",
  "domain": "storefront",
  "category": "付款方式",
  "intent": "payment_methods",
  "answerMode": "rag",
  "source": ["docs/api/payment-api-contract.md"],
  "question": "商城支援哪些付款方式？",
  "aliases": ["購物可以怎麼付款？"],
  "answer": "商城線上付款走綠界...",
  "relatedIds": []
}
```

For n8n PGVector import, embed a text body similar to:

```text
業務類型：{{ $json.domain }}
分類：{{ $json.category }}
意圖：{{ $json.intent }}
問題：{{ $json.question }}
常見問法：{{ $json.aliases.join('、') }}
答案：{{ $json.answer }}
關聯ID：{{ $json.relatedIds.join('、') }}
```

Recommended metadata:

- `id`
- `domain`
- `category`
- `intent`
- `answerMode`
- `source`
- `relatedIds`

## Routing Recommendation

For demo stability, import storefront and booking into separate vector stores or collections:

- `storefront_kb`
- `booking_kb`

Then route before retrieval:

1. Domain router:
   - `storefront`
   - `booking`
   - `ambiguous`
   - `chat`
2. Intent router:
   - `rag`
   - `api`
   - `clarify`
   - `planner`
   - `modify_request`
   - `human`

Do not retrieve from both storefront and booking knowledge bases for ambiguous questions such as "支援哪些付款方式？" Ask a clarification question first.

## Must Not Use RAG Alone

These questions require API/tooling:

- "我的訂單出貨了嗎？"
- "我的付款成功了嗎？"
- "物流進度在哪裡？"
- "我的露營預約成功了嗎？"
- "下週六還有營位嗎？"
- "那天還有 Coleman 六人帳篷可以租嗎？"
- "系統失敗但款項已扣怎麼辦？"
- "我想修改配送地址、門市、收件人或電話。"
- "我想修改商品規格、商品數量、預約日期、營位、入住人數或租借裝備。"

Use RAG only to explain general rules. Use APIs for personal or live state.

## Modification Requests

Modification requests use intent `modify_request`.

RAG may explain general policy:

- Storefront unpaid checkout can update shipping, pickup branch, recipient, phone, payment method, and coupon.
- Storefront item quantity/spec changes cannot be patched directly; the usual path is cancel and recreate checkout.
- Booking date, zone, guest count, and rental changes require booking lookup and availability checks.

For any request involving "my order", "my booking", a specific order, or an actual change, route to API or human support before answering whether the change is possible.

## Source Priority

Knowledge was organized from:

1. API contracts under `docs/api/`
2. Development seed SQL under `docs/seed/dev/`
3. Frontend catalog JSON under `frontend/data/catalog/`
4. Old FAQ only as question/alias inspiration, not as answer authority

Known old-FAQ conflicts excluded:

- LINE Pay / Apple Pay are not included as supported payment methods.
- Booking COD is explicitly excluded.
- Unconfirmed deposit rules are not included.
