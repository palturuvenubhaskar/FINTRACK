import { dbFirestore, auth } from '../firebase';
import { db } from '../db';
import { collection, doc, onSnapshot, query, writeBatch } from 'firebase/firestore';

// Helper function to remove undefined values before sending to Firestore
function sanitizeForFirestore(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }
  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      sanitized[key] = null;
    } else {
      sanitized[key] = sanitizeForFirestore(value);
    }
  }
  return sanitized;
}

export class SyncService {
  private static instance: SyncService;
  private isSyncing = false;
  private hasPendingSyncTrigger = false;
  private unsubscribeListeners: (() => void)[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isStarted = false;

  public static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  public async startSync() {
    const user = auth.currentUser;
    if (!user) {
      console.warn('[Sync] No authenticated user, skipping sync start.');
      return;
    }

    // Prevent duplicate starts
    if (this.isStarted) {
      console.log('[Sync] Already started, triggering immediate sync.');
      this.processPendingChanges();
      return;
    }
    this.isStarted = true;

    console.log('[Sync] Starting sync for user:', user.uid);

    // Run immediately, then every 30 seconds as a fallback
    this.processPendingChanges();
    this.intervalId = setInterval(() => this.processPendingChanges(), 30000);

    const syncTrigger = () => this.processPendingChanges();
    window.addEventListener('ft-trigger-sync', syncTrigger);
    this.unsubscribeListeners.push(() => window.removeEventListener('ft-trigger-sync', syncTrigger));

    // Setup snapshot listeners for real-time pull from cloud
    this.setupListeners(user.uid);
  }

  public stopSync() {
    this.unsubscribeListeners.forEach(unsub => unsub());
    this.unsubscribeListeners = [];
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isStarted = false;
    console.log('[Sync] Stopped.');
  }

  private setupListeners(uid: string) {
    const tables = ['customers', 'loans', 'emis', 'collections'] as const;
    
    tables.forEach(table => {
      const q = query(collection(dbFirestore, `users/${uid}/${table}`));
      const unsub = onSnapshot(q, async (snapshot) => {
        const toPut: any[] = [];
        
        const addedOrModified = snapshot.docChanges()
          .filter(c => c.type === 'added' || c.type === 'modified')
          .map(c => c.doc.data() as any);

        if (addedOrModified.length === 0) return;

        const ids = addedOrModified.map(d => d.id);
        const localRecords = await (db as any)[table].bulkGet(ids);
        
        for (let i = 0; i < addedOrModified.length; i++) {
          const data = addedOrModified[i];
          const localRecord = localRecords[i];
          
          if (!localRecord || (data.updatedAt || 0) > (localRecord.updatedAt || 0)) {
            toPut.push({
              ...data,
              syncStatus: 'synced',
              __fromSync: Date.now() + Math.random()
            });
          }
        }

        if (toPut.length > 0) {
          try {
            await (db as any)[table].bulkPut(toPut);
            console.log(`[Sync] Pulled ${toPut.length} records for ${table} from cloud`);
            window.dispatchEvent(new Event('ft-data-changed'));
          } catch (error) {
            console.error(`[Sync] Failed to apply remote changes for ${table}:`, error);
          }
        }
      }, (error) => {
        console.error(`[Sync] Listener error for ${table}:`, error);
      });
      this.unsubscribeListeners.push(unsub);
    });
  }

  private async processPendingChanges() {
    if (this.isSyncing) {
      this.hasPendingSyncTrigger = true;
      return;
    }
    
    const user = auth.currentUser;
    if (!user) return;

    this.isSyncing = true;
    this.hasPendingSyncTrigger = false;

    try {
      const tables = ['customers', 'loans', 'emis', 'collections'] as const;
      let totalPushed = 0;
      
      for (const table of tables) {
        const pendingRecords = await (db as any)[table]
          .where('syncStatus').equals('pending')
          .toArray();

        if (pendingRecords.length === 0) continue;

        // Use writeBatch to push in chunks of 500
        let batch = writeBatch(dbFirestore);
        let batchCount = 0;
        const localUpdates: any[] = [];

        for (const record of pendingRecords) {
          try {
            const docRef = doc(dbFirestore, `users/${user.uid}/${table}`, record.id);
            const { syncStatus, ...dataToSync } = record;
            
            const sanitizedData = sanitizeForFirestore(dataToSync);
            
            batch.set(docRef, {
              ...sanitizedData,
              lastModifiedDevice: navigator.userAgent
            }, { merge: true });

            localUpdates.push(record.id);
            batchCount++;
            totalPushed++;

            if (batchCount === 500) {
              await batch.commit();
              // Update local records
              await (db as any)[table].where('id').anyOf(localUpdates).modify({ syncStatus: 'synced' });
              batch = writeBatch(dbFirestore);
              batchCount = 0;
              localUpdates.length = 0;
            }
          } catch (error) {
            console.error(`[Sync] Failed to push ${table}/${record.id}:`, error);
          }
        }

        if (batchCount > 0) {
          await batch.commit();
          await (db as any)[table].where('id').anyOf(localUpdates).modify({ syncStatus: 'synced' });
        }
      }

      if (totalPushed > 0) {
        console.log(`[Sync] Pushed ${totalPushed} records to cloud.`);
      }
    } finally {
      this.isSyncing = false;
      if (this.hasPendingSyncTrigger) {
        setTimeout(() => this.processPendingChanges(), 100);
      }
    }
  }
}

export const syncService = SyncService.getInstance();
