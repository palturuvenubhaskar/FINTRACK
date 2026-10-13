import { useState, useCallback, useEffect } from 'react';

interface PinScreenProps {
  mode: 'setup' | 'verify';
  onSuccess: () => void;
  onCancel?: () => void;
}

export default function PinScreen({ mode, onSuccess, onCancel }: PinScreenProps) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const maxLen = 6;

  const handleKey = useCallback((key: string) => {
    setError('');
    if (step === 'enter') {
      if (pin.length < maxLen) setPin(p => p + key);
    } else {
      if (confirmPin.length < maxLen) setConfirmPin(p => p + key);
    }
  }, [pin, confirmPin, step]);

  const handleDelete = useCallback(() => {
    setError('');
    if (step === 'enter') setPin(p => p.slice(0, -1));
    else setConfirmPin(p => p.slice(0, -1));
  }, [step]);

  // Keyboard support for PIN entry
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (attempts >= 5) return;
      if (e.key >= '0' && e.key <= '9') {
        handleKey(e.key);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        handleDelete();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKey, handleDelete, attempts]);

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (mode === 'setup' && step === 'enter' && pin.length === maxLen) {
      setTimeout(() => { setStep('confirm'); }, 200);
    }
    if (mode === 'setup' && step === 'confirm' && confirmPin.length === maxLen) {
      setTimeout(async () => {
        if (pin === confirmPin) {
          const hashed = await hashPin(pin);
          localStorage.setItem('ft_pin', hashed);
          localStorage.setItem('ft_setup_complete', 'true');
          onSuccess();
        } else {
          setError('PIN MISMATCH');
          setConfirmPin('');
          setStep('enter');
          setPin('');
        }
      }, 200);
    }
    if (mode === 'verify' && pin.length === maxLen) {
      setTimeout(async () => {
        const stored = localStorage.getItem('ft_pin');
        const hashed = await hashPin(pin);
        const oldHashed = oldHashPin(pin);
        
        if (stored && (stored === hashed || stored === oldHashed)) {
          if (stored !== hashed) {
            localStorage.setItem('ft_pin', hashed); // Upgrade hash
          }
          onSuccess();
        } else {
          setAttempts(a => a + 1);
          setError(`ACCESS DENIED [${Math.max(0, 5 - attempts - 1)} ATTEMPTS]`);
          setPin('');
        }
      }, 200);
    }
  }, [pin, confirmPin, step, mode, onSuccess, attempts]);

  const currentPin = step === 'enter' ? pin : confirmPin;
  const title = mode === 'setup'
    ? 'FINTRACK'
    : 'FINTRACK';
  const subtitle = mode === 'setup'
    ? (step === 'enter' ? 'Set a 6-digit access code' : 'Confirm your access code')
    : 'Welcome back, Lender';

  return (
    <div className="pin-screen">
      <div className="pin-bg-glow"></div>
      
      <div className="pin-card">
        <div className="pin-header" style={{ position: 'relative' }}>
          {onCancel && (
            <button className="btn btn-ghost" onClick={onCancel} style={{ position: 'absolute', right: 0, top: 0, padding: 'var(--space-2)' }}>✕</button>
          )}
          <div className="pin-icon-wrap" style={{ padding: 0, overflow: 'hidden', background: 'transparent', boxShadow: '0 4px 16px rgba(163,230,53,0.3)' }}>
            <img src="/icons/icon-192.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
          </div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>

        <div className="pin-dots-container">
          <div className="pin-dots">
            {Array.from({ length: maxLen }, (_, i) => (
              <div key={i} className={`pin-dot ${i < currentPin.length ? 'filled' : ''} ${error ? 'error' : ''}`} />
            ))}
          </div>
          <div className={`pin-msg ${error ? 'error' : ''}`}>{error || '\u00A0'}</div>
        </div>

        <div className="pin-pad">
          {['1','2','3','4','5','6','7','8','9','','0','CLR'].map((key, i) => (
            <button
              key={i}
              className={`pin-key ${key === '' ? 'empty' : ''} ${key === 'CLR' ? 'action' : ''}`}
              onClick={() => {
                if (key === 'CLR') handleDelete();
                else if (key !== '') handleKey(key);
              }}
              disabled={attempts >= 5}
            >
              {key === 'CLR' ? (
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path><line x1="18" y1="9" x2="12" y2="15"></line><line x1="12" y1="9" x2="18" y2="15"></line></svg>
              ) : key}
            </button>
          ))}

        </div>
      </div>
      
      <div className="pin-footer" style={{ marginTop: 'var(--space-8)', opacity: 0.5, fontWeight: 600, fontSize: 'var(--font-sm)' }}>
        FINTRACK &copy; {new Date().getFullYear()}
      </div>
    </div>
  );
}

async function hashPin(pin: string): Promise<string> {
  if (window.crypto && window.crypto.subtle) {
    const msgUint8 = new TextEncoder().encode(pin + 'ft_salt_v2');
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } else {
    // Fallback for non-HTTPS local network testing
    let hash = 0;
    const str = pin + 'ft_salt_v2_fallback';
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return hash.toString(36);
  }
}

function oldHashPin(pin: string): string {
  let hash = 0;
  const str = pin + 'ft_salt_v1';
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash.toString(36);
}
