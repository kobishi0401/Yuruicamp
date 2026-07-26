# BookingCheckoutPage Spec

**Status:** Draft
**Category:** Page
**Design Ref:** N/A - derived from existing source file `booking/pages/booking-checkout.html`

---

## Overview

Booking checkout page with stay details, rental details, contact info, agreement, and ECPay redirect. **B3（ADR 0002）**：`booking-cart.html` 僅 soft 驗量；**本頁**登入後才 `POST /api/booking/checkout/sessions` 建立 Session 並開始 15 分鐘 hard lock。Contact 可自動帶入或按 `#fillProfileBtn`；ECPay launch 帶 contact 快照（O2）。

## TypeScript Interface

```typescript
export type PageShellVariant = "main" | "booking" | "admin";

export interface NavigationPayload {
  href: string;
  label: string;
  source: "BookingCheckoutPage";
}

export interface UserSummary {
  id: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
}

export interface ContentBlock {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  href?: string;
}

export interface BookingCheckoutPageData {
  title: string;
  sourcePath: "booking/pages/booking-checkout.html";
  keyAreas: string[];
  blocks?: ContentBlock[];
}

export interface BookingCheckoutPageProps {
  // Required props
  shell: "booking"; // Page shell variant used by this source page.
  data: BookingCheckoutPageData; // Initial page content, records, or mounted section metadata.

  // Optional props
  currentUser?: UserSummary | null; // Logged-in user context. default: null
  loading?: boolean; // Shows skeleton or loading state. default: false
  errorMessage?: string | null; // User-facing error message. default: null

  // Event handlers
  onNavigate?: (payload: NavigationPayload) => void;
  onRefresh?: (sourcePath: "booking/pages/booking-checkout.html") => void;

  // Render props / slots
  headerSlot?: React.ReactNode;
  footerSlot?: React.ReactNode;
  actionSlot?: React.ReactNode;
}
```

## Variants

| Variant | Props                | Description                                                                      |
| ------- | -------------------- | -------------------------------------------------------------------------------- |
| Default | `shell="booking"`    | Matches the current `booking/pages/booking-checkout.html` layout and shared CSS. |
| Loading | `loading={true}`     | Keeps the page skeleton stable while data or partial content loads.              |
| Empty   | `data.blocks=[]`     | Shows a helpful empty state without collapsing the page frame.                   |
| Error   | `errorMessage="..."` | Shows a localized error message and a retry path.                                |

## States

| State    | Trigger                                      | Visual Change                                                                  |
| -------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| Default  | Page loaded                                  | Primary content areas render with Yuruicamp green tokens and existing spacing. |
| Hover    | Interactive card, row, tab, or button hover  | Border, shadow, or background changes without layout shift.                    |
| Active   | Selected tab, filter, nav item, or table row | Uses `--yc-sage-action` or `--yc-sage-soft` plus text label.                   |
| Disabled | Unavailable action or incomplete form        | Lower opacity, blocked pointer, preserved element dimensions.                  |
| Loading  | `loading={true}`                             | Skeleton rows, disabled submit buttons, or stable placeholder blocks.          |
| Error    | `errorMessage` exists                        | Inline alert near the failed area and retry action when possible.              |

## Design Tokens

```typescript
const spacing = {
  pagePadding: "clamp(24px, 5vw, 64px)",
  sectionGap: "24px",
  controlGap: "8px",
};

const typography = {
  bodyFontSize: "16px",
  bodyLineHeight: "1.5",
  headingWeight: "700",
};

const colors = {
  background: "var(--yc-bg)",
  surface: "var(--yc-surface)",
  text: "var(--yc-text)",
  mutedText: "var(--yc-text-muted)",
  border: "var(--yc-border)",
  focus: "var(--yc-sage-action)",
};
```

## Usage Examples

### Basic

```tsx
<BookingCheckoutPage
  shell="booking"
  data={{
    title: "BookingCheckoutPage",
    sourcePath: "booking/pages/booking-checkout.html",
    keyAreas:
      "panelDetails, panelContact, panelPayment, confirmPayBtn".split(", "),
  }}
/>
```

### With Optional Props

```tsx
<BookingCheckoutPage
  shell="booking"
  data={bookingcheckoutpageData}
  currentUser={currentUser}
  loading={isLoading}
  errorMessage={errorMessage}
  onNavigate={(payload) => router.push(payload.href)}
  onRefresh={(sourcePath) => reloadPageData(sourcePath)}
/>
```

## Accessibility

- **Role:** `main` for the primary content area; nested controls use native semantic elements first.
- **Keyboard:** Tab order follows visual order. Enter / Space activates buttons, tabs, accordion headers, and row actions.
- **ARIA attributes:** Use `aria-current` for current navigation, `aria-expanded` for collapsible panels, and `aria-describedby` for errors.
- **Focus management:** Modals and offcanvas panels trap focus and return focus to the opener after close.
- **Screen reader:** Announces page title, loading/error states, selected filters, and status labels as text.

## Implementation Notes

- Source file: `booking/pages/booking-checkout.html`.
- Shared CSS source: `booking/css/*.css`.
- Shared components: components/header.partial, components/footer.partial through booking layout loader.
- Key UI areas: panelDetails, panelContact, panelPayment, fillProfileBtn, confirmPayBtn.
- Contact fields stay blank on initial load and after authentication readiness; only `#fillProfileBtn` may copy the current member profile into them.
- `booking-cart.html` **does not** create the Booking Checkout Session（B3 soft only）. Session creation happens on `booking-checkout.html` after login.
- This page must not call `POST /api/booking/checkout/sessions`. It reads `lastCheckoutBooking`, verifies the saved cart fingerprint, then calls `POST /api/booking/checkout/sessions/{bookingId}/ecpay` and submits the returned `actionUrl` and signed `fields` as a hidden POST form.
- Do not collect card number, expiry, or CVV. The frontend must not store ECPay keys or generate `CheckMacValue`.
- Do not clear the booking cart or show payment success before the verified ECPay Notify completes line D.
- Use `docs/ai-style-sheet.md` and `docs/ai-style-tokens.css` before generating new UI.
- Open question: no Figma reference is present, so existing code is the design source of truth.
- Do NOT replace the existing shell, storage keys, mock data contracts, or partial loader pattern while implementing this spec.

## Acceptance Criteria

- [ ] Renders all variants without errors
- [ ] All states are visually distinct
- [ ] Keyboard navigation works correctly
- [ ] Screen reader announces correctly
- [ ] Design tokens match the Yuruicamp AI style sheet
- [ ] Contact fields are blank until `#fillProfileBtn` is selected
- [ ] The page contains no card number, expiry, or CVV inputs
- [ ] `booking-checkout.html` 進頁建立 Booking Checkout Session（B3 hard lock）
- [ ] `#confirmPayBtn` requests ECPay form with contact body and submits backend-signed form
- [ ] Unit tests or smoke checks cover required props and primary events
