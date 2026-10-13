import { useState, useEffect, useMemo } from 'react';
import { db, formatCurrency, formatCompact, startOfDay, startOfMonth, isToday } from '../db';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
// AppContext unused
import { Eye, EyeOff, Plus, AlertCircle, ArrowRight, Check } from 'lucide-react';

export default function Dashboard() {
  // Unused context removed
  const [stats, setStats] = useState({
    totalPortfolio: 0, totalRecoverable: 0, pendingRecovery: 0, todayCollection: 0,
    monthCollection: 0, activeLoans: 0, overdueLoans: 0, npaLoans: 0,
    yesterdayCollection: 0, todayCollectionsCount: 0,
  });
  
  const [recentCollections, setRecentCollections] = useState<any[]>([]);
  const [activityRange, setActivityRange] = useState<'today' | '7d' | '30d' | 'all'>('all');
  const [overdueLoans, setOverdueLoans] = useState<any[]>([]);
  
  const [chartData, setChartData] = useState<{ date: string; amount: number }[]>([]);
  // Unused chartTotal removed
  const [chartRange, setChartRange] = useState<'week' | 'month' | 'year' | 'all'>('week');
  const [showBalance, setShowBalance] = useState(true);

  const filteredActivity = useMemo(() => {
    const now = Date.now();
    const dayMs = 86400000;
    const todayStart = startOfDay();

    return recentCollections.filter((c) => {
      if (activityRange === 'today') {
        return c.date >= todayStart;
      }
      if (activityRange === '7d') {
        return c.date >= now - 7 * dayMs;
      }
      if (activityRange === '30d') {
        return c.date >= now - 30 * dayMs;
      }
      return true;
    });
  }, [recentCollections, activityRange]);

  useEffect(() => {
    loadDashboard();
    window.addEventListener('ft-data-changed', loadDashboard);
    return () => window.removeEventListener('ft-data-changed', loadDashboard);
  }, []);

  useEffect(() => {
    loadChartData();
  }, [chartRange]);

  async function loadChartData() {
    const allCollections = await db.collections.filter(c => !c.deleted).toArray();
    let data: { date: string; amount: number }[] = [];

    const calculateAmount = (startMs: number, endMs: number) => {
      return allCollections.filter(c => c.date >= startMs && c.date < endMs).reduce((s, c) => s + c.amount, 0);
    };

    if (chartRange === 'week' || chartRange === 'month') {
      const days = chartRange === 'week' ? 7 : 30;
      const dates = Array.from({ length: days }).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (days - 1 - i));
        d.setHours(0, 0, 0, 0);
        return d;
      });
      data = dates.map(date => {
        const startMs = date.getTime();
        const endMs = startMs + 86400000;
        const amount = calculateAmount(startMs, endMs);
        return { date: date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), amount };
      });
    } else if (chartRange === 'year' || chartRange === 'all') {
      let monthsToGenerate = 12;
      let startMonth = new Date();
      startMonth.setMonth(startMonth.getMonth() - 11);
      startMonth.setDate(1);
      startMonth.setHours(0, 0, 0, 0);

      const months = Array.from({ length: monthsToGenerate }).map((_, i) => {
        const d = new Date(startMonth);
        d.setMonth(d.getMonth() + i);
        return d;
      });
      data = months.map(date => {
        const startMs = date.getTime();
        const nextMonth = new Date(date);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const endMs = nextMonth.getTime();
        const amount = calculateAmount(startMs, endMs);
        return { date: date.toLocaleDateString('en-IN', { month: 'short' }), amount };
      });
    }
    // Unused total removed
    setChartData(data);
  }

  async function loadDashboard() {
    const loans = await db.loans.filter(l => !l.deleted).toArray();
    const active = loans.filter(l => l.status === 'active');
    const overdue = loans.filter(l => l.status === 'overdue');
    const npa = loans.filter(l => l.status === 'npa');

    const todayStart = startOfDay();
    const monthStart = startOfMonth();
    
    // Yesterday start and end
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = todayStart;

    const allCollections = await db.collections.filter(c => !c.deleted).toArray();

    // Repair collections stored as UTC midnight (where hour became 05:30 in IST) using createdAt
    const collectionsToFix = allCollections.filter(c => {
      if (!c.createdAt) return false;
      const d = new Date(c.date);
      return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
    });

    if (collectionsToFix.length > 0) {
      for (const c of collectionsToFix) {
        const createdDateStr = new Date(c.createdAt!).toLocaleDateString('en-CA');
        const collDateStr = new Date(c.date).toLocaleDateString('en-CA');
        let newDate = c.createdAt!;
        if (createdDateStr !== collDateStr) {
          const cr = new Date(c.createdAt!);
          const target = new Date(c.date);
          target.setHours(cr.getHours(), cr.getMinutes(), cr.getSeconds(), cr.getMilliseconds());
          newDate = target.getTime();
        }
        await db.collections.update(c.id, { date: newDate });
        c.date = newDate;
      }
    }

    const todayC = allCollections.filter(c => c.date >= todayStart);
    const yesterdayC = allCollections.filter(c => c.date >= yesterdayStart.getTime() && c.date < yesterdayEnd);
    const monthC = allCollections.filter(c => c.date >= monthStart);

    const activeAndOverdue = loans.filter(l => l.status === 'active' || l.status === 'overdue' || l.status === 'npa');

    setStats({
      totalPortfolio: activeAndOverdue.reduce((s, l) => s + l.amount, 0),
      totalRecoverable: activeAndOverdue.reduce((s, l) => s + l.totalPayable, 0),
      pendingRecovery: activeAndOverdue.reduce((s, l) => s + l.pendingAmount, 0),
      todayCollection: todayC.reduce((s, c) => s + c.amount, 0),
      monthCollection: monthC.reduce((s, c) => s + c.amount, 0),
      yesterdayCollection: yesterdayC.reduce((s, c) => s + c.amount, 0),
      activeLoans: active.length,
      overdueLoans: overdue.length,
      npaLoans: npa.length,
      todayCollectionsCount: todayC.length,
    });

    const sortedCollections = allCollections.sort((a, b) => b.date - a.date);
    const customers = await db.customers.toArray();
    const custMap = new Map(customers.map(c => [c.id, c.name]));
    const withNames = sortedCollections.map((c) => {
      const name = custMap.get(c.customerId) || 'Unknown';
      return { ...c, customerName: name, customerInitials: getInitials(name) };
    });
    setRecentCollections(withNames);
    
    const overdueSorted = overdue.sort((a, b) => {
      const aDays = Math.floor((Date.now() - a.startDate) / 86400000);
      const bDays = Math.floor((Date.now() - b.startDate) / 86400000);
      return bDays - aDays;
    }).slice(0, 3);
    
    const overdueWithNames = await Promise.all(overdueSorted.map(async (l) => {
      const cust = await db.customers.get(l.customerId);
      const daysOverdue = Math.floor((Date.now() - (l.updatedAt || l.startDate)) / 86400000) || 1;
      return { ...l, customerName: cust?.name || 'Unknown', daysOverdue };
    }));
    setOverdueLoans(overdueWithNames);
  }
  
  function getInitials(name: string) {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

  // Calculate percentage change for today vs yesterday
  const collectionDelta = stats.yesterdayCollection > 0 
    ? Math.round(((stats.todayCollection - stats.yesterdayCollection) / stats.yesterdayCollection) * 100) 
    : (stats.todayCollection > 0 ? 100 : 0);
    
  const donutData = [
    { name: 'Collected', value: stats.todayCollection, color: 'var(--primary)' },
    { name: 'Pending', value: Math.max(0, 100000 - stats.todayCollection), color: '#F0F0F0' } // Mock target of 1L for visualization
  ];

  return (
    <div style={{ display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap', alignItems: 'flex-start', paddingBottom: 'var(--space-8)' }}>
      {/* ── PRIMARY COLUMN (62%) ── */}
      <div style={{ flex: '1 1 60%', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', minWidth: 'min(100%, 400px)' }}>
        
        {/* HERO METRIC CARD */}
        <div className="card" style={{ padding: 'var(--space-6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--font-sm)', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Total Portfolio (Principal)
            </span>
            <button 
              className="btn-ghost" 
              style={{ border: 'none', background: 'transparent', color: 'var(--text-tertiary)', padding: 4, cursor: 'pointer' }}
              onClick={() => setShowBalance(!showBalance)}
            >
              {showBalance ? <Eye size={20} /> : <EyeOff size={20} />}
            </button>
          </div>
          {(() => {
            const balanceText = showBalance ? formatCurrency(stats.totalPortfolio) : '₹••••••••';
            let dynamicFontSize = 'var(--font-hero)';
            if (balanceText.length > 15) dynamicFontSize = '1.75rem';
            else if (balanceText.length > 12) dynamicFontSize = '2.25rem';
            else if (balanceText.length > 9) dynamicFontSize = '2.75rem';
            
            return (
              <div style={{ fontSize: dynamicFontSize, fontWeight: 800, fontFamily: 'var(--font-display)', marginTop: 'var(--space-2)', lineHeight: 1, letterSpacing: '-1px' }}>
                {balanceText}
              </div>
            );
          })()}
          
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: 'var(--space-5) 0' }} />
          
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => document.dispatchEvent(new CustomEvent('ft-navigate', { detail: 'collections' }))}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'white' }}></span>
              Collect Payment
            </button>
            <button className="btn btn-ghost" onClick={() => document.dispatchEvent(new CustomEvent('ft-navigate', { detail: 'customers' }))}>
              <Plus size={18} /> Add Loan
            </button>
          </div>
        </div>

        {/* OVERVIEW MINI STATS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)' }}>
          <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 700 }}>Total Recoverable</div>
            <div style={{ fontSize: 'clamp(15px, 4vw, var(--font-lg))', fontWeight: 800, marginTop: 4, wordBreak: 'break-word', lineHeight: 1.2 }}>{showBalance ? formatCurrency(stats.totalRecoverable).replace('.00', '') : '••••'}</div>
          </div>
          <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 700 }}>Pending Recovery</div>
            <div style={{ fontSize: 'clamp(15px, 4vw, var(--font-lg))', fontWeight: 800, marginTop: 4, color: 'var(--primary)', wordBreak: 'break-word', lineHeight: 1.2 }}>{showBalance ? formatCurrency(stats.pendingRecovery).replace('.00', '') : '••••'}</div>
          </div>
          <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 700 }}>Running Loans</div>
            <div style={{ fontSize: 'clamp(15px, 4vw, var(--font-lg))', fontWeight: 800, marginTop: 4, wordBreak: 'break-word', lineHeight: 1.2 }}>{stats.activeLoans + stats.overdueLoans} <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)' }}>({stats.overdueLoans} overdue)</span></div>
          </div>
          <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 700 }}>Monthly Collection</div>
            <div style={{ fontSize: 'clamp(15px, 4vw, var(--font-lg))', fontWeight: 800, marginTop: 4, wordBreak: 'break-word', lineHeight: 1.2 }}>{showBalance ? formatCurrency(stats.monthCollection).replace('.00', '') : '••••'}</div>
          </div>
        </div>

        {/* CHARTS ROW */}
        <div style={{ display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap' }}>
          
          {/* COLLECTIONS TREND */}
          <div className="card" style={{ flex: '1 1 50%', minWidth: 'min(100%, 300px)', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <span style={{ fontSize: 'var(--font-sm)', fontWeight: 700, textTransform: 'uppercase' }}>Collections Trend</span>
              <div className="tabs" style={{ marginBottom: 0 }}>
                <button className={`tab-btn ${chartRange === 'week' ? 'active' : ''}`} style={{ padding: '4px 12px', minHeight: '28px', fontSize: '11px' }} onClick={() => setChartRange('week')}>7d</button>
                <button className={`tab-btn ${chartRange === 'month' ? 'active' : ''}`} style={{ padding: '4px 12px', minHeight: '28px', fontSize: '11px' }} onClick={() => setChartRange('month')}>30d</button>
              </div>
            </div>
            
            <div style={{ width: '100%', height: 160, marginTop: 'auto' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} dy={10} minTickGap={20} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} tickFormatter={(v) => formatCompact(v).replace('.00', '')} />
                  <Tooltip 
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-card)' }}
                    itemStyle={{ color: 'var(--primary)', fontWeight: 800 }}
                    formatter={(value: any) => [formatCurrency(value).replace('.00', ''), 'Collected']}
                  />
                  <Area type="monotone" dataKey="amount" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorAmount)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* SPEND CATEGORY / TARGET (DONUT) */}
          <div className="card" style={{ flex: '1 1 30%', minWidth: 'min(100%, 200px)', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <span style={{ fontSize: 'var(--font-sm)', fontWeight: 700, textTransform: 'uppercase', alignSelf: 'flex-start', marginBottom: 'var(--space-2)' }}>Daily Target</span>
            <div style={{ position: 'relative', width: 140, height: 140 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%" cy="50%"
                    innerRadius={50}
                    outerRadius={65}
                    startAngle={90}
                    endAngle={-270}
                    dataKey="value"
                    stroke="none"
                  >
                    {donutData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <span style={{ fontSize: 'var(--font-lg)', fontWeight: 800, fontFamily: 'var(--font-display)', lineHeight: 1 }}>
                  {stats.todayCollection > 0 ? `${Math.min(100, Math.round((stats.todayCollection / 100000) * 100))}%` : '0%'}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>of ₹1L</span>
              </div>
            </div>
          </div>

        </div>

        {/* MINI STATS ROW */}
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div className="stat-card" style={{ flex: 1, minWidth: '140px', padding: 'var(--space-4)' }}>
            <span className="stat-label">Collected MTD</span>
            <span className="stat-value" style={{ fontSize: 'var(--font-xl)', marginTop: 'var(--space-2)' }}>{formatCompact(stats.monthCollection)}</span>
          </div>
          <div className="stat-card" style={{ flex: 1, minWidth: '140px', padding: 'var(--space-4)' }}>
            <span className="stat-label">Active Loans</span>
            <span className="stat-value" style={{ fontSize: 'var(--font-xl)', marginTop: 'var(--space-2)' }}>{stats.activeLoans}</span>
          </div>
          <div className="stat-card" style={{ flex: 1, minWidth: '140px', padding: 'var(--space-4)' }}>
            <span className="stat-label">NPA Accounts</span>
            <span className="stat-value" style={{ fontSize: 'var(--font-xl)', marginTop: 'var(--space-2)', color: stats.npaLoans > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>{stats.npaLoans}</span>
          </div>
        </div>

      </div>

      {/* ── SECONDARY COLUMN (38%) ── */}
      <div style={{ flex: '1 1 35%', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', minWidth: 'min(100%, 300px)' }}>
        
        {/* LIME HERO CARD */}
        <div className="hero-lime-card">
          <div className="stat-label" style={{ fontWeight: 800, letterSpacing: '1px' }}>TODAY'S COLLECTIONS</div>
          <div className="stat-value" style={{ fontSize: 'var(--font-3xl)', marginTop: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            {formatCurrency(stats.todayCollection)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {collectionDelta !== 0 && (
              <span style={{ 
                background: collectionDelta > 0 ? 'var(--primary-dark)' : 'var(--danger)', 
                color: collectionDelta > 0 ? 'var(--primary)' : '#ffffff',
                padding: '4px 12px', 
                borderRadius: '100px',
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '4px',
                fontSize: '12px', 
                fontWeight: 800, 
                letterSpacing: '0.5px'
              }}>
                <span>{collectionDelta > 0 ? '▲' : '▼'}</span>
                <span>{Math.abs(collectionDelta)}% vs yesterday</span>
              </span>
            )}
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary-dark)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Due: {stats.activeLoans}</span>
              <span style={{ opacity: 0.5 }}>|</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}><Check size={14} strokeWidth={4} /> {stats.todayCollectionsCount}</span>
            </span>
          </div>
        </div>

        {/* URGENT / OVERDUE */}
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <span style={{ fontSize: 'var(--font-sm)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Urgent Action</span>
            {stats.overdueLoans > 0 && <span className="badge badge-overdue">{stats.overdueLoans} Overdue</span>}
          </div>
          
          {overdueLoans.length === 0 ? (
            <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--font-sm)', fontWeight: 500 }}>
              No urgent items today.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {overdueLoans.map((loan) => (
                <div key={loan.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', paddingBottom: 'var(--space-3)', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--danger-bg)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <AlertCircle size={18} strokeWidth={2.5} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 'var(--font-sm)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {loan.customerName}
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--danger)' }}>
                      {loan.daysOverdue} days overdue
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: 'var(--font-sm)' }}>{formatCurrency(loan.pendingAmount)}</div>
                    <button className="btn-ghost" style={{ padding: 0, fontSize: '10px', color: 'var(--text-secondary)', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>
                      Send Nudge
                    </button>
                  </div>
                </div>
              ))}
              <button 
                className="btn btn-ghost btn-sm" 
                style={{ width: '100%', justifyContent: 'center', border: 'none', color: 'var(--primary-deep)' }}
                onClick={() => document.dispatchEvent(new CustomEvent('ft-navigate', { detail: 'tracker' }))}
              >
                View all overdue <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>

        {/* RECENT ACTIVITY */}
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--font-sm)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Recent Activity</span>
            
            <div className="sort-minimal-container" style={{ minHeight: '28px', height: '28px', padding: '0 8px', borderRadius: 'var(--radius-sm)' }}>
              <select 
                className="sort-minimal" 
                value={activityRange} 
                onChange={(e) => setActivityRange(e.target.value as any)}
                style={{ fontSize: '12px', paddingRight: '16px', backgroundPosition: 'right 2px center' }}
              >
                <option value="today" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Today</option>
                <option value="7d" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Last 7 Days</option>
                <option value="30d" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Last 30 Days</option>
                <option value="all" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>All</option>
              </select>
            </div>
          </div>
          
          {filteredActivity.length === 0 ? (
            <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--font-sm)', fontWeight: 500 }}>
              No activity in this period.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxHeight: '380px', overflowY: 'auto', paddingRight: '2px' }}>
              {filteredActivity.map((c, i) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', paddingBottom: i < filteredActivity.length - 1 ? 'var(--space-3)' : 0, borderBottom: i < filteredActivity.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-soft)', color: 'var(--text-secondary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '11px', fontWeight: 800 }}>
                    {c.customerInitials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 'var(--font-sm)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.customerName}
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {(() => {
                        const d = new Date(c.date);
                        const timeMs = (c.createdAt && d.getUTCHours() === 0 && d.getUTCMinutes() === 0) ? c.createdAt : c.date;
                        return isToday(timeMs)
                          ? new Date(timeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : `${new Date(timeMs).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${new Date(timeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                      })()}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: 'var(--font-sm)', color: 'var(--success)' }}>
                      +{formatCurrency(c.amount, c.amount % 1 === 0 ? 0 : 2)}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>
                      {c.mode || 'Cash'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
