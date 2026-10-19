import { type Customer, formatCurrency } from '../db';
import { ArrowLeft, Phone, MapPin, Briefcase, Calendar, CreditCard, Edit3, TrendingUp, TrendingDown, Activity, Shield, IndianRupee, ChevronRight } from 'lucide-react';

interface CustomerProfileProps {
  customer: Customer;
  stats: any;
  onClose: () => void;
  onEdit: () => void;
}

export default function CustomerProfile({ customer, stats, onClose, onEdit }: CustomerProfileProps) {
  const safeName = customer.name || 'Unknown';
  const initials = safeName.trim().split(' ').filter(Boolean).map(n => n[0]).join('').substring(0,2).toUpperCase() || 'U';
  
  const score = stats.totalPaid > 0 || stats.given > 0 
    ? Math.min(100, Math.max(0, Math.round((stats.totalPaid / (stats.totalPaid + stats.outstanding)) * 100))) 
    : 100;
  
  const scoreColor = score >= 80 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)';
  const scoreBg = score >= 80 ? 'var(--success-bg)' : score >= 50 ? 'var(--warning-bg)' : 'var(--danger-bg)';
  const scoreLabel = score >= 80 ? 'Excellent' : score >= 50 ? 'Average' : 'At Risk';

  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const phones = customer.phones?.length ? customer.phones : [customer.phone, customer.phone2].filter(Boolean);
  const addresses = customer.addresses?.length ? customer.addresses : [customer.address, customer.address2].filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 'var(--space-3)' }}>
      
      {/* ── BACK BUTTON ── */}
      <button 
        onClick={onClose} 
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: '13px', transition: 'color 0.2s' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
      >
        <ArrowLeft size={16} /> Back to Customers
      </button>

      {/* ── HERO CARD ── */}
      <div style={{
        background: 'linear-gradient(135deg, #1a2e05 0%, #2d4a0a 40%, #3d6b0f 100%)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 20px',
        position: 'relative',
        overflow: 'hidden',
        color: '#fff',
      }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(163,230,53,0.08)' }} />
        <div style={{ position: 'absolute', bottom: -50, right: 60, width: 160, height: 160, borderRadius: '50%', background: 'rgba(163,230,53,0.05)' }} />
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1, flexWrap: 'wrap', gap: 12 }}>
          
          {/* Left: Avatar + Info */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: '1 1 250px' }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'linear-gradient(135deg, #a3e635, #65a30d)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '18px', color: '#1a2e05',
              boxShadow: '0 4px 16px rgba(163,230,53,0.3)',
              flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: '17px', letterSpacing: '-0.3px' }}>{customer.name}</span>
                <span style={{ 
                  background: 'rgba(163,230,53,0.15)', color: '#a3e635', 
                  fontSize: '10px', fontWeight: 800, padding: '2px 8px', 
                  borderRadius: 100, border: '1px solid rgba(163,230,53,0.25)',
                }}>
                  {customer.displayId}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: '11px', color: 'rgba(255,255,255,0.55)', fontWeight: 500, flexWrap: 'wrap' }}>
                {customer.occupation && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Briefcase size={11} />{customer.occupation}</span>}
                {customer.place && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><MapPin size={11} />{customer.place}</span>}
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Calendar size={11} />{new Date(customer.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {customer.phone && (
              <a href={`tel:${customer.phone}`} style={{
                width: 34, height: 34, borderRadius: 10,
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#a3e635', cursor: 'pointer', textDecoration: 'none',
              }}>
                <Phone size={15} />
              </a>
            )}
            <button onClick={onEdit} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(163,230,53,0.15)', border: '1px solid rgba(163,230,53,0.3)',
              color: '#a3e635', fontWeight: 700, fontSize: '12px',
              padding: '7px 14px', borderRadius: 10, cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(163,230,53,0.25)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(163,230,53,0.15)'; }}
            >
              <Edit3 size={13} /> Edit
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div style={{ 
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
          gap: 8, marginTop: 14, position: 'relative', zIndex: 1,
        }}>
          {[
            { label: 'Given', value: formatCurrency(stats.given), icon: <TrendingUp size={13} /> },
            { label: 'Outstanding', value: formatCurrency(stats.outstanding), icon: <TrendingDown size={13} /> },
            { label: 'Recovered', value: formatCurrency(stats.totalPaid), icon: <IndianRupee size={13} /> },
            { label: 'Active', value: `${stats.activeLoans + stats.overdueLoans}`, icon: <Activity size={13} /> },
          ].map((item, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px',
              border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>
                {item.icon} {item.label}
              </div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-display)', letterSpacing: '-0.3px' }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── BODY GRID ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-3)' }}>
        
        {/* ── LEFT: TRUST SCORE + CONTACT INFO ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          
          {/* Trust Score Card */}
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
            <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
              <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="36" cy="36" r={radius} fill="none" stroke="var(--border)" strokeWidth="5" />
                <circle 
                  cx="36" cy="36" r={radius} fill="none" 
                  stroke={scoreColor} strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                  style={{ transition: 'stroke-dashoffset 1s ease-out' }}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '17px', fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{score}%</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Shield size={15} style={{ color: scoreColor }} />
                <span style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text-primary)' }}>Trust Score</span>
              </div>
              <span style={{ 
                display: 'inline-flex', alignSelf: 'flex-start',
                fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: 100,
                background: scoreBg, color: scoreColor, textTransform: 'uppercase',
              }}>
                {scoreLabel}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500, lineHeight: 1.3 }}>
                {formatCurrency(stats.totalPaid)} of {formatCurrency(stats.totalPaid + stats.outstanding)}
              </span>
            </div>
          </div>

          {/* Contact Details Card */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>Contact Info</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {phones.map((p, i) => p && (
                <a key={i} href={`tel:${p}`} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  background: 'var(--bg-soft)', borderRadius: 8, textDecoration: 'none',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-alpha)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-soft)')}
                >
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--success-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Phone size={12} style={{ color: 'var(--success)' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{p}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Phone {i+1}</div>
                  </div>
                  <ChevronRight size={12} style={{ color: 'var(--text-tertiary)' }} />
                </a>
              ))}
              
              {addresses.map((addr, i) => addr && (
                <div key={`addr-${i}`} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  background: 'var(--bg-soft)', borderRadius: 8,
                }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--info-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <MapPin size={12} style={{ color: 'var(--info)' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{addr}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Address {i+1}</div>
                  </div>
                </div>
              ))}

              {customer.aadhaar && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg-soft)', borderRadius: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--warning-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CreditCard size={12} style={{ color: 'var(--warning)' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{customer.aadhaar.replace(/(\d{4})/g, '$1 ').trim()}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Aadhaar</div>
                  </div>
                </div>
              )}

              {customer.pan && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg-soft)', borderRadius: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--info-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CreditCard size={12} style={{ color: 'var(--info)' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{customer.pan}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>PAN</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: FINANCIAL + LOANS ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          
          {/* Financial Overview */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 12 }}>Financial Overview</div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div style={{ background: 'var(--success-bg)', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--success)', textTransform: 'uppercase', marginBottom: 4 }}>Total Principal</div>
                <div style={{ fontSize: 'clamp(15px, 2.5vw, 20px)', fontWeight: 800, color: 'var(--success)', fontFamily: 'var(--font-display)', letterSpacing: '-0.3px', wordBreak: 'break-word' }}>{formatCurrency(stats.given)}</div>
              </div>
              <div style={{ background: 'var(--danger-bg)', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase', marginBottom: 4 }}>Outstanding</div>
                <div style={{ fontSize: 'clamp(15px, 2.5vw, 20px)', fontWeight: 800, color: 'var(--danger)', fontFamily: 'var(--font-display)', letterSpacing: '-0.3px', wordBreak: 'break-word' }}>{formatCurrency(stats.outstanding)}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div style={{ padding: '8px 0', borderTop: '2px solid var(--border)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 3 }}>Expected</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--warning-text)', fontFamily: 'var(--font-display)' }}>{formatCurrency(stats.totalPaid + stats.outstanding)}</div>
              </div>
              <div style={{ padding: '8px 0', borderTop: '2px solid var(--border)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 3 }}>Recovered</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--success)', fontFamily: 'var(--font-display)' }}>{formatCurrency(stats.totalPaid)}</div>
              </div>
            </div>

            {/* Recovery Bar */}
            <div style={{ background: 'var(--bg-soft)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>Recovery Rate</span>
                <span style={{ fontSize: '13px', fontWeight: 800, color: scoreColor }}>{score}%</span>
              </div>
              <div style={{ width: '100%', height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ 
                  height: '100%', borderRadius: 4,
                  background: `linear-gradient(90deg, ${scoreColor}, ${score >= 80 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)'})`,
                  width: `${score}%`, transition: 'width 1s ease-out',
                  boxShadow: `0 0 8px ${scoreColor}`,
                }} />
              </div>
            </div>
          </div>

          {/* Loan Breakdown */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>Loan Breakdown</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: 'Total', value: stats.totalLoans, color: 'var(--text-primary)', bg: 'var(--bg-soft)', borderColor: 'var(--border)' },
                { label: 'Running', value: stats.activeLoans + stats.overdueLoans, color: 'var(--success)', bg: 'var(--success-bg)', borderColor: 'var(--border)' },
                { label: 'Closed', value: stats.closedLoans, color: 'var(--text-tertiary)', bg: 'var(--bg-soft)', borderColor: 'var(--border)' },
              ].map((item, i) => (
                <div key={i} style={{ 
                  background: item.bg, borderRadius: 10, padding: '10px 8px', 
                  textAlign: 'center', border: `1px solid ${item.borderColor}`,
                }}>
                  <div style={{ fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 800, color: item.color, fontFamily: 'var(--font-display)', lineHeight: 1 }}>{item.value}</div>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginTop: 4 }}>{item.label}</div>
                </div>
              ))}
            </div>
            
            {stats.lastClosedAt && (
              <div style={{ textAlign: 'center', marginTop: 12, fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Last Loan Closed: {new Date(stats.lastClosedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
              </div>
            )}

            {stats.overdueLoans > 0 && (
              <div style={{ 
                marginTop: 10, padding: '8px 10px', borderRadius: 8,
                background: 'var(--danger-bg)', border: '1px solid var(--danger)', 
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: '11px', fontWeight: 700, color: 'var(--danger)',
              }}>
                <Activity size={13} />
                {stats.overdueLoans} loan{stats.overdueLoans > 1 ? 's' : ''} overdue
              </div>
            )}
          </div>

          {/* Notes */}
          {customer.notes && (
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Notes</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {customer.notes}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
