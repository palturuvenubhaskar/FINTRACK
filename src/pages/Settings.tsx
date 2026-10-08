import { useState, useEffect } from 'react';
import { db, type Customer, type Loan, type Collection } from '../db';
import { auth, dbFirestore } from '../firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PinScreen from '../components/PinScreen';
import { 
  Laptop, Smartphone, Download, Upload, Trash2, 
  CloudLightning, Shield, Clock, Mail, 
  ChevronRight, LogOut, Check, FileText, Code, AtSign
} from 'lucide-react';

type ActivityItem = {
  id: string;
  date: number;
  type: 'customer_added' | 'loan_given' | 'collection_made';
  title: string;
  subtitle: string;
};

export default function Settings() {
  // Unused backupHistory removed
  const [msg, setMsg] = useState('');
  const [user, setUser] = useState(auth.currentUser);

  const [exportModal, setExportModal] = useState(false);
  const [exportType, setExportType] = useState<'csv' | 'pdf' | null>(null);
  const [exportCustomerId, setExportCustomerId] = useState<string>('all');
  const [exportStartDate, setExportStartDate] = useState<string>('');
  const [exportEndDate, setExportEndDate] = useState<string>('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [restoreModal, setRestoreModal] = useState(false);
  const [restoreTab, setRestoreTab] = useState<'customers'|'loans'|'collections'>('customers');
  const [deletedCustomers, setDeletedCustomers] = useState<Customer[]>([]);
  const [deletedLoans, setDeletedLoans] = useState<Loan[]>([]);
  const [deletedCollections, setDeletedCollections] = useState<Collection[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityItem[]>([]);
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [activityLimit, setActivityLimit] = useState<'30' | '100' | 'all'>('30');
  const [pinAction, setPinAction] = useState<(() => void) | null>(null);
  
  const [devices, setDevices] = useState<{ id: string; deviceName: string; lastActive: number; isCurrent: boolean }[]>([]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      if (u) {
        fetchDevices(u.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  async function fetchDevices(uid: string) {
    try {
      const currentDeviceId = localStorage.getItem('ft_device_id');
      const snap = await getDocs(collection(dbFirestore, `users/${uid}/sessions`));
      const devs = snap.docs.map(d => ({
        id: d.id,
        deviceName: d.data().deviceName || 'Unknown Device',
        lastActive: d.data().lastActive || 0,
        isCurrent: d.id === currentDeviceId
      }));
      devs.sort((a, b) => b.lastActive - a.lastActive);
      setDevices(devs);
    } catch (e) {
      console.error("Failed to fetch devices", e);
    }
  }

  async function handleLogoutDevice(deviceId: string) {
    if (!user) return;
    try {
      await deleteDoc(doc(dbFirestore, `users/${user.uid}/sessions`, deviceId));
      setDevices(prev => prev.filter(d => d.id !== deviceId));
      setMsg('Device session removed.');
      setTimeout(() => setMsg(''), 3000);
    } catch (e: any) {
      setMsg('Failed to remove device: ' + e.message);
      setTimeout(() => setMsg(''), 3000);
    }
  }

  useEffect(() => {
    // Unused backup logs call removed
    db.customers.filter(c => !c.deleted).toArray().then(setCustomers);
  }, []);

  useEffect(() => {
    if (activityLogOpen) {
      fetchActivityLog();
    }
  }, [activityLogOpen, activityLimit]);

  async function fetchActivityLog() {
    try {
      const allCustomers = await db.customers.toArray();
      const allLoans = await db.loans.toArray();
      const allCollections = await db.collections.toArray();

      const activities: ActivityItem[] = [];

      allCustomers.forEach(c => {
        activities.push({
          id: `c-${c.id}`,
          date: c.createdAt,
          type: 'customer_added',
          title: `Added customer: ${c.name}`,
          subtitle: `Phone: ${c.phone}`,
        });
      });

      allLoans.forEach(l => {
        const customer = allCustomers.find(c => c.id === l.customerId);
        activities.push({
          id: `l-${l.id}`,
          date: l.createdAt,
          type: 'loan_given',
          title: `Given loan of ₹${l.amount.toLocaleString('en-IN')}`,
          subtitle: `To: ${customer?.name || 'Unknown'} (Loan ID: ${l.displayId})`,
        });
      });

      allCollections.forEach(col => {
        const loan = allLoans.find(l => l.id === col.loanId);
        const customer = loan ? allCustomers.find(c => c.id === loan.customerId) : null;
        activities.push({
          id: `col-${col.id}`,
          date: col.createdAt || col.date,
          type: 'collection_made',
          title: `Collected ₹${col.amount.toLocaleString('en-IN')}`,
          subtitle: `From: ${customer?.name || 'Unknown'} (Loan ID: ${loan?.displayId || 'Unknown'})`,
        });
      });

      activities.sort((a, b) => b.date - a.date);
      setActivityLog(activityLimit === 'all' ? activities : activities.slice(0, parseInt(activityLimit)));
    } catch (e) {
      console.error('Failed to fetch activity log', e);
    }
  }

  async function handleExport() {
    try {
      const data = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        customers: await db.customers.toArray(),
        loans: await db.loans.toArray(),
        emis: await db.emis.toArray(),
        collections: await db.collections.toArray(),
      };
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filename = `finance_tracker_backup_${Date.now()}.json`;
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);

      await db.backupLog.add({
        id: crypto.randomUUID(), backupDate: Date.now(),
        filename, fileSize: blob.size, status: 'success',
      });
      setMsg('Backup exported successfully!');
      
      // History state set removed
      
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg('Export failed: ' + (err as Error).message);
      setTimeout(() => setMsg(''), 3000);
    }
  }

  async function handleExportCSV() {
    try {
      const customers = await db.customers.filter(c => !c.deleted).toArray();
      let loans = await db.loans.filter(l => !l.deleted).toArray();
      let collections = await db.collections.filter(c => !c.deleted).toArray();

      if (exportCustomerId !== 'all') {
        loans = loans.filter(l => l.customerId === exportCustomerId);
        collections = collections.filter(c => c.customerId === exportCustomerId);
      }
      if (exportStartDate) {
        const start = new Date(exportStartDate).getTime();
        loans = loans.filter(l => l.startDate >= start);
        collections = collections.filter(c => c.date >= start);
      }
      if (exportEndDate) {
        const end = new Date(exportEndDate).getTime() + 86399999;
        loans = loans.filter(l => l.startDate <= end);
        collections = collections.filter(c => c.date <= end);
      }

      let csv = '=== LOAN LEDGER ===\n';
      csv += 'Customer Name,Phone,Loan ID,Principal,Recovered,Pending,Status,Start Date\n';
      
      loans.forEach(l => {
        const cust = customers.find(cu => cu.id === l.customerId);
        csv += `"${cust?.name || 'Unknown'}","${cust?.phone || ''}","${l.displayId}",${l.amount},${l.paidAmount},${l.pendingAmount},${l.status.toUpperCase()},${new Date(l.startDate).toISOString().split('T')[0]}\n`;
      });

      csv += '\n\n=== COLLECTION HISTORY ===\n';
      csv += 'Date,Customer Name,Loan ID,Amount Paid,Payment Mode\n';
      
      collections.sort((a, b) => b.date - a.date).forEach(c => {
        const loan = loans.find(lo => lo.id === c.loanId);
        const cust = customers.find(cu => cu.id === c.customerId);
        csv += `${new Date(c.date).toISOString().split('T')[0]},"${cust?.name || 'Unknown'}","${loan?.displayId || 'Unknown'}",${c.amount},${c.mode.toUpperCase()}\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `Finance_Ledger_${Date.now()}.csv`; a.click();
      URL.revokeObjectURL(url);
      setMsg('CSV Exported Successfully!');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg('CSV Export Failed: ' + (err as Error).message);
      setTimeout(() => setMsg(''), 3000);
    }
  }

  async function handleExportPDF() {
    try {
      const customers = await db.customers.filter(c => !c.deleted).toArray();
      let loans = await db.loans.filter(l => !l.deleted).toArray();
      let collections = await db.collections.filter(c => !c.deleted).toArray();

      if (exportCustomerId !== 'all') {
        loans = loans.filter(l => l.customerId === exportCustomerId);
        collections = collections.filter(c => c.customerId === exportCustomerId);
      }
      if (exportStartDate) {
        const start = new Date(exportStartDate).getTime();
        loans = loans.filter(l => l.startDate >= start);
        collections = collections.filter(c => c.date >= start);
      }
      if (exportEndDate) {
        const end = new Date(exportEndDate).getTime() + 86399999;
        loans = loans.filter(l => l.startDate <= end);
        collections = collections.filter(c => c.date <= end);
      }

      const doc = new jsPDF();
      
      // --- TABLE 1: LOAN LEDGER ---
      doc.setFontSize(18);
      doc.text('Finance Tracker - Loan Ledger', 14, 22);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);

      const tableData = loans.map(l => {
        const cust = customers.find(cu => cu.id === l.customerId);
        return [
          cust?.name || 'Unknown',
          l.displayId || 'N/A',
          `Rs. ${l.amount.toLocaleString('en-IN')}`,
          `Rs. ${l.paidAmount.toLocaleString('en-IN')}`,
          `Rs. ${l.pendingAmount.toLocaleString('en-IN')}`,
          l.status.toUpperCase()
        ];
      });

      autoTable(doc, {
        startY: 36,
        head: [['Customer', 'Loan ID', 'Principal', 'Recovered', 'Pending', 'Status']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [26, 26, 26] },
      });

      // --- TABLE 2: COLLECTION HISTORY ---
      let finalY = (doc as any).lastAutoTable.finalY || 36;
      if (finalY > 250) {
         doc.addPage();
         finalY = 20;
      } else {
         finalY += 20;
      }

      doc.setFontSize(18);
      doc.setTextColor(0);
      doc.text('Collection History', 14, finalY);

      const collectionData = collections.sort((a, b) => b.date - a.date).map(c => {
        const loan = loans.find(l => l.id === c.loanId);
        const cust = customers.find(cu => cu.id === c.customerId);
        return [
          new Date(c.date).toLocaleDateString('en-IN'),
          cust?.name || 'Unknown',
          loan?.displayId || 'Unknown',
          `Rs. ${c.amount.toLocaleString('en-IN')}`,
          c.mode.toUpperCase()
        ];
      });

      autoTable(doc, {
        startY: finalY + 8,
        head: [['Date', 'Customer', 'Loan ID', 'Amount Paid', 'Mode']],
        body: collectionData,
        theme: 'striped',
        headStyles: { fillColor: [70, 70, 70] },
      });

      doc.save(`Finance_Report_${Date.now()}.pdf`);
      setMsg('PDF Exported Successfully!');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg('PDF Export Failed: ' + (err as Error).message);
      setTimeout(() => setMsg(''), 3000);
    }
  }



  async function handleImport() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.customers || !data.loans) throw new Error('Invalid backup file');

        if (!confirm('This will replace ALL current data. Are you sure?')) return;

        setPinAction(() => async () => {
          try {
            await db.customers.clear(); await db.loans.clear();
            await db.emis.clear(); await db.collections.clear();

            if (data.customers.length) await db.customers.bulkAdd(data.customers);
            if (data.loans.length) await db.loans.bulkAdd(data.loans);
            if (data.emis?.length) await db.emis.bulkAdd(data.emis);
            if (data.collections.length) await db.collections.bulkAdd(data.collections);

            setMsg('Data restored successfully! Refresh the page.');
            setTimeout(() => setMsg(''), 4000);
          } catch (err) {
            setMsg('Import failed: ' + (err as Error).message);
            setTimeout(() => setMsg(''), 4000);
          }
        });
      } catch (err) {
        setMsg('Import failed: ' + (err as Error).message);
        setTimeout(() => setMsg(''), 4000);
      }
    };
    input.click();
  }

  function handleResetPin() {
    localStorage.removeItem('ft_pin');
    localStorage.removeItem('ft_setup_complete');
    setMsg('PIN reset. You will be asked to set a new PIN on next load.');
    setTimeout(() => window.location.reload(), 1500);
  }

  async function handleSignOut() {
    try {
      await auth.signOut();
      await db.delete(); // Wipe local Dexie database for the logged out user
      localStorage.removeItem('ft_pin');
      localStorage.removeItem('ft_setup_complete');
      window.location.reload();
    } catch (err) {
      console.error('Sign out error', err);
      setMsg('Failed to sign out completely. Please clear site data.');
      setTimeout(() => setMsg(''), 4000);
    }
  }

  async function handleForceSync() {
    try {
      const now = Date.now();
      await db.customers.toCollection().modify((r: any) => { r.syncStatus = 'pending'; r.updatedAt = now; });
      await db.loans.toCollection().modify((r: any) => { r.syncStatus = 'pending'; r.updatedAt = now; });
      await db.emis.toCollection().modify((r: any) => { r.syncStatus = 'pending'; r.updatedAt = now; });
      await db.collections.toCollection().modify((r: any) => { r.syncStatus = 'pending'; r.updatedAt = now; });
      setMsg('Success! All local data pushed to Cloud Sync queue.');
      setTimeout(() => setMsg(''), 4000);
    } catch (e: any) {
      console.error(e);
      setMsg('Force Sync failed: ' + e.message);
      setTimeout(() => setMsg(''), 4000);
    }
  }

  async function fetchDeletedRecords() {
    const dCust = await db.customers.filter(c => !!c.deleted).toArray();
    const dLoans = await db.loans.filter(l => !!l.deleted).toArray();
    const dColls = await db.collections.filter(c => !!c.deleted).toArray();
    setDeletedCustomers(dCust);
    setDeletedLoans(dLoans);
    setDeletedCollections(dColls);
  }

  async function handleRestoreCustomer(id: string) {
    setPinAction(() => async () => {
      try {
        await db.customers.update(id, { deleted: false, syncStatus: 'pending', updatedAt: Date.now() });
        setMsg('Customer successfully restored!');
        setTimeout(() => setMsg(''), 3000);
        fetchDeletedRecords();
      } catch (err: any) {
        setMsg('Restore failed: ' + err.message);
      }
    });
  }

  async function handleRestoreLoan(loan: Loan) {
    setPinAction(() => async () => {
      try {
        await db.loans.update(loan.id, { deleted: false, syncStatus: 'pending', updatedAt: Date.now() });
        
        // Auto-restore customer if it's also deleted
        const customer = await db.customers.get(loan.customerId);
        if (customer && customer.deleted) {
          await db.customers.update(loan.customerId, { deleted: false, syncStatus: 'pending', updatedAt: Date.now() });
        }

        // Auto-restore related collections
        const cols = await db.collections.where('loanId').equals(loan.id).toArray();
        for (const col of cols) {
          if (col.deleted) {
            await db.collections.update(col.id, { deleted: false, syncStatus: 'pending', updatedAt: Date.now() });
          }
        }

        // Auto-restore related EMIs
        const emis = await db.emis.where('loanId').equals(loan.id).toArray();
        for (const emi of emis) {
          if (emi.deleted) {
            await db.emis.update(emi.id, { deleted: false, syncStatus: 'pending', updatedAt: Date.now() });
          }
        }

        setMsg('Loan and its collections successfully restored!');
        setTimeout(() => setMsg(''), 3000);
        fetchDeletedRecords();
      } catch (err: any) {
        setMsg('Restore failed: ' + err.message);
      }
    });
  }

  async function handleRestoreCollection(col: Collection) {
    setPinAction(() => async () => {
      try {
        await db.collections.update(col.id, { deleted: false, syncStatus: 'pending', updatedAt: Date.now() });
        
        // Auto-restore loan if it's also deleted
        const loan = await db.loans.get(col.loanId);
        if (loan && loan.deleted) {
          await db.loans.update(col.loanId, { deleted: false, syncStatus: 'pending', updatedAt: Date.now() });
        }

        // Auto-restore customer if it's also deleted
        const customer = await db.customers.get(col.customerId);
        if (customer && customer.deleted) {
          await db.customers.update(col.customerId, { deleted: false, syncStatus: 'pending', updatedAt: Date.now() });
        }

        // Recalculate loan balances
        if (loan) {
          const updatedCollections = (await db.collections.where('loanId').equals(loan.id).toArray()).filter(c => !c.deleted);
          const totalPaid = updatedCollections.reduce((sum, c) => sum + c.amount, 0);
          const newPending = Math.max(0, loan.totalPayable - totalPaid);
          const newStatus = newPending <= 0 ? 'closed' : loan.status === 'closed' ? 'active' : loan.status;
          await db.loans.update(loan.id, { paidAmount: totalPaid, pendingAmount: newPending, status: newStatus, syncStatus: 'pending', updatedAt: Date.now() });
        }

        setMsg('Collection successfully restored!');
        setTimeout(() => setMsg(''), 3000);
        fetchDeletedRecords();
      } catch (err: any) {
        setMsg('Restore failed: ' + err.message);
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style>{`
        .settings-container {
          max-width: 800px;
          margin: 0 auto;
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: var(--space-6);
          padding-bottom: var(--space-8);
        }
        .settings-section-title {
          font-size: 11px;
          font-weight: 800;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: var(--space-3);
          padding-left: var(--space-2);
        }
        .settings-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-xl);
          box-shadow: var(--shadow-sm);
          overflow: hidden;
          width: 100%;
        }
        .settings-row {
          display: flex;
          align-items: center;
          padding: var(--space-4);
          border-bottom: 1px solid var(--border);
          gap: var(--space-4);
          transition: background 0.2s;
          width: 100%;
        }
        .settings-row:last-child {
          border-bottom: none;
        }
        .settings-row.clickable {
          cursor: pointer;
        }
        .settings-row.clickable:hover {
          background: var(--bg-soft);
        }
        .settings-icon {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .settings-content {
          flex: 1;
          min-width: 0;
        }
        .settings-title {
          font-size: var(--font-base);
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 2px;
          white-space: normal;
          word-break: break-word;
        }
        .settings-desc {
          font-size: var(--font-xs);
          color: var(--text-secondary);
          line-height: 1.4;
          white-space: normal;
          word-break: break-word;
        }
        .settings-action {
          flex-shrink: 0;
          display: flex;
          gap: var(--space-2);
          align-items: center;
          flex-wrap: wrap;
        }
        @media (max-width: 768px) {
          .settings-row {
            flex-direction: column;
            align-items: flex-start;
            gap: var(--space-3);
          }
          .settings-action {
            width: 100%;
            justify-content: flex-end;
          }
        }
      `}</style>

      <div className="page-header" style={{ marginBottom: 'var(--space-6)' }}>
        <div>
          <h2>Settings</h2>
          <p className="page-header-sub">Manage your preferences and data</p>
        </div>
      </div>

      <div className="settings-container">
        
        {/* Floating Message Alert */}
        {msg && (
          <div style={{
            padding: 'var(--space-3) var(--space-4)',
            background: msg.toLowerCase().includes('error') || msg.toLowerCase().includes('failed') ? 'var(--danger-bg)' : 'var(--success-bg)',
            color: msg.toLowerCase().includes('error') || msg.toLowerCase().includes('failed') ? 'var(--danger)' : 'var(--success)',
            borderRadius: 'var(--radius-md)', fontSize: 'var(--font-sm)', fontWeight: 600,
            border: `1px solid ${msg.toLowerCase().includes('error') || msg.toLowerCase().includes('failed') ? 'var(--danger)' : 'var(--success)'}`,
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)'
          }}>
            {msg.toLowerCase().includes('error') || msg.toLowerCase().includes('failed') ? <Shield size={16} /> : <Check size={16} />}
            {msg}
          </div>
        )}

        {/* ── Section: Account ── */}
        {user && (
          <div className="settings-card" style={{ padding: 'var(--space-5)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-4)', background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--primary-alpha) 100%)' }}>
            {user.photoURL ? (
              <img src={user.photoURL} alt="Profile" style={{ width: 64, height: 64, borderRadius: '50%', border: '2px solid var(--primary)', flexShrink: 0, boxShadow: '0 4px 12px rgba(163,230,53,0.3)' }} />
            ) : (
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--primary-deep)', color: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--font-2xl)', fontWeight: 800, flexShrink: 0, boxShadow: '0 4px 12px rgba(163,230,53,0.3)' }}>
                {user.displayName?.charAt(0) || user.email?.charAt(0) || '?'}
              </div>
            )}
            <div className="settings-content">
              <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.5px', marginBottom: 2 }}>Logged In As</div>
              <h3 style={{ fontSize: 'var(--font-xl)', fontWeight: 800, margin: 0, fontFamily: 'var(--font-display)' }}>{user.displayName || 'Unknown User'}</h3>
              <p style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: 'var(--font-sm)', margin: 0 }}>{user.email || 'No Email'}</p>
            </div>
            <button className="btn btn-ghost" style={{ color: 'var(--danger)', background: 'var(--bg-card)', border: '1px solid var(--border)' }} onClick={handleSignOut}>
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        )}

        {/* ── Section: Data & Storage ── */}
        <div className="settings-section">
          <div className="settings-section-title">Data Management</div>
          <div className="settings-card">
            
            <div className="settings-row">
              <div className="settings-icon" style={{ background: 'var(--primary-alpha)', color: 'var(--primary-deep)' }}>
                <Download size={20} />
              </div>
              <div className="settings-content">
                <div className="settings-title">Export Ledger</div>
                <div className="settings-desc">Download a copy of your records</div>
              </div>
              <div className="settings-action">
                <button className="btn btn-ghost btn-sm" style={{ padding: '0 12px' }} onClick={handleExport}>JSON</button>
                <button className="btn btn-ghost btn-sm" style={{ padding: '0 12px' }} onClick={() => { setExportType('csv'); setExportModal(true); }}>CSV</button>
                <button className="btn btn-primary btn-sm" style={{ padding: '0 12px' }} onClick={() => { setExportType('pdf'); setExportModal(true); }}>PDF</button>
              </div>
            </div>

            <div className="settings-row clickable" onClick={handleImport}>
              <div className="settings-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' }}>
                <Upload size={20} />
              </div>
              <div className="settings-content">
                <div className="settings-title">Restore from Backup</div>
                <div className="settings-desc">Import data from a previously downloaded JSON file</div>
              </div>
              <div className="settings-action">
                <ChevronRight size={18} color="var(--text-tertiary)" />
              </div>
            </div>

            <div className="settings-row clickable" onClick={() => { fetchDeletedRecords(); setRestoreModal(true); }}>
              <div className="settings-icon" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                <Trash2 size={20} />
              </div>
              <div className="settings-content">
                <div className="settings-title">Recycle Bin</div>
                <div className="settings-desc">Recover accidentally deleted loans and collections</div>
              </div>
              <div className="settings-action">
                <ChevronRight size={18} color="var(--text-tertiary)" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Section: Security & Sync ── */}
        <div className="settings-section">
          <div className="settings-section-title">Security & Devices</div>
          <div className="settings-card">
            
            <div className="settings-row clickable" onClick={handleForceSync}>
              <div className="settings-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}>
                <CloudLightning size={20} />
              </div>
              <div className="settings-content">
                <div className="settings-title">Force Cloud Sync</div>
                <div className="settings-desc">Manually push local changes to the cloud server</div>
              </div>
              <div className="settings-action">
                <button className="btn btn-ghost btn-sm" style={{ color: '#10B981', border: '1px solid rgba(16,185,129,0.3)' }} onClick={e => { e.stopPropagation(); handleForceSync(); }}>Sync Now</button>
              </div>
            </div>

            <div className="settings-row clickable" onClick={handleResetPin}>
              <div className="settings-icon" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                <Shield size={20} />
              </div>
              <div className="settings-content">
                <div className="settings-title">Reset Security PIN</div>
                <div className="settings-desc">Remove current PIN and setup a new one</div>
              </div>
              <div className="settings-action">
                <ChevronRight size={18} color="var(--text-tertiary)" />
              </div>
            </div>

            {/* Active Devices Sub-section */}
            <div style={{ background: 'var(--bg-soft)', padding: 'var(--space-2) var(--space-4)', borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Sessions</div>
            </div>
            
            {devices.length === 0 ? (
              <div style={{ padding: 'var(--space-4)', textAlign: 'center', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)' }}>Loading devices...</div>
            ) : (
              devices.map(device => (
                <div className="settings-row" key={device.id}>
                  <div className="settings-icon" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    {device.deviceName.toLowerCase().includes('phone') || device.deviceName.toLowerCase().includes('android') ? <Smartphone size={20} /> : <Laptop size={20} />}
                  </div>
                  <div className="settings-content">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span className="settings-title">{device.deviceName}</span>
                      {device.isCurrent && <span style={{ fontSize: '9px', background: 'var(--success-bg)', color: 'var(--success)', padding: '2px 6px', borderRadius: 'var(--radius-pill)', fontWeight: 800 }}>THIS DEVICE</span>}
                    </div>
                    <div className="settings-desc">
                      Last active: {new Date(device.lastActive).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>
                  {!device.isCurrent && (
                    <div className="settings-action">
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleLogoutDevice(device.id)}>Remove</button>
                    </div>
                  )}
                </div>
              ))
            )}

          </div>
        </div>

        {/* ── Section: App Info ── */}
        <div className="settings-section">
          <div className="settings-section-title">App Info</div>
          <div className="settings-card">
            
            <div className="settings-row clickable" onClick={() => setActivityLogOpen(true)}>
              <div className="settings-icon" style={{ background: 'var(--bg-soft)', color: 'var(--text-secondary)' }}>
                <Clock size={20} />
              </div>
              <div className="settings-content">
                <div className="settings-title">Activity Log</div>
                <div className="settings-desc">View history of all actions performed recently</div>
              </div>
              <div className="settings-action">
                <ChevronRight size={18} color="var(--text-tertiary)" />
              </div>
            </div>

            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', padding: '24px', position: 'relative', overflow: 'hidden', background: 'var(--bg-soft)' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.05, pointerEvents: 'none', background: 'radial-gradient(circle at 50% 50%, var(--primary) 0%, transparent 70%)' }}></div>
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>CREDITS</div>
                <div style={{ height: '1px', background: 'var(--border)', marginBottom: '24px', opacity: 0.5 }}></div>
                
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--primary)', marginBottom: '20px' }}>P.VENUBHASKAR</div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <a href="https://github.com/palturuvenubhaskar" target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 600, fontSize: '15px' }}>
                    <Code size={20} />
                    <span>palturuvenubhaskar</span>
                  </a>
                  <a href="mailto:palturuvenubhaskar@gmail.com" style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 600, fontSize: '15px' }}>
                    <Mail size={20} />
                    <span>palturuvenubhaskar@gmail.com</span>
                  </a>
                  <a href="https://instagram.com/vb_nobody" target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 600, fontSize: '15px' }}>
                    <AtSign size={20} />
                    <span>@vb_nobody</span>
                  </a>
                </div>
              </div>
              
              {/* Dollar sign background pattern matching image */}
              <div style={{ position: 'absolute', top: '10%', right: '15%', opacity: 0.15, color: 'var(--primary)', fontSize: '20px', fontWeight: 800, transform: 'rotate(15deg)' }}>$</div>
              <div style={{ position: 'absolute', top: '30%', right: '35%', opacity: 0.12, color: 'var(--primary)', fontSize: '24px', fontWeight: 800, transform: 'rotate(-10deg)' }}>$</div>
              <div style={{ position: 'absolute', bottom: '25%', right: '10%', opacity: 0.18, color: 'var(--primary)', fontSize: '18px', fontWeight: 800, transform: 'rotate(5deg)' }}>$</div>
              <div style={{ position: 'absolute', bottom: '15%', right: '45%', opacity: 0.1, color: 'var(--primary)', fontSize: '22px', fontWeight: 800, transform: 'rotate(-15deg)' }}>$</div>
              <div style={{ position: 'absolute', top: '50%', right: '25%', opacity: 0.14, color: 'var(--primary)', fontSize: '16px', fontWeight: 800, transform: 'rotate(25deg)' }}>$</div>
              <div style={{ position: 'absolute', top: '20%', left: '40%', opacity: 0.1, color: 'var(--primary)', fontSize: '18px', fontWeight: 800, transform: 'rotate(-5deg)' }}>$</div>
              <div style={{ position: 'absolute', bottom: '40%', left: '20%', opacity: 0.12, color: 'var(--primary)', fontSize: '20px', fontWeight: 800, transform: 'rotate(12deg)' }}>$</div>
            </div>

          </div>
        </div>

      </div>

      {/* ── Modals ── */}
      
      {/* Export Config Modal */}
      {exportModal && (
        <div className="modal-overlay" onClick={() => setExportModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h3 className="modal-title">Export {exportType?.toUpperCase()} Report</h3>
            <p className="page-header-sub" style={{marginBottom: 'var(--space-4)'}}>Filter your data by customer or date range.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label">Customer</label>
                <select className="form-input" value={exportCustomerId} onChange={e => setExportCustomerId(e.target.value)}>
                  <option value="all">All Customers</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">From Date</label>
                  <input type="date" className="form-input" value={exportStartDate} onChange={e => setExportStartDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">To Date</label>
                  <input type="date" className="form-input" value={exportEndDate} onChange={e => setExportEndDate(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setExportModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => {
                setExportModal(false);
                if (exportType === 'csv') handleExportCSV();
                else if (exportType === 'pdf') handleExportPDF();
              }}>
                <FileText size={16} /> Generate Report
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Activity Log Modal */}
      {activityLogOpen && (
        <div className="modal-overlay" onClick={() => setActivityLogOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
              <div>
                <h3 className="modal-title" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 4 }}>Activity Log</h3>
                <p className="page-header-sub" style={{ margin: 0 }}>Timeline of events in your Finance Tracker.</p>
              </div>
              <select 
                value={activityLimit} 
                onChange={(e) => setActivityLimit(e.target.value as '30' | '100' | 'all')}
                className="form-input"
                style={{ width: 'auto', minHeight: 36, padding: '4px 12px' }}
              >
                <option value="30">Last 30</option>
                <option value="100">Last 100</option>
                <option value="all">All</option>
              </select>
            </div>
            
            <div className="custom-scrollbar" style={{ overflowY: 'auto', flex: 1, paddingRight: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {activityLog.length === 0 ? (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-tertiary)' }}>No recent activity.</div>
              ) : (
                activityLog.map(act => (
                  <div key={act.id} style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--bg-soft)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: act.type === 'collection_made' ? 'var(--success-bg)' : act.type === 'loan_given' ? 'var(--primary-alpha)' : 'var(--bg-card)', color: act.type === 'collection_made' ? 'var(--success)' : act.type === 'loan_given' ? 'var(--primary-deep)' : 'var(--text-secondary)', border: `1px solid ${act.type === 'collection_made' ? 'var(--success)' : act.type === 'loan_given' ? 'var(--primary)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {act.type === 'collection_made' && <Download size={16} />}
                      {act.type === 'loan_given' && <Upload size={16} />}
                      {act.type === 'customer_added' && <Check size={16} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--font-sm)', fontWeight: 800, color: 'var(--text-primary)' }}>{act.title}</div>
                      <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', marginTop: 2 }}>{act.subtitle}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: 4, fontWeight: 700, textTransform: 'uppercase' }}>{new Date(act.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="modal-actions" style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setActivityLogOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Modal */}
      {restoreModal && (
        <div className="modal-overlay" onClick={() => setRestoreModal(false)} style={{ zIndex: 1000 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
            
            {/* Modal Header */}
            <div style={{ padding: 'var(--space-6) var(--space-6) var(--space-4) var(--space-6)', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              <h3 className="modal-title" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: '4px' }}>Recycle Bin</h3>
              <p className="page-header-sub" style={{ margin: 0, marginBottom: 'var(--space-4)' }}>Select items below to restore them.</p>
              <div className="tabs" style={{ margin: 0, alignSelf: 'flex-start' }}>
                <button className={`tab-btn ${restoreTab === 'customers' ? 'active' : ''}`} onClick={() => setRestoreTab('customers')}>Customers</button>
                <button className={`tab-btn ${restoreTab === 'loans' ? 'active' : ''}`} onClick={() => setRestoreTab('loans')}>Loans</button>
                <button className={`tab-btn ${restoreTab === 'collections' ? 'active' : ''}`} onClick={() => setRestoreTab('collections')}>Collections</button>
              </div>
            </div>
            
            {/* Modal Body (Scrollable) */}
            <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: 'var(--space-4) var(--space-6)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {restoreTab === 'customers' && (
                  deletedCustomers.length === 0 ? (
                    <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-tertiary)' }}>No deleted customers.</div>
                  ) : (
                    deletedCustomers.map(c => (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3) var(--space-4)', background: 'var(--bg-soft)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                        <div>
                          <div style={{ fontSize: 'var(--font-base)', fontWeight: 800, color: 'var(--text-primary)' }}>{c.name} {c.displayId ? `(${c.displayId})` : ''}</div>
                          <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>{c.phone}</div>
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={() => handleRestoreCustomer(c.id)}>Restore</button>
                      </div>
                    ))
                  )
                )}

                {restoreTab === 'loans' && (
                  deletedLoans.length === 0 ? (
                    <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-tertiary)' }}>No deleted loans.</div>
                  ) : (
                    deletedLoans.map(l => {
                      const cust = customers.find(cu => cu.id === l.customerId) || deletedCustomers.find(cu => cu.id === l.customerId);
                      return (
                        <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3) var(--space-4)', background: 'var(--bg-soft)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                          <div>
                            <div style={{ fontSize: 'var(--font-base)', fontWeight: 800, color: 'var(--text-primary)' }}>Loan ID: {l.displayId}</div>
                            <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>{cust ? `${cust.name}` : 'Unknown'} • ₹{l.amount.toLocaleString('en-IN')}</div>
                          </div>
                          <button className="btn btn-primary btn-sm" onClick={() => handleRestoreLoan(l)}>Restore</button>
                        </div>
                      );
                    })
                  )
                )}

                {restoreTab === 'collections' && (
                  deletedCollections.length === 0 ? (
                    <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-tertiary)' }}>No deleted collections.</div>
                  ) : (
                    deletedCollections.map(col => {
                      const cust = customers.find(cu => cu.id === col.customerId) || deletedCustomers.find(cu => cu.id === col.customerId);
                      return (
                        <div key={col.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3) var(--space-4)', background: 'var(--bg-soft)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                          <div>
                            <div style={{ fontSize: 'var(--font-base)', fontWeight: 800, color: 'var(--text-primary)' }}>{new Date(col.date).toLocaleDateString('en-IN')} • ₹{col.amount.toLocaleString('en-IN')}</div>
                            <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>{cust ? `${cust.name}` : 'Unknown'}</div>
                          </div>
                          <button className="btn btn-primary btn-sm" onClick={() => handleRestoreCollection(col)}>Restore</button>
                        </div>
                      );
                    })
                  )
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="modal-actions" style={{ padding: 'var(--space-4) var(--space-6)', margin: 0, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setRestoreModal(false)}>Close</button>
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
