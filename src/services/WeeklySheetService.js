// Weekly Sheet Service - Enhanced weekly sheet management with rollover logic
// This service replaces the weekly sheet functionality from VBA with enhanced features

import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  query, 
  orderBy, 
  where, 
  writeBatch,
  serverTimestamp 
} from 'firebase/firestore';
import { generateBatchID } from './FinancialEngine.js';

// Collection names
const COLLECTIONS = {
  WEEKLY_SHEETS: 'weeklySheets',
  TRANSACTIONS: 'transactions',
  BUDGET_LINES: 'budgetLines'
};

/**
 * Get week information for a given date (matching VBA GetWeekInfo function)
 * @param {Date} currentDate - Current date
 * @returns {Object} Week information with month and week number
 */
export const getWeekInfo = (currentDate = new Date()) => {
  // Ensure week starts on Monday (ISO 8601 standard)
  const dayOfWeek = currentDate.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday = 0, Monday = 1
  
  const weekStart = new Date(currentDate);
  weekStart.setDate(currentDate.getDate() - daysToMonday);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  
  // Month is determined by the Sunday of the week
  const targetMonthDate = weekEnd;
  const monthName = targetMonthDate.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  
  // Calculate week number within the month
  const firstDayOfMonth = new Date(targetMonthDate.getFullYear(), targetMonthDate.getMonth(), 1);
  const weekStartOfMonth = new Date(firstDayOfMonth);
  const firstDayOfWeek = firstDayOfMonth.getDay();
  const daysToFirstMonday = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  weekStartOfMonth.setDate(firstDayOfMonth.getDate() - daysToFirstMonday);
  
  let weekNum = 1;
  if (weekStart >= weekStartOfMonth) {
    const weeksDiff = Math.floor((weekStart - weekStartOfMonth) / (7 * 24 * 60 * 60 * 1000));
    weekNum = weeksDiff + 1;
  }
  
  // Ensure week number is at least 1
  if (weekNum <= 0) weekNum = 1;
  
  console.log(`GetWeekInfo for ${currentDate.toDateString()}: weekStart=${weekStart.toDateString()}, weekEnd=${weekEnd.toDateString()}, monthName=${monthName}, weekNum=${weekNum}`);
  
  return {
    monthName,
    weekNumber: weekNum,
    weekStart,
    weekEnd,
    targetMonthDate
  };
};

/**
 * Generate weekly sheet name based on current date
 * @param {Date} currentDate - Current date
 * @returns {string} Sheet name in format "APR-WEEK-3"
 */
export const generateWeeklySheetName = (currentDate = new Date()) => {
  const weekInfo = getWeekInfo(currentDate);
  return `${weekInfo.monthName}-WEEK-${weekInfo.weekNumber}`;
};

/**
 * Get previous week sheet name for rollover
 * @param {Date} currentDate - Current date
 * @returns {string} Previous week sheet name
 */
export const getPreviousWeekSheetName = (currentDate = new Date()) => {
  const prevDate = new Date(currentDate);
  prevDate.setDate(currentDate.getDate() - 7);
  return generateWeeklySheetName(prevDate);
};

/**
 * Create a new weekly sheet with rollover logic
 * @param {Object} db - Firestore database instance
 * @param {string} userId - User ID creating the sheet
 * @param {Date} currentDate - Current date
 * @returns {Promise<Object>} Created weekly sheet data
 */
export const createNewWeeklySheet = async (db, userId, currentDate = new Date()) => {
  try {
    const weekInfo = getWeekInfo(currentDate);
    const sheetName = generateWeeklySheetName(currentDate);
    const previousWeekName = getPreviousWeekSheetName(currentDate);
    
    console.log(`Creating new weekly sheet: ${sheetName}`);
    console.log(`Previous week sheet: ${previousWeekName}`);
    
    // Check if sheet already exists
    const existingSheet = await getWeeklySheetByName(db, sheetName);
    if (existingSheet) {
      throw new Error(`Weekly sheet '${sheetName}' already exists`);
    }
    
    // Get previous week sheet for rollover
    const previousWeekSheet = await getWeeklySheetByName(db, previousWeekName);
    
    // Create new weekly sheet
    const newSheet = {
      name: sheetName,
      month: weekInfo.monthName,
      weekNumber: weekInfo.weekNumber,
      weekStart: weekInfo.weekStart,
      weekEnd: weekInfo.weekEnd,
      createdBy: userId,
      createdAt: serverTimestamp(),
      status: 'active',
      transactions: [],
      rolloverCount: 0
    };
    
    const docRef = await addDoc(collection(db, COLLECTIONS.WEEKLY_SHEETS), newSheet);
    console.log(`New weekly sheet created: ${docRef.id}`);
    
    // Process rollover if previous week exists
    if (previousWeekSheet) {
      const rolloverResult = await processRollover(db, docRef.id, previousWeekSheet);
      newSheet.rolloverCount = rolloverResult.rolledOverCount;
      
      // Update sheet with rollover count
      await updateDoc(docRef, { rolloverCount: rolloverResult.rolledOverCount });
    }
    
    return {
      id: docRef.id,
      ...newSheet,
      rolloverCount: newSheet.rolloverCount
    };
  } catch (error) {
    console.error('Error creating new weekly sheet:', error);
    throw error;
  }
};

