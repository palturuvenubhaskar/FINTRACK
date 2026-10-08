import { useState, useEffect } from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

export default function NetworkIndicators() {
  const { isOnline, wasOffline } = useNetworkStatus();
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    if (isOnline && wasOffline) {
      setShowToast(true);
      const timer = setTimeout(() => setShowToast(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  return (
    <>
      {!isOnline && (
        <div className="network-toast network-toast--offline">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
          You're offline — changes will sync when reconnected
        </div>
      )}

      {showToast && (
        <div className="network-toast network-toast--online">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
          You're back online!
        </div>
      )}
    </>
  );
}
