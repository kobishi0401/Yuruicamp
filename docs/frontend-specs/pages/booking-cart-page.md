# BookingCartPage Spec

**Status:** Implemented (B3 2026-07-26)
**Category:** Page
**Design Ref:** N/A - derived from existing source file `booking/pages/booking-cart.html`

---

## Overview

Booking cart review page with stay card, rental card, cost rows, edit links, and checkout CTA. Use before booking checkout. Keep empty state, clear cart action, and cost summary stable.

## TypeScript Interface

```typescript
export type PageShellVariant = 'main' | 'booking' | 'admin';

export interface NavigationPayload {
  href: string;
  label: string;
  source: 'BookingCartPage';
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

export interface BookingCartPageData {
  title: string;
  sourcePath: 'booking/pages/booking-cart.html';
  keyAreas: string[];
  blocks?: ContentBlock[];
}

export interface BookingCartPageProps {
  // Required props
  shell: 'booking'; // Page shell variant used by this source page.
  data: BookingCartPageData; // Initial page content, records, or mounted section metadata.

  // Optional props
  currentUser?: UserSummary | null; // Logged-in user context. default: null
  loading?: boolean; // Shows skeleton or loading state. default: false
  errorMessage?: string | null; // User-facing error message. default: null

  // Event handlers
  onNavigate?: (payload: NavigationPayload) => void;
  onRefresh?: (sourcePath: 'booking/pages/booking-cart.html') => void;

  // Render props / slots
  headerSlot?: React.ReactNode;
  footerSlot?: React.ReactNode;
  actionSlot?: React.ReactNode;
}
```

## Variants

| Variant | Props | Description |
|---------|-------|-------------|
| Default | `shell="booking"` | Matches the current `booking/pages/booking-cart.html` layout and shared CSS. |
| Loading | `loading={true}` | Keeps the page skeleton stable while data or partial content loads. |
| Empty | `data.blocks=[]` | Shows a helpful empty state without collapsing the page frame. |
| Error | `errorMessage="..."` | Shows a localized error message and a retry path. |

## States

| State | Trigger | Visual Change |
|-------|---------|---------------|
| Default | Page loaded | Primary content areas render with Yuruicamp green tokens and existing spacing. |
| Hover | Interactive card, row, tab, or button hover | Border, shadow, or background changes without layout shift. |
| Active | Selected tab, filter, nav item, or table row | Uses `--yc-sage-action` or `--yc-sage-soft` plus text label. |
| Disabled | Unavailable action or incomplete form | Lower opacity, blocked pointer, preserved element dimensions. |
| Loading | `loading={true}` | Skeleton rows, disabled submit buttons, or stable placeholder blocks. |
| Error | `errorMessage` exists | Inline alert near the failed area and retry action when possible. |

## Design Tokens

```typescript
const spacing = {
  pagePadding: 'clamp(24px, 5vw, 64px)',
  sectionGap: '24px',
  controlGap: '8px',
};

const typography = {
  bodyFontSize: '16px',
  bodyLineHeight: '1.5',
  headingWeight: '700',
};

const colors = {
  background: 'var(--yc-bg)',
  surface: 'var(--yc-surface)',
  text: 'var(--yc-text)',
  mutedText: 'var(--yc-text-muted)',
  border: 'var(--yc-border)',
  focus: 'var(--yc-sage-action)',
};
```

## Usage Examples

### Basic

```tsx
<BookingCartPage
  shell="booking"
  data={{
    title: 'BookingCartPage',
    sourcePath: 'booking/pages/booking-cart.html',
    keyAreas: 'cartEmptyBooking, cartStayCardBooking, cartRentalCardBooking, cartCostRowsBooking'.split(', '),
  }}
/>
```

### With Optional Props

```tsx
<BookingCartPage
  shell="booking"
  data={bookingcartpageData}
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

- Source file: `booking/pages/booking-cart.html`.
- Shared CSS source: `booking/css/*.css`.
- Shared components: components/header.partial, components/footer.partial through booking layout loader.
- **Shared scripts:** must load `/booking/js/booking-core-scripts.js`（見 [`booking-shared-scripts.md`](../booking-shared-scripts.md)），確保 `window.AppConfig` 存在。
- Key UI areas: cartEmptyBooking, cartStayCardBooking, cartRentalCardBooking, cartCostRowsBooking.
- Use `docs/ai-style-sheet.md` and `docs/ai-style-tokens.css` before generating new UI.
- Open question: no Figma reference is present, so existing code is the design source of truth.
- Do NOT replace the existing shell, storage keys, mock data contracts, or partial loader pattern while implementing this spec.
- Rental quantity supports both stepper buttons and direct integer input from 1 to 20; either path recalculates totals and persists the cart (**soft validation only**; no Booking Checkout Session on this page — B3).
- Clearing the cart removes `bookingCart` and its prepared session, then shows「沒有預約營地、租賃裝備請前往預約首頁預約。」with a link to the booking home.

## Acceptance Criteria

- [ ] Renders all variants without errors
- [ ] All states are visually distinct
- [ ] Keyboard navigation works correctly
- [ ] Screen reader announces correctly
- [ ] Design tokens match the Yuruicamp AI style sheet
- [ ] Unit tests or smoke checks cover required props and primary events
- [ ] Rental quantity can be entered directly and invalid values are restored.
- [ ] Clear cart removes all booking cart data and displays the specified empty-state guidance.
