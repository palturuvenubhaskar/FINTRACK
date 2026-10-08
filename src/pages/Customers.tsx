import { useState, useEffect, useMemo } from 'react';
import { db, type Customer, formatCurrency, getNextCustomerDisplayId } from '../db';
import { v4 as uuid } from 'uuid';
import { handleEnterToNext } from '../utils/keyboard';
import { Phone, Search, Plus, UserPlus, AlertCircle, Clock, CheckCircle, ChevronRight } from 'lucide-react';
import Fuse from 'fuse.js';
import { getEnrichedLoans } from '../services/LoanService';
import CustomerProfile from '../components/CustomerProfile';

interface CustomersProps {
  targetId?: string | null;
  clearTarget?: () => void;
}

export default function Customers(_props: CustomersProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [sortParam, setSortParam] = useState<'default' | 'name-asc' | 'name-desc' | 'outstanding-desc' | 'recent'>('default');
  const [filter, setFilter] = useState<'all' | 'active' | 'overdue' | 'closed'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedProfileCustomer, setSelectedProfileCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({ displayId: '', name: '', phones: [''], addresses: [''], occupation: '', place: '', shopAddresses: [''], aadhaar: '', pan: '', notes: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [stats, setStats] = useState<Record<string, { given: number, outstanding: number, totalPaid: number, totalLoans: number, activeLoans: number, overdueLoans: number, closedLoans: number, hasNpa: boolean, nextDueDate: number | null, lastClosedAt: number | null }>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { loadCustomers(); }, []);

  async function loadCustomers() {
    setIsLoading(true);
    const all = await db.customers.filter(c => !c.deleted).toArray();
    setCustomers(all.filter(c => c.isActive).sort((a, b) => b.createdAt - a.createdAt));
    
    const loans = await getEnrichedLoans();
    
    const s: Record<string, any> = {};
    const initStat = () => ({ given: 0, outstanding: 0, totalPaid: 0, totalLoans: 0, activeLoans: 0, overdueLoans: 0, closedLoans: 0, hasNpa: false, nextDueDate: null as number | null, lastClosedAt: null as number | null });

    loans.forEach(l => {
      if (!s[l.customerId]) s[l.customerId] = initStat();
      s[l.customerId].totalLoans++;
      s[l.customerId].given += l.amount;
      s[l.customerId].totalPaid += l.paidAmount;
      if (l.status === 'npa') s[l.customerId].hasNpa = true;
      
      if (l.status === 'closed') {
        s[l.customerId].closedLoans++;
        if (l.closedAt) {
          if (!s[l.customerId].lastClosedAt || l.closedAt > s[l.customerId].lastClosedAt) {
            s[l.customerId].lastClosedAt = l.closedAt;
          }
        }
      } else {
        if (l.status === 'overdue') s[l.customerId].overdueLoans++;
        else s[l.customerId].activeLoans++;
        s[l.customerId].outstanding += l.pendingAmount;
        
        // Find next due date from pending slots
        const pendingSlot = l.slots.find(slot => slot.status === 'pending' || slot.status === 'partial');
        if (pendingSlot) {
          const due = pendingSlot.dueDate;
          if (!s[l.customerId].nextDueDate || due < s[l.customerId].nextDueDate) {
            s[l.customerId].nextDueDate = due;
          }
        }
      }
    });

    setStats(s);
    setIsLoading(false);
  }

  const baseFilteredCustomers = useMemo(() => {
    let result = customers;
    // Filter by Tab
    if (filter !== 'all') {
      result = result.filter(c => {
        const st = stats[c.id];
        if (!st) return filter === 'closed'; // If no stats, considered closed/inactive
        if (filter === 'active') return st.activeLoans > 0 && st.overdueLoans === 0 && !st.hasNpa;
        if (filter === 'overdue') return st.overdueLoans > 0 || st.hasNpa;
        if (filter === 'closed') return st.activeLoans === 0 && st.overdueLoans === 0 && !st.hasNpa;
        return true;
      });
    }
    return result;
  }, [customers, filter, stats]);

  const fuse = useMemo(() => new Fuse(baseFilteredCustomers, { 
    keys: ['name', 'phone', 'displayId'], 
    threshold: 0.3, 
    ignoreLocation: true 
  }), [baseFilteredCustomers]);

  const filtered = useMemo(() => {
    let result = baseFilteredCustomers;
    
    // Search
    if (search.trim()) {
      result = fuse.search(search).map(r => r.item);
    }
    
    // Sort
    return result.sort((a, b) => {
      if (sortParam === 'name-asc') return a.name.localeCompare(b.name);
      if (sortParam === 'name-desc') return b.name.localeCompare(a.name);
      if (sortParam === 'outstanding-desc') {
        const outA = stats[a.id]?.outstanding || 0;
        const outB = stats[b.id]?.outstanding || 0;
        return outB - outA;
      }
      if (sortParam === 'recent') {
        return b.createdAt - a.createdAt;
      }

      // Default: Overdue -> Due Soon -> Alpha
      const stA = stats[a.id];
      const stB = stats[b.id];
      
      const isOverdueA = stA && (stA.overdueLoans > 0 || stA.hasNpa);
      const isOverdueB = stB && (stB.overdueLoans > 0 || stB.hasNpa);
      
      if (isOverdueA && !isOverdueB) return -1;
      if (!isOverdueA && isOverdueB) return 1;
      
      const dueA = stA?.nextDueDate || Infinity;
      const dueB = stB?.nextDueDate || Infinity;
      
      if (dueA !== dueB) return dueA - dueB;
      
      return a.name.localeCompare(b.name);
    });
  }, [baseFilteredCustomers, search, sortParam, fuse, stats]);

  async function openAdd() {
    setEditId(null);
    const nextId = await getNextCustomerDisplayId();
    setForm({ displayId: nextId, name: '', phones: [''], addresses: [''], occupation: '', place: '', shopAddresses: [''], aadhaar: '', pan: '', notes: '' });
    setError('');
    setShowModal(true);
  }

  function openEdit(c: Customer) {
    setEditId(c.id);
    const cPhones = c.phones?.length ? [...c.phones] : [c.phone, c.phone2].filter(Boolean);
    const cAddresses = c.addresses?.length ? [...c.addresses] : [c.address, c.address2].filter(Boolean);
    setForm({ displayId: c.displayId || '', name: c.name, phones: cPhones.length ? (cPhones as string[]) : [''], addresses: cAddresses.length ? (cAddresses as string[]) : [''], occupation: c.occupation || '', place: c.place || '', shopAddresses: c.shopAddresses?.length ? [...c.shopAddresses] : [''], aadhaar: c.aadhaar || '', pan: c.pan || '', notes: c.notes || '' });
    setError('');
    setShowModal(true);
  }

  function handleArrayChange(key: keyof typeof form, index: number, value: string) {
    const arr = [...(form[key] as string[])];
    arr[index] = value;
    setForm({ ...form, [key]: arr });
  }

  function addArrayField(key: keyof typeof form) {
    setForm({ ...form, [key]: [...(form[key] as string[]), ''] });
  }

  function removeArrayField(key: keyof typeof form, index: number) {
    const arr = (form[key] as string[]).filter((_, i) => i !== index);
    setForm({ ...form, [key]: arr.length ? arr : [''] });
  }

  async function handleSave() {
    const cleanedPhones = form.phones.filter(p => p.trim() !== '');
    if (!form.name.trim() || cleanedPhones.length === 0) {
      setError('Name and at least one phone are required fields.');
      return;
    }

    if (form.displayId.trim()) {
      const existing = await db.customers.filter(c => !c.deleted && c.id !== editId && (c.displayId || '').toLowerCase() === form.displayId.trim().toLowerCase()).toArray();
      if (existing.length > 0) {
        setError(`Customer ID "${form.displayId.trim()}" is already used by ${existing[0].name}.`);
        return;
      }
    }

    const saveAction = async () => {
      setIsSubmitting(true);
      try {
        const cleanedShopAddresses = form.shopAddresses.filter(s => s.trim().length > 0);
        const cleanedAddresses = form.addresses.filter(a => a.trim().length > 0);
        const saveForm = { ...form, phones: cleanedPhones, phone: cleanedPhones[0], phone2: cleanedPhones[1] || '', shopAddresses: cleanedShopAddresses, addresses: cleanedAddresses, address: '', address2: '', occupation: form.occupation.trim(), place: form.place.trim() };

        if (editId) {
          await db.customers.update(editId, { ...saveForm, syncStatus: 'pending', updatedAt: Date.now() });
        } else {
          await db.customers.add({ id: uuid(), ...saveForm, isActive: true, createdAt: Date.now(), syncStatus: 'pending', updatedAt: Date.now() } as Customer);
        }
        setShowModal(false);
        loadCustomers();
      } catch (err) {
        setError('Failed to save customer. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    };
    saveAction();
  }

  if (selectedProfileCustomer) {
    const st = stats[selectedProfileCustomer.id] || { given: 0, outstanding: 0, totalPaid: 0, totalLoans: 0, activeLoans: 0, overdueLoans: 0, closedLoans: 0, hasNpa: false, nextDueDate: null };
    return (
      <CustomerProfile
        customer={selectedProfileCustomer}
        stats={st}
        onClose={() => setSelectedProfileCustomer(null)}
        onEdit={() => {
          const customerToEdit = selectedProfileCustomer;
          setSelectedProfileCustomer(null);
          openEdit(customerToEdit);
        }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-2xl)', fontWeight: 800, fontFamily: 'var(--font-display)', margin: 0, textTransform: 'uppercase' }}>Customers</h2>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          <Plus size={18} /> Add Customer
        </button>
      </div>

      {/* FILTERS & SEARCH */}
      <div className="card" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <div className="search-bar" style={{ flex: 1, background: 'var(--bg-card)' }}>
            <Search size={18} />
            <input placeholder="Search name or phone..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select 
            value={sortParam} 
            onChange={e => setSortParam(e.target.value as any)}
            style={{ 
              padding: '0 var(--space-3)', 
              borderRadius: 'var(--radius-md)', 
              border: '1px solid var(--border)', 
              background: 'var(--bg-card)', 
              color: 'var(--text-primary)', 
              fontWeight: 600, 
              fontSize: 'var(--font-sm)',
              outline: 'none', 
              cursor: 'pointer',
              minHeight: '36px'
            }}
          >
            <option value="default">Default Sort</option>
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="outstanding-desc">Highest Outstanding</option>
            <option value="recent">Recently Added</option>
          </select>
        </div>
        <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none' }}>
          <button className={`tab-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All ({customers.length})</button>
          <button className={`tab-btn ${filter === 'active' ? 'active' : ''}`} onClick={() => setFilter('active')}>Active</button>
          <button className={`tab-btn ${filter === 'overdue' ? 'active' : ''}`} onClick={() => setFilter('overdue')}>Overdue</button>
          <button className={`tab-btn ${filter === 'closed' ? 'active' : ''}`} onClick={() => setFilter('closed')}>Closed</button>
        </div>
      </div>

      {/* GRID */}
      {isLoading ? (
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          {[1,2,3,4].map(i => <div key={i} className="card" style={{ flex: '1 1 300px', height: '180px', opacity: 0.5, animation: 'pulse 1.5s infinite' }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state" style={{ padding: 'var(--space-8) 0' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--space-4)', color: 'var(--text-tertiary)' }}>
            <UserPlus size={32} />
          </div>
          <h3 style={{ fontSize: 'var(--font-lg)', marginBottom: 'var(--space-2)' }}>No customers found</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Add your first customer to get started.</p>
        </div>
      ) : (
        <div className="responsive-grid-3">
          {filtered.map((c) => {
            const st = stats[c.id] || { outstanding: 0, activeLoans: 0, overdueLoans: 0, hasNpa: false, nextDueDate: null };
            
            let statusLabel = 'ACTIVE';
            let statusColor = 'var(--primary)';
            let StatusIcon = CheckCircle;
            let bgClass = 'bg-soft';

            if (st.hasNpa || st.overdueLoans > 0) {
              statusLabel = 'OVERDUE';
              statusColor = 'var(--danger)';
              StatusIcon = AlertCircle;
              bgClass = 'danger-bg';
            } else if (st.outstanding === 0 && st.activeLoans === 0) {
              statusLabel = 'CLOSED';
              statusColor = 'var(--text-tertiary)';
              StatusIcon = CheckCircle;
              bgClass = 'bg-card';
            } else if (st.nextDueDate) {
              const daysToDue = (st.nextDueDate - Date.now()) / 86400000;
              if (daysToDue <= 3) {
                statusLabel = 'DUE SOON';
                statusColor = 'var(--warning)';
                StatusIcon = Clock;
                bgClass = 'warning-bg';
              }
            }
            
            const safeName = c.name || 'Unknown';
            const initials = safeName.trim().split(' ').filter(Boolean).map(n => n[0]).join('').substring(0,2).toUpperCase() || 'U';

            return (
              <div key={c.id} className="card" style={{ padding: 'var(--space-5)', position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--space-4)' }}>
                
                {/* Header: Avatar, Name, ID & Status Badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: `var(--${bgClass})`, color: statusColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 'var(--font-xl)', border: `1px solid ${statusColor}40` }}>
                      {initials}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 800, fontSize: 'var(--font-lg)', textTransform: 'uppercase', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px', lineHeight: 1.2 }}>{c.name}</span>
                      <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.5px', marginTop: 2 }}>{c.displayId}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 'var(--radius-pill)', background: `${statusColor}15`, color: statusColor, fontSize: '10px', fontWeight: 800 }}>
                    <StatusIcon size={12} strokeWidth={3} /> {statusLabel}
                  </div>
                </div>

                {/* Balance Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 'var(--space-2)' }}>
                  <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Total Balance</span>
                  <span style={{ fontSize: 'var(--font-2xl)', fontWeight: 800, fontFamily: 'var(--font-display)', color: st.outstanding > 0 ? 'var(--text-primary)' : 'var(--success)', letterSpacing: '-0.5px' }}>
                    {formatCurrency(st.outstanding)}
                  </span>
                  {statusLabel === 'CLOSED' && st.lastClosedAt && (
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 700, marginTop: 2 }}>
                      LAST CLOSED: {new Date(st.lastClosedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
                    </span>
                  )}
                </div>
                
                {/* Contact & Meta Info */}
                <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
                  {c.phone && (
                    <a href={`tel:${c.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textDecoration: 'none' }}>
                      <Phone size={14} color="var(--primary)" /> {c.phone}
                    </a>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)' }} />
                    {st.activeLoans + st.overdueLoans} Active Loans
                  </div>
                </div>
                
                {/* Action Button */}
                <button 
                  style={{ 
                    width: '100%', background: 'var(--bg-soft)', border: 'none', padding: '12px', 
                    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, 
                    color: 'var(--primary-deep)', fontWeight: 700, fontSize: '13px',
                    borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'background 0.2s',
                    marginTop: 'auto'
                  }}
                  onClick={() => setSelectedProfileCustomer(c)}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#e9f5e9'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-soft)'}
                >
                  View Profile
                  <ChevronRight size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* FORM MODAL */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }} onKeyDown={handleEnterToNext}>
            <h3 className="modal-title">{editId ? 'Edit Customer' : 'Add Customer'}</h3>
            
            {error && (
              <div style={{ padding: 'var(--space-3)', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-4)', fontSize: 'var(--font-sm)', fontWeight: 600 }}>{error}</div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', paddingRight: 'var(--space-1)' }}>
              
              {/* Basic Details Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.8px', paddingLeft: 4 }}>Basic Details</div>
                <div style={{ background: 'var(--bg-soft)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 'var(--space-4)' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '12px' }}>Customer ID</label>
                      <input data-next="cust-name" className="form-input" style={{ background: 'var(--bg-card)', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }} placeholder="101C001" value={form.displayId} onChange={e => setForm({...form, displayId: e.target.value})} autoFocus={!editId} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '12px' }}>Full Name *</label>
                      <input id="cust-name" data-next="cust-phone-0" className="form-input" style={{ background: 'var(--bg-card)', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }} placeholder="Enter full name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} autoFocus={!!editId} />
                    </div>
                  </div>
                  <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '12px' }}>Occupation</label>
                      <input className="form-input" style={{ background: 'var(--bg-card)', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }} placeholder="e.g. Shop Owner" value={form.occupation} onChange={e => setForm({...form, occupation: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '12px' }}>Location</label>
                      <input className="form-input" style={{ background: 'var(--bg-card)', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }} placeholder="e.g. Market area" value={form.place} onChange={e => setForm({...form, place: e.target.value})} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.8px', paddingLeft: 4 }}>Contact Information</div>
                <div style={{ background: 'var(--bg-soft)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  
                  <div>
                    <label className="form-label" style={{ fontSize: '12px', marginBottom: 8 }}>Phone Numbers *</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {form.phones.map((p, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8 }}>
                          <input id={`cust-phone-${i}`} className="form-input" style={{ background: 'var(--bg-card)', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', flex: 1 }} placeholder={`Phone ${i+1}`} type="tel" value={p} onChange={e => handleArrayChange('phones', i, e.target.value.replace(/\D/g, '').slice(0, 12))} />
                          {i === form.phones.length - 1 ? (
                            <button type="button" onClick={() => addArrayField('phones')} style={{ width: 44, height: 44, borderRadius: 12, border: 'none', background: '#dcfce7', color: '#166534', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background='#bbf7d0'} onMouseLeave={e => e.currentTarget.style.background='#dcfce7'}>+</button>
                          ) : (
                            <button type="button" onClick={() => removeArrayField('phones', i)} style={{ width: 44, height: 44, borderRadius: 12, border: 'none', background: '#fee2e2', color: '#991b1b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background='#fecaca'} onMouseLeave={e => e.currentTarget.style.background='#fee2e2'}>-</button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '12px', marginBottom: 8 }}>Addresses</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {form.addresses.map((addr, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8 }}>
                          <input className="form-input" style={{ background: 'var(--bg-card)', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', flex: 1 }} placeholder={`Address ${i+1}`} value={addr} onChange={e => handleArrayChange('addresses', i, e.target.value)} />
                          {i === form.addresses.length - 1 ? (
                            <button type="button" onClick={() => addArrayField('addresses')} style={{ width: 44, height: 44, borderRadius: 12, border: 'none', background: '#dcfce7', color: '#166534', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background='#bbf7d0'} onMouseLeave={e => e.currentTarget.style.background='#dcfce7'}>+</button>
                          ) : (
                            <button type="button" onClick={() => removeArrayField('addresses', i)} style={{ width: 44, height: 44, borderRadius: 12, border: 'none', background: '#fee2e2', color: '#991b1b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background='#fecaca'} onMouseLeave={e => e.currentTarget.style.background='#fee2e2'}>-</button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </div>

              {/* Documents & Notes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.8px', paddingLeft: 4 }}>Documents & Notes</div>
                <div style={{ background: 'var(--bg-soft)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '12px' }}>Aadhaar Number</label>
                      <input className="form-input" style={{ background: 'var(--bg-card)', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }} placeholder="12-digit" value={form.aadhaar} onChange={e => setForm({...form, aadhaar: e.target.value.replace(/\D/g, '').slice(0, 12)})} maxLength={12} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '12px' }}>PAN Card</label>
                      <input className="form-input" style={{ background: 'var(--bg-card)', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }} placeholder="10-chars" value={form.pan} onChange={e => setForm({...form, pan: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)})} maxLength={10} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '12px' }}>Notes</label>
                    <textarea className="form-textarea" style={{ background: 'var(--bg-card)', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', minHeight: '80px' }} placeholder="Any additional info..." value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
                  </div>
                </div>
              </div>

            </div>

            <div className="modal-actions" style={{ marginTop: 'var(--space-5)' }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)} disabled={isSubmitting}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Customer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
