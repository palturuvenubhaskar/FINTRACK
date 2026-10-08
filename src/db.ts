import Dexie, { type Table } from 'dexie';

// ── Type Definitions ─────────────────────────────────────

export interface Syncable {
  updatedAt?: number;
  syncStatus?: 'synced' | 'pending' | 'error';
  lastModifiedDevice?: string;
  deleted?: boolean;
}

export interface Customer extends Syncable {
  id: string;
  displayId?: string;
  name: string;
  phone: string;
  phone2?: string;
  phones?: string[];
  address?: string;
  address2?: string;
  addresses?: string[];
  occupation?: string;
  place?: string;
  shopAddresses?: string[];
  aadhaar?: string;
  pan?: string;
  notes?: string;
  isActive: boolean;
  createdAt: number; // unix ms
}

export type CollectionType = 'daily' | 'weekly' | 'monthly';
export type LoanStatus = 'active' | 'closed' | 'overdue' | 'npa';
export type PaymentMode = 'cash' | 'upi' | 'bank' | 'cheque';
export type EmiStatus = 'pending' | 'paid' | 'overdue' | 'partial';

export interface Loan extends Syncable {
  id: string;
  displayId?: string;
  customerId: string;
  customerName?: string; // joined field
  amount: number;
  rate: number;
  type: CollectionType;
  tenure: number;
  startDate: number;
  emiAmount: number;
  totalPayable: number;
  paidAmount: number;
  pendingAmount: number;
  status: LoanStatus;
  customDates?: Record<number, number>;
  customEmiAmounts?: Record<number, number>;
  collectionDay?: string;
  notes?: string;
  discount?: number;
  createdAt: number;
  closedAt?: number;
}

export interface Emi extends Syncable {
  id: string;
  loanId: string;
  emiNumber: number;
  dueDate: number;
  emiAmount: number;
  status: EmiStatus;
  paidAmount: number;
  paidOn?: number;
}

export interface Collection extends Syncable {
  id: string;
  loanId: string;
  customerId: string;
  customerName?: string;
  amount: number;
  date: number;
  mode: PaymentMode;
  note?: string;
  createdAt: number;
}

export interface BackupLog {
  id: string;
  backupDate: number;
  filename: string;
  fileSize: number;
  status: string;
  error?: string;
}

// ── Database Class ───────────────────────────────────────

class FinanceTrackerDB extends Dexie {
  customers!: Table<Customer>;
  loans!: Table<Loan>;
  emis!: Table<Emi>;
  collections!: Table<Collection>;
  backupLog!: Table<BackupLog>;

