# Finance Tracker Web App - Complete Information

This document provides a comprehensive overview of the Finance Tracker Web App located in this directory, summarizing its purpose, technical architecture, design system, and business logic.

## 1. Overview
The **Finance Tracker** is a Progressive Web Application (PWA) designed for individual money lenders and micro-finance operators. It digitizes the traditional paper-ledger system, allowing lenders to track customers, manage loans, monitor EMI schedules, record daily/weekly/monthly collections, and generate business reports. It features offline-first functionality and multi-device synchronization.

## 2. Technical Stack
- **Framework:** React (v19) + TypeScript + Vite
- **Routing:** React Router DOM (v7)
- **Styling:** Tailwind CSS (v3.4) with utility libraries like `tailwind-merge` and `clsx`.
- **Animations:** Framer Motion (`framer-motion`) and `tsparticles` for background effects.
- **Icons:** Lucide React (`lucide-react`)
- **Database & State:** 
  - **Local DB (Offline-First):** Dexie.js (IndexedDB wrapper) for fast local reads/writes.
  - **Cloud Sync & Auth:** Firebase (Auth, Firestore for persistent local cache, Analytics).
- **Data Visualization:** Recharts (`recharts`)
- **PDF Generation:** `jspdf` and `jspdf-autotable` for reporting.
- **PWA Support:** `vite-plugin-pwa` for offline capabilities and installation.
- **Testing:** Vitest and Testing Library.
- **Linting:** ESLint with TypeScript plugins (`@eslint/js`, `typescript-eslint`).

## 3. Database Schema (Dexie & Firestore)
The database structure is centered around core entities that manage the lending process, each implementing a `Syncable` interface for Firebase synchronization.

- **Customers:** Tracks `id`, `name`, `phone(s)`, `address(es)`, `occupation`, `aadhaar`, `pan`, and active status.
- **Loans:** Linked to a `customerId`. Includes `amount`, `rate`, `type` (daily/weekly/monthly), `tenure`, `startDate`, `emiAmount`, `totalPayable`, `paidAmount`, `pendingAmount`, and `status` (active, closed, overdue, npa).
- **EMIs:** Tracks individual installments with `dueDate`, `emiAmount`, `status` (pending, paid, overdue, partial), and `paidAmount`.
- **Collections:** Records individual payments (`amount`, `date`, `mode` [cash/upi/bank/cheque], and `note`).
- **BackupLogs:** Tracks database backups.

## 4. Business Logic & Rules
- **Loan Types:** Daily, Weekly, Monthly.
- **Interest Calculation:** Simple interest model, with options for custom plans and discounts.
- **Status Lifecycle:** `ACTIVE → OVERDUE → NPA → CLOSED`. NPAs (Non-Performing Assets) are manually flagged.
- **Data Integrity:** Cascading soft-deletes are used. Deleting a customer soft-deletes their loans, EMIs, and collections, ensuring recoverability.
- **Offline-First:** All modifications happen via Dexie.js locally and sync to Firebase when online, supporting areas with poor connectivity.

## 5. Design System (Premium Fintech)
The UI follows a highly specific, premium design document (`DESIGN.md`):
- **Aesthetic:** Premium Fintech, Ultra-Modern, Minimalistic.
- **Visual Style:** Glassmorphism (translucent panels, background blurs, glowing accents).
- **Golden Ratio (1.618):** Used strictly for typography scaling, layout divisions (e.g., 62/38 split), and component spacing.
- **Color Palette (60-30-10 Rule):**
  - **60% Base:** Deep Obsidian / Midnight Slate (dark mode base).
  - **30% Secondary:** Glass surfaces and typography (Soft Silver `#E2E8F0`, Cool Slate `#94A3B8`).
  - **10% Accents:** Electric Emerald (`#10B981`) for success/primary, Electric Indigo (`#6366F1`) for highlights, Neon Coral (`#F43F5E`) for warnings/overdue.
- **Typography:** `Outfit` for headings/display, and `Plus Jakarta Sans` or `Inter` for body/data.

## 6. Project Structure (`src/`)
- `assets/`: Static assets (images, global CSS if any).
- `components/`: Reusable React components (UI elements, glassmorphic cards, forms).
- `hooks/`: Custom React hooks (e.g., for syncing, auth, or DB queries).
- `lib/`: Utility libraries and 3rd-party wrappers.
- `pages/`: Page components (Dashboard, Customer Directory, Loans, Tracker, Auth).
- `services/`: API or synchronization services (connecting Dexie to Firebase).
- `utils/`: Helper functions (date formatting, currency formatting).
- `db.ts`: Dexie database schema and class definition.
- `firebase.ts`: Firebase initialization and config.

This repository serves as the complete digital solution replacing physical notebooks, minimizing data loss, automating calculations, and providing real-time portfolio health monitoring.
