import { useNetworkStatus } from '../hooks/useNetworkStatus';

export default function NetworkDot() {
  const { isOnline } = useNetworkStatus();
  return (
    <div 
      title={isOnline ? 'Online' : 'Offline'}
      style={{
        width: 8, height: 8, borderRadius: '50%',
        background: isOnline ? 'var(--success)' : 'var(--warning)',
        animation: isOnline ? 'none' : 'pulseDot 2s infinite',
        flexShrink: 0
      }}
    />
  );
}
