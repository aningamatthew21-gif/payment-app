// Centralized Budget Update Service
// Provides consistent budget balance updates across all system components

import { 
  doc, 
  updateDoc, 
  getDoc, 
  writeBatch, 
  serverTimestamp 
} from 'firebase/firestore';

/**
 * Centralized Budget Update Service
 * Ensures consistent budget balance updates across all system components
 */
export class BudgetUpdateService {
  
  /**
   * Update budget balance with comprehensive field synchronization
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} budgetLineId - Budget line ID
   * @param {number} paymentAmount - Payment amount in USD
   * @param {string} paymentId - Payment ID for audit trail
   * @param {string} userId - User ID performing the operation
   * @param {string} month - Month key (e.g., "2025-01")
   * @returns {Promise<Object>} Update result with validation
   */
  static async updateBudgetBalance(db, appId, budgetLineId, paymentAmount, paymentId, userId, month = null) {
    try {
      console.log(`[BudgetUpdateService] Starting centralized budget update:`, {
        budgetLineId,
        paymentAmount,
        paymentId,
        userId,
        month
      });

      // Validate required parameters
      if (!db || !appId || !budgetLineId || paymentAmount === undefined || !paymentId || !userId) {
        throw new Error('Missing required parameters for budget balance update');
      }

      // Get current month if not provided
      if (!month) {
        month = this.getCurrentMonth();
      }

      const budgetLineRef = doc(db, `artifacts/${appId}/public/data/budgetLines`, budgetLineId);
      console.log(`[BudgetUpdateService] Updating budget line at path: ${budgetLineRef.path}`);

      // Get current budget line data
      const budgetLineSnap = await getDoc(budgetLineRef);
      
      if (!budgetLineSnap.exists()) {
        throw new Error(`Budget line ${budgetLineId} not found`);
      }

      const budgetLine = budgetLineSnap.data();
      console.log(`[BudgetUpdateService] Current budget line data:`, budgetLine);

      // Calculate new balance with validation
      const currentBalance = this.getCurrentBalance(budgetLine);
      const newBalance = currentBalance - paymentAmount;

      console.log(`[BudgetUpdateService] Balance calculation:`, {
        currentBalance,
        paymentAmount,
        newBalance,
        isNegative: newBalance < 0
      });

      // Prepare comprehensive update data with all required fields
      const updateData = this.prepareUpdateData(budgetLine, newBalance, paymentAmount, paymentId, userId, month);

      console.log(`[BudgetUpdateService] Prepared update data:`, updateData);

      // Use batch for atomic updates
      const batch = writeBatch(db);
      batch.update(budgetLineRef, updateData);

      // Commit the batch
      await batch.commit();

      // Validate the update was successful
      const validationResult = await this.validateUpdate(db, appId, budgetLineId, updateData);

      console.log(`[BudgetUpdateService] Budget balance updated successfully:`, {
        budgetLineId,
        previousBalance: currentBalance,
        newBalance,
        paymentAmount,
        validation: validationResult
      });

      return {
        budgetLineId,
        budgetLineName: budgetLine.name,
        previousBalance: currentBalance,
        paymentAmount: paymentAmount,
        newBalance: newBalance,
        isNegative: newBalance < 0,
        timestamp: new Date().toISOString(),
        success: true,
        validation: validationResult
      };

    } catch (error) {
      console.error(`[BudgetUpdateService] Error updating budget balance:`, error);
      throw error;
    }
  }

  /**
   * Get current balance from budget line data with fallback logic
   * @param {Object} budgetLine - Budget line data
   * @returns {number} Current balance
   */
  static getCurrentBalance(budgetLine) {
    // Priority order for balance fields
    const balanceFields = [
      'currentBalanceUSD',
      'currentBalance', 
      'balCD',
      'balance'
    ];

    for (const field of balanceFields) {
      if (budgetLine[field] !== undefined && budgetLine[field] !== null) {
        return Number(budgetLine[field]) || 0;
      }
    }

    // Fallback: calculate from monthly values
    const totalAllocated = budgetLine.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 0;
    const totalSpent = Math.abs(budgetLine.totalSpent || budgetLine.totalSpendToDate || 0);
    return totalAllocated - totalSpent;
  }

