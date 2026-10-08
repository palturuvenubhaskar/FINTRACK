/// <reference types="vite-plugin-pwa/client" />
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import ErrorBoundary from './components/ErrorBoundary'
import { registerSW } from 'virtual:pwa-register'

// Automatically reload the page when a new PWA version is available
const updateSW = registerSW({
  onNeedRefresh() {
    updateSW(true);
    window.location.reload();
  },
  onOfflineReady() {}
})

// Prevent mouse wheel from changing number input values globally
document.addEventListener('wheel', (event) => {
  const target = event.target as HTMLInputElement | null;
  if (target && target.type === 'number' && document.activeElement === target) {
    target.blur();
  }
}, { passive: false });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
