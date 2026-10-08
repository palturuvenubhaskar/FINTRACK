import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import './App.css'
import PinScreen from './components/PinScreen'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import Loans from './pages/Loans'
import Collections from './pages/Collections'
import Records from './pages/Records'
import Tracker from './pages/Tracker'
import Settings from './pages/Settings'
import NotFound from './components/NotFound'
import AppLoader from './components/AppLoader'
import InstallPrompt from './components/InstallPrompt'
import NetworkIndicators from './components/NetworkIndicators'
import { ThemeToggle } from './components/ui/theme-toggle'

import SyncIndicator from './components/SyncIndicator'
import { auth, googleProvider, dbFirestore } from './firebase'
import { signInWithPopup, getRedirectResult, onAuthStateChanged } from 'firebase/auth'
import { doc, setDoc, onSnapshot } from 'firebase/firestore'
import { syncService } from './services/SyncService'
import { db } from './db'
import { LayoutDashboard, UsersRound, Landmark, HandCoins, CalendarCheck, ScrollText, Settings as SettingsIcon } from 'lucide-react'
import React from 'react'

export const AppContext = React.createContext({
  navigateToCustomer: (_id: string) => {}
});

type Page = 'tracker' | 'dashboard' | 'customers' | 'loans' | 'collections' | 'records' | 'settings';

const navItems: { id: Page; label: string; icon: ReactNode }[] = [
  { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard size={20} strokeWidth={2} /> },
  { id: 'customers', label: 'Customers', icon: <UsersRound size={20} strokeWidth={2} /> },
  { id: 'loans', label: 'Loans', icon: <Landmark size={20} strokeWidth={2} /> },
  { id: 'collections', label: 'Collect', icon: <HandCoins size={20} strokeWidth={2} /> },
  { id: 'tracker', label: 'Tracker', icon: <CalendarCheck size={20} strokeWidth={2} /> },
  { id: 'records', label: 'Records', icon: <ScrollText size={20} strokeWidth={2} /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon size={20} strokeWidth={2} /> },
];

