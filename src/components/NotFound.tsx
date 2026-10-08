interface Props {
  onGoHome: () => void;
}

export default function NotFound({ onGoHome }: Props) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      textAlign: 'center',
      animation: 'fadeSlideUp 0.4s ease-out forwards'
    }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '120px', fontWeight: 900, color: 'var(--primary)', lineHeight: 1, marginBottom: 'var(--space-4)' }}>404</h1>
      <h2 style={{ fontSize: 'var(--font-2xl)', marginBottom: 'var(--space-2)' }}>Page not found</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)' }}>This page doesn't exist or was moved.</p>
      <button className="btn btn-primary" onClick={onGoHome}>Go Home</button>
    </div>
  );
}
