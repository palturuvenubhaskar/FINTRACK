import { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { db, formatCurrency, formatCompact } from '../db';
import { v4 as uuid } from 'uuid';
import { useIsMobile } from '../hooks/useIsMobile';
import { AppContext } from '../App';
import Fuse from 'fuse.js';
import { Check, X, Search, Activity, Edit3, Plus, TrendingUp, AlertCircle, Phone } from 'lucide-react';
import { getEnrichedLoans, type EnrichedLoan } from '../services/LoanService';
import EmptyState from '../components/EmptyState';
import SkeletonList from '../components/SkeletonList';

export default function Tracker() {
  const isMobile = useIsMobile();
  const { navigateToCustomer } = useContext(AppContext);
  const [loans, setLoans] = useState<EnrichedLoan[]>([]);
  const [tab, setTab] = useState<'all' | 'active' | 'overdue' | 'npa' | 'cleared'>('all');
  const [stats, setStats] = useState({ lent: 0, recovered: 0, pending: 0, clearedCount: 0, totalCount: 0, overdueCount: 0, npaCount: 0 });
  const [paymentModal, setPaymentModal] = useState<{loan: EnrichedLoan, emi: any, amount: string, date: string} | null>(null);
  const [editScheduleModal, setEditScheduleModal] = useState<{loan: EnrichedLoan, dates: Record<number, string>, amounts: Record<number, string>, tenure: number} | null>(null);
  const [search, setSearch] = useState('');
  const [sortType, setSortType] = useState(() => localStorage.getItem('ft_sort_tracker') || 'default');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  useEffect(() => {
    // Auto-scroll the horizontal slots to the current active slot
    const timer = setTimeout(() => {
      document.querySelectorAll('.slots-track').forEach(container => {
        let target = container.querySelector('.slot-wrapper[data-status="pending"], .slot-wrapper[data-status="missed"], .slot-wrapper[data-status="partial"]');
        if (!target) target = container.lastElementChild;
        if (target && container instanceof HTMLElement && target instanceof HTMLElement) {
           const containerCenter = container.clientWidth / 2;
           const targetCenter = target.offsetLeft + (target.clientWidth / 2);
           container.scrollTo({ left: targetCenter - containerCenter, behavior: 'smooth' });
        }
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [loans, tab, search, sortType]);

  useEffect(() => { localStorage.setItem('ft_sort_tracker', sortType); }, [sortType]);

  const load = useCallback(async () => {
    setIsLoading(true);
    const enriched = await getEnrichedLoans();

    let lent = 0, recovered = 0, pending = 0, clearedCount = 0, overdueCount = 0, npaCount = 0;
    enriched.forEach(l => {
      lent += l.amount;
      recovered += l.paidAmount;
      pending += l.pendingAmount;
      if (l.pendingAmount <= 0) clearedCount++;
      if (l.status === 'overdue') overdueCount++;
      if (l.status === 'npa') npaCount++;
    });

    setStats({ lent, recovered, pending, clearedCount, totalCount: enriched.length, overdueCount, npaCount });
    setLoans(enriched.sort((a, b) => b.createdAt - a.createdAt));
    setTimeout(() => setIsLoading(false), 300);
  }, []);

  useEffect(() => { 
    load(); 
    window.addEventListener('ft-data-changed', load);
    return () => window.removeEventListener('ft-data-changed', load);
  }, [load]);

  const handleSaveSchedule = async () => {
    if (!editScheduleModal || isSubmitting) return;
    setIsSubmitting(true);
    
    try {
      const customDates: Record<number, number> = {};
      for (const [idx, dateStr] of Object.entries(editScheduleModal.dates)) {
        const ts = new Date(dateStr).getTime();
        if (!isNaN(ts)) {
          customDates[Number(idx)] = ts;
        }
      }
      
      const customEmiAmounts: Record<number, number> = {};
      for (const [idx, amtStr] of Object.entries(editScheduleModal.amounts)) {
        const amt = parseFloat(amtStr);
        if (!isNaN(amt)) {
          customEmiAmounts[Number(idx)] = amt;
        }
      }
      
      await db.loans.update(editScheduleModal.loan.id, { 
        customDates,
        customEmiAmounts,
        tenure: editScheduleModal.tenure,
        syncStatus: 'pending', updatedAt: Date.now()
      });
      setEditScheduleModal(null);
      load();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoanPayment = async () => {
    if (!paymentModal || isSubmitting) return;
    const { loan } = paymentModal;
    const newlyPaidAmount = parseFloat(paymentModal.amount);
    
    if (isNaN(newlyPaidAmount) || newlyPaidAmount <= 0) return;

    setIsSubmitting(true);
    
    try {
      const paymentMs = new Date(paymentModal.date).getTime() || Date.now();

      await db.collections.add({
        id: uuid(),
        loanId: loan.id,
        customerId: loan.customerId,
        amount: newlyPaidAmount,
        date: paymentMs,
        mode: 'cash',
        note: `Slot Collection`,
        createdAt: Date.now(),
        syncStatus: 'pending', updatedAt: Date.now()
      });

      const updatedCollections = (await db.collections.where('loanId').equals(loan.id).toArray()).filter(c => !c.deleted);
      const totalPaid = updatedCollections.reduce((sum, c) => sum + c.amount, 0);
      const totalPending = loan.totalPayable - totalPaid;
      
      let loanStatus = loan.status;
      if (totalPending <= 0) loanStatus = 'closed';
      else if (loanStatus === 'closed') loanStatus = 'active';

      await db.loans.update(loan.id, { paidAmount: totalPaid, pendingAmount: totalPending, status: loanStatus, syncStatus: 'pending', updatedAt: Date.now() });

      setPaymentModal(null);
      load();
    } finally {
      setIsSubmitting(false);
    }
  };

  const searchableBaseTracker = useMemo(() => {
    let base = loans.filter(l => {
      if (tab === 'all') return true;
      if (tab === 'active') return l.status === 'active' && l.pendingAmount > 0;
      if (tab === 'cleared') return l.pendingAmount <= 0;
      if (tab === 'overdue') return l.status === 'overdue';
      if (tab === 'npa') return l.status === 'npa';
      return true;
    });

    return base.map(l => ({
      ...l,
      searchName: l.customer?.name || l.customerName || '',
      searchPhone: l.customer?.phone || '',
      searchDisplayId: l.customer?.displayId || ''
    }));
  }, [loans, tab]);

  const fuse = useMemo(() => new Fuse(searchableBaseTracker, {
    keys: ['searchName', 'searchPhone', 'displayId', 'searchDisplayId'],
    threshold: 0.3,
    ignoreLocation: true
  }), [searchableBaseTracker]);

  const filtered = useMemo(() => {
    let result = searchableBaseTracker;
    if (search.trim()) {
      result = fuse.search(search).map(r => r.item);
    }
    
    return [...result].sort((a, b) => {
      if (sortType === 'score') return a.score - b.score;
      if (sortType === 'pending') return b.pendingAmount - a.pendingAmount;
      if (sortType === 'name-asc') return a.searchName.localeCompare(b.searchName);
      if (sortType === 'name-desc') return b.searchName.localeCompare(a.searchName);
      if (sortType === 'id') return (a.displayId || '').localeCompare(b.displayId || '');
      if (sortType === 'oldest') return a.createdAt - b.createdAt;
      return b.createdAt - a.createdAt; // default
    });
  }, [searchableBaseTracker, search, sortType, fuse]);


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-2xl)', fontWeight: 800, fontFamily: 'var(--font-display)', margin: 0, textTransform: 'uppercase' }}>Tracker</h2>
          <p className="page-header-sub" style={{ margin: 0, marginTop: 4 }}>
            Visual grid-based recovery tracking
          </p>
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 'var(--space-4)' }}>
        <div style={{ background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(59, 130, 246, 0.05) 100%)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, background: '#3B82F6' }} />
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Activity size={24} /></div>
          <div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Lent</div>
            <div style={{ fontSize: 'var(--font-xl)', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', lineHeight: 1.2 }}>{formatCurrency(stats.lent)}</div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', fontWeight: 600, marginTop: 2 }}>{stats.totalCount} total loans</div>
          </div>
        </div>
        
        <div style={{ background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(34, 197, 94, 0.05) 100%)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, background: 'var(--success)' }} />
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--success-bg)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><TrendingUp size={24} /></div>
          <div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recovered</div>
            <div style={{ fontSize: 'var(--font-xl)', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--success)', lineHeight: 1.2 }}>{formatCurrency(stats.recovered)}</div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', fontWeight: 600, marginTop: 2 }}>{stats.clearedCount} loans cleared</div>
          </div>
        </div>
        
        <div style={{ background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(234, 179, 8, 0.05) 100%)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, background: 'var(--warning)' }} />
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(234, 179, 8, 0.1)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AlertCircle size={24} /></div>
          <div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pending Balance</div>
            <div style={{ fontSize: 'var(--font-xl)', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--warning)', lineHeight: 1.2 }}>{formatCurrency(stats.pending)}</div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', fontWeight: 600, marginTop: 2 }}>{stats.overdueCount} overdue · {stats.npaCount} NPA</div>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="card" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none', overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
            {(['all', 'active', 'overdue', 'npa', 'cleared'] as const).map(t => (
              <button 
                key={t} 
                className={`tab-btn ${tab === t ? 'active' : ''}`} 
                onClick={() => setTab(t)}
                style={{ padding: '8px 16px', borderRadius: 'var(--radius-pill)', border: 'none', background: tab === t ? 'var(--primary-alpha)' : 'transparent', color: tab === t ? 'var(--primary-deep)' : 'var(--text-secondary)', fontWeight: 700, fontSize: 'var(--font-sm)', whiteSpace: 'nowrap' }}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flex: 1, minWidth: 280, justifyContent: 'flex-end' }}>
            <div className="search-bar" style={{ width: '100%', maxWidth: '280px', background: 'var(--bg-card)' }}>
              <Search size={14} />
              <input placeholder="Search tracker..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="sort-minimal-container" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', padding: '0 var(--space-3)' }}>
              <select className="sort-minimal" value={sortType} onChange={(e) => setSortType(e.target.value)} style={{ paddingLeft: 0 }}>
                <option value="default">Default</option>
                <option value="score">Score (%)</option>
                <option value="pending">Pending Amount</option>
                <option value="name-asc">Name (A-Z)</option>
                <option value="oldest">Oldest First</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── Grid List ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingBottom: 'var(--space-8)' }}>
        {isLoading ? (
          <SkeletonList count={3} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Activity size={48} style={{ color: 'var(--text-tertiary)', marginBottom: 'var(--space-3)' }} />}
            title="No records found"
            subtext={search ? "Try a different search term" : `No loans match the '${tab}' filter`}
          />
        ) : (
          filtered.map(loan => {
            const p = loan.totalPayable > 0 ? (loan.paidAmount / loan.totalPayable) * 100 : 0;
            const isBehind = loan.paidAmount < loan.expectedAmountToDate;
            const statusColors: any = {
              'active': { bg: 'var(--primary-alpha)', text: 'var(--primary-deep)', border: 'var(--primary)' },
              'overdue': { bg: 'var(--danger-bg)', text: 'var(--danger)', border: 'var(--danger)' },
              'npa': { bg: 'var(--danger-bg)', text: 'var(--danger)', border: 'var(--danger)' },
              'closed': { bg: 'var(--success-bg)', text: 'var(--success)', border: 'var(--success)' },
            };
            const sColor = statusColors[loan.status];

            return (
              <div 
                key={loan.id} 
                className="card" 
                style={{ 
                  padding: 0, 
                  position: 'relative', 
                  overflow: 'hidden', 
                  border: '1px solid var(--border)', 
                  borderLeft: `4px solid ${sColor.border}`,
                  backgroundColor: 'var(--bg-card)',
                  boxShadow: 'var(--shadow-card)',
                  transition: 'transform 0.2s, box-shadow 0.2s'
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow-card)'; }}
              >
                {/* Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0, flex: 1 }}>
                    <div 
                      style={{ 
                        width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                        background: 'var(--primary-alpha)', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        fontWeight: 800, fontSize: 'var(--font-lg)', color: 'var(--primary-deep)',
                        border: '1px solid rgba(163,230,53,0.3)', cursor: 'pointer'
                      }}
                      onClick={() => navigateToCustomer(loan.customerId)}
                    >
                      {(loan.customer?.name || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0, cursor: 'pointer' }} onClick={() => navigateToCustomer(loan.customerId)}>
                      <h3 style={{ fontSize: 'var(--font-lg)', fontWeight: 800, textTransform: 'uppercase', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                        {loan.customer?.name || 'Unknown'}
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 'var(--font-xs)', color: 'var(--primary-deep)', fontWeight: 800, letterSpacing: '0.5px' }}>{loan.displayId}</span>
                        {loan.customer?.occupation && <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', fontWeight: 600, borderLeft: '1px solid var(--border)', paddingLeft: 6, textTransform: 'capitalize' }}>{loan.customer.occupation}</span>}
                        {loan.customer?.phone && (
                          <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', fontWeight: 600, borderLeft: '1px solid var(--border)', paddingLeft: 6, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Phone size={10} /> {loan.customer.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <span style={{ 
                        background: sColor.bg, color: sColor.text, border: `1px solid ${sColor.border}`,
                        padding: '4px 10px', borderRadius: 'var(--radius-pill)', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px'
                      }}>
                        {loan.status === 'closed' ? 'CLEARED' : loan.status}
                      </span>
                      {loan.status === 'closed' && loan.closedAt && (
                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', marginTop: '2px' }}>
                          ON {new Date(loan.closedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).toUpperCase()}
                        </div>
                      )}
                      <div style={{ fontSize: 'var(--font-xs)', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                        {loan.type} · <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(loan.emiAmount)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Financials Row */}
                <div className="tracker-financials" style={{ padding: 'var(--space-3) var(--space-5)', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Principal</div>
                    <div style={{ fontWeight: 800, fontSize: 'var(--font-base)', color: 'var(--text-primary)' }}>{formatCurrency(loan.amount)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Recovered</div>
                    <div style={{ fontWeight: 800, fontSize: 'var(--font-base)', color: 'var(--success)' }}>{formatCurrency(loan.paidAmount)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Pending</div>
                    <div style={{ fontWeight: 800, fontSize: 'var(--font-base)', color: loan.pendingAmount > 0 ? 'var(--warning)' : 'var(--text-tertiary)' }}>{formatCurrency(loan.pendingAmount)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Health Score</div>
                    <div style={{ fontWeight: 800, fontSize: 'var(--font-base)', color: loan.score >= 100 ? 'var(--success)' : loan.score > 80 ? 'var(--warning)' : 'var(--danger)' }}>{Math.round(loan.score)}%</div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={{ padding: 'var(--space-3) var(--space-5)', borderBottom: '1px dashed var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 'var(--font-xs)', alignItems: 'flex-end' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Expected to date: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(loan.expectedAmountToDate)}</strong></span>
                    <span style={{ 
                      color: isBehind ? 'var(--danger)' : 'var(--success)', 
                      fontWeight: 800,
                      background: isBehind ? 'var(--danger-bg)' : 'var(--success-bg)',
                      padding: '2px 8px', borderRadius: 'var(--radius-pill)', fontSize: '10px', textTransform: 'uppercase'
                    }}>
                      {isBehind ? `Behind ${formatCurrency(loan.expectedAmountToDate - loan.paidAmount)}` : 'On Track'}
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-soft)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <div style={{ width: `${p}%`, height: '100%', background: p === 100 ? 'var(--success)' : isBehind ? 'var(--warning)' : 'var(--primary-deep)', borderRadius: 3, transition: 'width 0.4s' }} />
                  </div>
                </div>

                {/* Horizontal Slots Track */}
                <div style={{ padding: 'var(--space-4) var(--space-5)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 'var(--space-3)', letterSpacing: '0.5px' }}>Collection Schedule</div>
                  
                  <div className="slots-track" style={{ 
                    position: 'relative',
                    display: 'flex', flexWrap: 'nowrap', gap: 'var(--space-2)', 
                    overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
                    paddingBottom: 'var(--space-2)', paddingTop: '12px'
                  }}>
                    {loan.slots.map(emi => {
                      const diff = emi.emiAmount - emi.paidAmount;
                      const dateObj = new Date(emi.dueDate);
                      
                      let bg = 'var(--bg-soft)';
                      let color = 'var(--text-primary)';
                      let border = '1px solid var(--border)';
                      let icon = null;

                      if (emi.status === 'paid') {
                        bg = 'var(--success)'; color = '#fff'; border = 'none';
                        icon = <Check size={16} strokeWidth={4} />;
                      } else if (emi.status === 'missed') {
                        bg = 'var(--danger)'; color = '#fff'; border = 'none';
                        icon = <X size={16} strokeWidth={4} />;
                      } else if (emi.status === 'partial') {
                        bg = 'var(--warning)'; color = '#fff'; border = 'none';
                        icon = <span style={{ fontSize: '18px', fontWeight: 800, lineHeight: 1 }}>~</span>;
                      }

                      return (
                        <div key={emi.id} className="slot-wrapper" data-status={emi.status} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          
                          {/* The Slot Box */}
                          <div 
                            onClick={() => {
                              if (emi.status === 'paid') return;
                              const localDateString = new Date(dateObj.getTime() - (dateObj.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
                              setPaymentModal({ loan, emi, amount: String(Math.max(0, emi.emiAmount - emi.paidAmount)), date: localDateString });
                            }}
                            style={{ 
                              position: 'relative', width: 44, height: 44, borderRadius: 'var(--radius-md)',
                              background: bg, color: color, border: border,
                              display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', 
                              cursor: emi.status === 'paid' ? 'default' : 'pointer',
                              transition: 'all 0.15s'
                            }}
                            onMouseEnter={e => { if (emi.status !== 'paid') e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={e => { if (emi.status !== 'paid') e.currentTarget.style.transform = 'none'; }}
                            title={`${dateObj.toLocaleDateString()}: ${formatCurrency(emi.paidAmount)} / ${formatCurrency(emi.emiAmount)}`}
                          >
                            {icon ? icon : (
                              <>
                                <span style={{ fontSize: '14px', fontWeight: 800, lineHeight: 1, marginBottom: 2 }}>{dateObj.getDate()}</span>
                                <span style={{ fontSize: '9px', fontWeight: 700, lineHeight: 1 }}>{dateObj.toLocaleString('default', { month: 'short' }).toUpperCase()}</span>
                              </>
                            )}
                            
                            {/* Underpayment Badge (diff > 0 means they paid LESS than EMI) */}
                            {emi.status === 'partial' && diff > 0.01 && (
                              <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', background: 'var(--danger)', color: '#fff', fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: 'var(--radius-pill)', zIndex: 10, boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}>
                                -{formatCompact(diff)}
                              </div>
                            )}
                            {/* Overpayment Badge (diff < 0 means they paid MORE than EMI) */}
                            {diff < -0.01 && (
                              <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', background: 'var(--success)', color: '#fff', fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: 'var(--radius-pill)', zIndex: 10, boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}>
                                +{formatCompact(-diff)}
                              </div>
                            )}
                            {/* Late Badge */}
                            {emi.isLate && (
                              <div style={{ position: 'absolute', top: -4, right: -4, width: 10, height: 10, borderRadius: '50%', background: 'var(--danger)', border: '2px solid var(--bg-card)' }} title="Paid Late" />
                            )}
                          </div>
                          
                          {/* Date Label (Only if box is showing an icon) */}
                          {emi.status !== 'pending' && (
                            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.2 }}>
                              {dateObj.getDate()} {dateObj.toLocaleString('default', { month: 'short' }).toUpperCase()}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    
                    {/* EDIT Button */}
                    <div 
                      onClick={() => {
                        const dates: Record<number, string> = {};
                        const amounts: Record<number, string> = {};
                        loan.slots.forEach((s, i) => { 
                          dates[i] = new Date(s.dueDate).toISOString().split('T')[0]; 
                          amounts[i] = s.emiAmount.toString();
                        });
                        setEditScheduleModal({ loan, dates, amounts, tenure: loan.tenure });
                      }}
                      style={{
                        width: 44, height: 44, flexShrink: 0,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                        border: `1.5px dashed var(--border)`,
                        borderRadius: 'var(--radius-md)',
                        background: 'transparent',
                        color: 'var(--text-tertiary)',
                        cursor: 'pointer',
                        fontWeight: 800, fontSize: '9px',
                        textTransform: 'uppercase',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text-secondary)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                    >
                      <Edit3 size={14} />
                      EDIT
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Modals ── */}
      {/* Payment Modal */}
      {paymentModal && (
        <div className="modal-overlay" onClick={() => setPaymentModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            {/* Header Context */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', paddingBottom: 'var(--space-4)', borderBottom: '2px solid var(--border)' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, background: 'var(--primary-alpha)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 'var(--font-lg)', color: 'var(--primary-deep)', border: '1px solid rgba(163,230,53,0.3)' }}>
                {(paymentModal.loan.customer?.name || 'U').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 'var(--font-base)', textTransform: 'uppercase' }}>{paymentModal.loan.customer?.name || 'Unknown'}</div>
                <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  <span style={{ color: 'var(--primary-deep)' }}>{paymentModal.loan.displayId}</span>
                  <span style={{ margin: '0 6px', color: 'var(--border)' }}>·</span>
                  Pending: <span style={{ color: 'var(--warning)', fontWeight: 800 }}>{formatCurrency(paymentModal.loan.pendingAmount)}</span>
                </div>
              </div>
            </div>
            
            <h3 className="modal-title" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 'var(--space-4)' }}>Record Slot Collection</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">Amount (₹)</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--text-tertiary)', fontSize: 'var(--font-lg)' }}>₹</span>
                    <input 
                      className="form-input" 
                      type="number" inputMode="decimal" min="0" 
                      style={{ paddingLeft: 32, fontSize: 'var(--font-xl)', fontWeight: 800, height: 56 }}
                      value={paymentModal.amount} 
                      onChange={e => setPaymentModal({ ...paymentModal, amount: e.target.value })}
                      autoFocus
                    />
                  </div>
                  {/* Quick pills */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {[
                      { label: 'Slot', value: paymentModal.emi.emiAmount - paymentModal.emi.paidAmount },
                      { label: 'Full', value: paymentModal.loan.pendingAmount },
                    ].filter(q => q.value > 0).map(q => (
                      <button
                        key={q.label} type="button"
                        onClick={() => setPaymentModal({ ...paymentModal, amount: q.value.toString() })}
                        style={{
                          padding: '3px 10px', borderRadius: 'var(--radius-pill)', 
                          border: `1px solid ${parseFloat(paymentModal.amount) === q.value ? 'var(--primary-deep)' : 'var(--border)'}`,
                          background: parseFloat(paymentModal.amount) === q.value ? 'var(--primary-alpha)' : 'var(--bg-card)',
                          color: parseFloat(paymentModal.amount) === q.value ? 'var(--primary-deep)' : 'var(--text-tertiary)',
                          fontSize: '10px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s'
                        }}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input 
                    className="form-input" type="date" 
                    style={{ height: 56 }}
                    value={paymentModal.date}
                    onChange={e => setPaymentModal({ ...paymentModal, date: e.target.value })}
                    onClick={e => (e.target as HTMLInputElement).showPicker?.()}
                  />
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setPaymentModal(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }} onClick={handleLoanPayment}>
                <Check size={16} strokeWidth={3} /> Record Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Schedule Modal */}
      {editScheduleModal && (
        <div className="modal-overlay" onClick={() => setEditScheduleModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <h3 className="modal-title">Edit Schedule</h3>
            <p className="page-header-sub" style={{marginBottom: 'var(--space-4)'}}>Adjust expected dates & amounts for {editScheduleModal.loan.customer?.name}</p>
            
            <div className="custom-scrollbar" style={{ overflowY: 'auto', flex: 1, paddingRight: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {Array.from({ length: editScheduleModal.tenure }).map((_, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--bg-soft)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Date</div>
                    <input 
                      type="date" 
                      className="form-input" 
                      value={editScheduleModal.dates[i] || ''} 
                      onChange={e => setEditScheduleModal({ ...editScheduleModal, dates: { ...editScheduleModal.dates, [i]: e.target.value } })}
                      onClick={e => (e.target as HTMLInputElement).showPicker?.()}
                    />
                  </div>
                  <div style={{ width: 110 }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Amount</div>
                    <input 
                      type="number" inputMode="decimal" 
                      className="form-input" 
                      placeholder="Amt"
                      value={editScheduleModal.amounts[i] ?? ''} 
                      onChange={e => setEditScheduleModal({ ...editScheduleModal, amounts: { ...editScheduleModal.amounts, [i]: e.target.value } })}
                    />
                  </div>
                </div>
              ))}
            </div>
            
            <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <button 
                className="btn btn-ghost btn-sm" 
                style={{ color: 'var(--primary-deep)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}
                onClick={() => setEditScheduleModal({...editScheduleModal, tenure: editScheduleModal.tenure + 1})}
              >
                 <Plus size={14} /> Add Installment
               </button>
               
               <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                 <button className="btn btn-ghost" onClick={() => setEditScheduleModal(null)}>Cancel</button>
                 <button className="btn btn-primary" onClick={handleSaveSchedule}>Save Changes</button>
               </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .slots-track::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
