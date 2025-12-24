// WHT Enhanced Service - PERMANENTLY INTEGRATED
// This service provides enhanced WHT functionality that is now permanently integrated into the system

import { ProcurementTypesService } from './ProcurementTypesService.js';
import { WHT_CONFIG } from '../config/WHTConfig.js';
import { calculateTotalTaxes, calculateWHT } from './FinancialEngine.js';
import { collection, query, where, getDocs } from 'firebase/firestore';

export class WHTEnhancedService {

  // Cache for procurement types to improve performance
  static procurementTypesCache = new Map();
  static cacheTimestamp = null;

  /**
   * Get dynamic WHT rate from database - STRICTLY DB ONLY
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} procurementType - Procurement type name
   * @returns {Promise<number|null>} - WHT rate as decimal (null if not found)
   */
  static async getDynamicWHTRate(db, appId, procurementType) {
    try {
      // Check cache first
      if (this.shouldUseCache()) {
        const cachedRate = this.getCachedWHTRate(procurementType);
        if (cachedRate !== null) {
          console.log(`[WHTEnhancedService] Using cached rate for ${procurementType}: ${(cachedRate * 100).toFixed(1)}%`);
          return cachedRate;
        }
      }

      // First check if the procurement type actually EXISTS in the database
      const typeData = await ProcurementTypesService.getProcurementTypeByName(db, appId, procurementType);

      if (typeData && typeData.isActive) {
        // Type exists - get its rate (could be 0 for tax-exempt, that's valid)
        const rate = typeData.whtRate;

        if (typeof rate === 'number') {
          // Cache the result
          if (WHT_CONFIG.CACHE_PROCUREMENT_TYPES) {
            this.cacheWHTRate(procurementType, rate);
          }
          console.log(`[WHTEnhancedService] Retrieved rate for ${procurementType}: ${(rate * 100).toFixed(1)}%`);
          return rate;
        }
      }

      // Type not found in procurement types collection
      console.warn(`[WHTEnhancedService] Procurement type '${procurementType}' not found in database`);
      return null;

    } catch (error) {
      console.error('[WHTEnhancedService] Error getting dynamic WHT rate:', error);
      return null;
    }
  }