  constructor() {
    super('FinanceTrackerDB');

    this.version(1).stores({
      customers: 'id, name, phone, isActive, createdAt',
      loans: 'id, customerId, status, type, startDate, createdAt',
      emis: 'id, loanId, emiNumber, dueDate, status',
      collections: 'id, loanId, customerId, date, createdAt',
    });

    this.version(3).stores({
      customers: 'id, name, phone, isActive, createdAt',
      loans: 'id, customerId, status, type, startDate, createdAt',
      emis: 'id, loanId, emiNumber, dueDate, status',
      collections: 'id, loanId, customerId, date, createdAt',
      backupLog: 'id, backupDate',
    });

    this.version(4).stores({
      customers: 'id, displayId, name, phone, isActive, createdAt',
      loans: 'id, displayId, customerId, status, type, startDate, createdAt',
      emis: 'id, loanId, emiNumber, dueDate, status',
      collections: 'id, loanId, customerId, date, createdAt',
      backupLog: 'id, backupDate',
    }).upgrade(async tx => {
      const customers = await tx.table('customers').orderBy('createdAt').toArray();
      let cSeq = 1;
      for (const c of customers) {
        if (!c.displayId) {
          c.displayId = `C${cSeq.toString().padStart(3, '0')}`;
          await tx.table('customers').put(c);
        }
        cSeq++;
        
        const loans = await tx.table('loans').where('customerId').equals(c.id).sortBy('createdAt');
        let lSeq = 1;
        for (const l of loans) {
          if (!l.displayId) {
            l.displayId = `${c.displayId.replace(/-/g, '')}L${lSeq.toString().padStart(2, '0')}`;
            await tx.table('loans').put(l);
          }
          lSeq++;
        }
      }
    });

    this.version(5).stores({
      customers: 'id, displayId, name, phone, isActive, createdAt, syncStatus, updatedAt',
      loans: 'id, displayId, customerId, status, type, startDate, createdAt, syncStatus, updatedAt',
      emis: 'id, loanId, emiNumber, dueDate, status, syncStatus, updatedAt',
      collections: 'id, loanId, customerId, date, createdAt, syncStatus, updatedAt',
    }).upgrade(async tx => {
      const now = Date.now();
      await tx.table('customers').toCollection().modify(c => { c.syncStatus = c.syncStatus || 'pending'; c.updatedAt = c.updatedAt || now; });
      await tx.table('loans').toCollection().modify(c => { c.syncStatus = c.syncStatus || 'pending'; c.updatedAt = c.updatedAt || now; });
      await tx.table('emis').toCollection().modify(c => { c.syncStatus = c.syncStatus || 'pending'; c.updatedAt = c.updatedAt || now; });
      await tx.table('collections').toCollection().modify(c => { c.syncStatus = c.syncStatus || 'pending'; c.updatedAt = c.updatedAt || now; });
    });

    this.version(6).stores({
      customers: 'id, displayId, name, phone, isActive, createdAt, syncStatus, updatedAt',
      loans: 'id, displayId, customerId, status, type, startDate, createdAt, syncStatus, updatedAt',
      emis: 'id, loanId, emiNumber, dueDate, status, syncStatus, updatedAt',
      collections: 'id, loanId, customerId, date, createdAt, syncStatus, updatedAt',
    });

    this.version(7).stores({
      customers: 'id, displayId, name, phone, isActive, createdAt, syncStatus, updatedAt',
      loans: 'id, displayId, customerId, status, type, startDate, createdAt, syncStatus, updatedAt',
      emis: 'id, loanId, emiNumber, dueDate, status, syncStatus, updatedAt',
      collections: 'id, loanId, customerId, date, createdAt, syncStatus, updatedAt',
    }).upgrade(async tx => {
      await tx.table('customers').toCollection().modify(c => {
        if (c.displayId) c.displayId = c.displayId.replace(/-/g, '');
      });
      await tx.table('loans').toCollection().modify(l => {
        if (l.displayId) l.displayId = l.displayId.replace(/-/g, '');
      });
    });

    this.version(8).stores({
      customers: 'id, displayId, name, phone, isActive, createdAt, syncStatus, updatedAt',
      loans: 'id, displayId, customerId, status, type, startDate, createdAt, syncStatus, updatedAt',
      emis: 'id, loanId, emiNumber, dueDate, status, syncStatus, updatedAt',
      collections: 'id, loanId, customerId, date, createdAt, syncStatus, updatedAt',
    }).upgrade(async tx => {
      await tx.table('customers').toCollection().modify(c => {
        if (c.shopAddresses && c.shopAddresses.length > 0 && !c.occupation) {
          c.occupation = c.shopAddresses[0];
          c.shopAddresses = [];
          c.syncStatus = 'pending';
          c.updatedAt = Date.now();
        }
      });
    });

    this.version(9).stores({
      customers: 'id, displayId, name, phone, isActive, createdAt, syncStatus, updatedAt',
      loans: 'id, displayId, customerId, status, type, startDate, createdAt, syncStatus, updatedAt',
      emis: 'id, loanId, emiNumber, dueDate, status, syncStatus, updatedAt',
      collections: 'id, loanId, customerId, date, createdAt, syncStatus, updatedAt',
    }).upgrade(async tx => {
      await tx.table('customers').toCollection().modify(c => {
        if (!c.addresses || c.addresses.length === 0) {
          const oldAddrs = [c.address, c.address2].filter(a => typeof a === 'string' && a.trim() !== '');
          if (oldAddrs.length > 0) {
            c.addresses = oldAddrs;
            c.address = '';
            c.address2 = '';
            c.syncStatus = 'pending';
            c.updatedAt = Date.now();
          }
        }
      });
    });

    this.version(10).stores({
      customers: 'id, displayId, name, phone, isActive, createdAt, syncStatus, updatedAt',
      loans: 'id, displayId, customerId, status, type, startDate, createdAt, syncStatus, updatedAt',
      emis: 'id, loanId, emiNumber, dueDate, status, syncStatus, updatedAt',
      collections: 'id, loanId, customerId, date, createdAt, syncStatus, updatedAt',
    }).upgrade(async tx => {
      await tx.table('customers').toCollection().modify(c => {
        if (c.notes && c.notes.trim() && !c.place) {
          c.place = c.notes.trim();
          c.notes = '';
          c.syncStatus = 'pending';
          c.updatedAt = Date.now();
        }
      });
    });

    // Automatically flag all new or updated records for sync
    const syncTables = ['customers', 'loans', 'emis', 'collections'];
    syncTables.forEach(tableName => {
      this.table(tableName).hook('creating', function (_primKey: any, obj: any) {
        if (obj.syncStatus !== 'synced') {
          obj.syncStatus = 'pending';
          obj.updatedAt = Date.now();
          setTimeout(() => window.dispatchEvent(new Event('ft-trigger-sync')), 200);
        }
      });
      
      this.table(tableName).hook('updating', function (modifications: any, _primKey: any, _obj: any) {
        if (modifications.syncStatus === 'synced' || modifications.hasOwnProperty('__fromSync')) {
          if (modifications.hasOwnProperty('__fromSync')) {
            delete modifications.__fromSync;
          }
          return modifications;
        }
        
        setTimeout(() => window.dispatchEvent(new Event('ft-trigger-sync')), 200);
        return {
          ...modifications,
          syncStatus: 'pending',
          updatedAt: Date.now()
        };
      });
    });
  }
}

