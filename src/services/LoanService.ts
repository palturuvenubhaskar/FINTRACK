import { db, type Loan, type Customer, startOfDay } from '../db';

export type DynamicSlot = {
  id: string;
  dueDate: number;
  status: 'paid' | 'partial' | 'pending' | 'missed';
  emiAmount: number;
  paidAmount: number;
  isLate?: boolean;
  latestCollectionDate?: number;
};

export type EnrichedLoan = Loan & { customer: Customer | undefined, slots: DynamicSlot[], expectedAmountToDate: number, score: number };

export async function getEnrichedLoans(): Promise<EnrichedLoan[]> {
  const allLoans = (await db.loans.toArray()).filter(l => !l.deleted);
  const customers = await db.customers.toArray();
  
  const custMap = new Map(customers.map(c => [c.id, c]));
  const now = Date.now();

  const allCollections = await db.collections.filter(c => !c.deleted).toArray();
  const colsByLoan = new Map<string, typeof allCollections>();
  allCollections.forEach(c => {
    if (!colsByLoan.has(c.loanId)) colsByLoan.set(c.loanId, []);
    colsByLoan.get(c.loanId)!.push(c);
  });

  const enriched: EnrichedLoan[] = allLoans.map(l => {
    const collections = (colsByLoan.get(l.id) || []).sort((a, b) => a.date - b.date);
    const slots: DynamicSlot[] = [];
    
    let remainingPayable = l.totalPayable;
    let expectedAmountToDate = 0;
    let slotIndex = 0;

    const baseDate = startOfDay(new Date(l.startDate));
    let getSlotTimes = (idx: number) => {
      if (l.type === 'daily') {
        return { slotStart: baseDate + idx * 86400000, slotEnd: baseDate + (idx + 1) * 86400000 };
      }
      if (l.type === 'weekly') {
        return { slotStart: baseDate + idx * 7 * 86400000, slotEnd: baseDate + (idx + 1) * 7 * 86400000 };
      }
      let dStart = new Date(baseDate);
      dStart.setMonth(dStart.getMonth() + idx);
      let dEnd = new Date(baseDate);
      dEnd.setMonth(dEnd.getMonth() + idx + 1);
      return { slotStart: dStart.getTime(), slotEnd: dEnd.getTime() };
    };

    let collectionIndex = 0;

    while (remainingPayable > 0) {
      if (slotIndex > 200) break; // Hard safeguard

      const { slotStart: defaultSlotStart, slotEnd: defaultSlotEnd } = getSlotTimes(slotIndex);
      const slotStart = l.customDates?.[slotIndex] ?? defaultSlotStart;
      const nextStart = l.customDates?.[slotIndex + 1] ?? defaultSlotEnd;
      const slotEnd = nextStart;

      let expectedAmount = 0;
      if (remainingPayable > 0) {
        expectedAmount = l.customEmiAmounts?.[slotIndex] ?? l.emiAmount;
        if (slotIndex === l.tenure - 1 && l.customEmiAmounts?.[slotIndex] === undefined) {
          const totalPrevious = slots.reduce((sum, s) => sum + s.emiAmount, 0);
          expectedAmount = Math.max(0, Math.round((l.totalPayable - totalPrevious) * 100) / 100);
        }
        if (slotIndex >= l.tenure) {
          expectedAmount = l.emiAmount;
        }
        if (expectedAmount > remainingPayable) {
          expectedAmount = remainingPayable;
        }
      }

      if (slotStart <= now && remainingPayable > 0) {
          expectedAmountToDate += expectedAmount;
      }

      let amountFilledInSlot = 0;
      let latestCollectionDateForSlot = 0;
      
      while (collectionIndex < collections.length) {
        const col = collections[collectionIndex];
        if (col.date < slotEnd) {
          if (slotIndex === 0 || col.date >= slotStart) {
            amountFilledInSlot += col.amount;
            if (col.date > latestCollectionDateForSlot) latestCollectionDateForSlot = col.date;
          }
          collectionIndex++;
        } else {
          break;
        }
      }

      let expectedFuturePayment = 0;
      if (slotStart > now) {
        expectedFuturePayment = expectedAmount;
      } else if (slotStart <= now && slotEnd > now) {
        expectedFuturePayment = Math.max(0, expectedAmount - amountFilledInSlot);
      }

      let projectedDeduction = amountFilledInSlot + expectedFuturePayment;
      remainingPayable -= projectedDeduction;
      remainingPayable = Math.round(remainingPayable * 100) / 100;

      let status: 'pending' | 'partial' | 'paid' | 'missed' = 'pending';
      
      if (expectedAmount === 0) {
        status = 'paid';
      } else if (amountFilledInSlot >= expectedAmount - 0.01) {
        status = 'paid';
      } else if (amountFilledInSlot > 0) {
        status = 'partial';
      } else if (now >= slotEnd) {
        status = 'missed';
      }

      slots.push({
        id: `slot-${l.id}-${slotIndex}`,
        dueDate: slotStart,
        emiAmount: expectedAmount,
        paidAmount: amountFilledInSlot,
        status,
        isLate: false,
        latestCollectionDate: latestCollectionDateForSlot || undefined
      });

      slotIndex++;
    }

    expectedAmountToDate = Math.min(expectedAmountToDate, l.totalPayable);
    let score = expectedAmountToDate > 0 ? (l.paidAmount / expectedAmountToDate) * 100 : 100;
    if (score > 100) score = 100;

    let dynamicStatus = l.status;
    if (dynamicStatus === 'active' && slots.some(s => s.status === 'missed')) {
      dynamicStatus = 'overdue';
    }

    return { ...l, status: dynamicStatus, customer: custMap.get(l.customerId), slots, expectedAmountToDate, score };
  });

  return enriched;
}
