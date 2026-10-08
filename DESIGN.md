# FINTRACK — Web App Design System v2.0

> **Redesign Directive**: The previous dark glassmorphism version was scrapped. This document defines the new, optimal design direction, rebuilt from the ground up to match the reference banking dashboard (Agibankz by Dashboard Delibix) — a **light, airy, lime-green premium fintech** aesthetic that converts better, reads faster, and feels trustworthy.

---

## 1. Core Aesthetic & Concept

- **Theme**: Modern Lending/Finance Dashboard, light-mode-first, minimal, confident.
- **Visual Style**: **Soft Light UI** — white/off-white surfaces, generous whitespace, subtle drop shadows, large rounded corners (18–28px), a signature **lime-green primary accent**, and one signature "hero card" in saturated green for the most important metric.
- **Vibe**: Clean like a neobank, trustworthy like a ledger. Calm, not flashy. No gradients-for-the-sake-of-gradients, no glowing neon tubes, no frosted glass.
- **Reference DNA preserved from image**:
  - Light-gray app canvas with a floating white rounded "app shell" card.
  - Pill-shaped **segmented tabs** (e.g., Overview / Wealth / Cards / Tools).
  - Dark-green **solid pill buttons** ("Transfer Balance") with outlined secondary buttons ("Request Balance").
  - One **big, loud lime-green card** used as the visual anchor (in FINTRACK: "Total Portfolio" hero card).
  - Circular donut charts, horizontal progress bars, clean list rows with icon + title + amount.
- **Layout Rhythm**: Card grid with 8pt spacing system; primary divisions ~62/38 (Golden Ratio) for main/sidebar columns.

---

## 2. Color Palette (60-30-10)

Light mode as the default and only mode for v2.0 (no dark-mode toggle until Phase 2).

| Role | Color | Hex | Usage |
| --- | --- | --- | --- |
| **60% Dominant** | App Canvas | `#ECECEC` | Full page background behind the app shell |
|  | Surface / App Shell | `#FFFFFF` | Main floating card, panels |
|  | Soft Surface | `#F6F6F6` | Sub-cards, hover states, table zebra rows |
| **30% Secondary** | Border / Divider | `#E4E4E4` | Card borders, hairlines |
|  | Text Primary | `#17181C` | Headings, amounts |
|  | Text Secondary | `#5F6368` | Labels, metadata, timestamps |
|  | Text Muted | `#9AA0A6` | Placeholders, captions |
| **10% Accent** | **Signature Lime** | `#A3E635` | Hero card, positive deltas, active segments |
|  | **Deep Green** | `#1E4620` / `#14532D` | Primary solid buttons, active states, success text on lime |
|  | Indigo | `#6366F1` | Secondary chart series, informational badges |
|  | **Coral / Red** | `#F43F5E` | Overdue, NPA, negative deltas, destructive actions |
|  | Amber | `#F59E0B` | Pending / due-soon status only |

**Rules**

- Lime is a *surface* accent (large areas), Deep Green is an *action* accent (buttons, text on lime).
- Red appears only for true problem states. Never use red for decorative purposes.
- All success numbers use Deep Green text; never lime-on-white text (fails contrast).

---

## 3. Typography

- **Display & Headings**: `Outfit` (600/700)
- **Body, Data & Numbers**: `Plus Jakarta Sans` or `Inter` — tabular numerals (`font-feature-settings: "tnum"`) for all currency.
- **Scale (Golden Ratio × 1.618, base 14px)**:
  - Body: 14px / 20px
  - H4 / Card titles: 20px
  - H3 / Section headers: 22px
  - H2: 32px
  - **Hero Metric (Total Outstanding)**: 44–52px / tight leading, weight 700
- Currency formatting: INR `₹92,142.10`, tabular, aligned right in tables.

---

## 4. Global Layout (The App Shell)

Mirrors the reference image exactly:

```
┌──────────────────────────────────────────────────────────────┐
│ [LOGO] FINTRACK        [Overview][Tracker][Customers][…]  🔍 🔔 │
├──────────────────────────────┬───────────────────────────────┤
│  HERO METRIC CARD (white)    │  SIGNATURE LIME HERO CARD     │
│  Account / Total Outstanding │  Today's Collections + CTA    │
├──────────────────────────────┼───────────────────────────────┤
│  Donut: Spending by Category │  Transactions / Due-EMI List  │
│  Progress bars: Earning src  │  (scrollable, row actions)    │
└──────────────────────────────┴───────────────────────────────┘
```

- **App shell**: white, radius 28px, subtle shadow `0 8px 40px rgba(0,0,0,0.08)`, floating on `#ECECEC` canvas.
- **Header**: logo left; **segmented pill nav** center (active segment = lime fill, deep-green text, radius 999px); search + notification bell right.
- **Grid**: 12-col, gutter 16px; content padding 24–32px.
- **Ratio**: primary column ≈ 62%, secondary ≈ 38%.

---

## 5. Component Library

### 5.1 Buttons

- **Primary (Solid Deep Green)**: `#14532D` fill, white text, radius 999px, height 40–44px, soft shadow on hover, subtle press scale (0.98).
- **Secondary (Outlined)**: white fill, 1px `#D7D7D7` border, dark text, radius 999px.
- **Icon Button (circle)**: 44px circle, soft surface bg, 1px border; used for "↗ expand" style actions.
- **Destructive**: coral text/outline, never solid coral fill except final-confirm.

