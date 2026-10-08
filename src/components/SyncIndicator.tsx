import { useEffect, useState } from 'react';
import { db } from '../db';

export default function SyncIndicator() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Poll for pending records
    const checkPending = async () => {
      let count = 0;
      count += await db.customers.filter(r => r.syncStatus === 'pending').count();
      count += await db.loans.filter(r => r.syncStatus === 'pending').count();
      count += await db.emis.filter(r => r.syncStatus === 'pending').count();
      count += await db.collections.filter(r => r.syncStatus === 'pending').count();
      setPendingCount(count);
    };
    
    checkPending();
    const interval = setInterval(checkPending, 2000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', justifyContent: 'space-between', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          backgroundColor: !isOnline ? 'var(--danger)' : (pendingCount > 0 ? 'var(--warning)' : 'var(--success)')
        }} />
        <span style={{ color: 'inherit', fontWeight: 'inherit', fontSize: 'inherit' }}>
          {!isOnline ? 'Offline' : (pendingCount > 0 ? `Syncing (${pendingCount})` : 'Synced')}
        </span>
      </div>

    </div>
  );
}
