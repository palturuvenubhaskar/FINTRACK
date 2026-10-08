import { useState, useEffect, useMemo, useContext } from 'react';
import { db, type Loan, formatCurrency } from '../db';
import { v4 as uuid } from 'uuid';
import { handleEnterToNext } from '../utils/keyboard';
import Fuse from 'fuse.js';
import { getEnrichedLoans } from '../services/LoanService';
import EmptyState from '../components/EmptyState';
import SkeletonList from '../components/SkeletonList';
import { AppContext } from '../App';
import { useIsMobile } from '../hooks/useIsMobile';

const daysOfWeek = ['All', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Collections() {
  const isMobile = useIsMobile();
  const { navigateToCustomer } = useContext(AppContext);
  const [tab, setTab] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [selectedDay, setSelectedDay] = useState<string>(new Date().toLocaleDateString('en-US', { weekday: 'long' }));
  const [dueLoans, setDueLoans] = useState<(Loan & { customerName: string; customerPhone: string; customerDisplayId: string; customerOccupation: string; customerPlace: string; paidToday: boolean; todayAmount: number; lastCollectionDate: number; arrearsAmount: number })[]>([]);
  const [showCollect, setShowCollect] = useState<string | null>(null);
  const [collectForm, setCollectForm] = useState({ amount: '', date: new Date().toLocaleDateString('en-CA'), mode: 'cash' as 'cash' | 'upi' | 'bank' | 'cheque', note: '' });
  const [search, setSearch] = useState('');
  const [sortType, setSortType] = useState(() => localStorage.getItem('ft_sort_collections') || 'default');
  useEffect(() => { localStorage.setItem('ft_sort_collections', sortType); }, [sortType]);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [receipt, setReceipt] = useState<{ amount: number, name: string, time: number, ref: string } | null>(null);

  useEffect(() => { loadDue(); }, []);

  async function loadDue() {
    setIsLoading(true);
    const enriched = await getEnrichedLoans();
    const activeLoans = enriched.filter(l => l.status === 'active' || l.status === 'overdue');

    const result = activeLoans.map(l => {
      let targetSlot = l.slots.find(s => s.status !== 'paid');
      
      let fallbackSlot = targetSlot;
      let isFullyPaidUp = false;
      if (!targetSlot || targetSlot.dueDate > Date.now()) {
        isFullyPaidUp = true;
        if (targetSlot) {
          const idx = l.slots.findIndex(s => s.id === targetSlot!.id);
          if (idx > 0) {
             fallbackSlot = l.slots[idx - 1];
          }
        } else if (l.slots.length > 0) {
          fallbackSlot = l.slots[l.slots.length - 1];
        }
      }

      const todayStart = new Date().setHours(0, 0, 0, 0);
      const madePaymentToday = l.slots.some(s => s.latestCollectionDate && s.latestCollectionDate >= todayStart);
      const paidToday = isFullyPaidUp || madePaymentToday;
      const todayAmount = fallbackSlot ? fallbackSlot.paidAmount : 0;
      
      let expectedAmount = fallbackSlot ? fallbackSlot.emiAmount : l.emiAmount;
      const totalDueAmount = Math.max(0, l.expectedAmountToDate - l.paidAmount);
      const arrearsAmount = Math.max(0, totalDueAmount - expectedAmount);
      const lastCollectionDate = l.slots.reduce((max, s) => Math.max(max, s.latestCollectionDate || 0), 0);

      return {
        ...l,
        customerName: l.customer?.name || 'Unknown',
        customerPhone: l.customer?.phone || '',
        customerDisplayId: l.customer?.displayId || '',
        customerOccupation: l.customer?.occupation || '',
        customerPlace: l.customer?.place || '',
        paidToday,
        todayAmount,
        lastCollectionDate,
        emiAmount: expectedAmount,
        arrearsAmount
      };
    });

    result.sort((a, b) => (a.paidToday ? 1 : 0) - (b.paidToday ? 1 : 0));
    setDueLoans(result as any);
    setTimeout(() => setIsLoading(false), 300);
  }

  function openCollect(loanId: string, emiAmount: number) {
    setShowCollect(loanId);
    setCollectForm({ amount: emiAmount.toString(), date: new Date().toLocaleDateString('en-CA'), mode: 'cash', note: '' });
    setError('');
  }

  async function handleCollect() {
    if (!showCollect) return;
    const amount = parseFloat(collectForm.amount);
    if (!amount || amount <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }

    const loan = await db.loans.get(showCollect);
    if (!loan) {
      setError('Loan not found.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const collId = uuid();
      const paymentMs = new Date(collectForm.date).getTime() || Date.now();

      await db.collections.add({
        id: collId, loanId: loan.id, customerId: loan.customerId,
        amount, date: paymentMs, mode: collectForm.mode,
        note: collectForm.note || "", createdAt: Date.now(),
        syncStatus: 'pending', updatedAt: Date.now()
      });

      const updatedCollections = (await db.collections.where('loanId').equals(loan.id).toArray()).filter(c => !c.deleted);
      const totalPaid = updatedCollections.reduce((sum, c) => sum + c.amount, 0);
      const newPending = Math.max(0, loan.totalPayable - totalPaid);
      const newStatus = newPending <= 0 ? 'closed' : loan.status;

      await db.loans.update(loan.id, {
        paidAmount: totalPaid, pendingAmount: newPending,
        status: newStatus, ...(newStatus === 'closed' ? { closedAt: Date.now() } : {}),
        syncStatus: 'pending', updatedAt: Date.now()
      });

      setShowCollect(null);
      loadDue();
      setReceipt({ amount, name: (loan as any).customerName || 'Unknown', time: Date.now(), ref: collId.slice(0, 8).toUpperCase() });
    } catch (err) {
      setError('Failed to record payment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const tabLoans = dueLoans.filter(l => l.type === tab);
  
  const baseDisplayLoans = useMemo(() => {
    return tabLoans.filter(l => selectedDay === 'All' || tab !== 'weekly' || l.collectionDay === selectedDay || !l.collectionDay);
  }, [tabLoans, selectedDay, tab]);

  const fuse = useMemo(() => new Fuse(baseDisplayLoans, {
    keys: ['customerName', 'customerPhone', 'customerDisplayId', 'displayId'],
    threshold: 0.3,
    ignoreLocation: true
  }), [baseDisplayLoans]);

  const displayLoans = useMemo(() => {
    let result = baseDisplayLoans;
    if (search.trim()) {
      result = fuse.search(search).map(r => r.item);
    }
    
    return [...result].sort((a, b) => {
      const aPaid = a.paidToday ? 1 : 0;
      const bPaid = b.paidToday ? 1 : 0;
      if (aPaid !== bPaid) return aPaid - bPaid;

      if (sortType === 'pending') return b.pendingAmount - a.pendingAmount;
      if (sortType === 'name-asc') return (a.customerName || '').localeCompare(b.customerName || '');
      if (sortType === 'name-desc') return (b.customerName || '').localeCompare(a.customerName || '');
      if (sortType === 'id') return (a.displayId || '').localeCompare(b.displayId || '');
      if (sortType === 'oldest') return a.createdAt - b.createdAt;
      return 0;
    });
  }, [baseDisplayLoans, search, sortType, fuse]);

  function getDayCount(day: string) {
    if (day === 'All') return tabLoans.length;
    return tabLoans.filter(l => l.collectionDay === day || !l.collectionDay).length;
  }

  const totalDue = displayLoans.filter(l => !l.paidToday).reduce((s, l) => s + l.emiAmount, 0);
  const totalCollected = displayLoans.filter(l => l.paidToday).reduce((s, l) => s + l.todayAmount, 0);
  const paidCount = displayLoans.filter(l => l.paidToday).length;
  const unpaidCount = displayLoans.filter(l => !l.paidToday).length;

  const selectedLoanForCollect = showCollect ? dueLoans.find(l => l.id === showCollect) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-2xl)', fontWeight: 800, fontFamily: 'var(--font-display)', margin: 0, textTransform: 'uppercase' }}>Collections</h2>
          <p className="page-header-sub" style={{ margin: 0, marginTop: 4 }}>
            {tab === 'daily' ? "Today's" : tab === 'weekly' ? "This week's" : "This month's"} due list · <span style={{ fontWeight: 700, color: 'var(--warning)' }}>{formatCurrency(totalDue)} pending</span>
          </p>
        </div>
      </div>

      {/* ── Tabs + Search + Sort ── */}
      <div className="card" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none' }}>
            <button className={`tab-btn ${tab === 'daily' ? 'active' : ''}`} onClick={() => setTab('daily')}>
              Daily ({dueLoans.filter(l => l.type === 'daily').length})
            </button>
            <button className={`tab-btn ${tab === 'weekly' ? 'active' : ''}`} onClick={() => setTab('weekly')}>
              Weekly ({dueLoans.filter(l => l.type === 'weekly').length})
            </button>
            <button className={`tab-btn ${tab === 'monthly' ? 'active' : ''}`} onClick={() => setTab('monthly')}>
              Monthly ({dueLoans.filter(l => l.type === 'monthly').length})
            </button>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flex: 1, justifyContent: 'flex-end' }}>
            <div className="search-bar" style={{ width: '100%', maxWidth: '320px', background: 'var(--bg-card)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input placeholder="Search customer..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="sort-minimal-container" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', padding: '0 var(--space-3)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
              <select className="sort-minimal" value={sortType} onChange={(e) => setSortType(e.target.value)}>
                <option value="default">Default</option>
                <option value="id">ID</option>
                <option value="pending">Pending</option>
                <option value="name-asc">A-Z</option>
                <option value="name-desc">Z-A</option>
                <option value="oldest">Oldest</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Day of Week Pills (Weekly only) ── */}
        {tab === 'weekly' && (
          <div style={{ display: 'flex', overflowX: 'auto', gap: 'var(--space-2)', paddingBottom: 2, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
            {daysOfWeek.map(day => {
              const count = getDayCount(day);
              const isActive = selectedDay === day;
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-pill)',
                    border: `1.5px solid ${isActive ? 'var(--primary-deep)' : 'var(--border)'}`,
                    background: isActive ? 'var(--primary-alpha)' : 'var(--bg-card)',
                    color: isActive ? 'var(--primary-deep)' : 'var(--text-secondary)',
                    fontWeight: isActive ? 700 : 600,
                    fontSize: 'var(--font-xs)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {day === 'All' ? 'All' : day.slice(0, 3)}
                  <span style={{ 
                    background: isActive ? 'var(--primary-deep)' : 'var(--bg-soft)', 
                    color: isActive ? '#fff' : 'var(--text-tertiary)',
                    borderRadius: '50%', width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '10px', fontWeight: 800
                  }}>{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Summary Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 'var(--space-3)' }}>
        <div className="stat-card" style={{ padding: 'var(--space-4)' }}>
          <span className="stat-label">Due Amount</span>
          <span className="stat-value" style={{ fontSize: 'var(--font-xl)', color: 'var(--warning)' }}>{formatCurrency(totalDue)}</span>
          <span className="stat-sub" style={{ borderTop: 'none', padding: 0, margin: 0 }}>{unpaidCount} pending</span>
        </div>
        <div className="stat-card" style={{ padding: 'var(--space-4)' }}>
          <span className="stat-label">Collected</span>
          <span className="stat-value" style={{ fontSize: 'var(--font-xl)', color: 'var(--success)' }}>{formatCurrency(totalCollected)}</span>
          <span className="stat-sub" style={{ borderTop: 'none', padding: 0, margin: 0 }}>{paidCount} paid</span>
        </div>
        {!isMobile && (
          <>
            <div className="stat-card" style={{ padding: 'var(--space-4)' }}>
              <span className="stat-label">Progress</span>
              <span className="stat-value" style={{ fontSize: 'var(--font-xl)' }}>{paidCount}/{displayLoans.length}</span>
              <span className="stat-sub" style={{ borderTop: 'none', padding: 0, margin: 0 }}>borrowers</span>
            </div>
            <div className="stat-card" style={{ padding: 'var(--space-4)' }}>
              <span className="stat-label">Rate</span>
              <span className="stat-value" style={{ fontSize: 'var(--font-xl)', color: displayLoans.length > 0 && paidCount / displayLoans.length >= 0.5 ? 'var(--success)' : 'var(--warning)' }}>
                {displayLoans.length > 0 ? Math.round((paidCount / displayLoans.length) * 100) : 0}%
              </span>
              <span className="stat-sub" style={{ borderTop: 'none', padding: 0, margin: 0 }}>completion</span>
            </div>
          </>
        )}
      </div>

      {/* ── Due List ── */}
      {isLoading ? (
        <SkeletonList count={5} />
      ) : displayLoans.length === 0 ? (
        <EmptyState
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:48, height:48, marginBottom:'var(--space-3)', color:'var(--text-tertiary)'}}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
          title={search ? "No results found" : `No ${tab} collections due`}
          subtext={search ? 'Try a different name or phone number' : `Create loans with ${tab} collection type to see them here`}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {displayLoans.map(l => (
            <div 
              key={l.id} 
              className="due-card" 
              style={{ 
                opacity: l.paidToday ? 0.55 : 1, 
                cursor: 'pointer',
                borderLeft: `4px solid ${l.paidToday ? 'var(--success)' : l.arrearsAmount > 0 ? 'var(--danger)' : 'var(--warning)'}`,
                background: l.paidToday ? 'var(--bg-soft)' : 'var(--bg-card)'
              }} 
              onClick={() => openCollect(l.id, l.emiAmount)}
            >
              <div className="due-card-info">
                <div 
                  className="due-avatar" 
                  style={{ 
                    background: l.paidToday ? 'var(--success-bg)' : l.arrearsAmount > 0 ? 'var(--danger-bg)' : 'var(--bg-soft)',
                    color: l.paidToday ? 'var(--success)' : l.arrearsAmount > 0 ? 'var(--danger)' : 'var(--text-primary)',
                    borderColor: l.paidToday ? 'var(--success)' : l.arrearsAmount > 0 ? 'var(--danger)' : 'var(--border)',
                    borderRadius: '50%'
                  }}
                >
                  {l.customerName.charAt(0)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="due-name" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span 
                      style={{ cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      onClick={(e) => { e.stopPropagation(); navigateToCustomer(l.customerId); }}
                    >
                      {l.customerName}
                    </span>
                  </div>
                  <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--primary-deep)' }}>{l.displayId}</span>
                    {l.customerOccupation && <span style={{ paddingLeft: 6, borderLeft: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>{l.customerOccupation}</span>}
                    {l.customerPlace && <span style={{ paddingLeft: 6, borderLeft: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>{l.customerPlace}</span>}
                  </div>
                </div>
              </div>
              <div className="due-actions">
                <div className="due-amount" style={{ textAlign: 'right' }}>
                  {l.paidToday ? (
                    <>
                      <div className="amount" style={{ color: l.todayAmount >= l.emiAmount ? 'var(--success)' : 'var(--warning)' }}>
                        {formatCurrency(l.todayAmount)}
                      </div>
                      <div className="label" style={{ color: l.todayAmount >= l.emiAmount ? 'var(--success)' : 'var(--warning)' }}>
                        paid {l.todayAmount < l.emiAmount ? `(short ${formatCurrency(l.emiAmount - l.todayAmount)})` : `(due ${formatCurrency(l.emiAmount)})`}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="amount">{formatCurrency(l.emiAmount)}</div>
                      <div className="label">
                        per {l.type === 'daily' ? 'day' : l.type === 'weekly' ? 'week' : 'month'}
                        {l.arrearsAmount > 0 && (
                          <span style={{ color: 'var(--danger)', fontWeight: 700 }}> +{formatCurrency(l.arrearsAmount)} arrears</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                {l.paidToday ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span className="badge badge-paid" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      Paid
                    </span>
                    {l.lastCollectionDate > 0 && (
                      <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {new Date(l.lastCollectionDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                ) : (
                  <button 
                    className="btn btn-primary btn-sm" 
                    style={{ borderRadius: 'var(--radius-pill)', fontWeight: 700, minWidth: 72 }}
                    onClick={(e) => { e.stopPropagation(); openCollect(l.id, l.emiAmount); }}
                  >
                    Collect
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Collect Modal ── */}
      {showCollect && (
        <div className="modal-overlay" onClick={() => setShowCollect(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} onKeyDown={handleEnterToNext}>
            
            {/* Modal Header with Customer Info */}
            {selectedLoanForCollect && (
              <div style={{ 
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)', 
                marginBottom: 'var(--space-4)', paddingBottom: 'var(--space-4)', borderBottom: '2px solid var(--border)' 
              }}>
                <div style={{ 
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--primary-alpha)', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  fontWeight: 800, fontSize: 'var(--font-lg)', color: 'var(--primary-deep)',
                  border: '1px solid rgba(163,230,53,0.3)'
                }}>
                  {selectedLoanForCollect.customerName.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 'var(--font-base)', textTransform: 'uppercase' }}>{selectedLoanForCollect.customerName}</div>
                  <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    <span style={{ color: 'var(--primary-deep)' }}>{selectedLoanForCollect.displayId}</span>
                    <span style={{ margin: '0 6px', color: 'var(--border)' }}>·</span>
                    Pending: <span style={{ color: 'var(--warning)', fontWeight: 800 }}>{formatCurrency(selectedLoanForCollect.pendingAmount)}</span>
                  </div>
                </div>
              </div>
            )}
            
            <h3 className="modal-title" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 'var(--space-4)' }}>Record Collection</h3>
            
            {error && (
              <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-4)', fontSize: 'var(--font-sm)', fontWeight: 600, border: '1px solid var(--danger)' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">Amount (₹)</label>
                  <input 
                    className="form-input" type="number" inputMode="decimal" min="0" 
                    style={{ fontSize: 'var(--font-lg)', fontWeight: 800 }}
                    onKeyDown={e => { if(e.key === '-' || e.key === 'e') e.preventDefault(); }} 
                    value={collectForm.amount} onChange={e => setCollectForm({ ...collectForm, amount: e.target.value })} autoFocus 
                  />
                  {/* Quick amount pills */}
                  {selectedLoanForCollect && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                      {[
                        { label: 'EMI', value: selectedLoanForCollect.emiAmount },
                        { label: 'Half', value: Math.round(selectedLoanForCollect.emiAmount / 2) },
                        { label: 'Full', value: selectedLoanForCollect.pendingAmount },
                      ].filter(q => q.value > 0 && q.value <= selectedLoanForCollect.pendingAmount).map(q => (
                        <button
                          key={q.label}
                          type="button"
                          onClick={() => setCollectForm({ ...collectForm, amount: q.value.toString() })}
                          style={{
                            padding: '3px 10px', borderRadius: 'var(--radius-pill)', 
                            border: `1px solid ${parseFloat(collectForm.amount) === q.value ? 'var(--primary-deep)' : 'var(--border)'}`,
                            background: parseFloat(collectForm.amount) === q.value ? 'var(--primary-alpha)' : 'var(--bg-card)',
                            color: parseFloat(collectForm.amount) === q.value ? 'var(--primary-deep)' : 'var(--text-tertiary)',
                            fontSize: '10px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s'
                          }}
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input 
                    className="form-input" type="date" 
                    value={collectForm.date} 
                    onChange={e => setCollectForm({ ...collectForm, date: e.target.value })} 
                    onClick={e => (e.target as HTMLInputElement).showPicker?.()}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Payment Mode</label>
                <div className="tabs" style={{ marginBottom: 0 }}>
                  {(['cash', 'upi', 'bank', 'cheque'] as const).map(m => (
                    <button key={m} className={`tab-btn ${collectForm.mode === m ? 'active' : ''}`} onClick={() => setCollectForm({ ...collectForm, mode: m })}>{m.toUpperCase()}</button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Note</label>
                <input className="form-input" placeholder="Reference no, remarks..." value={collectForm.note} onChange={e => setCollectForm({ ...collectForm, note: e.target.value })} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowCollect(null)} disabled={isSubmitting}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCollect} disabled={isSubmitting} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                {isSubmitting ? 'Recording...' : (
                  <>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    Record Payment
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Success Receipt ── */}
      {receipt && (
        <div className="modal-overlay" onClick={() => setReceipt(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '380px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
            {/* Top accent */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, var(--primary), var(--success), var(--primary))' }} />
            
            <div style={{ width: 64, height: 64, background: 'var(--success-bg)', color: 'var(--success)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-4)', border: '2px solid var(--success)', animation: 'popIn 0.3s ease' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--font-xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>Payment Successful</h3>
            <div style={{ fontSize: 'var(--font-3xl)', fontWeight: 800, color: 'var(--success)', marginBottom: 'var(--space-5)', fontFamily: 'var(--font-display)', lineHeight: 1 }}>{formatCurrency(receipt.amount)}</div>
            
            <div style={{ textAlign: 'left', background: 'var(--bg-soft)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-sm)', marginBottom: 'var(--space-5)', border: '1px solid var(--border)' }}>
              {[
                { label: 'Paid by', value: receipt.name },
                { label: 'Time', value: new Date(receipt.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) },
                { label: 'Ref ID', value: receipt.ref, mono: true },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: i < 2 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>{item.label}</span>
                  <span style={{ fontWeight: 700, ...(item.mono ? { fontFamily: 'monospace', letterSpacing: '1px' } : {}) }}>{item.value}</span>
                </div>
              ))}
            </div>

            <button className="btn btn-primary" style={{ width: '100%', height: 48 }} onClick={() => setReceipt(null)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
