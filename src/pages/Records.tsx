import { useState, useEffect, useRef, useContext, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { db, type Collection, type Loan, type Customer, formatCurrency, formatDate } from '../db';
import EmptyState from '../components/EmptyState';
import PinScreen from '../components/PinScreen';
import { useIsMobile } from '../hooks/useIsMobile';
import { AppContext } from '../App';
import Fuse from 'fuse.js';

interface DetailedRow {
  loan: Loan;
  customer: Customer | undefined;
  collections: Collection[];
}

export default function Records() {
  const isMobile = useIsMobile();
  const { navigateToCustomer } = useContext(AppContext);
  const [tab, setTab] = useState<'collections' | 'closed' | 'detailed'>('collections');
  const [collections, setCollections] = useState<(Collection & { customerName: string })[]>([]);
  const [closedLoans, setClosedLoans] = useState<(Loan & { customerName: string })[]>([]);
  const [detailedRows, setDetailedRows] = useState<DetailedRow[]>([]);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'dateDesc' | 'dateAsc' | 'amountDesc' | 'nameAsc'>('dateDesc');
  
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pinAction, setPinAction] = useState<(() => void) | null>(null);

  useEffect(() => { loadData(); }, [tab, dateFrom, dateTo, sortBy]);

  async function loadData() {
    const customers = await db.customers.toArray();
    const custMap = Object.fromEntries(customers.map(c => [c.id, c]));

    if (tab === 'collections') {
      let all = await db.collections.filter(c => !c.deleted).toArray();
      if (dateFrom) all = all.filter(c => c.date >= new Date(dateFrom).getTime());
      if (dateTo) all = all.filter(c => c.date <= new Date(dateTo).getTime() + 86400000);
      
      const mapped = all.map(c => ({ ...c, customerName: custMap[c.customerId]?.name || 'Unknown' }));
      if (sortBy === 'dateDesc') mapped.sort((a, b) => b.date - a.date);
      else if (sortBy === 'dateAsc') mapped.sort((a, b) => a.date - b.date);
      else if (sortBy === 'amountDesc') mapped.sort((a, b) => b.amount - a.amount);
      else if (sortBy === 'nameAsc') mapped.sort((a, b) => a.customerName.localeCompare(b.customerName));
      
      setCollections(mapped);
    }

    if (tab === 'closed') {
      const loans = await db.loans.where('status').equals('closed').and(l => !l.deleted).toArray();
      const mapped = loans.map(l => ({ ...l, customerName: custMap[l.customerId]?.name || 'Unknown' }));
      
      if (sortBy === 'dateDesc') mapped.sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));
      else if (sortBy === 'dateAsc') mapped.sort((a, b) => (a.closedAt || 0) - (b.closedAt || 0));
      else if (sortBy === 'amountDesc') mapped.sort((a, b) => b.amount - a.amount);
      else if (sortBy === 'nameAsc') mapped.sort((a, b) => a.customerName.localeCompare(b.customerName));
      
      setClosedLoans(mapped);
    }

    if (tab === 'detailed') {
      const loans = await db.loans.filter(l => !l.deleted).toArray();
      const allCollections = await db.collections.filter(c => !c.deleted).toArray();
      
      const rows: DetailedRow[] = loans.map(loan => {
        const cust = custMap[loan.customerId];
        const loanCollections = allCollections.filter(c => c.loanId === loan.id).sort((a, b) => a.date - b.date);
        return { loan, customer: cust, collections: loanCollections };
      });
      
      if (sortBy === 'dateDesc') rows.sort((a, b) => b.loan.startDate - a.loan.startDate);
      else if (sortBy === 'dateAsc') rows.sort((a, b) => a.loan.startDate - b.loan.startDate);
      else if (sortBy === 'amountDesc') rows.sort((a, b) => b.loan.amount - a.loan.amount);
      else if (sortBy === 'nameAsc') rows.sort((a, b) => (a.customer?.name || '').localeCompare(b.customer?.name || ''));
      
      setDetailedRows(rows);
    }
  }

  const handleDeleteCollection = async (id: string) => {
    const deleteAction = async () => {
      setIsSubmitting(true);
      try {
        const collection = await db.collections.get(id);
        if (collection) {
          const now = Date.now();
          await db.collections.update(id, { deleted: true, syncStatus: 'pending', updatedAt: now });
          const loan = await db.loans.get(collection.loanId);
          if (loan) {
            const updatedCollections = (await db.collections.where('loanId').equals(loan.id).toArray()).filter(c => !c.deleted);
            const totalPaid = updatedCollections.reduce((sum, c) => sum + c.amount, 0);
            const newPending = Math.max(0, loan.totalPayable - totalPaid);
            const newStatus = newPending <= 0 ? 'closed' : loan.status === 'closed' ? 'active' : loan.status;
            await db.loans.update(loan.id, { paidAmount: totalPaid, pendingAmount: newPending, status: newStatus, syncStatus: 'pending', updatedAt: now });
          }
        }
        setDeleteConfirmId(null);
        loadData();
      } finally {
        setIsSubmitting(false);
      }
    };
    setPinAction(() => deleteAction);
  };

  const collectionsFuse = useMemo(() => new Fuse(collections, { keys: ['customerName', 'note'], threshold: 0.3, ignoreLocation: true }), [collections]);
  const filteredCollections = useMemo(() => {
    if (!search.trim()) return collections;
    return collectionsFuse.search(search).map(r => r.item);
  }, [collections, search, collectionsFuse]);

  const closedLoansFuse = useMemo(() => new Fuse(closedLoans, { keys: ['customerName', 'displayId'], threshold: 0.3, ignoreLocation: true }), [closedLoans]);
  const filteredClosedLoans = useMemo(() => {
    if (!search.trim()) return closedLoans;
    return closedLoansFuse.search(search).map(r => r.item);
  }, [closedLoans, search, closedLoansFuse]);

  const detailedFuse = useMemo(() => new Fuse(detailedRows, { keys: ['customer.name', 'customer.displayId', 'loan.displayId'], threshold: 0.3, ignoreLocation: true }), [detailedRows]);
  const filteredDetailed = useMemo(() => {
    if (!search.trim()) return detailedRows;
    return detailedFuse.search(search).map(r => r.item);
  }, [detailedRows, search, detailedFuse]);

  const totalFiltered = filteredCollections.reduce((s, c) => s + c.amount, 0);
  const maxCollections = Math.max(0, ...filteredDetailed.map(r => r.collections.length));

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: filteredDetailed.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0]?.start || 0 : 0;
  const paddingBottom = virtualItems.length > 0
    ? rowVirtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end || 0)
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-2xl)', fontWeight: 800, fontFamily: 'var(--font-display)', margin: 0, textTransform: 'uppercase' }}>Records</h2>
        </div>
      </div>

      <div className="card" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flex: 1 }}>
          <div className="search-bar" style={{ width: '100%', background: 'var(--bg-card)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input placeholder="Search records..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="sort-minimal-container" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', padding: '0 var(--space-3)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
            <select className="sort-minimal" value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
              <option value="dateDesc">Newest</option>
              <option value="dateAsc">Oldest</option>
              <option value="amountDesc">Highest Amt</option>
              <option value="nameAsc">A-Z</option>
            </select>
          </div>
        </div>
        <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none', overflowX: 'auto', whiteSpace: 'nowrap' }}>
          <button className={`tab-btn ${tab === 'collections' ? 'active' : ''}`} onClick={() => setTab('collections')}>All Collections</button>
          <button className={`tab-btn ${tab === 'detailed' ? 'active' : ''}`} onClick={() => setTab('detailed')}>Ledger</button>
          <button className={`tab-btn ${tab === 'closed' ? 'active' : ''}`} onClick={() => setTab('closed')}>Closed Loans</button>
        </div>
      </div>

      {tab === 'collections' && (
        <>
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', alignItems: 'end', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flex: '1 1 280px' }}>
              <div className="form-group" style={{ flex: 1, minWidth: 0 }}>
                <label className="form-label">From</label>
                <input className="form-input" type="date" value={dateFrom} onClick={e => (e.target as HTMLInputElement).showPicker?.()} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 0 }}>
                <label className="form-label">To</label>
                <input className="form-input" type="date" value={dateTo} onClick={e => (e.target as HTMLInputElement).showPicker?.()} onChange={e => setDateTo(e.target.value)} />
              </div>
            </div>
            {(dateFrom || dateTo) && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>Clear</button>
            )}
            <div style={{ marginLeft: 'auto', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
              Total: <strong style={{ color: 'var(--success)' }}>{formatCurrency(totalFiltered)}</strong> ({filteredCollections.length} entries)
            </div>
          </div>
          {filteredCollections.length === 0 ? (
            <div style={{ marginTop: 'var(--space-6)' }}>
              <EmptyState
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:48, height:48, marginBottom:'var(--space-3)', color:'var(--text-tertiary)'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>}
                title="No collections found"
                subtext="Try adjusting your filters or search criteria."
              />
            </div>
          ) : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {filteredCollections.map(c => (
                <div key={c.id} className="card" style={{ padding: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                    <div style={{ fontWeight: 800, fontSize: 'var(--font-base)', cursor: 'pointer' }} onClick={() => navigateToCustomer(c.customerId)}>{c.customerName}</div>
                    <div style={{ fontWeight: 800, color: 'var(--success)' }}>{formatCurrency(c.amount)}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)' }}>{formatDate(c.date)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span className={`badge badge-${c.mode || 'cash'}`}>{(c.mode || 'cash').toUpperCase()}</span>
                      <button className="btn btn-ghost btn-sm" style={{ padding: '4px', color: 'var(--danger)' }} onClick={() => setDeleteConfirmId(c.id)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                  {c.note && (
                    <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', background: 'var(--bg-input)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)' }}>
                      {c.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Customer</th><th>Amount</th><th>Mode</th><th>Note</th><th></th></tr></thead>
                <tbody>
                  {filteredCollections.map(c => (
                    <tr key={c.id}>
                      <td>{formatDate(c.date)}</td>
                      <td style={{ fontWeight: 500, cursor: 'pointer' }} onClick={() => navigateToCustomer(c.customerId)}>{c.customerName}</td>
                      <td style={{ fontWeight: 600, color: 'var(--success)' }}>{formatCurrency(c.amount)}</td>
                      <td><span className={`badge badge-${c.mode || 'cash'}`}>{(c.mode || 'cash').toUpperCase()}</span></td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-xs)' }}>{c.note || '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '4px', color: 'var(--danger)' }} onClick={() => setDeleteConfirmId(c.id)}>
                           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'closed' && (
        filteredClosedLoans.length === 0 ? (
          <div style={{ marginTop: 'var(--space-6)' }}>
            <EmptyState
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:48, height:48, marginBottom:'var(--space-3)', color:'var(--text-tertiary)'}}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>}
              title="No closed loans"
              subtext="Fully recovered loans will appear here."
            />
          </div>
        ) : isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {filteredClosedLoans.map(l => (
              <div key={l.id} className="card" style={{ padding: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                  <div style={{ fontWeight: 800, fontSize: 'var(--font-base)', cursor: 'pointer' }} onClick={() => navigateToCustomer(l.customerId)}>{l.customerName}</div>
                  <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)' }}>{l.closedAt ? formatDate(l.closedAt) : '—'}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
                  <div><div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', fontWeight: 600 }}>Principal</div><div style={{ fontWeight: 700 }}>{formatCurrency(l.amount)}</div></div>
                  <div><div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', fontWeight: 600 }}>Interest</div><div style={{ fontWeight: 700, color: 'var(--success)' }}>{formatCurrency(l.totalPayable - l.amount)}</div></div>
                  <div><div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', fontWeight: 600 }}>Recovered</div><div style={{ fontWeight: 700 }}>{formatCurrency(l.totalPayable)}</div></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Customer</th><th>Principal</th><th>Interest Earned</th><th>Total Recovered</th><th>Closed</th></tr></thead>
              <tbody>
                {filteredClosedLoans.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 500, cursor: 'pointer' }} onClick={() => navigateToCustomer(l.customerId)}>{l.customerName}</td>
                    <td>{formatCurrency(l.amount)}</td>
                    <td style={{ color: 'var(--success)' }}>{formatCurrency(l.totalPayable - l.amount)}</td>
                    <td style={{ fontWeight: 600 }}>{formatCurrency(l.totalPayable)}</td>
                    <td>{l.closedAt ? formatDate(l.closedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'detailed' && (
        filteredDetailed.length === 0 ? (
          <div style={{ marginTop: 'var(--space-6)' }}>
            <EmptyState
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:48, height:48, marginBottom:'var(--space-3)', color:'var(--text-tertiary)'}}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>}
              title="No data found"
              subtext="No loans match your search."
            />
          </div>
        ) : (
          <div ref={parentRef} className="table-wrap" style={{ overflow: 'auto', paddingBottom: 'var(--space-4)', maxHeight: '600px' }}>
            <table style={{ minWidth: 'max-content', whiteSpace: 'nowrap' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-card)' }}>
                <tr>
                  <th>C&L ID</th>
                  <th>Name</th>
                  <th>EMI Amount</th>
                  {Array.from({ length: maxCollections }).map((_, i) => (
                    <th key={i}>Payment {i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paddingTop > 0 && (
                  <tr><td style={{ height: `${paddingTop}px`, padding: 0 }} colSpan={maxCollections + 3} /></tr>
                )}
                {virtualItems.map(virtualRow => {
                  const r = filteredDetailed[virtualRow.index];
                  return (
                    <tr key={virtualRow.key} ref={rowVirtualizer.measureElement} data-index={virtualRow.index}>
                      <td>
                        <div style={{ fontWeight: 800, color: 'var(--primary)' }}>{r.customer?.displayId || '—'}</div>
                        <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>{r.loan.displayId || '—'}</div>
                      </td>
                      <td style={{ fontWeight: 800, cursor: 'pointer' }} onClick={() => r.customer?.id && navigateToCustomer(r.customer.id)}>{r.customer?.name || 'Unknown'}</td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(r.loan.emiAmount)}</td>
                      {Array.from({ length: maxCollections }).map((_, i) => {
                        const col = r.collections[i];
                        return (
                          <td key={i}>
                            {col ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div style={{ fontWeight: 800, color: 'var(--success)' }}>{formatCurrency(col.amount)}</div>
                                <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)' }}>{formatDate(col.date)}</div>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--border)' }}>—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr><td style={{ height: `${paddingBottom}px`, padding: 0 }} colSpan={maxCollections + 3} /></tr>
                )}
              </tbody>
            </table>
          </div>
        )
      )}

      {deleteConfirmId && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title" style={{ color: 'var(--danger)', borderBottomColor: 'var(--danger-alpha)' }}>Delete Record</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.5 }}>
              Are you sure? This will delete the payment record and automatically adjust the loan's pending balance back to what it was.
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setDeleteConfirmId(null)} disabled={isSubmitting}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDeleteCollection(deleteConfirmId)} disabled={isSubmitting}>
                {isSubmitting ? 'Deleting...' : 'Yes, Delete'}
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
