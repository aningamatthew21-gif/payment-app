// Enhanced Budget Balance Service
// Handles real-time balance tracking, rollovers, overspending detection, and performance metrics

import { 
  collection, 
  doc, 
  updateDoc, 
  getDoc, 
  serverTimestamp 
} from 'firebase/firestore';

/**
 * Enhanced Budget Balance Service
 * Provides comprehensive budget tracking with balance rollovers, overspending detection, and performance metrics
 */
export class BudgetBalanceService {
  
  /**
   * Calculate monthly balance after a transaction
   * @param {Object} budgetLine - Budget line object with monthly balances
   * @param {string} month - Month key (e.g., "2025-01")
   * @param {number} transactionAmount - Transaction amount in USD
   * @returns {Object} Updated month data with new balance and status
   */
  static calculateMonthlyBalance(budgetLine, month, transactionAmount) {
    const monthData = budgetLine.monthlyBalances[month];
    if (!monthData) {
      console.warn(`Month ${month} not found in budget line ${budgetLine.name}`);
      return null;
    }
    
    const previousBalance = monthData.balance;
    const newSpent = monthData.spent + transactionAmount;
    const newBalance = monthData.allocated - newSpent;
    
    // Determine status based on new balance
    let status = "active";
    if (newBalance < 0) {
      status = "overspent";
    } else if (newBalance === 0) {
      status = "completed";
    } else if (newBalance > monthData.allocated * 0.8) {
      status = "underspent"; // Less than 80% used
    }
    
    return {
      ...monthData,
      spent: newSpent,
      balance: newBalance,
      status,
      lastTransaction: new Date(),
      isOverspent: newBalance < 0,
      overspendAmount: newBalance < 0 ? Math.abs(newBalance) : 0,
      utilizationRate: (newSpent / monthData.allocated) * 100,
      previousBalance: previousBalance,
      changeAmount: transactionAmount
    };
  }
  
  /**
   * Process monthly rollover between months
   * @param {Object} budgetLine - Budget line object
   * @param {string} fromMonth - Source month (e.g., "2025-01")
   * @param {string} toMonth - Target month (e.g., "2025-02")
   * @returns {Object} Rollover result with updated month data
   */
  static processMonthlyRollover(budgetLine, fromMonth, toMonth) {
    const fromMonthData = budgetLine.monthlyBalances[fromMonth];
    const toMonthData = budgetLine.monthlyBalances[toMonth];
    
    if (!fromMonthData || !toMonthData) {
      console.warn(`Month data not found for rollover: ${fromMonth} -> ${toMonth}`);
      return null;
    }
    
    let rolloverAmount = 0;
    let rolloverType = "none";
    
    if (fromMonthData.balance > 0) {
      // Positive balance rolls over (savings)
      rolloverAmount = fromMonthData.balance;
      rolloverType = "positive";
      fromMonthData.status = "completed";
      fromMonthData.rolloverTo = toMonth;
      fromMonthData.rolloverAmount = rolloverAmount;
      fromMonthData.rolloverType = rolloverType;
    } else if (fromMonthData.balance < 0) {
      // Negative balance (overspending) affects next month
      rolloverAmount = fromMonthData.balance; // Negative value
      rolloverType = "negative";
      fromMonthData.status = "overspent";
      fromMonthData.rolloverTo = toMonth;
      fromMonthData.rolloverAmount = rolloverAmount;
      fromMonthData.rolloverType = rolloverType;
    }
    
    // Update next month with rollover
    toMonthData.balance += rolloverAmount;
    toMonthData.rolloverFrom = fromMonth;
    toMonthData.rolloverAmount = rolloverAmount;
    toMonthData.rolloverType = rolloverType;
    
    // Adjust status based on new balance
    if (toMonthData.balance < 0) {
      toMonthData.status = "overspent";
    } else if (toMonthData.balance > toMonthData.allocated) {
      toMonthData.status = "underspent";
    } else if (toMonthData.balance === 0) {
      toMonthData.status = "completed";
    }
    
    return { 
      fromMonthData, 
      toMonthData, 
      rolloverAmount, 
      rolloverType,
      fromMonth,
      toMonth
    };
  }
  
