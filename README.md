# FINTRACK — Finance Tracker Web App


FINTRACK is a Progressive Web Application (PWA) designed for individual money lenders and micro-finance operators. It digitizes the traditional paper-ledger system, allowing lenders to track customers, manage loans, monitor EMI schedules, record collections, and generate business reports. It features offline-first functionality and multi-device synchronization.

## Key Features

- **Customer Management**: Detailed profiles tracking contact info, KYC (Aadhaar, PAN), and active status.
- **Loan Tracking**: Support for Daily, Weekly, and Monthly loans with simple interest calculation.
- **Automated EMIs**: Tracks individual installments, dues, and overdue statuses.
- **Offline-First**: Built with Dexie.js (IndexedDB) for seamless use in low-connectivity areas.
- **Cloud Sync**: Firebase integration ensures data is synchronized across devices when online.
- **Premium Fintech UI**: A stunning light and dark mode aesthetic with a signature lime-green accent, glassmorphic elements, and Golden Ratio layouts.
- **Installable PWA**: Can be installed on mobile or desktop devices natively.
- **PDF Reports**: Export customer and loan summaries instantly.

## Technology Stack

- **Frontend**: React (v19) + TypeScript + Vite
- **Styling**: Tailwind CSS (v3.4) + Framer Motion
- **Database & Sync**: Dexie.js (Local) + Firebase (Cloud)
- **Visuals**: Recharts (Charts) + Lucide React (Icons)
- **PWA**: vite-plugin-pwa

## Design System

FINTRACK follows a highly specific **Premium Fintech** design language (v2.0):
- **Soft Light UI**: Generous whitespace, soft drop shadows, and 28px rounded corners.
- **Colors**: Dominant light surfaces (`#ECECEC` / `#FFFFFF`), signature **Lime Accent (`#A3E635`)** for key metrics, and Deep Green (`#1E4620`) for actions.
- **Typography**: `Outfit` for headings, `Plus Jakarta Sans`/`Inter` for tabular data.
- **Layout Rhythm**: Built on the Golden Ratio (1.618).

## Local Development

1. **Clone the repository:**
   ```bash
   git clone <your-repository-url>
   cd FINTRACK
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment:**
   Create a `.env` file in the root directory and add your Firebase configuration:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

## Deployment (Vercel)

FINTRACK is configured for zero-config deployment on Vercel:

1. Push your code to GitHub.
2. Import the repository in your Vercel Dashboard.
3. Vercel will automatically detect the **Vite** framework.
4. Add the `VITE_FIREBASE_*` environment variables in the Vercel project settings.
5. Deploy! The included `vercel.json` ensures client-side routing works perfectly.

## License

This project is proprietary and confidential.
