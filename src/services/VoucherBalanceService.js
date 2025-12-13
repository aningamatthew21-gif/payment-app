// Voucher Balance Service
// Handles budget balance calculations for payment vouchers
// Provides Bal C/D (opening balance), Request (current amount), and Bal B/D (closing balance)

import {
  doc,
  getDoc,
  updateDoc,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { BudgetUpdateService } from './BudgetUpdateService.js';

/**
 * Voucher Balance Service
 * Manages budget balance tracking specifically for payment vouchers
 */
export class VoucherBalanceService {

  /**
   * Get budget line balance for voucher display
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} budgetLineId - Budget line ID
   * @returns {Promise<Object>} Budget balance data for voucher
   */
  static async getBudgetBalanceForVoucher(db, appId, budgetLineIdOrName) {
    try {
      console.log(`[VoucherBalanceService] Fetching budget balance for budget line: ${budgetLineIdOrName}`);

      let budgetLineDoc = null;
      let budgetLineId = budgetLineIdOrName;

      // First, try direct document lookup by ID
      const budgetLineRef = doc(db, `artifacts/${appId}/public/data/budgetLines`, budgetLineIdOrName);
      budgetLineDoc = await getDoc(budgetLineRef);

      // If not found by ID, try to find by name (the budgetLine might be a display string like "NAME - GL - DEPT")
      if (!budgetLineDoc.exists()) {
        console.log(`[VoucherBalanceService] Document not found by ID, trying name-based lookup...`);

        // Import collection and query for name-based lookup
        const { collection, getDocs } = await import('firebase/firestore');
        const budgetLinesRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);
        const budgetLinesSnapshot = await getDocs(budgetLinesRef);

        // Extract the name part (first part before " - ")
        const searchName = budgetLineIdOrName.split(' - ')[0].trim();
        console.log(`[VoucherBalanceService] Searching for budget line with name: ${searchName}`);

        for (const docItem of budgetLinesSnapshot.docs) {
          const data = docItem.data();
          // Check if name matches (exact or partial)
          if (data.name === searchName ||
            data.name === budgetLineIdOrName ||
            data.budgetLine === searchName ||
            data.budgetLine === budgetLineIdOrName) {
            budgetLineDoc = docItem;
            budgetLineId = docItem.id;
            console.log(`[VoucherBalanceService] Found budget line by name: ${docItem.id}`);
            break;
          }
        }
      }

      if (!budgetLineDoc || !budgetLineDoc.exists()) {
        console.warn(`[VoucherBalanceService] Budget line document not found: ${budgetLineIdOrName}`);
        return {
          budgetLineId: budgetLineIdOrName,
          budgetLineName: budgetLineIdOrName, // Use the input as the name since we couldn't find it
          allocatedAmount: 0,
          totalSpendToDate: 0,
          balCD: 0,
          request: 0,
          balBD: 0,
          error: 'Budget line not found'
        };
      }

      const budgetData = budgetLineDoc.data ? budgetLineDoc.data() : budgetLineDoc;
      console.log(`[VoucherBalanceService] Budget line data retrieved:`, budgetData);

      // Extract budget line name
      let budgetLineName = 'Unknown';
      if (budgetData.name) {
        budgetLineName = budgetData.name;
      } else if (budgetData.budgetLine) {
        budgetLineName = budgetData.budgetLine;
      } else if (budgetData.description) {
        budgetLineName = budgetData.description;
      }

      // Extract allocated amount (total budget)
      let allocatedAmount = 0;
      if (budgetData.allocatedAmount !== undefined) {
        allocatedAmount = Number(budgetData.allocatedAmount);
      } else if (budgetData.totalBudget !== undefined) {
        allocatedAmount = Number(budgetData.totalBudget);
      } else if (budgetData.budget !== undefined) {
        allocatedAmount = Number(budgetData.budget);
      } else if (budgetData.monthlyValues && Array.isArray(budgetData.monthlyValues)) {
        // Sum monthly values if they exist
        allocatedAmount = budgetData.monthlyValues.reduce((sum, val) => sum + Number(val || 0), 0);
      }

      // Extract total spend to date
      let totalSpendToDate = 0;
      if (budgetData.totalSpendToDate !== undefined) {
        totalSpendToDate = Number(budgetData.totalSpendToDate);
      } else if (budgetData.spentToDate !== undefined) {
        totalSpendToDate = Number(budgetData.spentToDate);
      } else if (budgetData.totalSpent !== undefined) {
        totalSpendToDate = Number(budgetData.totalSpent);
      }

      // Calculate current balance (Bal C/D)
      let balCD = allocatedAmount - totalSpendToDate;

      // If we have explicit current balance fields, use those instead
      if (budgetData.currentBalanceUSD !== undefined) {
        balCD = Number(budgetData.currentBalanceUSD);
      } else if (budgetData.currentBalance !== undefined) {
        balCD = Number(budgetData.currentBalance);
      } else if (budgetData.balance !== undefined) {
        balCD = Number(budgetData.balance);
      }

      console.log(`[VoucherBalanceService] Budget calculations:`, {
        budgetLineName,
        allocatedAmount,
        totalSpendToDate,
        balCD,
        extractedFields: {
          name: budgetData.name,
          budget: budgetData.budget,
          totalBudget: budgetData.totalBudget,
          allocatedAmount: budgetData.allocatedAmount,
          totalSpendToDate: budgetData.totalSpendToDate,
          currentBalance: budgetData.currentBalance,
          currentBalanceUSD: budgetData.currentBalanceUSD,
          monthlyValues: budgetData.monthlyValues
        }
      });

      return {
        budgetLineId,
        budgetLineName,
        allocatedAmount,
        totalSpendToDate,
        balCD,
        request: 0, // Will be set by caller
        balBD: 0,   // Will be calculated by caller
        rawData: budgetData // Store raw data for debugging
      };

    } catch (error) {
      console.error(`[VoucherBalanceService] Error fetching budget balance:`, error);
      return {
        budgetLineId: budgetLineIdOrName,
        budgetLineName: budgetLineIdOrName || 'Error',
        allocatedAmount: 0,
        totalSpendToDate: 0,
        balCD: 0,
        request: 0,
        balBD: 0,
        error: error.message
      };
    }
  }

  /**
   * Update budget balance after payment finalization
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} budgetLineId - Budget line ID
   * @param {number} requestAmount - Payment amount in USD
   * @param {string} paymentId - Payment ID for audit trail
   * @param {string} userId - User ID performing the operation
   * @returns {Promise<Object>} Updated balance result
   */
  static async updateBudgetBalanceAfterPayment(db, appId, budgetLineId, requestAmount, paymentId, userId) {
    try {
      console.log(`[VoucherBalanceService] Updating budget balance after payment:`, {
        budgetLineId,
        requestAmount,
        paymentId,
        userId
      });

      // ✅ ENHANCED: Use centralized BudgetUpdateService for consistent updates
      const updateResult = await BudgetUpdateService.updateBudgetBalance(
        db,
        appId,
        budgetLineId,
        requestAmount,
        paymentId,
        userId
      );

      if (updateResult.success) {
        console.log(`[VoucherBalanceService] Budget balance updated successfully using centralized service:`, updateResult);

        return {
          budgetLineId,
          budgetLineName: updateResult.budgetLineName,
          previousBalance: updateResult.previousBalance,
          requestAmount: requestAmount,
          newBalance: updateResult.newBalance,
          isNegative: updateResult.isNegative,
          timestamp: updateResult.timestamp,
          success: true,
          validation: updateResult.validation
        };
      } else {
        throw new Error(`Budget update failed: ${updateResult.error}`);
      }

    } catch (error) {
      console.error(`[VoucherBalanceService] Error updating budget balance:`, error);
      throw error;
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
   * Calculate voucher budget impact display data
   * @param {Object} budgetBalance - Budget balance data from getBudgetBalanceForVoucher
   * @param {number} requestAmount - Current payment request amount
   * @returns {Object} Voucher display data
   */
  static calculateVoucherBudgetImpact(budgetBalance, requestAmount) {
    try {
      console.log(`[VoucherBalanceService] Calculating voucher budget impact:`, {
        budgetBalance,
        requestAmount
      });

      const balCD = Number(budgetBalance.balCD || 0);
      const request = Number(requestAmount || 0);
      const balBD = balCD - request; // Closing balance

      const result = {
        budgetLine: budgetBalance.budgetLineName,
        balCD: balCD,
        request: request,
        balBD: balBD,
        isNegative: balBD < 0,
        // Format for display
        balCDFormatted: `$${balCD.toFixed(2)}`,
        requestFormatted: `$${request.toFixed(2)}`,
        balBDFormatted: `$${balBD.toFixed(2)}`,
        // Add negative indicator
        balBDFormattedWithIndicator: balBD < 0 ? `-$${Math.abs(balBD).toFixed(2)}` : `$${balBD.toFixed(2)}`
      };

      console.log(`[VoucherBalanceService] Voucher budget impact calculated:`, result);

      return result;

    } catch (error) {
      console.error(`[VoucherBalanceService] Error calculating voucher budget impact:`, error);
      return {
        budgetLine: 'Error',
        balCD: 0,
        request: 0,
        balBD: 0,
        isNegative: false,
        balCDFormatted: '$0.00',
        requestFormatted: '$0.00',
        balBDFormatted: '$0.00',
        balBDFormattedWithIndicator: '$0.00',
        error: error.message
      };
    }
  }
}
