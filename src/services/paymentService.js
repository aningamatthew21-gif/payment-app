import { collection, addDoc, deleteDoc, doc, updateDoc, getDocs, runTransaction } from 'firebase/firestore';
import { UndoService } from './UndoService';

export const stagePayment = async (db, appId, paymentData) => {
  const stagedPaymentsCollection = collection(db, `artifacts/${appId}/public/data/stagedPayments`);
  return await addDoc(stagedPaymentsCollection, paymentData);
};

export const removePaymentFromBatch = async (db, appId, paymentId) => {
  const paymentRef = doc(db, `artifacts/${appId}/public/data/stagedPayments`, paymentId);
  return await deleteDoc(paymentRef);
};

export const clearBatch = async (db, appId) => {
  const stagedPaymentsCollection = collection(db, `artifacts/${appId}/public/data/stagedPayments`);
  const snapshot = await getDocs(stagedPaymentsCollection);
  const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
  return await Promise.all(deletePromises);
};

export const finalizeSchedule = async (db, appId, userId, weeklySheetId) => {
  return await runTransaction(db, async (transaction) => {
    // 1. READ: Fetch staged payments INSIDE the transaction
    const stagedRef = collection(db, `artifacts/${appId}/public/data/stagedPayments`);
    const snapshot = await getDocs(stagedRef);

    if (snapshot.empty) throw new Error("No payments to finalize!");

    const stagedPayments = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // 2. CALCULATE
    // Use netPayable (Number), not amount (String)
    const totalAmount = stagedPayments.reduce((sum, p) => sum + (Number(p.netPayable) || Number(p.amount) || 0), 0);

    const transactionLog = {
      batchId: `BATCH_${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId,
      totalAmount,
      paymentCount: stagedPayments.length,
      status: 'finalized',
      payments: stagedPayments.map(p => ({
        id: p.id,
        vendor: p.vendor,
        amount: Number(p.netPayable) || Number(p.amount) || 0,
        budgetLine: p.budgetItem || p.budgetLine,
        invoiceNo: p.invoiceNo,
        description: p.description
      })),
      metadata: {
        weeklySheetId: weeklySheetId,
        budgetLinesAffected: [...new Set(stagedPayments.map(p => p.budgetItem || p.budgetLine))],
        currencies: [...new Set(stagedPayments.map(p => p.currency))]
      }
    };

    // 3. WRITE: Create Log
    const logRef = doc(collection(db, `artifacts/${appId}/public/transactionLog`));
    transaction.set(logRef, transactionLog);

    // 4. WRITE: Update Weekly Sheet
    if (weeklySheetId) {
      const sheetRef = doc(db, `artifacts/${appId}/public/weeklySheets`, weeklySheetId);
      transaction.update(sheetRef, {
        lastFinalized: new Date().toISOString(),
        finalizedPaymentsCount: stagedPayments.length,
        totalFinalizedAmount: totalAmount
      });
    }

    // 5. DELETE: Remove staged payments
    snapshot.docs.forEach((doc) => {
      transaction.delete(doc.ref);
    });

    return logRef.id;
  });
};

// New functions for Batch Logic and Data Sync

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase-config';

/**
 * Uploads support documents to Firebase Storage
 * @param {File[]} files - Array of files to upload
 * @param {string} paymentId - ID of the payment (or temporary ID)
 * @returns {Promise<Array<{name: string, url: string, type: string}>>}
 */
export const uploadSupportDocuments = async (files, paymentId) => {
  if (!files || files.length === 0) return [];

  const uploadPromises = files.map(async (file) => {
    const timestamp = new Date().getTime();
    const storageRef = ref(storage, `support-documents/${paymentId}/${timestamp}_${file.name}`);

    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);

    return {
      name: file.name,
      url: url,
      type: file.type
    };
  });

  return Promise.all(uploadPromises);
};

/**
 * Updates an existing transaction in a weekly sheet
 * @param {Object} db - Firestore instance
 * @param {string} appId - App ID
 * @param {string} sheetName - Name/ID of the weekly sheet
 * @param {string} transactionId - ID of the transaction to update
 * @param {Object} updatedTransaction - The updated transaction data
 */
export const updateWeeklySheetTransaction = async (db, appId, sheetName, transactionId, updatedTransaction) => {
  try {
    const paymentRef = doc(db, `artifacts/${appId}/public/data/weeklySheets/${sheetName}/payments`, transactionId);

    await updateDoc(paymentRef, {
      ...updatedTransaction,
      lastUpdated: new Date().toISOString()
    });

    return true;
  } catch (error) {
    console.error('Error updating weekly sheet transaction:', error);
    throw error;
  }
};

/**
 * Adds a new transaction to a weekly sheet
 * @param {Object} db - Firestore instance
 * @param {string} appId - App ID
 * @param {string} sheetName - Name/ID of the weekly sheet
 * @param {Object} newTransaction - The new transaction data
 */
export const addTransactionToWeeklySheet = async (db, appId, sheetName, newTransaction) => {
  try {
    const paymentsCollection = collection(db, `artifacts/${appId}/public/data/weeklySheets/${sheetName}/payments`);

    const docRef = await addDoc(paymentsCollection, {
      ...newTransaction,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    });

    return docRef.id;
  } catch (error) {
    console.error('Error adding transaction to weekly sheet:', error);
    throw error;
  }
};
