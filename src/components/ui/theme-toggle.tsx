import { Moon, Sun } from "lucide-react"

interface ThemeToggleProps {
  className?: string;
  isDark: boolean;
  onToggle: () => void;
}

export function ThemeToggle({ className, isDark, onToggle }: ThemeToggleProps) {
  return (
    <button
      className={className}
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        background: 'var(--bg-soft)',
        border: '1px solid var(--border)',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        flexShrink: 0,
        outline: 'none'
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.background = 'var(--border)';
        e.currentTarget.style.color = 'var(--text-primary)';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.background = 'var(--bg-soft)';
        e.currentTarget.style.color = 'var(--text-secondary)';
      }}
      aria-label="Toggle theme"
      title="Toggle Dark Mode"
    >
      {isDark ? <Sun size={18} strokeWidth={2} /> : <Moon size={18} strokeWidth={2} />}
    </button>
  )
}