  /**
   * Prepare comprehensive update data with all required fields
   * @param {Object} budgetLine - Current budget line data
   * @param {number} newBalance - New balance after payment
   * @param {number} paymentAmount - Payment amount
   * @param {string} paymentId - Payment ID
   * @param {string} userId - User ID
   * @param {string} month - Month key
   * @returns {Object} Update data object
   */
  static prepareUpdateData(budgetLine, newBalance, paymentAmount, paymentId, userId, month) {
    const currentSpent = Math.abs(budgetLine.totalSpent || budgetLine.totalSpendToDate || 0);
    const newTotalSpent = currentSpent + paymentAmount;

    // Get current month data for monthly balances
    const currentMonthData = budgetLine.monthlyBalances?.[month] || {
      allocated: budgetLine.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 0,
      spent: 0,
      balance: budgetLine.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 0
    };

    const newMonthSpent = currentMonthData.spent + paymentAmount;
    const newMonthBalance = currentMonthData.allocated - newMonthSpent;

    // Determine status based on new balance
    let status = "active";
    if (newMonthBalance < 0) {
      status = "overspent";
    } else if (newMonthBalance === 0) {
      status = "completed";
    } else if (newMonthBalance > currentMonthData.allocated * 0.8) {
      status = "underspent";
    }

    const updateData = {
      // ✅ CRITICAL: Update ALL fields that BudgetManagement displays
      balCD: newBalance, // Voucher display field
      currentBalance: newBalance, // General tracking field
      currentBalanceUSD: newBalance, // USD tracking field
      totalSpent: newTotalSpent, // Cumulative spending
      totalSpendToDate: newTotalSpent, // Alternative spending field
      
      // Update tracking fields
      lastUpdated: serverTimestamp(),
      lastPaymentBatch: paymentId,
      lastPaymentAmount: paymentAmount,
      lastPaymentCurrency: 'USD',
      lastPaymentBy: userId,
      lastPaymentDate: serverTimestamp(),
      
      // Update monthly balances for current month
      [`monthlyBalances.${month}.spent`]: newMonthSpent,
      [`monthlyBalances.${month}.balance`]: newMonthBalance,
      [`monthlyBalances.${month}.status`]: status,
      [`monthlyBalances.${month}.lastUpdated`]: serverTimestamp(),
      [`monthlyBalances.${month}.lastTransaction`]: new Date().toISOString(),
      [`monthlyBalances.${month}.isOverspent`]: newMonthBalance < 0,
      [`monthlyBalances.${month}.overspendAmount`]: newMonthBalance < 0 ? Math.abs(newMonthBalance) : 0,
      [`monthlyBalances.${month}.utilizationRate`]: (newMonthSpent / currentMonthData.allocated) * 100,
      [`monthlyBalances.${month}.previousBalance`]: currentMonthData.balance,
      [`monthlyBalances.${month}.changeAmount`]: paymentAmount,
      
      // Update current month tracking
      currentMonth: month,
      currentSpent: newMonthSpent,
      currentRemaining: newMonthBalance,
      
      // Add to balance history for audit trail
      balanceHistory: [
        ...(budgetLine.balanceHistory || []),
        {
          date: new Date().toISOString(),
          paymentId: paymentId,
          previousBalance: this.getCurrentBalance(budgetLine),
          paymentAmount: paymentAmount,
          newBalance: newBalance,
          userId: userId,
          type: 'PAYMENT_FINALIZED',
          month: month
        }
      ]
    };

    return updateData;
  }

  /**
   * Validate that the update was successful
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} budgetLineId - Budget line ID
   * @param {Object} expectedData - Expected update data
   * @returns {Promise<Object>} Validation result
   */
  static async validateUpdate(db, appId, budgetLineId, expectedData) {
    try {
      const budgetLineRef = doc(db, `artifacts/${appId}/public/data/budgetLines`, budgetLineId);
      const budgetLineSnap = await getDoc(budgetLineRef);
      
      if (!budgetLineSnap.exists()) {
        return { valid: false, error: 'Budget line not found after update' };
      }

      const updatedData = budgetLineSnap.data();
      const validation = {
        valid: true,
        discrepancies: []
      };

      // Check critical fields
      const criticalFields = ['balCD', 'currentBalance', 'currentBalanceUSD', 'totalSpent'];
      
      for (const field of criticalFields) {
        if (updatedData[field] !== expectedData[field]) {
          validation.discrepancies.push({
            field,
            expected: expectedData[field],
            actual: updatedData[field]
          });
          validation.valid = false;
        }
      }

      return validation;

    } catch (error) {
      console.error(`[BudgetUpdateService] Validation error:`, error);
      return { valid: false, error: error.message };
    }
  }

