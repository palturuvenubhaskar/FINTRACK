import { Moon, Sun } from "lucide-react"

interface ThemeToggleProps {
  className?: string;
  isDark: boolean;
  onToggle: () => void;
}

export function ThemeToggle({ className, isDark, onToggle }: ThemeToggleProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        width: '64px',
        height: '32px',
        padding: '4px',
        borderRadius: '9999px',
        cursor: 'pointer',
        transition: 'all 300ms',
        background: isDark ? 'transparent' : '#ffffff',
        border: `1px solid ${isDark ? 'var(--border)' : '#e4e4e7'}`,
      }}
      onClick={onToggle}
      role="button"
      tabIndex={0}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '24px',
            height: '24px',
            borderRadius: '9999px',
            transition: 'transform 300ms, background-color 300ms',
            transform: isDark ? 'translateX(0)' : 'translateX(30px)',
            background: isDark ? 'rgba(255, 255, 255, 0.15)' : '#e5e7eb',
            zIndex: 10
          }}
        >
          {isDark ? (
            <Moon size={16} color="#ffffff" strokeWidth={1.5} />
          ) : (
            <Sun size={16} color="#374151" strokeWidth={1.5} />
          )}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '24px',
            height: '24px',
            borderRadius: '9999px',
            transition: 'transform 300ms, background-color 300ms',
            background: 'transparent',
            transform: isDark ? 'translateX(0)' : 'translateX(-30px)',
            zIndex: 5
          }}
        >
          {isDark ? (
            <Sun size={16} color="#71717a" strokeWidth={1.5} />
          ) : (
            <Moon size={16} color="#000000" strokeWidth={1.5} />
          )}
        </div>
      </div>
    </div>
  )
}
