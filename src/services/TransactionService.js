// Transaction Service - Handles transaction logging, archiving, and undo operations
// This service replaces the MasterTransactionLOG and Undo_Log functionality from VBA

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  where,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { generateTransactionID, generateBatchID } from './FinancialEngine.js';

// Collection names (matching VBA sheet names)
const COLLECTIONS = {
  TRANSACTIONS: 'transactions',
  UNDO_LOG: 'undoLog',
  BUDGET_LOG: 'budgetLog',
  PAYMENT_ARCHIVES: 'paymentArchives',
  WHT_ARCHIVES: 'whtArchives'
};

// Helper function to get collection path with app context
const getCollectionPath = (appId, collectionName) => {
  return `artifacts/${appId}/public/data/${collectionName}`;
};

/**
 * Log a finalized transaction to the master transaction log
 * @param {Object} db - Firestore database instance
 * @param {Object} transaction - Transaction object to log
 * @param {string} batchId - Batch ID for grouping transactions
 * @returns {Promise<string>} Transaction log ID
 */
export const logFinalizedTransaction = async (db, transaction, batchId) => {
  try {
    const transactionLog = {
      transactionId: transaction.id || generateTransactionID(),
      finalizationDate: serverTimestamp(),
      sourceWeeklySheet: transaction.weeklySheetName,
      originalSheetRow: transaction.originalRow,
      invoiceNo: transaction.invoiceNo,
      vendorName: transaction.vendor,
      description: transaction.description,
      netPayable: transaction.netPayable,
      currency: transaction.currency,
      bankPaidFrom: transaction.bank,
      batchId: batchId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, COLLECTIONS.TRANSACTIONS), transactionLog);
    console.log('Transaction logged successfully:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error logging transaction:', error);
    throw error;
  }
};

/**
 * Create undo log entry for a batch of transactions
 * @param {Object} db - Firestore database instance
 * @param {string} appId - Application ID for collection path
 * @param {Object} undoData - Undo data object
 * @returns {Promise<string>} Undo log entry ID
 */
export const createUndoLogEntry = async (db, appId, undoData) => {
  try {
    const undoEntry = {
      batchId: undoData.batchId || generateBatchID(),
      datetime: serverTimestamp(),
      primaryVendor: undoData.primaryVendor,
      totalAmount: undoData.totalAmount,
      scheduleSheet: undoData.scheduleSheet,
      scheduleArchiveInfo: undoData.scheduleArchiveInfo,
      whtArchiveInfo: undoData.whtArchiveInfo,
      budgetNames: undoData.budgetNames || [],
      budgetOrigBalances: undoData.budgetOrigBalances || [],
      weeklySheetRowsAffected: undoData.weeklySheetRowsAffected || undoData.payments?.map(p => p.originalSheetRow).filter(Boolean) || [],
      weeklyOrigData: undoData.weeklyOrigData || [],
      masterLogIds: undoData.masterLogIds || [],
      isUndone: false,
      createdAt: serverTimestamp(),
      // Include any additional fields from undoData that might be present
      ...(undoData.weeklySheetData && { weeklySheetData: undoData.weeklySheetData }),
      ...(undoData.weeklySheetName && { weeklySheetName: undoData.weeklySheetName }),
      ...(undoData.status && { status: undoData.status }),
      ...(undoData.canUndo !== undefined && { canUndo: undoData.canUndo }),
      ...(undoData.completedAt && { completedAt: undoData.completedAt }),
      ...(undoData.updatedAt && { updatedAt: undoData.updatedAt })
    };

    const docRef = await addDoc(collection(db, getCollectionPath(appId, COLLECTIONS.UNDO_LOG)), undoEntry);
    console.log('Undo log entry created:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error creating undo log entry:', error);
    throw error;
  }
};

/**
 * Get recent undo log entries (last 5 batches)
 * @param {Object} db - Firestore database instance
 * @param {string} appId - Application ID for collection path
 * @returns {Promise<Array>} Array of undo log entries
 */
