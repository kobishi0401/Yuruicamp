# AdminProductsPage Spec

**Status:** Implemented for G-2c Backend integration; legacy page spec retained
**Category:** Page
**Design Ref:** N/A - derived from existing source file `admin/partials/products.html`

> G-2c 已在現有 Bootstrap Admin shell 內完成 Mock／Backend 雙模式。**ADM-W2-08（✅）**：Backend 商品 Modal 可編各分店 on-hand（`stockLocations`）；規格說明隱藏並由顏色／尺寸組字；存檔後 pending →「產生異動紀錄」一鍵稽核（明細帶 `lineNature` 推導預設）。**分類／品牌主檔（W2-01／02）**：工具列單一「分類／品牌」按鈕 → Modal 內 tab 切換維護；無說明文。**租借上架 Modal（W2-04 UI）**：一次列出全部規格卡；每卡一組平日／假日價＋勾選上架營區（C002–C009，不含主倉）；`discount` 固定 0；不編輯裝備規格／標籤。調撥另見 W2-05／G-3。互動驗收見 [`../test/admin-validation.md`](../test/admin-validation.md)，API 契約見 [`../../api/admin-api-contract.md`](../../api/admin-api-contract.md) **v0.18**。

---

## Overview

Admin product and rental inventory partial with product tables, rental transfer modal, movement generation, and min-stock controls. Use for product inventory maintenance. Preserve stock column contracts and modal reuse.

## TypeScript Interface

```typescript
export type PageShellVariant = 'main' | 'booking' | 'admin';

export interface NavigationPayload {
  href: string;
  label: string;
  source: 'AdminProductsPage';
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

export interface AdminProductsPageData {
  title: string;
  sourcePath: 'admin/partials/products.html';
  keyAreas: string[];
  blocks?: ContentBlock[];
}

export interface AdminProductsPageProps {
  // Required props
  shell: 'admin'; // Page shell variant used by this source page.
  data: AdminProductsPageData; // Initial page content, records, or mounted section metadata.

  // Optional props
  currentUser?: UserSummary | null; // Logged-in user context. default: null
  loading?: boolean; // Shows skeleton or loading state. default: false
  errorMessage?: string | null; // User-facing error message. default: null

  // Event handlers
  onNavigate?: (payload: NavigationPayload) => void;
  onRefresh?: (sourcePath: 'admin/partials/products.html') => void;

  // Render props / slots
  headerSlot?: React.ReactNode;
  footerSlot?: React.ReactNode;
  actionSlot?: React.ReactNode;
}
```

## Variants

| Variant | Props | Description |
|---------|-------|-------------|
| Default | `shell="admin"` | Matches the current `admin/partials/products.html` layout and shared CSS. |
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
<AdminProductsPage
  shell="admin"
  data={{
    title: 'AdminProductsPage',
    sourcePath: 'admin/partials/products.html',
    keyAreas: 'productsModuleCard, productsTable, rentalProductsTable, transferToRentalModal'.split(', '),
  }}
/>
```

### With Optional Props

```tsx
<AdminProductsPage
  shell="admin"
  data={adminproductspageData}
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

- Source file: `admin/partials/products.html`.
- Shared CSS source: `admin/css/admin.css`.
- Shared components: admin/dashboard.html shell and admin partial loader.
- Key UI areas: productsModuleCard, productsTable, rentalProductsTable, transferToRentalModal.
- Use `docs/ai-style-sheet.md` and `docs/ai-style-tokens.css` before generating new UI.
- Open question: no Figma reference is present, so existing code is the design source of truth.
- Do NOT replace the existing shell, storage keys, mock data contracts, or partial loader pattern while implementing this spec.

## Acceptance Criteria

- [ ] Renders all variants without errors
- [ ] All states are visually distinct
- [ ] Keyboard navigation works correctly
- [ ] Screen reader announces correctly
- [ ] Design tokens match the Yuruicamp AI style sheet
- [ ] Unit tests or smoke checks cover required props and primary events
