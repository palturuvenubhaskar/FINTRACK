export default function AppLoader() {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#ECECEC',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999
    }}>
      <img src="/icons/icon-192.png" alt="FINTRACK Logo" style={{
        width: 64, height: 64, marginBottom: 'var(--space-4)',
        boxShadow: '0 8px 32px rgba(163, 230, 53, 0.3)', borderRadius: 16
      }} />
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--font-xl)', color: '#17181C', marginBottom: 'var(--space-2)', letterSpacing: '1px' }}>FINTRACK</h1>
      <div style={{ display: 'flex', gap: 6, marginTop: 'var(--space-3)' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#A3E635', animation: 'pulseDot 1s infinite' }} />
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#A3E635', animation: 'pulseDot 1s infinite 0.2s' }} />
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#A3E635', animation: 'pulseDot 1s infinite 0.4s' }} />
      </div>
      <style>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