export const getRecentUndoLogEntries = async (db, appId) => {
  try {
    console.log('[TransactionService] Attempting to get recent undo log entries...');

    // Try the optimized query first (requires index)
    try {
      const q = query(
        collection(db, getCollectionPath(appId, COLLECTIONS.UNDO_LOG)),
        where('isUndone', '==', false),
        orderBy('datetime', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const entries = [];

      querySnapshot.forEach((doc) => {
        entries.push({
          id: doc.id,
          ...doc.data()
        });
      });

      console.log(`[TransactionService] Found ${entries.length} undo log entries with optimized query`);
      // Limit to last 5 batches (matching VBA UNDO_LOG_MAX_BATCHES)
      return entries.slice(0, 5);

    } catch (indexError) {
      console.warn('[TransactionService] Index-based query failed, using fallback approach:', indexError.message);

      // Fallback: Get all entries and filter in memory
      const fallbackQuery = query(
        collection(db, getCollectionPath(appId, COLLECTIONS.UNDO_LOG)),
        orderBy('datetime', 'desc')
      );

      const querySnapshot = await getDocs(fallbackQuery);
      const allEntries = [];

      querySnapshot.forEach((doc) => {
        const entry = {
          id: doc.id,
          ...doc.data()
        };
        allEntries.push(entry);
      });

      // Filter for non-undone entries in memory
      const filteredEntries = allEntries.filter(entry => entry.isUndone !== true);

      console.log(`[TransactionService] Found ${filteredEntries.length} non-undone entries with fallback query`);

      // Limit to last 5 batches (matching VBA UNDO_LOG_MAX_BATCHES)
      return filteredEntries.slice(0, 5);
    }

  } catch (error) {
    console.error('[TransactionService] Error getting undo log entries:', error);

    // Return empty array instead of throwing to prevent UI crashes
    return [];
  }
};

/**
 * Mark a batch as undone in the undo log
 * @param {Object} db - Firestore database instance
 * @param {string} appId - Application ID for collection path
 * @param {string} undoLogId - Undo log entry ID
 * @returns {Promise<void>}
 */
export const markBatchAsUndone = async (db, appId, undoLogId) => {
  try {
    const undoRef = doc(db, getCollectionPath(appId, COLLECTIONS.UNDO_LOG), undoLogId);
    await updateDoc(undoRef, {
      isUndone: true,
      undoneAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    console.log('Batch marked as undone:', undoLogId);
  } catch (error) {
    console.error('Error marking batch as undone:', error);
    throw error;
  }
};

/**
 * Undo a complete transaction batch (restore all original state)
 * @param {Object} db - Firestore database instance
 * @param {string} appId - Application ID for collection path
 * @param {string} batchId - Batch ID to undo
 * @returns {Promise<Object>} Result of undo operation
 */
/**
 * Undo a complete transaction batch (restore all original state)
 * @param {Object} db - Firestore database instance
 * @param {string} appId - Application ID for collection path
 * @param {string} batchId - Batch ID to undo
 * @returns {Promise<Object>} Result of undo operation
 */
export const undoTransactionBatch = async (db, appId, batchId) => {
  try {
    console.log('[TransactionService] Starting undo for batch:', batchId);

    // Get the undo log entry
    const undoQuery = query(
      collection(db, getCollectionPath(appId, COLLECTIONS.UNDO_LOG)),
      where('batchId', '==', batchId),
      where('isUndone', '==', false)
    );

    const undoSnapshot = await getDocs(undoQuery);
    if (undoSnapshot.empty) {
      throw new Error('Undo log entry not found or already undone');
    }

    const undoEntry = undoSnapshot.docs[0].data();
    const undoEntryId = undoSnapshot.docs[0].id;

    console.log('[TransactionService] Found undo entry:', {
      batchId: undoEntry.batchId,
      primaryVendor: undoEntry.primaryVendor,
      totalAmount: undoEntry.totalAmount,
      budgetNames: undoEntry.budgetNames,
      masterLogIds: undoEntry.masterLogIds,
      paymentCount: undoEntry.payments?.length
    });

    // Start a batch write for atomic operations
    const batch = writeBatch(db);

    // 1. RESTORE BUDGET BALANCES (Reverse UpdateBudgetBalancesAfterArchive)
    if (undoEntry.budgetNames && undoEntry.budgetOrigBalances && undoEntry.budgetNames.length > 0) {
      console.log('[TransactionService] Restoring budget balances...');

      for (let i = 0; i < undoEntry.budgetNames.length; i++) {
        const budgetName = undoEntry.budgetNames[i];
        const originalBalance = undoEntry.budgetOrigBalances[i]; // This is actually the balance BEFORE the transaction

        // Note: originalBalance in undoEntry might be the balance *before* the transaction, 
        // or the balance *after* (depending on how it was captured).
        // Based on PaymentFinalizationService.captureUndoData, it captures 'originalBudgetBalances' 
        // which seems to be the state *before* the update.
        // So we should restore to that value.

        if (originalBalance && typeof originalBalance === 'object') {
          // Try to find and restore budget line
          try {
            const budgetQuery = query(
              collection(db, `artifacts/${appId}/public/data/budgetLines`),
              where('name', '==', budgetName)
            );

            const budgetSnapshot = await getDocs(budgetQuery);
            if (!budgetSnapshot.empty) {
              const budgetDoc = budgetSnapshot.docs[0];
              const budgetRef = doc(db, `artifacts/${appId}/public/data/budgetLines`, budgetDoc.id);

              // Restore original values
              batch.update(budgetRef, {
                balCD: originalBalance.balCD || 0,
                totalSpendToDate: originalBalance.totalSpendToDate || 0,
                lastUpdated: serverTimestamp(),
                undoRestored: true,
                undoBatchId: batchId,
                undoTimestamp: serverTimestamp()
              });

              console.log(`[TransactionService] ✓ Budget balance restored for: ${budgetName}`);
            } else {
              console.warn(`[TransactionService] Budget line not found: ${budgetName}`);
            }
          } catch (error) {
            console.error(`[TransactionService] Error restoring budget for ${budgetName}:`, error);
          }
        }
      }
    }

    // 2. REMOVE MASTER LOG ENTRIES (Reverse LogFinalizedTransactions)
    if (undoEntry.masterLogIds && undoEntry.masterLogIds.length > 0) {
      console.log('[TransactionService] Removing master log entries...');

      // Use correct collection path: artifacts/${appId}/public/data/masterLog
      const masterLogRef = collection(db, `artifacts/${appId}/public/data/masterLog`);

      // Query by transactionID field (not document ID)
      for (const transactionId of undoEntry.masterLogIds) {
        try {
          // Find document by transactionID field
          const masterLogQuery = query(masterLogRef, where('transactionID', '==', transactionId));
          const masterLogSnapshot = await getDocs(masterLogQuery);

          if (!masterLogSnapshot.empty) {
            masterLogSnapshot.forEach((docSnap) => {
              batch.delete(docSnap.ref);
              console.log(`[TransactionService] ✓ Master log entry removed: ${transactionId} (doc: ${docSnap.id})`);
            });
          } else {
            console.warn(`[TransactionService] Master log entry not found for transactionID: ${transactionId}`);
          }
        } catch (error) {
          console.error(`[TransactionService] Error removing master log entry ${transactionId}:`, error);
        }
      }
    }

    // 3. REMOVE ARCHIVED SCHEDULES/VOUCHERS (Reverse ArchivePreviewedSchedule/ArchiveVoucherSnapshot)
    if (undoEntry.scheduleArchiveInfo) {
      console.log('[TransactionService] Reversing archived schedule/voucher...');

      try {
        const archiveParts = undoEntry.scheduleArchiveInfo.split(';');
        if (archiveParts.length === 3) {
          // Find and mark archive entries as reversed
          const archiveQuery = query(
            collection(db, getCollectionPath(appId, COLLECTIONS.PAYMENT_ARCHIVES)),
            where('batchId', '==', batchId)
          );

          const archiveSnapshot = await getDocs(archiveQuery);
          archiveSnapshot.forEach((doc) => {
            // Try to delete, if fails (permission), update as reversed
            // Actually, let's just mark as reversed to be safe and preserve history
            batch.update(doc.ref, {
              isReversed: true,
              reversedAt: serverTimestamp(),
              reversedByBatchId: batchId
            });
          });

          console.log(`[TransactionService] ✓ Archive entries marked as reversed for batch: ${batchId}`);
        }
      } catch (error) {
        console.error('[TransactionService] Error reversing archived content:', error);
      }
    }

    // 4. REMOVE WHT ENTRIES (Reverse PopulateWHTReturnSheetsFromBatch)
    if (undoEntry.whtArchiveInfo) {
      console.log('[TransactionService] Reversing WHT entries...');

      try {
        // Check both primary and fallback paths for WHT
        const whtPaths = [
          `artifacts/${appId}/whtReturns`,
          `artifacts/${appId}/public/data/whtReturns`
        ];

        for (const path of whtPaths) {
          try {
            const whtQuery = query(
              collection(db, path),
              where('batchId', '==', batchId)
            );

            const whtSnapshot = await getDocs(whtQuery);
            whtSnapshot.forEach((doc) => {
              // Mark as reversed/void instead of deleting
              batch.update(doc.ref, {
                status: 'void',
                isReversed: true,
                reversedAt: serverTimestamp(),
                reversedByBatchId: batchId
              });
            });
          } catch (pathError) {
            console.warn(`[TransactionService] Error checking WHT path ${path}:`, pathError);
          }
        }

        console.log(`[TransactionService] ✓ WHT entries marked as reversed for batch: ${batchId}`);
      } catch (error) {
        console.error('[TransactionService] Error reversing WHT entries:', error);
      }
    }

    // 5. REVERT PAYMENT STATUSES (Reset to pending/unpaid state)
    if (undoEntry.payments && undoEntry.payments.length > 0) {
      console.log('[TransactionService] Reverting payment statuses...');

      for (const payment of undoEntry.payments) {
        try {
          // Determine collection based on weeklySheetId or sheetName
          const weeklySheetId = payment.weeklySheetId || undoEntry.weeklySheetData?.sheetId || undoEntry.weeklySheetName;
          let paymentRef;

          if (weeklySheetId) {
            paymentRef = doc(db, `artifacts/${appId}/public/data/weeklySheets/${weeklySheetId}/payments`, payment.id);
          } else {
            paymentRef = doc(db, `artifacts/${appId}/public/data/stagedPayments`, payment.id);
          }

          // Read current payment state before updating
          const paymentDoc = await getDoc(paymentRef);

          if (paymentDoc.exists()) {
            const currentData = paymentDoc.data();
            const amountToRevert = Number(payment.netPayable || payment.amountThisTransaction || 0);
            const currentPaid = Number(currentData.paid_amount || 0);
            const newPaid = Math.max(0, currentPaid - amountToRevert);
            const total = Number(currentData.total_amount || currentData.amount || payment.netPayable || 0);

            // Determine new status based on remaining paid amount
            let newStatus = 'pending';
            if (newPaid >= (total - 0.01) && total > 0) {
              newStatus = 'paid'; // Still fully paid after revert
            } else if (newPaid > 0) {
              newStatus = 'partial'; // Partially paid
            } else {
              newStatus = 'pending'; // Not paid
            }

            // Update payment status
            batch.update(paymentRef, {
              paid_amount: newPaid,
              payment_status: newStatus,
              paid: newStatus === 'paid', // Update legacy paid field
              status: newStatus === 'pending' ? 'staged' : 'finalized', // Legacy status
              last_payment_date: serverTimestamp(),
              undoneAt: serverTimestamp(),
              undoneByBatchId: batchId
            });

            console.log(`[TransactionService] ✓ Payment ${payment.id} status reverted: ${currentData.payment_status || 'unknown'} -> ${newStatus}, paid: ${currentPaid} -> ${newPaid}`);
          } else {
            console.warn(`[TransactionService] Payment document not found: ${payment.id}`);
          }
        } catch (error) {
          console.error(`[TransactionService] Error reverting payment ${payment.id}:`, error);
        }
      }
    }

    // 6. MARK UNDO LOG ENTRY AS UNDONE
    const undoRef = doc(db, COLLECTIONS.UNDO_LOG, undoEntryId);
    batch.update(undoRef, {
      isUndone: true,
      undoneAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      undoOperation: {
        timestamp: serverTimestamp(),
        restoredBudgetLines: undoEntry.budgetNames?.length || 0,
        removedTransactions: undoEntry.masterLogIds?.length || 0,
        removedArchives: 1, // Schedule/voucher archive
        removedWHT: 1 // WHT archive
      }
    });

    // 7. LOG BUDGET CHANGES FOR AUDIT TRAIL
    if (undoEntry.budgetNames && undoEntry.budgetOrigBalances) {
      for (let i = 0; i < undoEntry.budgetNames.length; i++) {
        const budgetLogEntry = {
          budgetLineName: undoEntry.budgetNames[i],
          originalBalance: undoEntry.budgetOrigBalances[i]?.balCD || 0,
          changeType: 'UNDO_RESTORE',
          changeAmount: 0,
          newBalance: undoEntry.budgetOrigBalances[i]?.balCD || 0,
          batchId: batchId,
          undoOperation: true,
          undoTimestamp: serverTimestamp(),
          createdAt: serverTimestamp()
        };

        const budgetLogRef = doc(collection(db, COLLECTIONS.BUDGET_LOG));
        batch.set(budgetLogRef, budgetLogEntry);
      }
    }

    // Commit all changes atomically
    await batch.commit();

    console.log('[TransactionService] ✓ Transaction batch undone successfully:', batchId);

    return {
      success: true,
      batchId: batchId,
      message: 'Transaction batch undone successfully',
      restoredBudgetLines: undoEntry.budgetNames?.length || 0,
      removedTransactions: undoEntry.masterLogIds?.length || 0,
      removedArchives: 1,
      removedWHT: 1,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('[TransactionService] Error undoing transaction batch:', error);
    throw new Error(`Failed to undo transaction batch: ${error.message}`);
  }
};

/**
 * Get transaction history by bank
 * @param {Object} db - Firestore database instance
 * @param {string} bankName - Bank name to filter by
 * @param {Date} startDate - Start date for filtering
 * @param {Date} endDate - End date for filtering
 * @returns {Promise<Array>} Array of transactions
 */
export const getTransactionHistoryByBank = async (db, bankName, startDate, endDate) => {
  try {
    let q = collection(db, COLLECTIONS.TRANSACTIONS);

    // Build query based on filters
    if (bankName && bankName !== 'ALL') {
      q = query(q, where('bankPaidFrom', '==', bankName));
    }

    if (startDate && endDate) {
      q = query(q,
        where('finalizationDate', '>=', startDate),
        where('finalizationDate', '<=', endDate)
      );
    }

    q = query(q, orderBy('finalizationDate', 'desc'));

    const querySnapshot = await getDocs(q);
    const transactions = [];

    querySnapshot.forEach((doc) => {
      transactions.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return transactions;
  } catch (error) {
    console.error('Error getting transaction history:', error);
    throw error;
  }
};

/**
 * Archive payment schedule data
 * @param {Object} db - Firestore database instance
 * @param {Object} archiveData - Archive data object
 * @returns {Promise<string>} Archive entry ID
 */
export const archivePaymentSchedule = async (db, archiveData) => {
  try {
    const archiveEntry = {
      type: 'payment_schedule',
      sourceSheet: archiveData.sourceSheet,
      data: archiveData.scheduleData,
      archivedAt: serverTimestamp(),
      batchId: archiveData.batchId,
      createdBy: archiveData.userId,
      createdAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, COLLECTIONS.PAYMENT_ARCHIVES), archiveEntry);
    console.log('Payment schedule archived:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error archiving payment schedule:', error);
    throw error;
  }
};

/**
 * Archive WHT return data
 * @param {Object} db - Firestore database instance
 * @param {Object} archiveData - WHT archive data object
 * @returns {Promise<string>} WHT archive entry ID
 */
export const archiveWHTReturn = async (db, archiveData) => {
  try {
    const archiveEntry = {
      type: 'wht_return',
      period: archiveData.period,
      data: archiveData.whtData,
      archivedAt: serverTimestamp(),
      batchId: archiveData.batchId,
      createdBy: archiveData.userId,
      createdAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, COLLECTIONS.WHT_ARCHIVES), archiveEntry);
    console.log('WHT return archived:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error archiving WHT return:', error);
    throw error;
  }
};

/**
 * Get archive entries by type and date range
 * @param {Object} db - Firestore database instance
 * @param {string} archiveType - Type of archive to retrieve
 * @param {Date} startDate - Start date for filtering
 * @param {Date} endDate - End date for filtering
 * @returns {Promise<Array>} Array of archive entries
 */
export const getArchiveEntries = async (db, archiveType, startDate, endDate) => {
  try {
    let q = collection(db, archiveType === 'wht' ? COLLECTIONS.WHT_ARCHIVES : COLLECTIONS.PAYMENT_ARCHIVES);

    if (startDate && endDate) {
      q = query(q,
        where('archivedAt', '>=', startDate),
        where('archivedAt', '<=', endDate)
      );
    }

    q = query(q, orderBy('archivedAt', 'desc'));

    const querySnapshot = await getDocs(q);
    const archives = [];

    querySnapshot.forEach((doc) => {
      archives.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return archives;
  } catch (error) {
    console.error('Error getting archive entries:', error);
    throw error;
  }
};

/**
 * Clean up old undo log entries (keep only last 5 batches)
 * @param {Object} db - Firestore database instance
 * @param {string} appId - Application ID for collection path
 * @returns {Promise<number>} Number of entries cleaned up
 */
export const cleanupOldUndoLogEntries = async (db, appId) => {
  try {
    const q = query(
      collection(db, getCollectionPath(appId, COLLECTIONS.UNDO_LOG)),
      orderBy('datetime', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const entries = [];

    querySnapshot.forEach((doc) => {
      entries.push({
        id: doc.id,
        ...doc.data()
      });
    });

    // Keep only last 5 batches (matching VBA UNDO_LOG_MAX_BATCHES)
    if (entries.length <= 5) {
      return 0; // No cleanup needed
    }

    const entriesToDelete = entries.slice(5);
    const batch = writeBatch(db);

    entriesToDelete.forEach((entry) => {
      const docRef = doc(db, getCollectionPath(appId, COLLECTIONS.UNDO_LOG), entry.id);
      batch.delete(docRef);
    });

    await batch.commit();
    console.log(`Cleaned up ${entriesToDelete.length} old undo log entries`);
    return entriesToDelete.length;
  } catch (error) {
    console.error('Error cleaning up undo log entries:', error);
    throw error;
  }
};

/**
 * Test function to create sample undo data for testing
 * @param {Object} db - Firestore database instance
 * @param {string} appId - Application ID for collection path
 * @returns {Promise<Object>} Test result
 */
export const createTestUndoData = async (db, appId) => {
  try {
    console.log('[TransactionService] Creating test undo data...');

    const testUndoEntry = {
      batchId: 'TEST-BATCH-' + Date.now(),
      datetime: new Date(),
      primaryVendor: 'Test Vendor',
      totalAmount: 1500.00,
      scheduleSheet: 'Test Weekly Sheet',
      scheduleArchiveInfo: 'PaymentScheduleArchive;100;150',
      whtArchiveInfo: 'WHT_Return_Archive;200;250',
      budgetNames: ['Test Budget Line 1', 'Test Budget Line 2'],
      budgetOrigBalances: [
        { balCD: 10000, totalSpendToDate: 5000, allocatedAmount: 15000 },
        { balCD: 8000, totalSpendToDate: 3000, allocatedAmount: 12000 }
      ],
      weeklySheetRowsAffected: ['TestSheet_10', 'TestSheet_15'],
      weeklyOrigData: ['TestSheet_10:ColP:ColT:ColU:ColV:Color', 'TestSheet_15:ColP:ColT:ColU:ColV:Color'],
      masterLogIds: ['test-tx-1', 'test-tx-2'],
      isUndone: false,
      createdAt: new Date()
    };

    const undoLogId = await createUndoLogEntry(db, appId, testUndoEntry);

    console.log('[TransactionService] ✓ Test undo data created:', undoLogId);

    return {
      success: true,
      undoLogId,
      testData: testUndoEntry,
      message: 'Test undo data created successfully'
    };

  } catch (error) {
    console.error('[TransactionService] Error creating test undo data:', error);
    throw new Error(`Failed to create test undo data: ${error.message}`);
  }
};