export const db = new FinanceTrackerDB();

// ── Interest Calculator ──────────────────────────────────

export interface LoanCalculation {
  emi: number;
  totalInterest: number;
  totalPayable: number;
}

export function calculateLoan(
  principal: number,
  ratePercent: number,
  tenure: number,
): LoanCalculation {
  const totalInterest = principal * (ratePercent / 100);
  const totalPayable = principal + totalInterest;
  const emi = totalPayable / tenure;
  return {
    emi: Math.round(emi * 100) / 100,
    totalInterest: Math.round(totalInterest * 100) / 100,
    totalPayable: Math.round(totalPayable * 100) / 100,
  };
}

// ── Currency Formatter ───────────────────────────────────

export function formatCurrency(amount: number, decimals = 2): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export function formatCompact(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return formatCurrency(amount);
}

// ── Date Helpers ─────────────────────────────────────────

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateShort(ts: number): string {
  return new Date(ts).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

export function isToday(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

export function startOfDay(date: Date = new Date()): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function startOfMonth(date: Date = new Date()): number {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  return d.getTime();
}

export function startOfWeek(date: Date = new Date()): number {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export async function getNextCustomerDisplayId() {
  const customers = await db.customers.toArray();
  let maxSeq = 0;
  customers.forEach(c => {
    if (c.displayId) {
      const match = c.displayId.match(/c(\d+)/i);
      if (match) {
        const seq = parseInt(match[1]);
        if (seq > maxSeq) maxSeq = seq;
      }
    }
  });
  const nextNum = maxSeq + 1;
  return `101C${nextNum.toString().padStart(3, '0')}`;
}

export async function getNextLoanDisplayId(customerId: string) {
  const customer = await db.customers.get(customerId);
  let cDisplayId = customer?.displayId || '101C001';
  cDisplayId = cDisplayId.replace(/-/g, '');
  // Strip trailing Lxx placeholder if it was somehow saved previously
  cDisplayId = cDisplayId.replace(/lxx$/i, '');
  const loans = await db.loans.where('customerId').equals(customerId).toArray();
  let maxSeq = 0;
  loans.forEach(l => {
    if (l.displayId) {
       const match = l.displayId.match(/L(\d+)$/i);
       if (match) {
         const seq = parseInt(match[1]);
         if (seq > maxSeq) maxSeq = seq;
       }
    }
  });
  return `${cDisplayId}L${(maxSeq + 1).toString().padStart(2, '0')}`;
}