/**
 * Process rollover from previous week sheet
 * @param {Object} db - Firestore database instance
 * @param {string} newSheetId - New sheet ID
 * @param {Object} previousWeekSheet - Previous week sheet data
 * @returns {Promise<Object>} Rollover result
 */
export const processRollover = async (db, newSheetId, previousWeekSheet) => {
  try {
    console.log(`Processing rollover from ${previousWeekSheet.name} to new sheet ${newSheetId}`);
    
    // Get transactions from previous week that weren't scheduled
    const pendingTransactions = previousWeekSheet.transactions.filter(tx => 
      tx.scheduledStatus !== 'SCHEDULED' && tx.vendor && tx.vendor.trim() !== ''
    );
    
    if (pendingTransactions.length === 0) {
      console.log('No pending transactions to roll over');
      return { rolledOverCount: 0, transactions: [] };
    }
    
    // Process rollover transactions
    const rolledOverTransactions = [];
    const batch = writeBatch(db);
    
    for (const tx of pendingTransactions) {
      const rolledOverTx = {
        ...tx,
        id: undefined, // Remove old ID
        weeklySheetId: newSheetId,
        scheduledStatus: 'Pending (Rollover)',
        rolloverNote: `Rolled from: ${previousWeekSheet.name}`,
        rolloverDate: serverTimestamp(),
        originalTransactionId: tx.id // Keep reference to original
      };
      
      // Add to new sheet's transactions
      const txRef = doc(collection(db, COLLECTIONS.TRANSACTIONS));
      batch.set(txRef, rolledOverTx);
      
      rolledOverTransactions.push({
        id: txRef.id,
        ...rolledOverTx
      });
    }
    
    // Update previous week sheet status to archived
    const prevSheetRef = doc(db, COLLECTIONS.WEEKLY_SHEETS, previousWeekSheet.id);
    batch.update(prevSheetRef, {
      status: 'archived',
      archivedAt: serverTimestamp(),
      rolloverTargetSheet: newSheetId
    });
    
    // Commit all changes
    await batch.commit();
    
    console.log(`Successfully rolled over ${rolledOverTransactions.length} transactions`);
    
    return {
      rolledOverCount: rolledOverTransactions.length,
      transactions: rolledOverTransactions
    };
  } catch (error) {
    console.error('Error processing rollover:', error);
    throw error;
  }
};

/**
 * Get weekly sheet by name
 * @param {Object} db - Firestore database instance
 * @param {string} sheetName - Sheet name to find
 * @returns {Promise<Object|null>} Weekly sheet data or null if not found
 */
export const getWeeklySheetByName = async (db, sheetName) => {
  try {
    const q = query(
      collection(db, COLLECTIONS.WEEKLY_SHEETS),
      where('name', '==', sheetName)
    );
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return null;
    }
    
    const doc = querySnapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data()
    };
  } catch (error) {
    console.error('Error getting weekly sheet by name:', error);
    throw error;
  }
};

/**
 * Get all weekly sheets for a user
 * @param {Object} db - Firestore database instance
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of weekly sheets
 */