function App() {
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ft_theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('ft_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('ft_theme', 'light');
    }
  }, [isDark]);

  useEffect(() => {
    getRedirectResult(auth).catch(console.error);

    let unsubSession: (() => void) | null = null;
    const startTime = Date.now();
    
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      
      if (user) {
        // Prevent data mixing: if a different user logs in, wipe the local db
        const lastUid = localStorage.getItem('ft_last_uid');
        if (lastUid && lastUid !== user.uid) {
          try {
            await Promise.all(db.tables.map(table => table.clear()));
            localStorage.removeItem('ft_setup_complete');
            localStorage.removeItem('ft_pin');
            localStorage.removeItem('ft_last_sync');
            localStorage.removeItem('ft_device_id');
          } catch (err) {
            console.error('Failed to clear old user data:', err);
          }
        }
        localStorage.setItem('ft_last_uid', user.uid);

        // Device tracking
        try {
          let deviceId = localStorage.getItem('ft_device_id');
          if (!deviceId) {
            deviceId = crypto.randomUUID();
            localStorage.setItem('ft_device_id', deviceId);
          }
          let deviceName = 'Unknown Device';
          const ua = navigator.userAgent;
          if (ua.includes('Windows')) deviceName = 'Windows PC';
          else if (ua.includes('Macintosh')) deviceName = 'Mac';
          else if (ua.includes('iPhone')) deviceName = 'iPhone';
          else if (ua.includes('iPad')) deviceName = 'iPad';
          else if (ua.includes('Android')) deviceName = 'Android Device';
          else if (ua.includes('Linux')) deviceName = 'Linux PC';

          if (ua.includes('Edg/')) deviceName += ' (Edge)';
          else if (ua.includes('Chrome')) deviceName += ' (Chrome)';
          else if (ua.includes('Safari') && !ua.includes('Chrome')) deviceName += ' (Safari)';
          else if (ua.includes('Firefox')) deviceName += ' (Firefox)';

          const sessionRef = doc(dbFirestore, `users/${user.uid}/sessions`, deviceId);
          setDoc(sessionRef, {
            deviceName,
            userAgent: ua,
            lastActive: Date.now()
          }, { merge: true }).catch(console.error);

          let isInitial = true;
          unsubSession = onSnapshot(sessionRef, (snap) => {
            if (isInitial) {
              isInitial = false;
              return;
            }
            if (!snap.exists()) {
              auth.signOut().then(async () => {
                try { await db.delete(); } catch(e){}
                localStorage.removeItem('ft_device_id');
                localStorage.removeItem('ft_pin');
                localStorage.removeItem('ft_setup_complete');
                window.location.reload();
              });
            }
          });
        } catch (e) {
          console.error("Device tracking failed", e);
        }

        // Run migration if first time
        const migrated = localStorage.getItem('ft_migrated_' + user.uid);
        if (!migrated) {
           const tables = ['customers', 'loans', 'emis', 'collections'] as const;
           const now = Date.now();
           for (const table of tables) {
             await (db as any)[table].toCollection().modify((r: any) => {
               r.syncStatus = 'pending';
               r.updatedAt = r.updatedAt || now;
             });
           }
           localStorage.setItem('ft_migrated_' + user.uid, 'true');
        }
        syncService.startSync();
      } else {
        syncService.stopSync();
        if (unsubSession) unsubSession();
      }

      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, 500 - elapsed);
      setTimeout(() => setAuthLoading(false), remainingTime);
    });
    
    return () => {
      unsubscribeAuth();
      if (unsubSession) unsubSession();
    };
  }, []);

  // Automated Overdue Detection
  useEffect(() => {
    const checkOverdue = async () => {
      try {
        const now = new Date();
        now.setHours(0, 0, 0, 0); // Start of today
        const startOfTodayMs = now.getTime();

        const activeOrOverdueLoans = await db.loans.where('status').anyOf('active', 'overdue').filter(l => !l.deleted).toArray();
        if (activeOrOverdueLoans.length === 0) return;
        
        const loanIds = activeOrOverdueLoans.map(l => l.id);
        const allRelevantEmis = await db.emis.where('loanId').anyOf(loanIds).toArray();
        const emisByLoan = new Map();
        for (const emi of allRelevantEmis) {
          if (!emisByLoan.has(emi.loanId)) emisByLoan.set(emi.loanId, []);
          emisByLoan.get(emi.loanId).push(emi);
        }

        for (const loan of activeOrOverdueLoans) {
          const emis = emisByLoan.get(loan.id) || [];
          let hasOverdue = false;
          let oldestOverdueMs = Infinity;
          
          for (const emi of emis) {
            let currentStatus = emi.status;
            if (emi.status === 'pending' && emi.dueDate < startOfTodayMs) {
              await db.emis.update(emi.id, { status: 'overdue', syncStatus: 'pending', updatedAt: Date.now() });
              hasOverdue = true;
              currentStatus = 'overdue';
            }
            if (currentStatus === 'overdue' && emi.dueDate < oldestOverdueMs) {
              oldestOverdueMs = emi.dueDate;
              hasOverdue = true;
            }
          }

          const targetStatus = hasOverdue ? 'overdue' : loan.status;
          if (loan.status !== targetStatus) {
            await db.loans.update(loan.id, { status: targetStatus, syncStatus: 'pending', updatedAt: Date.now() });
          }
        }
      } catch (e) {
        console.error("Overdue check failed", e);
      }
    };
    checkOverdue();
  }, []);

  const [authenticated, setAuthenticated] = useState(false);
  const [needsSetup] = useState(() => !localStorage.getItem('ft_setup_complete'));
  const [page, setPage] = useState<Page>('dashboard');
  const [targetCustomerId, setTargetCustomerId] = useState<string | null>(null);

  useEffect(() => {
    const handleNav = (e: any) => {
      if (e.detail) setPage(e.detail as Page);
    };
    document.addEventListener('ft-navigate', handleNav);
    return () => document.removeEventListener('ft-navigate', handleNav);
  }, []);

  if (authLoading) return <AppLoader />;

  if (!firebaseUser) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: '100vh', padding: 'var(--space-4)', background: 'var(--bg-color)' }}>
        <div className="card" style={{ textAlign: 'center', maxWidth: 400, width: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <img src="/icons/icon-192.png" alt="FINTRACK Logo" style={{ width: 80, height: 80, marginBottom: 'var(--space-2)' }} />
            <h1 style={{ fontFamily: 'var(--font-display)', margin: 0, color: 'var(--primary-deep)', letterSpacing: '1px' }}>FINTRACK</h1>
          </div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)' }}>Sign in to sync your data across devices securely.</p>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => {
            signInWithPopup(auth, googleProvider).catch((err: any) => {
              alert('Google Sign-In Error: ' + err.message + '\n\nTry opening this site in your standard browser (Chrome/Safari) instead of an in-app browser!');
            });
          }}>
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style={{ width: 18, marginRight: 8 }} />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <PinScreen mode={needsSetup ? 'setup' : 'verify'} onSuccess={() => setAuthenticated(true)} />;
  }

  const renderPage = () => {
    switch (page) {
      case 'tracker': return <Tracker />;
      case 'dashboard': return <Dashboard />;
      case 'customers': return <Customers targetId={targetCustomerId} clearTarget={() => setTargetCustomerId(null)} />;
      case 'loans': return <Loans />;
      case 'collections': return <Collections />;
      case 'records': return <Records />;
      case 'settings': return <Settings />;
      default: return <NotFound onGoHome={() => setPage('dashboard')} />;
    }
  };

  return (
    <AppContext.Provider value={{ navigateToCustomer: (id) => { setTargetCustomerId(id); setPage('customers'); } }}>
      <div className="app">
        <NetworkIndicators />
        <InstallPrompt />
        <div className="app-shell">
          {/* Desktop Sidebar */}
          <aside className="sidebar">
            <div className="sidebar-brand" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <h1>FINTRACK</h1>
            </div>
            <nav className="sidebar-nav">
              {navItems.map(item => (
                <button
                  key={item.id}
                  className={`nav-item ${page === item.id ? 'active' : ''}`}
                  onClick={() => setPage(item.id)}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="sidebar-footer" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <ThemeToggle isDark={isDark} onToggle={() => setIsDark(!isDark)} />
              <SyncIndicator />
            </div>
          </aside>

          {/* Main Content */}
          <main className="main-content">
            <div className="mobile-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <h1 style={{ fontSize: 'var(--font-lg)', fontWeight: 800, textTransform: 'uppercase', color: 'var(--primary-deep)', margin: 0, lineHeight: 1, letterSpacing: '1px' }}>FINTRACK</h1>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <ThemeToggle isDark={isDark} onToggle={() => setIsDark(!isDark)} />
                <div style={{ width: '130px' }}>
                  <SyncIndicator />
                </div>
              </div>
            </div>
            <div className="page-container">
              {renderPage()}
            </div>
          </main>
        </div>

        {/* Mobile Navigation */}
        <nav className="mobile-nav">
          <div className="nav-indicator" style={{ transform: `translateX(${navItems.findIndex(i => i.id === page) * 100}%)` }} />
          {navItems.map(item => (
            <button
              key={item.id}
              className={page === item.id ? 'active' : ''}
              onClick={() => setPage(item.id)}
            >
              <div className="icon-wrap">{item.icon}</div>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </AppContext.Provider>
  );
}

export default App
