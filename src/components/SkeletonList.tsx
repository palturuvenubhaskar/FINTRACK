export default function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="shimmer-bg" style={{
          height: 72,
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)'
        }} />
      ))}
    </div>
  );
}