  /**
   * Get WHT rate from validation collection (database fallback)
   * Uses case-insensitive matching since user input may vary
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} procurementType - Procurement type name
   * @returns {Promise<number|null>} - WHT rate as decimal (null if not found)
   */
  static async getWHTRateFromValidation(db, appId, procurementType) {
    try {
      if (!db || !appId || !procurementType) {
        return null;
      }

      const searchTerm = procurementType.toUpperCase().trim();
      const validationRef = collection(db, `artifacts/${appId}/public/data/validation`);

      // Query for ALL procurement types since Firestore doesn't support case-insensitive queries
      const q = query(
        validationRef,
        where('field', '==', 'procurementTypes'),
        where('isActive', '==', true)
      );

      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        // Find matching entry with case-insensitive comparison
        for (const doc of querySnapshot.docs) {
          const data = doc.data();
          const storedValue = (data.value || '').toUpperCase().trim();

          // Exact match (case-insensitive)
          if (storedValue === searchTerm) {
            const rate = (data.rate !== undefined && data.rate !== null) ? data.rate : null;

            if (rate === null) {
              console.warn(`[WHTEnhancedService] Rate field missing in validation record for ${storedValue}`);
              continue;
            }

            // Convert percentage to decimal (e.g., 5.0 -> 0.05)
            const decimalRate = rate > 1 ? rate / 100 : rate;
            console.log(`[WHTEnhancedService] Found rate in validation collection for ${searchTerm}: ${rate}% (${(decimalRate * 100).toFixed(2)}%)`);
            return decimalRate;
          }
        }

        // Fuzzy match: Try singular/plural variations
        for (const doc of querySnapshot.docs) {
          const data = doc.data();
          const storedValue = (data.value || '').toUpperCase().trim();

          // Try removing or adding 'S'
          const fuzzySearchTerms = [];
          if (searchTerm.endsWith('S')) {
            fuzzySearchTerms.push(searchTerm.slice(0, -1)); // SERVICES -> SERVICE
          } else {
            fuzzySearchTerms.push(searchTerm + 'S'); // SERVICE -> SERVICES
          }

          if (fuzzySearchTerms.includes(storedValue)) {
            const rate = (data.rate !== undefined && data.rate !== null) ? data.rate : null;

            if (rate === null) continue;

            const decimalRate = rate > 1 ? rate / 100 : rate;
            console.log(`[WHTEnhancedService] Found rate via fuzzy match: ${searchTerm} -> ${storedValue}: ${rate}%`);
            return decimalRate;
          }
        }
      }

      console.warn(`[WHTEnhancedService] No rate found in validation collection for ${searchTerm}`);
      return null;

    } catch (error) {
      console.error('[WHTEnhancedService] Error getting rate from validation collection:', error);
      return null;
    }
  }

  /**
   * Get WHT rate from validation collection (synchronous fallback - uses cache if available)
   * This is kept for backward compatibility but should use async version
   * @param {string} procurementType - Procurement type name
   * @returns {number} - WHT rate as decimal (0 if not found)
   * @deprecated Use getWHTRateFromValidation instead
   */
  static getHardcodedWHTRate(procurementType) {
    console.warn('[WHTEnhancedService] getHardcodedWHTRate is deprecated. Use getWHTRateFromValidation instead.');
    // Return 0 - no hardcoded fallback
    return 0;
  }

  /**
   * Get effective WHT rate (ProcurementTypesService -> Validation Collection)
   * This is the "Smart Logic" that tries dedicated collection first, then validation collection
   * 
   * 🚨 STRICT MODE: Throws error if no rate found - prevents 0% tax default
   * 
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} procurementType - Procurement type name
   * @returns {Promise<number>} - Effective WHT rate as decimal
   * @throws {Error} - If no rate configuration found (CRITICAL SECURITY)
   */
  static async getEffectiveWHTRate(db, appId, procurementType) {
    const normalizedType = (procurementType || 'DEFAULT').toUpperCase().trim();
    let whtRate = null;

    // 1. Try ProcurementTypesService (dedicated collection)
    try {
      whtRate = await this.getDynamicWHTRate(db, appId, normalizedType);

      // Rate found (including 0 which is valid for tax-exempt)
      if (whtRate !== null) {
        console.log(`[WHTEnhancedService] Found rate from ProcurementTypesService for ${normalizedType}: ${(whtRate * 100).toFixed(2)}%`);
        return whtRate;
      }
    } catch (error) {
      console.warn('[WHTEnhancedService] ProcurementTypesService rate fetch failed:', error);
    }

    // 2. Fallback to Validation Collection
    try {
      whtRate = await this.getWHTRateFromValidation(db, appId, normalizedType);

      // Rate found (including 0 which is valid for tax-exempt)
      if (whtRate !== null) {
        console.log(`[WHTEnhancedService] Found rate from validation collection for ${normalizedType}: ${(whtRate * 100).toFixed(2)}%`);
        return whtRate;
      }
    } catch (error) {
      console.warn('[WHTEnhancedService] Validation collection rate fetch failed:', error);
    }

    // 3. 🚨 CRITICAL SECURITY FIX: Block transaction if no rate found
    // Do NOT return 0 - throw an error to prevent financial loss
    const errorMessage = `CRITICAL: Missing WHT rate configuration for '${normalizedType}'. Transaction blocked to prevent financial loss. Please configure this procurement type in Validation Manager.`;
    console.error(`[WHTEnhancedService] ${errorMessage}`);

    throw new Error(errorMessage);
  }

  /**
   * Calculate WHT for multiple payments in a batch using FinancialEngine
   * 
   * 🚨 STRICT MODE: If a rate is missing for a payment, that payment is marked
   * as blocked (success: false, isBlocked: true) rather than using 0% tax.
   * 
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Array} payments - Array of payment objects
   * @returns {Promise<Object>} - Batch WHT calculation result with blocked payments flagged
   */
  static async calculateBatchWHT(db, appId, payments) {
    console.log('[WHTEnhancedService] Calculating batch WHT for', payments.length, 'payments');

    const results = [];
    let totalWHTAmount = 0;
    let totalAmount = 0;
    let blockedCount = 0;

    for (const payment of payments) {
      const paymentId = payment.id || `payment_${Date.now()}_${Math.random()}`;
      const procurementType = payment.procurementType || payment.procurement || 'DEFAULT';

      try {
        // Get effective WHT rate (Will THROW if missing - STRICT MODE)
        const whtRate = await this.getEffectiveWHTRate(db, appId, procurementType);

        // Prepare transaction for FinancialEngine
        const transaction = {
          fullPretax: Number(payment.amount || payment.pretaxAmount || payment.fullPretax || 0),
          procurementType: procurementType,
          taxType: payment.taxType || 'STANDARD',
          vatDecision: payment.vatDecision || payment.vat || 'NO',
          paymentMode: payment.paymentMode || 'BANK TRANSFER',
          currency: payment.currency || 'GHS',
          fxRate: Number(payment.fxRate || 1)
        };

        // Calculate using FinancialEngine (unified system)
        const calculation = calculateTotalTaxes(transaction, { whtRate });

        // ✅ SUCCESS PATH - Payment calculated successfully
        results.push({
          paymentId: paymentId,
          success: true,
          isBlocked: false,
          whtAmount: calculation.wht || 0,
          whtRate: whtRate,
          whtRatePercentage: `${(whtRate * 100).toFixed(2)}%`,
          procurementType: procurementType,
          currency: transaction.currency,
          originalAmount: transaction.fullPretax,
          calculationMethod: 'financial_engine',
          timestamp: new Date().toISOString()
        });

        totalWHTAmount += calculation.wht || 0;
        totalAmount += transaction.fullPretax;

      } catch (error) {
        // ❌ ERROR PATH - Block this specific payment
        console.error(`[WHTEnhancedService] Calculation failed for payment ${paymentId}:`, error.message);

        blockedCount++;

        results.push({
          paymentId: paymentId,
          success: false,          // Mark as failed
          isBlocked: true,         // Explicit flag for UI
          error: error.message,    // "CRITICAL: Missing WHT rate configuration..."
          whtAmount: 0,
          whtRate: 0,
          whtRatePercentage: '0.00%',
          procurementType: procurementType,
          currency: payment.currency || 'GHS',
          originalAmount: Number(payment.amount || payment.pretaxAmount || payment.fullPretax || 0),
          calculationMethod: 'blocked',
          timestamp: new Date().toISOString()
        });

        // Do NOT add to totals - blocked payments should not contribute
      }
    }

    const batchResult = {
      payments: results,
      summary: {
        totalPayments: payments.length,
        successfulPayments: payments.length - blockedCount,
        blockedPayments: blockedCount,
        totalAmount: totalAmount,
        totalWHTAmount: Math.round(totalWHTAmount * 100) / 100,
        averageWHTRate: totalAmount > 0 ? (totalWHTAmount / totalAmount) : 0,
        currency: payments[0]?.currency || 'GHS',
        calculationMethod: 'financial_engine',
        hasBlockedPayments: blockedCount > 0,  // UI can check this
        timestamp: new Date().toISOString()
      }
    };

    if (blockedCount > 0) {
      console.warn(`[WHTEnhancedService] ⚠️ Batch has ${blockedCount} blocked payments due to missing rate configuration`);
    }

    console.log('[WHTEnhancedService] ✓ Batch WHT calculation completed:', batchResult.summary);
    return batchResult;
  }

  /**
   * Validate WHT calculation result
   * @param {Object} whtResult - WHT calculation result
   * @returns {Object} - Validation result
   */
  static validateWHTResult(whtResult) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: []
    };

    try {
      // Check required fields
      if (!whtResult.whtAmount || typeof whtResult.whtAmount !== 'number') {
        validation.errors.push('Invalid WHT amount');
        validation.isValid = false;
      }

      if (!whtResult.whtRate || typeof whtResult.whtRate !== 'number') {
        validation.errors.push('Invalid WHT rate');
        validation.isValid = false;
      }

      if (!whtResult.currency) {
        validation.errors.push('Missing currency');
        validation.isValid = false;
      }

      // Check for warnings
      if (whtResult.calculationMethod === 'error') {
        validation.warnings.push('WHT calculation encountered an error');
      }

      if (whtResult.whtAmount < 0) {
        validation.warnings.push('Negative WHT amount detected');
      }

      if (whtResult.whtRate > 0.5) {
        validation.warnings.push('Unusually high WHT rate detected (>50%)');
      }

    } catch (error) {
      validation.errors.push(`Validation error: ${error.message}`);
      validation.isValid = false;
    }

    return validation;
  }

  /**
   * Get WHT calculation statistics
   * @param {Array} whtResults - Array of WHT calculation results
   * @returns {Object} - Statistics object
   */
  static getWHTStatistics(whtResults) {
    try {
      if (!Array.isArray(whtResults) || whtResults.length === 0) {
        return {
          totalCalculations: 0,
          averageWHTRate: 0,
          totalWHTAmount: 0,
          currencyBreakdown: {},
          methodBreakdown: {}
        };
      }

      const stats = {
        totalCalculations: whtResults.length,
        averageWHTRate: 0,
        totalWHTAmount: 0,
        currencyBreakdown: {},
        methodBreakdown: {},
        timestamp: new Date().toISOString()
      };

      let totalAmount = 0;
      let totalWHTAmount = 0;

      whtResults.forEach(result => {
        // Currency breakdown
        const currency = result.currency || 'UNKNOWN';
        if (!stats.currencyBreakdown[currency]) {
          stats.currencyBreakdown[currency] = { count: 0, totalAmount: 0, totalWHT: 0 };
        }
        stats.currencyBreakdown[currency].count++;
        stats.currencyBreakdown[currency].totalAmount += result.originalAmount || 0;
        stats.currencyBreakdown[currency].totalWHT += result.whtAmount || 0;

        // Method breakdown
        const method = result.calculationMethod || 'UNKNOWN';
        if (!stats.methodBreakdown[method]) {
          stats.methodBreakdown[method] = { count: 0, totalAmount: 0, totalWHT: 0 };
        }
        stats.methodBreakdown[method].count++;
        stats.methodBreakdown[method].totalAmount += result.originalAmount || 0;
        stats.methodBreakdown[method].totalWHT += result.whtAmount || 0;

        totalAmount += result.originalAmount || 0;
        totalWHTAmount += result.whtAmount || 0;
      });

      stats.averageWHTRate = totalAmount > 0 ? (totalWHTAmount / totalAmount) : 0;
      stats.totalWHTAmount = Math.round(totalWHTAmount * 100) / 100;

      return stats;

    } catch (error) {
      console.error('[WHTEnhancedService] Error calculating statistics:', error);
      return {
        totalCalculations: 0,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Cache management methods
   */
  static shouldUseCache() {
    if (!WHT_CONFIG.CACHE_PROCUREMENT_TYPES) return false;
    if (!this.cacheTimestamp) return false;

    const now = Date.now();
    const cacheAge = now - this.cacheTimestamp;
    return cacheAge < WHT_CONFIG.CACHE_DURATION;
  }

  static getCachedWHTRate(procurementType) {
    const normalizedType = procurementType?.toUpperCase();
    return this.procurementTypesCache.get(normalizedType) || null;
  }

  static cacheWHTRate(procurementType, rate) {
    const normalizedType = procurementType?.toUpperCase();
    this.procurementTypesCache.set(normalizedType, rate);
    this.cacheTimestamp = Date.now();
  }

  static clearCache() {
    this.procurementTypesCache.clear();
    this.cacheTimestamp = null;
    console.log('[WHTEnhancedService] Cache cleared');
  }

  /**
   * Test function for development and debugging
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @returns {Promise<Object>} - Test results
   */
  static async runTests(db, appId) {
    try {
      console.log('[WHTEnhancedService] Running tests...');

      const testResults = {
        timestamp: new Date().toISOString(),
        tests: [],
        summary: { passed: 0, failed: 0, total: 0 }
      };

      // Test 1: Basic WHT calculation using FinancialEngine
      try {
        const whtRate = await this.getEffectiveWHTRate(db, appId, 'SERVICES');
        const transaction = {
          fullPretax: 1000,
          procurementType: 'SERVICES',
          taxType: 'STANDARD',
          vatDecision: 'NO',
          paymentMode: 'BANK TRANSFER',
          currency: 'GHS',
          fxRate: 1
        };
        const calculation = calculateTotalTaxes(transaction, { whtRate });
        const result = {
          whtAmount: calculation.wht,
          whtRate: whtRate,
          currency: 'GHS',
          calculationMethod: 'financial_engine'
        };

        if (result.whtAmount > 0 && result.currency === 'GHS') {
          testResults.tests.push({ name: 'Basic WHT Calculation', status: 'PASSED', details: result });
          testResults.summary.passed++;
        } else {
          testResults.tests.push({ name: 'Basic WHT Calculation', status: 'FAILED', details: result });
          testResults.summary.failed++;
        }
      } catch (error) {
        testResults.tests.push({ name: 'Basic WHT Calculation', status: 'ERROR', error: error.message });
        testResults.summary.failed++;
      }

      // Test 2: Non-GHS currency (should return 0 WHT)
      try {
        const transaction = {
          fullPretax: 1000,
          procurementType: 'SERVICES',
          taxType: 'STANDARD',
          vatDecision: 'NO',
          paymentMode: 'BANK TRANSFER',
          currency: 'USD',
          fxRate: 1
        };
        const calculation = calculateTotalTaxes(transaction, { whtRate: 0.05 });
        const result = {
          whtAmount: calculation.wht,
          currency: 'USD',
          calculationMethod: 'financial_engine'
        };

        if (result.whtAmount === 0 && result.currency === 'USD') {
          testResults.tests.push({ name: 'Non-GHS Currency Test', status: 'PASSED', details: result });
          testResults.summary.passed++;
        } else {
          testResults.tests.push({ name: 'Non-GHS Currency Test', status: 'FAILED', details: result });
          testResults.summary.failed++;
        }
      } catch (error) {
        testResults.tests.push({ name: 'Non-GHS Currency Test', status: 'ERROR', error: error.message });
        testResults.summary.failed++;
      }

      // Test 3: Batch calculation
      try {
        const testPayments = [
          { id: 'test1', amount: 1000, currency: 'GHS', procurementType: 'SERVICES' },
          { id: 'test2', amount: 2000, currency: 'GHS', procurementType: 'GOODS' }
        ];
        const result = await this.calculateBatchWHT(db, appId, testPayments);

        if (result.payments.length === 2 && result.summary.totalPayments === 2) {
          testResults.tests.push({ name: 'Batch WHT Calculation', status: 'PASSED', details: result.summary });
          testResults.summary.passed++;
        } else {
          testResults.tests.push({ name: 'Batch WHT Calculation', status: 'FAILED', details: result.summary });
          testResults.summary.failed++;
        }
      } catch (error) {
        testResults.tests.push({ name: 'Batch WHT Calculation', status: 'ERROR', error: error.message });
        testResults.summary.failed++;
      }

      testResults.summary.total = testResults.tests.length;

      console.log('[WHTEnhancedService] ✓ Tests completed:', testResults.summary);
      return testResults;

    } catch (error) {
      console.error('[WHTEnhancedService] Error running tests:', error);
      return {
        timestamp: new Date().toISOString(),
        error: error.message,
        tests: [],
        summary: { passed: 0, failed: 0, total: 0 }
      };
    }
  }
}
