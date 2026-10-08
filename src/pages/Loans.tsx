import { useState, useEffect, useMemo, useContext } from 'react';
import { db, type Loan, type Customer, type EmiStatus, calculateLoan, formatCurrency, formatDate, getNextLoanDisplayId } from '../db';
import { v4 as uuid } from 'uuid';
import PinScreen from '../components/PinScreen';
import SearchableSelect from '../components/SearchableSelect';
import EmptyState from '../components/EmptyState';
import OfflineWarning from '../components/OfflineWarning';
import SkeletonList from '../components/SkeletonList';
import { handleEnterToNext } from '../utils/keyboard';
import { useIsMobile } from '../hooks/useIsMobile';
import { AppContext } from '../App';
import Fuse from 'fuse.js';

export default function Loans() {
  const isMobile = useIsMobile();
  const { navigateToCustomer } = useContext(AppContext);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tab, setTab] = useState<'active' | 'closed' | 'npa'>('active');
  const [search, setSearch] = useState('');
  const [sortType, setSortType] = useState(() => localStorage.getItem('ft_sort_loans') || 'default');
  useEffect(() => { localStorage.setItem('ft_sort_loans', sortType); }, [sortType]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    displayId: '', customerId: '', amount: '', rate: '', planType: 'custom' as 'interest' | 'custom', customInstallment: '', type: 'daily' as 'daily' | 'weekly' | 'monthly',
    tenure: '', startDate: new Date().toISOString().split('T')[0], 
    collectionDay: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
    notes: '', discount: '',
  });

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [pinAction, setPinAction] = useState<(() => void) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (showCreate && !editingLoanId && form.customerId) {
      getNextLoanDisplayId(form.customerId).then(id => {
        setForm(f => ({ ...f, displayId: id }));
      });
    }
  }, [form.customerId, showCreate, editingLoanId]);

  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    if (activeMenuId) window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [activeMenuId]);

  useEffect(() => { load(); }, []);

  async function load() {
    setIsLoading(true);
    const allLoans = await db.loans.filter(l => !l.deleted).toArray();
    const allCustomers = await db.customers.filter(c => !c.deleted).toArray();
    // Join customer names
    const customerMap = Object.fromEntries(allCustomers.map(c => [c.id, c.name]));
    const occupationMap = Object.fromEntries(allCustomers.map(c => [c.id, c.occupation]));
    const placeMap = Object.fromEntries(allCustomers.map(c => [c.id, c.place]));
    const withNames = allLoans.map(l => ({ ...l, customerName: customerMap[l.customerId] || 'Unknown', customerOccupation: occupationMap[l.customerId], customerPlace: placeMap[l.customerId] }));
    setLoans(withNames.sort((a, b) => b.createdAt - a.createdAt));
    setCustomers(allCustomers);
    
    setTimeout(() => setIsLoading(false), 300);
  }

  const baseFilteredLoans = useMemo(() => {
    return loans.filter(l => {
        if (tab === 'active') return l.status === 'active' || l.status === 'overdue';
        return l.status === tab;
    });
  }, [loans, tab]);

  const fuse = useMemo(() => new Fuse(baseFilteredLoans, {
    keys: ['customerName', 'displayId'],
    threshold: 0.3,
    ignoreLocation: true
  }), [baseFilteredLoans]);

  const filtered = useMemo(() => {
    let result = baseFilteredLoans;
    if (search.trim()) {
      result = fuse.search(search).map(r => r.item);
    }
    
    return [...result].sort((a, b) => {
      if (sortType === 'principal') return b.amount - a.amount;
      if (sortType === 'status') {
        const order = { 'active': 1, 'overdue': 2, 'npa': 3, 'closed': 4 };
        return (order[a.status as keyof typeof order] || 5) - (order[b.status as keyof typeof order] || 5);
      }
      if (sortType === 'name-asc') return (a.customerName || '').localeCompare(b.customerName || '');
      if (sortType === 'name-desc') return (b.customerName || '').localeCompare(a.customerName || '');
      if (sortType === 'id') return (a.displayId || '').localeCompare(b.displayId || '');
      if (sortType === 'oldest') return a.createdAt - b.createdAt;
      return b.createdAt - a.createdAt; // default
    });
  }, [baseFilteredLoans, search, sortType, fuse]);

  // Live preview calculation
  const preview = useMemo(() => {
    const amt = parseFloat(form.amount) || 0;
    const tenure = parseInt(form.tenure) || 0;
    const discountAmt = parseFloat(form.discount) || 0;
    
    if (form.planType === 'interest') {
      const rate = parseFloat(form.rate) || 0;
      if (amt > 0 && rate > 0 && tenure > 0) {
        const calc = calculateLoan(amt, rate, tenure);
        const discountedTotal = Math.max(0, calc.totalPayable - discountAmt);
        return { ...calc, totalPayable: discountedTotal, emi: discountedTotal / tenure };
      }
    } else {
      const inst = parseFloat(form.customInstallment) || 0;
      if (amt > 0 && inst > 0 && tenure > 0) {
        let totalPayable = inst * tenure;
        totalPayable = Math.max(0, totalPayable - discountAmt);
        const totalInterest = totalPayable - amt;
        return { emi: inst, totalInterest: totalInterest > 0 ? totalInterest : 0, totalPayable };
      }
    }
    return null;
  }, [form.amount, form.rate, form.tenure, form.planType, form.customInstallment, form.discount]);

  function handleEditClick(l: Loan) {
    setActiveMenuId(null);
    setPinAction(() => () => {
      setEditingLoanId(l.id);
      
      const expectedInterestPayable = calculateLoan(l.amount, l.rate, l.tenure).totalPayable;
      const actualPayable = l.totalPayable + (l.discount || 0);
      const isInterest = l.rate > 0 && Math.abs(expectedInterestPayable - actualPayable) < 0.01;

      setForm({
        displayId: l.displayId || '',
        customerId: l.customerId,
        amount: l.amount.toString(),
        rate: l.rate.toString(),
        planType: isInterest ? 'interest' : 'custom',
        customInstallment: l.emiAmount.toString(),
        type: l.type,
        tenure: l.tenure.toString(),
        startDate: new Date(l.startDate).toISOString().split('T')[0],
        collectionDay: l.collectionDay || new Date(l.startDate).toLocaleDateString('en-US', { weekday: 'long' }),
        notes: l.notes || '',
        discount: (l.discount || '').toString()
      });
      setError('');
      setShowCreate(true);
    });
  }

  async function handleCreate() {
    const amt = parseFloat(form.amount);
    const tenure = parseInt(form.tenure);
    
    if (!form.customerId) { setError('Please select a borrower.'); return; }
    if (!amt || amt <= 0) { setError('Please enter a valid loan amount.'); return; }
    if (!tenure || tenure <= 0) { setError('Please enter a valid tenure.'); return; }

    if (form.displayId.trim()) {
      const existing = loans.find(l => 
        l.id !== editingLoanId && 
        (l.displayId || '').toLowerCase() === form.displayId.trim().toLowerCase()
      );
      if (existing) {
        setError(`Loan ID "${form.displayId.trim()}" is already used by ${existing.customerName}.`);
        return;
      }
    }

    let rate = 0;
    let finalEmi = 0;
    let totalPayable = 0;
    const discountAmt = parseFloat(form.discount) || 0;

    if (form.planType === 'interest') {
      rate = parseFloat(form.rate);
      if (!rate || rate <= 0) { setError('Please enter a valid interest rate.'); return; }
      const calc = calculateLoan(amt, rate, tenure);
      totalPayable = calc.totalPayable;
      totalPayable = Math.max(0, totalPayable - discountAmt);
      finalEmi = totalPayable / tenure;
    } else {
      finalEmi = parseFloat(form.customInstallment);
      if (!finalEmi || finalEmi <= 0) { setError('Please enter a valid installment amount.'); return; }
      totalPayable = finalEmi * tenure;
      // Calculate implied rate: rate = (TotalInterest / Principal / Tenure) * 100
      totalPayable = Math.max(0, totalPayable - discountAmt);
      const totalInterest = totalPayable - amt;
      rate = (totalInterest / amt / tenure) * 100;
      if (rate < 0) rate = 0; // fallback if they enter an amount less than principal
    }

    setError('');
    setIsSubmitting(true);
    
    try {
      const startMs = new Date(form.startDate).getTime() || Date.now();
      const loanId = editingLoanId || uuid();
      const existingLoan = editingLoanId ? loans.find(l => l.id === editingLoanId) : null;
      const displayId = form.displayId.trim() || existingLoan?.displayId || await getNextLoanDisplayId(form.customerId);
      const paidAmount = existingLoan?.paidAmount || 0;

      // Generate exact EMI schedule based on total payable
      const emis = [];
      let remaining = totalPayable;
      let actualTenure = 0;
      
      const isCustomEmi = form.planType === 'custom';
      
      if (finalEmi > 0) {
        while (remaining > 0) {
          let currentEmi = Math.min(finalEmi, remaining);
          if (!isCustomEmi && actualTenure === tenure - 1) {
            currentEmi = remaining;
          }
          
          const dueDate = form.type === 'daily'
            ? startMs + actualTenure * 86400000
            : form.type === 'weekly'
            ? startMs + actualTenure * 7 * 86400000
            : (() => { const d = new Date(startMs); d.setMonth(d.getMonth() + actualTenure); return d.getTime(); })();
            
          emis.push({
            id: uuid(), loanId, emiNumber: actualTenure + 1, dueDate,
            emiAmount: currentEmi, status: 'pending' as EmiStatus, paidAmount: 0,
            syncStatus: 'pending' as const, updatedAt: Date.now()
          });
          
          remaining -= currentEmi;
          remaining = Math.round(remaining * 100) / 100;
          actualTenure++;
          
          if (!isCustomEmi && actualTenure >= tenure) break;
        }
      }

      // Apply previously paid amount linearly to new schedule
      let unappliedPayment = paidAmount;
      for (const emi of emis) {
        if (unappliedPayment >= emi.emiAmount) {
          emi.paidAmount = emi.emiAmount;
          emi.status = 'paid';
          unappliedPayment -= emi.emiAmount;
        } else if (unappliedPayment > 0) {
          emi.paidAmount = unappliedPayment;
          emi.status = 'partial';
          unappliedPayment = 0;
        }
      }

      const newPendingAmount = Math.max(0, totalPayable - paidAmount);
      const newStatus = newPendingAmount <= 0 ? 'closed' : (existingLoan?.status === 'npa' ? 'npa' : 'active');

      if (editingLoanId) {
        // Soft delete old EMIs
        await db.emis.where('loanId').equals(loanId).modify({ deleted: true, syncStatus: 'pending', updatedAt: Date.now() });
        // Update loan
        await db.loans.update(loanId, {
          displayId, customerId: form.customerId, amount: amt, rate, type: form.type, tenure: actualTenure || tenure, startDate: startMs,
          emiAmount: finalEmi, totalPayable, pendingAmount: newPendingAmount, status: newStatus,
          collectionDay: form.collectionDay, notes: form.notes || "", discount: discountAmt > 0 ? discountAmt : undefined,
          syncStatus: 'pending', updatedAt: Date.now()
        });
        await db.emis.bulkAdd(emis);
      } else {
        await db.loans.add({
          id: loanId, displayId, customerId: form.customerId,
          amount: amt, rate, type: form.type, tenure: actualTenure || tenure, startDate: startMs,
          emiAmount: finalEmi, totalPayable: totalPayable,
          paidAmount: 0, pendingAmount: totalPayable,
          status: 'active', 
          collectionDay: form.collectionDay,
          notes: form.notes || "",
          discount: discountAmt > 0 ? discountAmt : undefined,
          createdAt: Date.now(),
          syncStatus: 'pending', updatedAt: Date.now()
        });
        await db.emis.bulkAdd(emis);
      }

      setShowCreate(false);
      setEditingLoanId(null);
      setForm({ displayId: '', customerId: '', amount: '', rate: '', planType: 'custom', customInstallment: '', type: 'daily', tenure: '', startDate: new Date().toISOString().split('T')[0], collectionDay: new Date().toLocaleDateString('en-US', { weekday: 'long' }), notes: '', discount: '' });
      
      setDeleteConfirmId(null);
      load();
    } catch (err) {
      console.error('Loan creation error:', err);
      setError('Failed to create loan: ' + (err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function getProgress(l: Loan) {
    if (l.totalPayable === 0) return 0;
    return Math.min(100, (l.paidAmount / l.totalPayable) * 100);
  }

  async function handleDeleteLoan(id: string) {
    const deleteAction = async () => {
      setIsSubmitting(true);
      try {
        const now = Date.now();
        await db.emis.where('loanId').equals(id).modify({ deleted: true, syncStatus: 'pending', updatedAt: now });
        await db.collections.where('loanId').equals(id).modify({ deleted: true, syncStatus: 'pending', updatedAt: now });
        await db.loans.update(id, { deleted: true, syncStatus: 'pending', updatedAt: now });
        setDeleteConfirmId(null);
        load();
      } finally {
        setIsSubmitting(false);
      }
    };
    setPinAction(() => deleteAction);
  }

  async function handleMarkNpa(id: string) {
    const action = async () => {
      setIsSubmitting(true);
      try {
        await db.loans.update(id, { status: 'npa', syncStatus: 'pending', updatedAt: Date.now() });
        load();
      } finally {
        setIsSubmitting(false);
      }
    };
    setPinAction(() => action);
  }

  async function handleMarkActive(id: string) {
    const action = async () => {
      setIsSubmitting(true);
      try {
        await db.loans.update(id, { status: 'active', syncStatus: 'pending', updatedAt: Date.now() });
        load();
      } finally {
        setIsSubmitting(false);
      }
    };
    setPinAction(() => action);
  }

  async function handleMarkClosed(id: string) {
    const action = async () => {
      setIsSubmitting(true);
      try {
        const loan = await db.loans.get(id);
        if (loan) {
          const now = Date.now();
          await db.loans.update(id, { 
            status: 'closed', 
            paidAmount: loan.totalPayable,
            pendingAmount: 0,
            closedAt: now, 
            syncStatus: 'pending', 
            updatedAt: now 
          });
          const emis = await db.emis.where('loanId').equals(id).toArray();
          const updatedEmis = emis.map(e => ({
            ...e,
            status: 'paid' as const,
            paidAmount: e.emiAmount,
            syncStatus: 'pending' as const,
            updatedAt: now
          }));
          await db.emis.bulkPut(updatedEmis);
        }
        load();
      } finally {
        setIsSubmitting(false);
      }
    };
    setPinAction(() => action);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-2xl)', fontWeight: 800, fontFamily: 'var(--font-display)', margin: 0, textTransform: 'uppercase' }}>Loans</h2>
        </div>
        <button className="btn btn-primary" onClick={() => { 
          setError(''); 
          setEditingLoanId(null);
          setForm({ displayId: '', customerId: '', amount: '', rate: '', planType: 'custom', customInstallment: '', type: 'daily', tenure: '', startDate: new Date().toISOString().split('T')[0], collectionDay: new Date().toLocaleDateString('en-US', { weekday: 'long' }), notes: '', discount: '' });
          setShowCreate(true); 
        }}>
          + New Loan
        </button>
      </div>

      <div className="card" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flex: 1 }}>
          <div className="search-bar" style={{ width: '100%', background: 'var(--bg-card)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input placeholder="Search customer or ID..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="sort-minimal-container" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', padding: '0 var(--space-3)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
            <select className="sort-minimal" value={sortType} onChange={(e) => setSortType(e.target.value)}>
              <option value="default">Default</option>
              <option value="id">ID</option>
              <option value="principal">Principal</option>
              <option value="status">Status</option>
              <option value="name-asc">A-Z</option>
              <option value="name-desc">Z-A</option>
              <option value="oldest">Oldest</option>
            </select>
          </div>
        </div>
        <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none' }}>
          <button className={`tab-btn ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>Active & Overdue</button>
          <button className={`tab-btn ${tab === 'closed' ? 'active' : ''}`} onClick={() => setTab('closed')}>Closed</button>
          <button className={`tab-btn ${tab === 'npa' ? 'active' : ''}`} onClick={() => setTab('npa')}>NPA</button>
        </div>
      </div>

      {isLoading ? (
        <SkeletonList count={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:48, height:48, marginBottom:'var(--space-3)', color:'var(--text-tertiary)'}}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>}
          title={search ? "No results found" : `No ${tab} loans`}
          subtext={search ? "Try a different keyword." : "Create a new loan to get started."}
          actionText={!search ? "Create Loan" : undefined}
          onAction={!search ? () => { setError(''); setShowCreate(true); } : undefined}
        />
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {filtered.map((l, index) => {
            const isLastRows = index >= filtered.length - 2 && index > 0;
            return (
            <div key={l.id} className="card loan-card-premium" style={{ 
              position: 'relative', 
              background: 'var(--bg-card)', 
              border: '1px solid var(--border)',
              borderRadius: '20px', 
              padding: '20px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.03)',
              display: 'flex', flexDirection: 'column', gap: '16px',
              overflow: 'hidden'
            }}>
              {(l.status === 'overdue' || l.status === 'npa') && (
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: l.status === 'overdue' ? 'var(--danger)' : '#7f1d1d' }} />
              )}
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0, paddingRight: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-deep)', background: 'var(--primary-alpha)', padding: '2px 8px', borderRadius: '6px', letterSpacing: '0.5px' }}>{l.displayId}</span>
                    <span className={`badge ${l.status === 'npa' ? 'badge-danger' : `badge-${l.status}`}`} style={{ fontSize: '10px', padding: '2px 6px' }}>{l.status.toUpperCase()}</span>
                    <span className={`badge ${l.type === 'daily' ? 'badge-active' : l.type === 'weekly' ? 'badge-upi' : 'badge-warning'}`} style={{ fontSize: '10px', padding: '2px 6px' }}>{l.type.toUpperCase()}</span>
                  </div>
                  
                  <div 
                    style={{ margin: '2px 0 0 0', cursor: 'pointer' }}
                    onClick={() => navigateToCustomer(l.customerId)}
                  >
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: '1.2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.customerName || (l as any).customer?.name || 'Unknown'}
                    </h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, marginTop: '4px' }}>
                      <span>{formatDate(l.startDate)}</span>
                      <span style={{ color: 'var(--border-focus)', opacity: 0.3 }}>•</span>
                      <span>{l.tenure} {l.type === 'daily' ? 'days' : l.type === 'weekly' ? 'weeks' : 'months'}</span>
                      {l.status === 'closed' && l.closedAt && <><span style={{ color: 'var(--border-focus)', opacity: 0.3 }}>•</span><span style={{ color: 'var(--success)' }}>Closed: {formatDate(l.closedAt)}</span></>}
                    </div>
                  </div>
                </div>

                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button style={{ background: 'var(--bg-soft)', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === l.id ? null : l.id); }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                      <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
                    </svg>
                  </button>
                  {activeMenuId === l.id && (
                    <div style={{ position: 'absolute', right: 0, top: isLastRows ? 'auto' : '100%', bottom: isLastRows ? '100%' : 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: '0 12px 32px rgba(0,0,0,0.12)', zIndex: 100, minWidth: '150px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                      <button className="menu-btn" onClick={() => handleEditClick(l)}>Edit Loan</button>
                      {l.status !== 'npa' && l.status !== 'closed' && (
                        <button className="menu-btn" onClick={() => { handleMarkNpa(l.id); setActiveMenuId(null); }}>Mark NPA</button>
                      )}
                      {l.status === 'npa' && (
                        <button className="menu-btn text-success" onClick={() => { handleMarkActive(l.id); setActiveMenuId(null); }}>Mark Active</button>
                      )}
                      {l.status !== 'closed' && (
                        <button className="menu-btn text-warning" onClick={() => { handleMarkClosed(l.id); setActiveMenuId(null); }}>Close Loan</button>
                      )}
                      <button className="menu-btn text-danger" onClick={() => { setDeleteConfirmId(l.id); setActiveMenuId(null); }}>Delete</button>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'var(--bg-soft)', padding: '14px', borderRadius: '16px', border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Principal</div>
                  <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text-primary)' }}>{formatCurrency(l.amount)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Total Payable</div>
                  <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text-primary)' }}>{formatCurrency(l.totalPayable)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--success)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Recovered</div>
                  <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--success)' }}>{formatCurrency(l.paidAmount)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: l.pendingAmount > 0 ? 'var(--warning-text)' : 'var(--success)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Pending</div>
                  <div style={{ fontWeight: 800, fontSize: '15px', color: l.pendingAmount > 0 ? 'var(--warning-text)' : 'var(--success)' }}>{formatCurrency(l.pendingAmount)}</div>
                </div>
              </div>

              <div style={{ background: 'transparent', padding: '0 4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>EMI Installment</div>
                  <div style={{ fontWeight: 800, fontSize: '17px', color: 'var(--primary-deep)', display: 'flex', alignItems: 'baseline', gap: '2px', lineHeight: '1' }}>
                    {formatCurrency(l.emiAmount)}<span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 700 }}>/{l.type === 'daily' ? 'day' : l.type === 'weekly' ? 'wk' : 'mo'}</span>
                  </div>
                </div>
                <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${getProgress(l)}%`, background: l.status === 'overdue' ? 'var(--danger)' : l.status === 'npa' ? '#7f1d1d' : 'var(--success)', borderRadius: '3px', transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                </div>
              </div>

              <style>{`
                .loan-card-premium { transition: transform 0.2s, box-shadow 0.2s; }
                .loan-card-premium:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0,0,0,0.06) !important; }
                .menu-btn { padding: 10px 12px; text-align: left; background: transparent; border: none; color: var(--text-primary); cursor: pointer; font-size: 13px; font-weight: 700; border-radius: 8px; transition: background 0.15s; }
                .menu-btn:hover { background: var(--bg-border); }
                .text-success { color: var(--success) !important; }
                .text-warning { color: var(--warning-text) !important; }
                .text-danger { color: var(--danger) !important; }
              `}</style>
            </div>
            );
          })}
        </div>
      ) : (
        <div className="table-cards-modern" style={{ width: '100%', overflowX: 'auto', paddingBottom: 'var(--space-6)' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 12px', minWidth: '950px' }}>
            <thead>
              <tr>
                <th style={{ padding: '0 var(--space-4)', color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: 'none', background: 'transparent' }}>Customer</th>
                <th style={{ padding: '0 var(--space-4)', color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: 'none', background: 'transparent' }}>Type</th>
                <th style={{ padding: '0 var(--space-4)', color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: 'none', background: 'transparent' }}>Amount</th>
                <th style={{ padding: '0 var(--space-4)', color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: 'none', background: 'transparent' }}>EMI</th>
                <th style={{ padding: '0 var(--space-4)', color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: 'none', background: 'transparent' }}>Status</th>
                <th style={{ padding: '0 var(--space-4)', color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: 'none', background: 'transparent' }}>Progress</th>
                <th style={{ padding: '0 var(--space-4)', color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: 'none', background: 'transparent', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l, index, arr) => {
                const isLastRows = index >= arr.length - 2;
                const isDanger = l.status === 'overdue' || l.status === 'npa';
                const statusColor = l.status === 'overdue' ? 'var(--danger)' : l.status === 'npa' ? 'var(--danger-text)' : l.status === 'closed' ? 'var(--text-tertiary)' : 'var(--success)';
                
                return (
                <tr key={l.id} className="modern-row" style={{ 
                  background: 'var(--bg-card)', 
                  boxShadow: 'var(--shadow-card)',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  cursor: 'default'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow-card)'; }}
                >
                  <td style={{ 
                    padding: 'var(--space-3) var(--space-4)', 
                    borderTopLeftRadius: 'var(--radius-lg)', 
                    borderBottomLeftRadius: 'var(--radius-lg)', 
                    borderLeft: `4px solid ${statusColor}`,
                    borderTop: '1px solid var(--border)',
                    borderBottom: '1px solid var(--border)'
                  }}>
                    <div 
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
                      onClick={() => navigateToCustomer(l.customerId)}
                    >
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--text-primary)', fontSize: 'var(--font-lg)', flexShrink: 0, border: '1px solid var(--border)' }}>
                      {((l as any).customerName || (l as any).customer?.name || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 'var(--font-base)', color: 'var(--text-primary)', textTransform: 'uppercase' }}>{l.customerName}</div>
                        <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                          <span style={{ color: 'var(--primary-deep)' }}>{l.displayId}</span>
                          {(l as any).customerPlace && <span style={{ textTransform: 'capitalize' }}>• {(l as any).customerPlace}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                    <span className={`badge ${l.type === 'daily' ? 'badge-active' : l.type === 'weekly' ? 'badge-upi' : 'badge-warning'}`} style={{ padding: '4px 8px' }}>{l.type.toUpperCase()}</span>
                    <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', marginTop: 6, fontWeight: 600 }}>{l.tenure} {l.type === 'daily' ? 'days' : l.type === 'weekly' ? 'weeks' : 'months'}</div>
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 800, fontSize: 'var(--font-base)' }}>{formatCurrency(l.amount)}</div>
                    <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', fontWeight: 600, marginTop: 4 }}>Total: {formatCurrency(l.totalPayable)}</div>
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 800, fontSize: 'var(--font-base)' }}>{formatCurrency(l.emiAmount)}</div>
                    <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', fontWeight: 600, marginTop: 4 }}>/ {l.type === 'daily' ? 'day' : l.type === 'weekly' ? 'week' : 'month'}</div>
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                    <span className={`badge ${l.status === 'npa' ? 'badge-danger' : l.status === 'overdue' ? 'badge-overdue' : l.status === 'closed' ? 'badge-closed' : 'badge-active'}`} style={{ padding: '6px 12px', borderRadius: '8px' }}>{l.status.toUpperCase()}</span>
                    {l.status === 'closed' && l.closedAt && (
                      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: 4, fontWeight: 700 }}>Closed: {formatDate(l.closedAt)}</div>
                    )}
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', minWidth: '180px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-xs)', fontWeight: 700, marginBottom: '8px' }}>
                      <span style={{ color: 'var(--success)' }}>{formatCurrency(l.paidAmount)}</span>
                      <span style={{ color: l.pendingAmount > 0 ? 'var(--warning)' : 'var(--success)' }}>{formatCurrency(l.pendingAmount)}</span>
                    </div>
                    <div className="progress-bar" style={{ height: '8px', background: 'var(--bg-soft)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div className="progress-fill" style={{ width: `${getProgress(l)}%`, background: isDanger ? 'var(--danger)' : 'var(--primary-deep)', height: '100%', borderRadius: '4px' }} />
                    </div>
                  </td>
                  <td style={{ 
                    padding: 'var(--space-3) var(--space-4)', 
                    textAlign: 'center', 
                    position: 'relative',
                    borderTopRightRadius: 'var(--radius-lg)', 
                    borderBottomRightRadius: 'var(--radius-lg)',
                    borderRight: '1px solid var(--border)',
                    borderTop: '1px solid var(--border)',
                    borderBottom: '1px solid var(--border)'
                  }}>
                    <button style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '50%', color: 'var(--text-secondary)', cursor: 'pointer', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', margin: '0 auto' }} onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === l.id ? null : l.id); }} onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-primary)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-soft)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
                      </svg>
                    </button>
                    {activeMenuId === l.id && (
                      <div style={{ position: 'absolute', right: '50%', top: isLastRows ? 'auto' : '50%', bottom: isLastRows ? '50%' : 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-shell)', zIndex: 100, minWidth: '140px', padding: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <button style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 'var(--font-sm)', fontWeight: 600, borderRadius: 'var(--radius-sm)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-soft)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} onClick={() => handleEditClick(l)}>Edit Loan</button>
                        {l.status !== 'npa' && l.status !== 'closed' && (
                          <button style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 'var(--font-sm)', fontWeight: 600, borderRadius: 'var(--radius-sm)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-soft)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} onClick={() => { handleMarkNpa(l.id); setActiveMenuId(null); }}>Mark NPA</button>
                        )}
                        {l.status === 'npa' && (
                          <button style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--success)', cursor: 'pointer', fontSize: 'var(--font-sm)', fontWeight: 600, borderRadius: 'var(--radius-sm)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--success-bg)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} onClick={() => { handleMarkActive(l.id); setActiveMenuId(null); }}>Mark Active</button>
                        )}
                        {l.status !== 'closed' && (
                          <button style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--warning)', cursor: 'pointer', fontSize: 'var(--font-sm)', fontWeight: 600, borderRadius: 'var(--radius-sm)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--warning-bg)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} onClick={() => { handleMarkClosed(l.id); setActiveMenuId(null); }}>Close Loan</button>
                        )}
                        <button style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 'var(--font-sm)', fontWeight: 600, borderRadius: 'var(--radius-sm)', transition: 'background 0.2s', marginTop: '4px', borderTop: '1px solid var(--border)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--danger-bg)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} onClick={() => { setDeleteConfirmId(l.id); setActiveMenuId(null); }}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} onKeyDown={handleEnterToNext}>
            <h3 className="modal-title">{editingLoanId ? 'Edit Loan' : 'Create New Loan'}</h3>
            
            {error && (
              <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 6, marginBottom: 'var(--space-4)', fontSize: 'var(--font-sm)', fontWeight: 500, border: '1px solid var(--danger)' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label">Plan Type</label>
                <div className="tabs" style={{ marginBottom: 0 }}>
                  <button className={`tab-btn ${form.planType === 'custom' ? 'active' : ''}`} onClick={() => setForm({ ...form, planType: 'custom' })}>Custom Plan</button>
                  <button className={`tab-btn ${form.planType === 'interest' ? 'active' : ''}`} onClick={() => setForm({ ...form, planType: 'interest' })}>Interest Plan</button>
                </div>
              </div>
              {editingLoanId && (
                <div className="form-group">
                  <label className="form-label">Loan ID</label>
                  <input className="form-input" placeholder="e.g. 101C001L01 (Auto-generated if left blank)" value={form.displayId} onChange={e => setForm({ ...form, displayId: e.target.value })} />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Select Customer</label>
                <SearchableSelect
                  options={customers.filter(c => c.isActive).map(c => ({ value: c.id, label: `${c.name} (${c.displayId || ''})`, sub: c.phone }))}
                  value={form.customerId}
                  onChange={v => setForm({ ...form, customerId: v })}
                  placeholder="Search by name, phone, or ID..."
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Loan Amount</label>
                  <input className="form-input" type="number" inputMode="decimal" min="0" onKeyDown={e => { if(e.key === '-' || e.key === 'e') e.preventDefault(); }} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
                {form.planType === 'interest' ? (
                  <div className="form-group">
                    <label className="form-label">Interest</label>
                    <input className="form-input" type="number" inputMode="decimal" step="0.1" min="0" onKeyDown={e => { if(e.key === '-' || e.key === 'e') e.preventDefault(); }} value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} />
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="form-label">Installment Amount</label>
                    <input className="form-input" type="number" inputMode="decimal" step="1" min="0" onKeyDown={e => { if(e.key === '-' || e.key === 'e') e.preventDefault(); }} value={form.customInstallment} onChange={e => setForm({ ...form, customInstallment: e.target.value })} />
                  </div>
                )}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Collection Type</label>
                  <div className="tabs" style={{ marginBottom: 0 }}>
                    <button className={`tab-btn ${form.type === 'daily' ? 'active' : ''}`} onClick={() => setForm({ ...form, type: 'daily' })}>Daily</button>
                    <button className={`tab-btn ${form.type === 'weekly' ? 'active' : ''}`} onClick={() => setForm({ ...form, type: 'weekly' })}>Weekly</button>
                    <button className={`tab-btn ${form.type === 'monthly' ? 'active' : ''}`} onClick={() => setForm({ ...form, type: 'monthly' })}>Monthly</button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Tenure ({form.type === 'daily' ? 'days' : form.type === 'weekly' ? 'weeks' : 'months'})</label>
                  <input className="form-input" type="number" inputMode="numeric" pattern="[0-9]*" min="0" onKeyDown={e => { if(e.key === '-' || e.key === 'e' || e.key === '.') e.preventDefault(); }} value={form.tenure} onChange={e => setForm({ ...form, tenure: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Start Date</label>
                  <input className="form-input" type="date" value={form.startDate} onClick={e => (e.target as HTMLInputElement).showPicker?.()} onChange={e => {
                    const newDate = e.target.value;
                    const dayName = new Date(newDate).toLocaleDateString('en-US', { weekday: 'long' });
                    setForm({ ...form, startDate: newDate, collectionDay: dayName });
                  }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Discount</label>
                  <input className="form-input" type="number" inputMode="decimal" min="0" onKeyDown={e => { if(e.key === '-' || e.key === 'e') e.preventDefault(); }} value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })} />
                </div>
              </div>
              {form.type === 'weekly' && (
                <div className="form-group">
                  <label className="form-label">Route / Collection Day</label>
                  <select className="form-select" value={form.collectionDay} onChange={e => {
                    const newDay = e.target.value;
                    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const targetDayIndex = days.indexOf(newDay);
                    const currentDate = new Date(form.startDate);
                    const currentDayIndex = currentDate.getDay();
                    let diff = targetDayIndex - currentDayIndex;
                    if (diff < 0) diff += 7;
                    const nextDate = new Date(currentDate);
                    nextDate.setDate(currentDate.getDate() + diff);
                    setForm({ ...form, collectionDay: newDay, startDate: nextDate.toISOString().split('T')[0] });
                  }}>
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-textarea form-input" placeholder="Purpose, remarks..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>

              {preview && (
                <div className="preview-card">
                  <h4>💰 Loan Preview</h4>
                  <div className="preview-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 'var(--space-3)' }}>
                    <div className="preview-item">
                      <div className="preview-label">Installment</div>
                      <div className="preview-value">{formatCurrency(preview.emi)}</div>
                    </div>
                    {parseFloat(form.discount) > 0 && (
                      <div className="preview-item">
                        <div className="preview-label">Discount</div>
                        <div className="preview-value" style={{ color: 'var(--success)' }}>-{formatCurrency(parseFloat(form.discount))}</div>
                      </div>
                    )}
                    <div className="preview-item">
                      <div className="preview-label">Total Payable</div>
                      <div className="preview-value">{formatCurrency(preview.totalPayable)}</div>
                    </div>
                  </div>
                </div>
              )}
              <OfflineWarning />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)} disabled={isSubmitting}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={isSubmitting}>
                {isSubmitting ? (editingLoanId ? 'Saving...' : 'Creating...') : (editingLoanId ? 'Save Changes' : 'Create Loan')}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: 'var(--space-4)' }}>
              <div style={{ width: 48, height: 48, background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-3)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
              </div>
              <h3 className="modal-title" style={{ color: 'var(--danger)' }}>Delete Loan</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-sm)', marginTop: 'var(--space-2)' }}>
                Are you sure you want to delete this loan? All of its associated EMIs and collections will also be permanently deleted. This action cannot be undone.
              </p>
            </div>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-ghost" onClick={() => setDeleteConfirmId(null)} disabled={isSubmitting}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDeleteLoan(deleteConfirmId)} disabled={isSubmitting}>
                {isSubmitting ? 'Deleting...' : 'Yes, Delete Loan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pinAction && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999 }}>
          <PinScreen mode="verify" onSuccess={async () => {
            await pinAction();
            setPinAction(null);
          }} onCancel={() => setPinAction(null)} />
        </div>
      )}
    </div>
  );
}
