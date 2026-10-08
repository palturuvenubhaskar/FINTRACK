import { db, type Customer, type Loan, type Emi, type Collection, calculateLoan } from './db';
import { v4 as uuid } from 'uuid';

export async function generateDemoData() {
  await db.customers.clear();
  await db.loans.clear();
  await db.emis.clear();
  await db.collections.clear();

  const now = Date.now();
  const dayMs = 86400000;

  // 1. Create Customers
  const customers: Customer[] = [
    { id: uuid(), name: 'Rajesh Kumar', phone: '9876543210', address: 'Market Road, Shop #12', isActive: true, createdAt: now - 30 * dayMs },
    { id: uuid(), name: 'Sneha Traders', phone: '8765432109', address: 'Main Bazar', isActive: true, createdAt: now - 45 * dayMs },
    { id: uuid(), name: 'Amit Electronics', phone: '7654321098', address: 'Station Road', isActive: true, createdAt: now - 15 * dayMs },
    { id: uuid(), name: 'Pooja Garments', phone: '6543210987', isActive: true, createdAt: now - 60 * dayMs },
    { id: uuid(), name: 'Vikram Singh', phone: '5432109876', isActive: true, createdAt: now - 10 * dayMs },
  ];
  await db.customers.bulkAdd(customers);

  // 2. Create Loans
  const loans: Loan[] = [];
  const emis: Emi[] = [];
  const collections: Collection[] = [];

  // Loan 1: Rajesh - Active Daily Loan (Partially Paid)
  const calc1 = calculateLoan(20000, 2, 45); // 45 days
  const l1Id = uuid();
  const l1Start = now - 20 * dayMs;
  loans.push({
    id: l1Id, customerId: customers[0].id, amount: 20000, rate: 2, type: 'daily', tenure: 45, startDate: l1Start,
    emiAmount: calc1.emi, totalPayable: calc1.totalPayable, paidAmount: calc1.emi * 18, pendingAmount: calc1.totalPayable - (calc1.emi * 18),
    status: 'active', notes: 'Shop inventory', createdAt: l1Start
  });

  // Generate 18 daily collections and EMIs
  for (let i = 0; i < 45; i++) {
    const isPaid = i < 18;
    const dueDate = l1Start + (i + 1) * dayMs;
    emis.push({ id: uuid(), loanId: l1Id, emiNumber: i + 1, dueDate, emiAmount: calc1.emi, status: isPaid ? 'paid' : 'pending', paidAmount: isPaid ? calc1.emi : 0, paidOn: isPaid ? dueDate + 3600000 : undefined });
    if (isPaid) collections.push({ id: uuid(), loanId: l1Id, customerId: customers[0].id, amount: calc1.emi, date: dueDate + 3600000, mode: 'cash', createdAt: dueDate });
  }

  // Loan 2: Sneha Traders - Active Weekly Loan (Overdue)
  const calc2 = calculateLoan(50000, 3, 10); // 10 weeks
  const l2Id = uuid();
  const l2Start = now - 35 * dayMs; // Started 5 weeks ago
  loans.push({
    id: l2Id, customerId: customers[1].id, amount: 50000, rate: 3, type: 'weekly', tenure: 10, startDate: l2Start,
    emiAmount: calc2.emi, totalPayable: calc2.totalPayable, paidAmount: calc2.emi * 3, pendingAmount: calc2.totalPayable - (calc2.emi * 3), // Only paid 3 weeks, 2 weeks overdue
    status: 'overdue', createdAt: l2Start
  });
  
  for (let i = 0; i < 10; i++) {
    const isPaid = i < 3;
    const isOverdue = i >= 3 && i < 5;
    const dueDate = l2Start + (i + 1) * 7 * dayMs;
    emis.push({ id: uuid(), loanId: l2Id, emiNumber: i + 1, dueDate, emiAmount: calc2.emi, status: isPaid ? 'paid' : isOverdue ? 'overdue' : 'pending', paidAmount: isPaid ? calc2.emi : 0, paidOn: isPaid ? dueDate : undefined });
    if (isPaid) collections.push({ id: uuid(), loanId: l2Id, customerId: customers[1].id, amount: calc2.emi, date: dueDate, mode: 'upi', createdAt: dueDate });
  }

  // Loan 3: Amit Electronics - Closed Loan
  const calc3 = calculateLoan(10000, 5, 20); // 20 days
  const l3Id = uuid();
  const l3Start = now - 40 * dayMs; 
  loans.push({
    id: l3Id, customerId: customers[2].id, amount: 10000, rate: 5, type: 'daily', tenure: 20, startDate: l3Start,
    emiAmount: calc3.emi, totalPayable: calc3.totalPayable, paidAmount: calc3.totalPayable, pendingAmount: 0,
    status: 'closed', closedAt: l3Start + 20 * dayMs, createdAt: l3Start
  });

  for (let i = 0; i < 20; i++) {
    const dueDate = l3Start + (i + 1) * dayMs;
    emis.push({ id: uuid(), loanId: l3Id, emiNumber: i + 1, dueDate, emiAmount: calc3.emi, status: 'paid', paidAmount: calc3.emi, paidOn: dueDate });
    collections.push({ id: uuid(), loanId: l3Id, customerId: customers[2].id, amount: calc3.emi, date: dueDate, mode: 'cash', createdAt: dueDate });
  }

  await db.loans.bulkAdd(loans);
  await db.emis.bulkAdd(emis);
  await db.collections.bulkAdd(collections);
}
