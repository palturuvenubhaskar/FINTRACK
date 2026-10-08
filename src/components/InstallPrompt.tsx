import { useState, useEffect } from 'react';
import { db } from '../db';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect platform
    const ua = window.navigator.userAgent;
    const isIOSMobile = !!ua.match(/iPad/i) || !!ua.match(/iPhone/i);
    setIsIOS(isIOSMobile);

    // Already installed as PWA?
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    if (isStandalone) return;

    // Recently dismissed?
    const dismissed = localStorage.getItem('ft_pwa_dismissed');
    if (dismissed) {
      const dismissDate = parseInt(dismissed, 10);
      if (Date.now() - dismissDate < 7 * 24 * 60 * 60 * 1000) {
        return; // wait 7 days
      }
    }

    // Listen for the native install prompt (only fires on HTTPS or localhost)
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    let checkInterval: any;
    
    // Show after 30s
    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, 30000);

    // OR after 3+ transactions
    checkInterval = setInterval(async () => {
      try {
        const loans = await db.loans.count();
        const emis = await db.emis.count();
        if (loans + emis >= 3) {
          setShowPrompt(true);
          clearInterval(checkInterval);
          clearTimeout(timer);
        }
      } catch (e) {
        // ignore
      }
    }, 5000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      clearTimeout(timer);
      clearInterval(checkInterval);
    };
  }, []);

  if (!showPrompt) return null;

  async function handleInstall() {
    // If we have the native prompt, use it
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
      return;
    }
    // Otherwise the native prompt isn't available (HTTP, non-localhost)
    // Do nothing — the UI below will show manual instructions instead
  }

  function handleDismiss() {
    setShowPrompt(false);
    localStorage.setItem('ft_pwa_dismissed', Date.now().toString());
  }

  // Determine if we can use the native prompt
  const canNativeInstall = !!deferredPrompt;

  // iOS: always show Safari share instructions
  if (isIOS) {
    return (
      <div className="install-prompt-toast">
        <div style={{ width: 40, height: 40, background: 'var(--primary)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 900, fontSize: 18, flexShrink: 0 }}>FT</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ margin: 0, marginBottom: 2, fontSize: 'var(--font-sm)', color: 'var(--text-primary)', fontWeight: 700 }}>Install App</h4>
          <p style={{ margin: 0, fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Tap <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', margin: '0 2px' }}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> Share → <strong>Add to Home Screen</strong>
          </p>
        </div>
        <button onClick={handleDismiss} style={{ background: 'transparent', border: 'none', padding: 'var(--space-2)', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 18 }}>✕</button>
      </div>
    );
  }

  // Android / Desktop: show native install or manual instructions
  return (
    <div className="install-prompt-toast">
      <div style={{ width: 40, height: 40, background: 'var(--primary)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 900, fontSize: 18, flexShrink: 0 }}>FT</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h4 style={{ margin: 0, marginBottom: 2, fontSize: 'var(--font-sm)', color: 'var(--text-primary)', fontWeight: 700 }}>Add to Home Screen</h4>
        {canNativeInstall ? (
          <p style={{ margin: 0, fontSize: 'var(--font-xs)', color: 'var(--text-secondary)' }}>Get the full app experience.</p>
        ) : (
          <p style={{ margin: 0, fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Tap <strong>⋮</strong> menu → <strong>Add to Home screen</strong>
          </p>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
        <button onClick={handleDismiss} style={{ background: 'transparent', border: 'none', padding: 'var(--space-2)', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 18 }}>✕</button>
        {canNativeInstall && (
          <button onClick={handleInstall} className="btn btn-primary btn-sm">Install</button>
        )}
      </div>
    </div>
  );
}
