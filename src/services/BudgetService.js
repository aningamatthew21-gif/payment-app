// Budget Service - Handles budget line management and balance tracking
// This service replaces the BUDGET_LINES and BUDGET_LOG functionality from VBA

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
import { calculateBudgetImpact } from './FinancialEngine.js';

// Collection names
const COLLECTIONS = {
  BUDGET_LINES: 'budgetLines',
  BUDGET_LOG: 'budgetLog'
};

/**
 * Create a new budget line
 * @param {Object} db - Firestore database instance
 * @param {Object} budgetData - Budget line data
 * @returns {Promise<string>} Budget line ID
 */
export const createBudgetLine = async (db, budgetData) => {
  try {
    const newBudgetLine = {
      name: budgetData.name,
      code: budgetData.code || '',
      description: budgetData.description || '',
      balance: budgetData.balance || 0,
      currency: budgetData.currency || 'USD',
      category: budgetData.category || 'General',
      isActive: true,
      createdBy: budgetData.userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, COLLECTIONS.BUDGET_LINES), newBudgetLine);
    console.log(`Budget line created: ${docRef.id}`);
    
    // Log the creation
    await logBudgetChange(db, {
      budgetLineId: docRef.id,
      budgetLineName: newBudgetLine.name,
      changeType: 'CREATED',
      originalBalance: 0,
      changeAmount: newBudgetLine.balance,
      newBalance: newBudgetLine.balance,
      description: 'Budget line created',
      userId: budgetData.userId
    });
    
    return docRef.id;
  } catch (error) {
    console.error('Error creating budget line:', error);
    throw error;
  }
};

/**
 * Get all budget lines for a user
 * @param {Object} db - Firestore database instance
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of budget lines
 */
