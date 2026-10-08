import type { ReactNode } from 'react';

interface Props {
  icon?: ReactNode;
  title: string;
  subtext: string;
  actionText?: string;
  onAction?: () => void;
}

export default function EmptyState({ icon, title, subtext, actionText, onAction }: Props) {
  return (
    <div className="empty-state" style={{ animation: 'fadeSlideUp 0.4s ease-out forwards' }}>
      {icon || (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
      )}
      <h3>{title}</h3>
      <p>{subtext}</p>
      {actionText && onAction && (
        <button className="btn btn-primary" onClick={onAction} style={{ marginTop: 'var(--space-3)' }}>{actionText}</button>
      )}
    </div>
  );
}
