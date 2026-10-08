import { useNetworkStatus } from '../hooks/useNetworkStatus';

export default function OfflineWarning() {
  const { isOnline } = useNetworkStatus();
  if (isOnline) return null;
  return (
    <div style={{ 
      padding: 'var(--space-2) var(--space-3)', 
      background: 'rgba(245, 158, 11, 0.1)', 
      color: 'var(--warning)', 
      borderRadius: 'var(--radius-sm)', 
      fontSize: 'var(--font-xs)', 
      fontWeight: 600, 
      display: 'flex', 
      alignItems: 'center', 
      gap: 'var(--space-2)', 
      marginBottom: 'var(--space-3)' 
    }}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/></svg>
      You're offline. This will be saved locally and synced later.
    </div>
  );
}