export const getUserBudgetLines = async (db, userId) => {
  try {
    const q = query(
      collection(db, COLLECTIONS.BUDGET_LINES),
      where('createdBy', '==', userId),
      where('isActive', '==', true),
      orderBy('name', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    const budgetLines = [];
    
    querySnapshot.forEach((doc) => {
      budgetLines.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return budgetLines;
  } catch (error) {
    console.error('Error getting user budget lines:', error);
    throw error;
  }
};

/**
 * Get budget line by ID
 * @param {Object} db - Firestore database instance
 * @param {string} budgetLineId - Budget line ID
 * @returns {Promise<Object|null>} Budget line data or null if not found
 */
export const getBudgetLineById = async (db, budgetLineId) => {
  try {
    const docRef = doc(db, COLLECTIONS.BUDGET_LINES, budgetLineId);
    const docSnap = await getDocs(docRef);
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error getting budget line by ID:', error);
    throw error;
  }
};

/**
 * Update budget line
 * @param {Object} db - Firestore database instance
 * @param {string} budgetLineId - Budget line ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<void>}
 */
export const updateBudgetLine = async (db, budgetLineId, updateData) => {
  try {
    const budgetLineRef = doc(db, COLLECTIONS.BUDGET_LINES, budgetLineId);
    
    // Get current budget line data for logging
    const currentData = await getBudgetLineById(db, budgetLineId);
    if (!currentData) {
      throw new Error('Budget line not found');
    }
    
    await updateDoc(budgetLineRef, {
      ...updateData,
      updatedAt: serverTimestamp()
    });
    
    console.log(`Budget line updated: ${budgetLineId}`);
    
    // Log the update if balance changed
    if (updateData.balance !== undefined && updateData.balance !== currentData.balance) {
      await logBudgetChange(db, {
        budgetLineId: budgetLineId,
        budgetLineName: currentData.name,
        changeType: 'MANUAL_UPDATE',
        originalBalance: currentData.balance,
        changeAmount: updateData.balance - currentData.balance,
        newBalance: updateData.balance,
        description: updateData.description || 'Budget line manually updated',
        userId: updateData.userId || currentData.createdBy
      });
    }
  } catch (error) {
    console.error('Error updating budget line:', error);
    throw error;
  }
};

/**
 * Delete budget line (soft delete by setting isActive to false)
 * @param {Object} db - Firestore database instance
 * @param {string} budgetLineId - Budget line ID
 * @param {string} userId - User ID performing the deletion
 * @returns {Promise<void>}
 */
export const deleteBudgetLine = async (db, budgetLineId, userId) => {
  try {
    const budgetLineRef = doc(db, COLLECTIONS.BUDGET_LINES, budgetLineId);
    
    // Get current budget line data for logging
    const currentData = await getBudgetLineById(db, budgetLineId);
    if (!currentData) {
      throw new Error('Budget line not found');
    }
    
    // Soft delete by setting isActive to false
    await updateDoc(budgetLineRef, {
      isActive: false,
      deletedAt: serverTimestamp(),
      deletedBy: userId,
      updatedAt: serverTimestamp()
    });
    
    console.log(`Budget line deleted (soft): ${budgetLineId}`);
    
    // Log the deletion
    await logBudgetChange(db, {
      budgetLineId: budgetLineId,
      budgetLineName: currentData.name,
      changeType: 'DELETED',
      originalBalance: currentData.balance,
      changeAmount: 0,
      newBalance: 0,
      description: 'Budget line deleted',
      userId: userId
    });
  } catch (error) {
    console.error('Error deleting budget line:', error);
    throw error;
  }
};

/**
 * Update budget balance after payment finalization
 * @param {Object} db - Firestore database instance
 * @param {Object} budgetImpact - Budget impact calculation
 * @param {string} batchId - Batch ID for grouping changes
 * @param {string} userId - User ID performing the operation
 * @returns {Promise<Object>} Updated budget line data
 */
export const updateBudgetBalanceAfterPayment = async (db, budgetImpact, batchId, userId) => {
  try {
    const budgetLineRef = doc(db, COLLECTIONS.BUDGET_LINES, budgetImpact.budgetLineId);
    
    // Get current budget line data
    const currentData = await getBudgetLineById(db, budgetImpact.budgetLineId);
    if (!currentData) {
      throw new Error('Budget line not found');
    }
    
    // Update the balance
    const newBalance = budgetImpact.newBalance;
    await updateDoc(budgetLineRef, {
      balance: newBalance,
      lastUpdated: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    console.log(`Budget balance updated for ${currentData.name}: ${currentData.balance} -> ${newBalance}`);
    
    // Log the budget change
    await logBudgetChange(db, {
      budgetLineId: budgetImpact.budgetLineId,
      budgetLineName: budgetImpact.budgetLineName,
      changeType: 'PAYMENT_FINALIZED',
      originalBalance: budgetImpact.currentBalance,
      changeAmount: -budgetImpact.transactionAmount, // Negative because it's a reduction
      newBalance: newBalance,
      description: `Payment finalized - ${budgetImpact.transactionAmount} USD`,
      batchId: batchId,
      userId: userId
    });
    
    return {
      id: budgetImpact.budgetLineId,
      name: budgetImpact.budgetLineName,
      previousBalance: budgetImpact.currentBalance,
      newBalance: newBalance,
      changeAmount: budgetImpact.transactionAmount,
      isOverBudget: budgetImpact.isOverBudget
    };
  } catch (error) {
    console.error('Error updating budget balance after payment:', error);
    throw error;
  }
};

/**
 * Undo last budget balance update for a batch
 * @param {Object} db - Firestore database instance
 * @param {string} batchId - Batch ID to undo
 * @returns {Promise<Object>} Result of undo operation
 */
export const undoLastBudgetBalanceUpdate = async (db, batchId) => {
  try {
    // Get the budget log entries for this batch
    const budgetLogQuery = query(
      collection(db, COLLECTIONS.BUDGET_LOG),
      where('batchId', '==', batchId),
      where('changeType', '==', 'PAYMENT_FINALIZED')
    );
    
    const budgetLogSnapshot = await getDocs(budgetLogQuery);
    if (budgetLogSnapshot.empty) {
      throw new Error('No budget changes found for this batch');
    }
    
    const batch = writeBatch(db);
    const restoredBudgets = [];
    
    // Process each budget change
    for (const logDoc of budgetLogSnapshot.docs) {
      const logData = logDoc.data();
      
      // Restore the original balance
      const budgetLineRef = doc(db, COLLECTIONS.BUDGET_LINES, logData.budgetLineId);
      batch.update(budgetLineRef, {
        balance: logData.originalBalance,
        lastUpdated: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      // Log the restoration
      const restoreLogRef = doc(collection(db, COLLECTIONS.BUDGET_LOG));
      batch.set(restoreLogRef, {
        budgetLineId: logData.budgetLineId,
        budgetLineName: logData.budgetLineName,
        changeType: 'UNDO_RESTORE',
        originalBalance: logData.newBalance,
        changeAmount: logData.originalBalance - logData.newBalance,
        newBalance: logData.originalBalance,
        description: `Budget balance restored from undo operation`,
        batchId: batchId,
        undoOperation: true,
        createdAt: serverTimestamp()
      });
      
      restoredBudgets.push({
        budgetLineId: logData.budgetLineId,
        budgetLineName: logData.budgetLineName,
        restoredBalance: logData.originalBalance
      });
    }
    
    // Commit all changes
    await batch.commit();
    
    console.log(`Budget balances restored for batch: ${batchId}`);
    
    return {
      success: true,
      batchId: batchId,
      restoredBudgets: restoredBudgets,
      message: 'Budget balances restored successfully'
    };
  } catch (error) {
    console.error('Error undoing budget balance update:', error);
    throw error;
  }
};

/**
 * Log budget change for audit trail
 * @param {Object} db - Firestore database instance
 * @param {Object} changeData - Budget change data
 * @returns {Promise<string>} Budget log entry ID
 */
export const logBudgetChange = async (db, changeData) => {
  try {
    const budgetLogEntry = {
      budgetLineId: changeData.budgetLineId,
      budgetLineName: changeData.budgetLineName,
      changeType: changeData.changeType,
      originalBalance: changeData.originalBalance,
      changeAmount: changeData.changeAmount,
      newBalance: changeData.newBalance,
      description: changeData.description,
      batchId: changeData.batchId,
      undoOperation: changeData.undoOperation || false,
      createdBy: changeData.userId,
      createdAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, COLLECTIONS.BUDGET_LOG), budgetLogEntry);
    console.log(`Budget change logged: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error('Error logging budget change:', error);
    throw error;
  }
};

/**
 * Get budget change history for a specific budget line
 * @param {Object} db - Firestore database instance
 * @param {string} budgetLineId - Budget line ID
 * @param {number} limit - Maximum number of entries to return
 * @returns {Promise<Array>} Array of budget change entries
 */
export const getBudgetChangeHistory = async (db, budgetLineId, limit = 50) => {
  try {
    const q = query(
      collection(db, COLLECTIONS.BUDGET_LOG),
      where('budgetLineId', '==', budgetLineId),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const changes = [];
    
    querySnapshot.forEach((doc) => {
      changes.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Limit the results
    return changes.slice(0, limit);
  } catch (error) {
    console.error('Error getting budget change history:', error);
    throw error;
  }
};

/**
 * Get budget summary for a user
 * @param {Object} db - Firestore database instance
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Budget summary
 */
export const getBudgetSummary = async (db, userId) => {
  try {
    const budgetLines = await getUserBudgetLines(db, userId);
    
    const summary = {
      totalBudgetLines: budgetLines.length,
      totalBalance: 0,
      totalAllocated: 0,
      overBudgetCount: 0,
      overBudgetAmount: 0,
      categories: {}
    };
    
    budgetLines.forEach(budget => {
      summary.totalBalance += budget.balance || 0;
      
      if (budget.balance < 0) {
        summary.overBudgetCount++;
        summary.overBudgetAmount += Math.abs(budget.balance);
      }
      
      // Group by category
      const category = budget.category || 'General';
      if (!summary.categories[category]) {
        summary.categories[category] = {
          count: 0,
          totalBalance: 0
        };
      }
      summary.categories[category].count++;
      summary.categories[category].totalBalance += budget.balance || 0;
    });
    
    return summary;
  } catch (error) {
    console.error('Error getting budget summary:', error);
    throw error;
  }
};

/**
 * Validate budget line data
 * @param {Object} budgetData - Budget line data to validate
 * @returns {Object} Validation result with errors array
 */
export const validateBudgetLine = (budgetData) => {
  const errors = [];
  
  if (!budgetData.name || budgetData.name.trim() === '') {
    errors.push('Budget line name is required');
  }
  
  if (budgetData.balance !== undefined && (isNaN(budgetData.balance) || budgetData.balance < 0)) {
    errors.push('Budget balance must be a non-negative number');
  }
  
  if (budgetData.currency && !['USD', 'GHS', 'EUR', 'GBP'].includes(budgetData.currency)) {
    errors.push('Invalid currency. Must be USD, GHS, EUR, or GBP');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};