  /**
   * Get comprehensive budget performance summary
   * @param {Object} budgetLine - Budget line object
   * @returns {Object} Performance metrics and analysis
   */
  static getBudgetPerformance(budgetLine) {
    const months = Object.values(budgetLine.monthlyBalances);
    
    if (months.length === 0) {
      return {
        totalAllocated: 0,
        totalSpent: 0,
        totalRemaining: 0,
        monthsOverspent: 0,
        monthsUnderspent: 0,
        monthsOnTarget: 0,
        monthsCompleted: 0,
        averageMonthlySpending: 0,
        averageUtilization: 0,
        totalPositiveRollover: 0,
        totalNegativeRollover: 0,
        isOverBudget: false,
        overBudgetAmount: 0,
        riskLevel: "NONE"
      };
    }
    
    const performance = {
      totalAllocated: months.reduce((sum, m) => sum + m.allocated, 0),
      totalSpent: months.reduce((sum, m) => sum + m.spent, 0),
      totalRemaining: months.reduce((sum, m) => sum + m.balance, 0),
      
      // Monthly performance counts
      monthsOverspent: months.filter(m => m.status === "overspent").length,
      monthsUnderspent: months.filter(m => m.status === "underspent").length,
      monthsOnTarget: months.filter(m => m.status === "active").length,
      monthsCompleted: months.filter(m => m.status === "completed").length,
      
      // Financial metrics
      averageMonthlySpending: months.reduce((sum, m) => sum + m.spent, 0) / months.length,
      averageUtilization: months.reduce((sum, m) => sum + m.utilizationRate, 0) / months.length,
      
      // Rollover analysis
      totalPositiveRollover: months.reduce((sum, m) => sum + (m.rolloverAmount > 0 ? m.rolloverAmount : 0), 0),
      totalNegativeRollover: months.reduce((sum, m) => sum + (m.rolloverAmount < 0 ? Math.abs(m.rolloverAmount) : 0), 0),
      
      // Risk indicators
      isOverBudget: months.some(m => m.status === "overspent"),
      overBudgetAmount: months.reduce((sum, m) => sum + m.overspendAmount, 0),
      riskLevel: this.calculateRiskLevel(months)
    };
    
    return performance;
  }
  
  /**
   * Calculate risk level based on spending patterns
   * @param {Array} months - Array of month data objects
   * @returns {string} Risk level (HIGH, MEDIUM, LOW, NONE)
   */
  static calculateRiskLevel(months) {
    const overspentMonths = months.filter(m => m.status === "overspent").length;
    const totalMonths = months.length;
    const overspendRatio = overspentMonths / totalMonths;
    
    if (overspendRatio > 0.5) return "HIGH";
    if (overspendRatio > 0.25) return "MEDIUM";
    if (overspendRatio > 0) return "LOW";
    return "NONE";
  }
  
  /**
   * Initialize monthly balances for a new budget line
   * @param {Object} budgetLine - Budget line with monthlyValues
   * @returns {Object} Budget line with initialized monthlyBalances
   */
  static initializeMonthlyBalances(budgetLine) {
    const monthlyBalances = {};
    
    // Create 12 months of balance tracking
    for (let i = 0; i < 12; i++) {
      const month = `2025-${String(i + 1).padStart(2, '0')}`;
      const allocated = Math.abs(budgetLine.monthlyValues[i] || 0);
      
      monthlyBalances[month] = {
        allocated: allocated,
        spent: 0,
        balance: allocated,
        status: "active",
        rolloverFrom: null,
        rolloverTo: null,
        rolloverAmount: 0,
        rolloverType: "none",
        lastTransaction: null,
        isOverspent: false,
        overspendAmount: 0,
        utilizationRate: 0,
        previousBalance: allocated,
        changeAmount: 0
      };
    }
    
    return {
      ...budgetLine,
      monthlyBalances,
      currentMonth: "2025-01",
      currentBalance: monthlyBalances["2025-01"].balance,
      currentSpent: 0,
      currentRemaining: monthlyBalances["2025-01"].balance
    };
  }
  