  /**
   * Get current month for budget updates
   * @returns {string} Current month in YYYY-MM format
   */
  static getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Validate budget data consistency
   * @param {Object} budgetLine - Budget line data
   * @returns {Object} Validation result
   */
  static validateBudgetData(budgetLine) {
    const validation = {
      valid: true,
      issues: [],
      warnings: []
    };

    // Check for balance field consistency
    const balanceFields = ['currentBalanceUSD', 'currentBalance', 'balCD'];
    const balanceValues = balanceFields.map(field => budgetLine[field]).filter(val => val !== undefined && val !== null);
    
    if (balanceValues.length > 1) {
      const uniqueValues = [...new Set(balanceValues)];
      if (uniqueValues.length > 1) {
        validation.issues.push({
          type: 'balance_inconsistency',
          message: 'Multiple balance fields have different values',
          fields: balanceFields,
          values: balanceValues
        });
        validation.valid = false;
      }
    }

    // Check for negative balances without proper status
    const currentBalance = this.getCurrentBalance(budgetLine);
    if (currentBalance < 0) {
      const monthData = budgetLine.monthlyBalances?.[this.getCurrentMonth()];
      if (monthData && monthData.status !== 'overspent') {
        validation.warnings.push({
          type: 'negative_balance_status',
          message: 'Negative balance detected but status is not overspent',
          balance: currentBalance,
          status: monthData.status
        });
      }
    }

    // Check for missing required fields
    const requiredFields = ['name', 'accountNo'];
    for (const field of requiredFields) {
      if (!budgetLine[field]) {
        validation.issues.push({
          type: 'missing_field',
          message: `Required field ${field} is missing`,
          field: field
        });
        validation.valid = false;
      }
    }

    return validation;
  }

  /**
   * Rollback budget balance update
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} budgetLineId - Budget line ID
   * @param {string} paymentId - Payment ID to rollback
   * @returns {Promise<Object>} Rollback result
   */
  static async rollbackBudgetUpdate(db, appId, budgetLineId, paymentId) {
    try {
      console.log(`[BudgetUpdateService] Rolling back budget update for payment: ${paymentId}`);

      const budgetLineRef = doc(db, `artifacts/${appId}/public/data/budgetLines`, budgetLineId);
      const budgetLineSnap = await getDoc(budgetLineRef);
      
      if (!budgetLineSnap.exists()) {
        throw new Error(`Budget line ${budgetLineId} not found`);
      }

      const budgetLine = budgetLineSnap.data();
      const balanceHistory = budgetLine.balanceHistory || [];
      
      // Find the payment entry to rollback
      const paymentEntry = balanceHistory.find(entry => entry.paymentId === paymentId);
      
      if (!paymentEntry) {
        throw new Error(`Payment entry ${paymentId} not found in balance history`);
      }

      // Calculate rollback values
      const rollbackBalance = paymentEntry.previousBalance;
      const rollbackAmount = paymentEntry.paymentAmount;
      const currentBalance = this.getCurrentBalance(budgetLine);
      const newBalance = currentBalance + rollbackAmount; // Add back the payment amount

      console.log(`[BudgetUpdateService] Rollback calculation:`, {
        currentBalance,
        rollbackAmount,
        newBalance,
        expectedBalance: rollbackBalance
      });

      // Prepare rollback update data
      const rollbackData = {
        balCD: newBalance,
        currentBalance: newBalance,
        currentBalanceUSD: newBalance,
        totalSpent: Math.max(0, (budgetLine.totalSpent || 0) - rollbackAmount),
        totalSpendToDate: Math.max(0, (budgetLine.totalSpendToDate || 0) - rollbackAmount),
        lastUpdated: serverTimestamp(),
        lastRollback: {
          paymentId: paymentId,
          rollbackAmount: rollbackAmount,
          previousBalance: currentBalance,
          newBalance: newBalance,
          timestamp: new Date().toISOString()
        }
      };

      // Update the budget line
      await updateDoc(budgetLineRef, rollbackData);

      console.log(`[BudgetUpdateService] Budget rollback completed successfully`);

      return {
        budgetLineId,
        paymentId,
        rollbackAmount,
        previousBalance: currentBalance,
        newBalance,
        success: true
      };

    } catch (error) {
      console.error(`[BudgetUpdateService] Error rolling back budget update:`, error);
      throw error;
    }
  }
}