export const getUserWeeklySheets = async (db, userId) => {
  try {
    const q = query(
      collection(db, COLLECTIONS.WEEKLY_SHEETS),
      where('createdBy', '==', userId),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const sheets = [];
    
    querySnapshot.forEach((doc) => {
      sheets.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return sheets;
  } catch (error) {
    console.error('Error getting user weekly sheets:', error);
    throw error;
  }
};

/**
 * Update weekly sheet
 * @param {Object} db - Firestore database instance
 * @param {string} sheetId - Sheet ID to update
 * @param {Object} updateData - Data to update
 * @returns {Promise<void>}
 */
export const updateWeeklySheet = async (db, sheetId, updateData) => {
  try {
    const sheetRef = doc(db, COLLECTIONS.WEEKLY_SHEETS, sheetId);
    await updateDoc(sheetRef, {
      ...updateData,
      updatedAt: serverTimestamp()
    });
    
    console.log(`Weekly sheet updated: ${sheetId}`);
  } catch (error) {
    console.error('Error updating weekly sheet:', error);
    throw error;
  }
};

/**
 * Delete weekly sheet
 * @param {Object} db - Firestore database instance
 * @param {string} sheetId - Sheet ID to delete
 * @returns {Promise<void>}
 */
export const deleteWeeklySheet = async (db, sheetId) => {
  try {
    // First, delete all transactions in the sheet
    const transactionsQuery = query(
      collection(db, COLLECTIONS.TRANSACTIONS),
      where('weeklySheetId', '==', sheetId)
    );
    
    const transactionsSnapshot = await getDocs(transactionsQuery);
    const batch = writeBatch(db);
    
    transactionsSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    // Delete the sheet itself
    const sheetRef = doc(db, COLLECTIONS.WEEKLY_SHEETS, sheetId);
    batch.delete(sheetRef);
    
    await batch.commit();
    
    console.log(`Weekly sheet and all transactions deleted: ${sheetId}`);
  } catch (error) {
    console.error('Error deleting weekly sheet:', error);
    throw error;
  }
};

/**
 * Get transactions for a weekly sheet
 * @param {Object} db - Firestore database instance
 * @param {string} sheetId - Sheet ID
 * @returns {Promise<Array>} Array of transactions
 */
export const getSheetTransactions = async (db, sheetId) => {
  try {
    const q = query(
      collection(db, COLLECTIONS.TRANSACTIONS),
      where('weeklySheetId', '==', sheetId),
      orderBy('createdAt', 'asc')
    );
    
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
    console.error('Error getting sheet transactions:', error);
    throw error;
  }
};

/**
 * Add transaction to weekly sheet
 * @param {Object} db - Firestore database instance
 * @param {string} sheetId - Sheet ID
 * @param {Object} transaction - Transaction data
 * @returns {Promise<string>} Transaction ID
 */
export const addTransactionToSheet = async (db, sheetId, transaction) => {
  try {
    const newTransaction = {
      ...transaction,
      weeklySheetId: sheetId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, COLLECTIONS.TRANSACTIONS), newTransaction);
    console.log(`Transaction added to sheet ${sheetId}: ${docRef.id}`);
    
    return docRef.id;
  } catch (error) {
    console.error('Error adding transaction to sheet:', error);
    throw error;
  }
};

/**
 * Update transaction in weekly sheet
 * @param {Object} db - Firestore database instance
 * @param {string} transactionId - Transaction ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<void>}
 */
export const updateTransaction = async (db, transactionId, updateData) => {
  try {
    const transactionRef = doc(db, COLLECTIONS.TRANSACTIONS, transactionId);
    await updateDoc(transactionRef, {
      ...updateData,
      updatedAt: serverTimestamp()
    });
    
    console.log(`Transaction updated: ${transactionId}`);
  } catch (error) {
    console.error('Error updating transaction:', error);
    throw error;
  }
};

/**
 * Delete transaction from weekly sheet
 * @param {Object} db - Firestore database instance
 * @param {string} transactionId - Transaction ID
 * @returns {Promise<void>}
 */
export const deleteTransaction = async (db, transactionId) => {
  try {
    const transactionRef = doc(db, COLLECTIONS.TRANSACTIONS, transactionId);
    await deleteDoc(transactionRef);
    
    console.log(`Transaction deleted: ${transactionId}`);
  } catch (error) {
    console.error('Error deleting transaction:', error);
    throw error;
  }
};

/**
 * Get weekly sheet statistics
 * @param {Object} db - Firestore database instance
 * @param {string} sheetId - Sheet ID
 * @returns {Promise<Object>} Sheet statistics
 */
export const getWeeklySheetStats = async (db, sheetId) => {
  try {
    const transactions = await getSheetTransactions(db, sheetId);
    
    const stats = {
      totalTransactions: transactions.length,
      pendingCount: 0,
      scheduledCount: 0,
      completedCount: 0,
      totalAmount: 0,
      totalWHT: 0,
      totalLevy: 0,
      totalVAT: 0,
      totalMomoCharge: 0,
      totalNetPayable: 0
    };
    
    transactions.forEach(tx => {
      switch (tx.scheduledStatus) {
        case 'Pending':
        case 'Pending (Rollover)':
          stats.pendingCount++;
          break;
        case 'SCHEDULED':
          stats.scheduledCount++;
          break;
        case 'COMPLETED':
          stats.completedCount++;
          break;
      }
      
      if (tx.fullPretax) stats.totalAmount += tx.fullPretax;
      if (tx.wht) stats.totalWHT += tx.wht;
      if (tx.levy) stats.totalLevy += tx.levy;
      if (tx.vat) stats.totalVAT += tx.vat;
      if (tx.momoCharge) stats.totalMomoCharge += tx.momoCharge;
      if (tx.netPayable) stats.totalNetPayable += tx.netPayable;
    });
    
    return stats;
  } catch (error) {
    console.error('Error getting weekly sheet stats:', error);
    throw error;
  }
};