  /**
   * Update budget line balance after payment finalization
   * @param {Object} db - Firestore database instance
   * @param {string} budgetLineId - Budget line ID
   * @param {Object} transaction - Payment transaction data
   * @param {string} month - Month key (e.g., "2025-01")
   * @returns {Promise<Object>} Updated budget line data
   */
  static async updateBudgetLineBalance(db, budgetLineId, transaction, month) {
    try {
      console.log(`[BudgetBalanceService] Starting balance update for budget line: ${budgetLineId}`);
      console.log(`[BudgetBalanceService] Transaction data:`, transaction);
      console.log(`[BudgetBalanceService] Month: ${month}`);
      
      // Get current budget line - FIXED: Use correct collection path
      const budgetLineRef = doc(db, `artifacts/${transaction.appId || 'default'}/public/data/budgetLines`, budgetLineId);
      console.log(`[BudgetBalanceService] Fetching budget line from:`, budgetLineRef.path);
      
      const budgetLineSnap = await getDoc(budgetLineRef);
      
      if (!budgetLineSnap.exists()) {
        console.error(`[BudgetBalanceService] Budget line ${budgetLineId} not found at path: ${budgetLineRef.path}`);
        throw new Error(`Budget line ${budgetLineId} not found`);
      }
      
      const budgetLine = budgetLineSnap.data();
      console.log(`[BudgetBalanceService] Current budget line data:`, budgetLine);
      
      // Calculate new balance
      const updatedMonthData = this.calculateMonthlyBalance(
        budgetLine, 
        month, 
        transaction.budgetImpactUSD
      );
      
      if (!updatedMonthData) {
        console.error(`[BudgetBalanceService] Failed to calculate balance for month ${month}`);
        throw new Error(`Failed to calculate balance for month ${month}`);
      }
      
      console.log(`[BudgetBalanceService] Updated month data:`, updatedMonthData);
      
      // Update monthly balances
      budgetLine.monthlyBalances[month] = updatedMonthData;
      
      // Update current month tracking
      budgetLine.currentMonth = month;
      budgetLine.currentBalance = updatedMonthData.balance;
      budgetLine.currentSpent = updatedMonthData.spent;
      budgetLine.currentRemaining = updatedMonthData.balance;
      
      // ADDED: Simple balance tracking for voucher display
      budgetLine.currentBalanceUSD = updatedMonthData.balance;
      budgetLine.lastBalanceUpdate = new Date().toISOString();
      
      // Update performance metrics
      const performance = this.getBudgetPerformance(budgetLine);
      budgetLine.totalAllocated = performance.totalAllocated;
      budgetLine.totalSpent = performance.totalSpent;
      budgetLine.totalRemaining = performance.totalRemaining;
      budgetLine.averageMonthlySpending = performance.averageMonthlySpending;
      budgetLine.monthsOverspent = performance.monthsOverspent;
      budgetLine.monthsUnderspent = performance.monthsUnderspent;
      budgetLine.monthsOnTarget = performance.monthsOnTarget;
      
      console.log(`[BudgetBalanceService] Performance metrics:`, performance);
      console.log(`[BudgetBalanceService] Updated budget line data:`, {
        currentBalanceUSD: budgetLine.currentBalanceUSD,
        lastBalanceUpdate: budgetLine.lastBalanceUpdate,
        currentBalance: budgetLine.currentBalance,
        currentSpent: budgetLine.currentSpent
      });
      
      // Save updated budget line
      const updateData = {
        monthlyBalances: budgetLine.monthlyBalances,
        currentMonth: budgetLine.currentMonth,
        currentBalance: budgetLine.currentBalance,
        currentSpent: budgetLine.currentSpent,
        currentRemaining: budgetLine.currentRemaining,
        totalAllocated: budgetLine.totalAllocated,
        totalSpent: budgetLine.totalSpent,
        totalRemaining: budgetLine.totalRemaining,
        averageMonthlySpending: budgetLine.averageMonthlySpending,
        monthsOverspent: budgetLine.monthsOverspent,
        monthsUnderspent: budgetLine.monthsUnderspent,
        monthsOnTarget: budgetLine.monthsOnTarget,
        // ADDED: Simple balance fields
        currentBalanceUSD: budgetLine.currentBalanceUSD,
        lastBalanceUpdate: budgetLine.lastBalanceUpdate,
        lastUpdated: serverTimestamp()
      };
      
      console.log(`[BudgetBalanceService] Saving update data:`, updateData);
      await updateDoc(budgetLineRef, updateData);
      
      console.log(`[BudgetBalanceService] Budget line ${budgetLineId} updated successfully`);
      
      return {
        budgetLineId,
        month,
        previousBalance: updatedMonthData.previousBalance,
        newBalance: updatedMonthData.balance,
        changeAmount: updatedMonthData.changeAmount,
        status: updatedMonthData.status,
        isOverspent: updatedMonthData.isOverspent,
        overspendAmount: updatedMonthData.overspendAmount,
        utilizationRate: updatedMonthData.utilizationRate,
        // ADDED: Simple balance info for voucher
        currentBalanceUSD: budgetLine.currentBalanceUSD,
        lastBalanceUpdate: budgetLine.lastBalanceUpdate
      };
      
    } catch (error) {
      console.error(`[BudgetBalanceService] Error updating budget line balance:`, error);
      throw error;
    }
  }
  
