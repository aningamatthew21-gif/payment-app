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
   * @returns {Promise<number>} - WHT rate as decimal (0 if not found)
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

      // Get rate from database
      const rate = await ProcurementTypesService.getWHTRate(db, appId, procurementType);

      // Cache the result
      if (WHT_CONFIG.CACHE_PROCUREMENT_TYPES) {
        this.cacheWHTRate(procurementType, rate);
      }

      console.log(`[WHTEnhancedService] Retrieved rate for ${procurementType}: ${(rate * 100).toFixed(1)}%`);
      return rate;

    } catch (error) {
      console.error('[WHTEnhancedService] Error getting dynamic WHT rate:', error);
      return 0;
    }
  }

  /**
   * Get WHT rate from validation collection (database fallback)
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} procurementType - Procurement type name
   * @returns {Promise<number>} - WHT rate as decimal (0 if not found)
   */
  static async getWHTRateFromValidation(db, appId, procurementType) {
    try {
      if (!db || !appId || !procurementType) {
        return 0;
      }

      const normalized = procurementType?.toUpperCase().trim();
      const validationRef = collection(db, `artifacts/${appId}/public/data/validation`);
      
      // Query for procurement type in validation collection
      const q = query(
        validationRef,
        where('field', '==', 'procurementTypes'),
        where('value', '==', normalized),
        where('isActive', '==', true)
      );

      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        const data = doc.data();
        const rate = data.rate || 0;
        
        // Convert percentage to decimal (e.g., 5.0 -> 0.05)
        const decimalRate = rate > 1 ? rate / 100 : rate;
        
        console.log(`[WHTEnhancedService] Found rate in validation collection for ${normalized}: ${rate}% (${(decimalRate * 100).toFixed(2)}%)`);
        return decimalRate;
      }

      console.warn(`[WHTEnhancedService] No rate found in validation collection for ${normalized}`);
      return 0;

    } catch (error) {
      console.error('[WHTEnhancedService] Error getting rate from validation collection:', error);
      return 0;
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
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} procurementType - Procurement type name
   * @returns {Promise<number>} - Effective WHT rate as decimal
   */
  static async getEffectiveWHTRate(db, appId, procurementType) {
    let whtRate = 0;
    const normalizedType = procurementType || 'DEFAULT';

    try {
      // 1. Try ProcurementTypesService (dedicated collection)
      whtRate = await this.getDynamicWHTRate(db, appId, normalizedType);
      
      if (whtRate > 0) {
        console.log(`[WHTEnhancedService] Found rate from ProcurementTypesService for ${normalizedType}: ${(whtRate * 100).toFixed(2)}%`);
        return whtRate;
      }
    } catch (error) {
      console.warn('[WHTEnhancedService] ProcurementTypesService rate fetch failed:', error);
    }

    // 2. Fallback to Validation Collection
    try {
      whtRate = await this.getWHTRateFromValidation(db, appId, normalizedType);
      
      if (whtRate > 0) {
        console.log(`[WHTEnhancedService] Found rate from validation collection for ${normalizedType}: ${(whtRate * 100).toFixed(2)}%`);
        return whtRate;
      }
    } catch (error) {
      console.warn('[WHTEnhancedService] Validation collection rate fetch failed:', error);
    }

    // 3. No rate found in either location
    console.error(`[WHTEnhancedService] No WHT rate found for ${normalizedType} in database. Please add it to validation collection or procurement types.`);
    return 0;
  }

  /**
   * Calculate WHT for multiple payments in a batch using FinancialEngine
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Array} payments - Array of payment objects
   * @returns {Promise<Object>} - Batch WHT calculation result
   */
  static async calculateBatchWHT(db, appId, payments) {
    try {
      console.log('[WHTEnhancedService] Calculating batch WHT for', payments.length, 'payments');

      const results = [];
      let totalWHTAmount = 0;
      let totalAmount = 0;

      for (const payment of payments) {
        // Get effective WHT rate
        const procurementType = payment.procurementType || payment.procurement || 'DEFAULT';
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

        const whtResult = {
          success: true,
          whtAmount: calculation.wht || 0,
          whtRate: whtRate,
          whtRatePercentage: `${(whtRate * 100).toFixed(2)}%`,
          procurementType: procurementType,
          currency: transaction.currency,
          calculationMethod: 'financial_engine',
          timestamp: new Date().toISOString()
        };

        results.push({
          paymentId: payment.id || `payment_${Date.now()}_${Math.random()}`,
          ...whtResult,
          originalAmount: transaction.fullPretax
        });

        totalWHTAmount += whtResult.whtAmount;
        totalAmount += transaction.fullPretax;
      }

      const batchResult = {
        payments: results,
        summary: {
          totalPayments: payments.length,
          totalAmount: totalAmount,
          totalWHTAmount: Math.round(totalWHTAmount * 100) / 100,
          averageWHTRate: totalAmount > 0 ? (totalWHTAmount / totalAmount) : 0,
          currency: payments[0]?.currency || 'GHS',
          calculationMethod: 'financial_engine',
          timestamp: new Date().toISOString()
        }
      };

      console.log('[WHTEnhancedService] ✓ Batch WHT calculation completed:', batchResult.summary);
      return batchResult;

    } catch (error) {
      console.error('[WHTEnhancedService] Error calculating batch WHT:', error);
      throw error;
    }
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