### 5.2 Cards

- Radius 20–24px, white or `#F6F6F6`, 1px `#ECECEC` border, shadow `0 2px 12px rgba(0,0,0,0.04)`.
- **Hero Lime Card**: `#A3E635` fill, deep-green text, radius 24px, optional faint decorative circle pattern at low opacity; contains metric + mini-stats row (mirrors the reference's green card).
- **Status Pills**: radius 999px — Active `#DCFCE7`/`#166534`, Due-soon `#FEF3C7`/`#92400E`, Overdue `#FEE2E2`/`#B91C1C`, Closed `#E5E7EB`/`#374151`.

### 5.3 Navigation — Segmented Pill Tabs

Reference-style pill group: rounded container `#F0F0F0`, active item lime `#A3E635` with dark-green label, animated slide indicator, 200ms ease-out.

### 5.4 Charts

- **Donut**: thick stroke (14–18px), lime for positive, neutral gray for remainder, center label = amount + delta badge.
- **Progress bars**: rounded caps, lime fill on soft-gray track; percentage chip overlaid at fill edge.
- **Area chart**: single indigo series, smooth monotone curve, fill fading to transparent, no gridline clutter (max 3 horizontal guides).
- All deltas shown as small pills: `+40% this month` on lime / `-8%` on soft red.

### 5.5 Lists & Tables

- Transaction row: 36px rounded-square icon tile (brand gray) + title/subtitle + right-aligned amount (green `+` / black `-`) + optional status dot.
- Reports table: soft zebra rows (`#FAFAFA` / white), no vertical borders, right-aligned numerics, sticky header on scroll.

### 5.6 Inputs & Modals

- Inputs: white, 1px `#E4E4E4` border, radius 12px, focus = 2px deep-green ring.
- Modals / drawers: white sheet, radius 24px top, backdrop `rgba(15,17,20,0.4)` with light blur; slide-up animation 250ms.
- PIN screen (mobile): white card on light canvas, lime accent underline inputs; error = coral border + gentle shake (400ms).

---

## 6. Screen Blueprints (rebuilt for light UI)

### 6.1 Dashboard (Golden Layout)

- **Left (62%)**: Hero metric card (Total Outstanding, tabular 48px, eye toggle to hide balance, "Collect Payment" primary pill + "Add Loan" secondary). Below: area chart (collections, 7/30-day toggle segmented pill). Below: 3 stat mini-cards — Collected Today / Active Loans / NPA Count.
- **Right (38%)**: **Lime hero card** — "Today's Collections" big number, delta pill, mini-stats (EMIs due / settled). Below: scrollable "Recent Activity" list with gradient-free initial avatars (soft gray tiles), coral dot for overdue entries.

### 6.2 Tracker / Daily Collections

- Horizontal date timeline (pill cards, selected = lime).
- EMI rows: three visual states exactly per reference logic — **Due** = white/gray glass-like row; **Paid** = lime left-border + deep-green "Collected 10:42 AM" stamp; **Overdue** = coral pulse badge with days overdue.
- Swipe actions: right = Mark Collected (green), left = Reminder (outline).

### 6.3 Customer Directory

- Search bar + status filter pills (All / Active / Overdue / Closed).
- Grid of profile cards: soft-gray avatar tile with initials, name, occupation, phone (tel: link), status pill.
- Empty state: outlined illustration + solid green "Add First Customer" pill.

### 6.4 Customer Profile / Loan Details

- Header banner card: avatar, name, contact, aggregate "Total Pending".
- Segmented pill tabs: Active Loans / Closed Loans / Payment History.
- Active loan: rounded progress bar (lime), metrics grid (Principal, Rate, Total Payable, Pending), big solid-green "Collect EMI" button opening a bottom-sheet modal with amount input + method chips.

### 6.5 Reports & Records

- Filter bar: date-range picker, status dropdown, loan-type chips.
- Clean table per §5.5; top-right ghost buttons "Download PDF" / "Export CSV".
- Summary strip above table: Total Collected / Total Pending / Overdue Amount.

### 6.6 Settings & Sync

- Grouped white cards: Account, Backup & Sync, Preferences.
- **Sync card**: "Last synced 2 min ago" + circular progress on manual sync (lime arc).
- iOS-style toggles: lime track when on, gray when off.

---

## 7. Motion & Interactions

- Durations: micro 150ms, standard 250ms, page 350ms; easing `cubic-bezier(0.4, 0, 0.2, 1)`.
- Segmented tab indicator slides; numbers count-up on hero cards (600ms).
- Skeleton loaders: soft-gray shimmer, never spinners for card content.
- Reduced-motion respected globally.

## 8. Do / Don't

- ✅ Do use the lime hero card for ONE flagship metric per screen.
- ✅ Do keep contrast ≥ 4.5:1 for all text.
- ❌ Don't reuse old dark-glass styles, neon glows, or blurred orbs.
- ❌ Don't put more than 3 accent colors on a single card.
- ❌ Don't use gradients on buttons — solid deep green only.

## 9. Accessibility & Quality Bar

- WCAG AA contrast; full keyboard navigation; focus rings visible.
- Every amount screen-reader labeled ("Total outstanding 9 lakh 21 thousand").
- Touch targets ≥ 44px.