  /**
   * Process monthly rollover for all budget lines
   * @param {Object} db - Firestore database instance
   * @param {string} fromMonth - Source month
   * @param {string} toMonth - Target month
   * @returns {Promise<Array>} Array of rollover results
   */
  static async processMonthlyRolloverForAll(db, fromMonth, toMonth) {
    try {
      // This would typically be called by a scheduled function
      // For now, we'll return the rollover logic
      console.log(`Processing rollover from ${fromMonth} to ${toMonth}`);
      
      // In a real implementation, you would:
      // 1. Get all budget lines
      // 2. Process rollover for each
      // 3. Update Firestore
      // 4. Log rollover transactions
      
      return {
        fromMonth,
        toMonth,
        processedAt: new Date(),
        message: "Rollover processing initiated"
      };
      
    } catch (error) {
      console.error('Error processing monthly rollover:', error);
      throw error;
    }
  }
  
  /**
   * Get budget line status summary for a specific month
   * @param {Object} budgetLine - Budget line object
   * @param {string} month - Month key
   * @returns {Object} Month status summary
   */
  static getMonthStatusSummary(budgetLine, month) {
    const monthData = budgetLine.monthlyBalances[month];
    if (!monthData) return null;
    
    return {
      month,
      budgetLineName: budgetLine.name,
      accountNo: budgetLine.accountNo,
      deptCode: budgetLine.deptCode,
      deptDimension: budgetLine.deptDimension,
      allocated: monthData.allocated,
      spent: monthData.spent,
      balance: monthData.balance,
      status: monthData.status,
      utilizationRate: monthData.utilizationRate,
      isOverspent: monthData.isOverspent,
      overspendAmount: monthData.overspendAmount,
      rolloverFrom: monthData.rolloverFrom,
      rolloverTo: monthData.rolloverTo,
      rolloverAmount: monthData.rolloverAmount,
      rolloverType: monthData.rolloverType,
      lastTransaction: monthData.lastTransaction
    };
  }
}

// Export utility functions
export const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const getMonthIndex = (month) => {
  const monthNum = parseInt(month.split('-')[1]);
  return monthNum - 1; // Convert to 0-based index
};

export const getNextMonth = (month) => {
  const [year, monthNum] = month.split('-');
  const nextMonthNum = parseInt(monthNum) + 1;
  
  if (nextMonthNum > 12) {
    return `${parseInt(year) + 1}-01`;
  }
  
  return `${year}-${String(nextMonthNum).padStart(2, '0')}`;
};

export const getPreviousMonth = (month) => {
  const [year, monthNum] = month.split('-');
  const prevMonthNum = parseInt(monthNum) - 1;
  
  if (prevMonthNum < 1) {
    return `${parseInt(year) - 1}-12`;
  }
  
  return `${year}-${String(prevMonthNum).padStart(2, '0')}`;
};
