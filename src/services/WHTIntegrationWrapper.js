// WHT Integration Wrapper - PERMANENTLY INTEGRATED
// This service provides seamless integration of enhanced WHT system with existing payment processing

import { WHTEnhancedService } from './WHTEnhancedService.js';
import { WHT_CONFIG } from '../config/WHTConfig.js';

export class WHTIntegrationWrapper {
  
  /**
   * Enhanced WHT calculation wrapper for existing payment systems - PERMANENTLY INTEGRATED
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Object} paymentData - Payment data from existing system
   * @param {Object} options - Integration options
   * @returns {Promise<Object>} - Enhanced payment data with WHT calculations
   */
  static async enhancePaymentWithWHT(db, appId, paymentData, options = {}) {
    try {
      console.log('[WHTIntegrationWrapper] Enhancing payment with WHT (PERMANENTLY INTEGRATED):', {
        paymentId: paymentData.id,
        amount: paymentData.amount,
        currency: paymentData.currency,
        procurementType: paymentData.procurementType
      });
      
      // PERMANENTLY INTEGRATED - Always use enhanced WHT service
      console.log('[WHTIntegrationWrapper] Using permanently integrated enhanced WHT service');
      
      // Prepare payment data for WHT calculation
      const whtInputData = {
        amount: paymentData.amount || paymentData.netPayable || paymentData.amountThisTransaction || 0,
        currency: paymentData.currency || 'GHS',
        procurementType: paymentData.procurementType || paymentData.whtType || 'DEFAULT',
        isPartialPayment: paymentData.isPartialPayment || false
      };
      
      // Calculate WHT using FinancialEngine (unified system)
      const { calculateTotalTaxes } = await import('./FinancialEngine.js');
      
      // Get effective WHT rate
      const whtRate = await WHTEnhancedService.getEffectiveWHTRate(
        db, 
        appId, 
        whtInputData.procurementType || 'DEFAULT'
      );
      
      // Prepare transaction for FinancialEngine
      const transaction = {
        fullPretax: whtInputData.amount,
        procurementType: whtInputData.procurementType || 'DEFAULT',
        taxType: paymentData.taxType || 'STANDARD',
        vatDecision: paymentData.vatDecision || paymentData.vat || 'NO',
        paymentMode: paymentData.paymentMode || 'BANK TRANSFER',
        currency: whtInputData.currency || 'GHS',
        fxRate: paymentData.fxRate || 1
      };
      
      // Calculate using FinancialEngine
      const calculation = calculateTotalTaxes(transaction, { whtRate });
      
      // Enhance payment data with WHT results - PERMANENTLY INTEGRATED
      const enhancedPayment = {
        ...paymentData,
        whtEnhanced: true,
        whtCalculationMethod: 'financial_engine',
        whtAmount: calculation.wht || 0,
        whtRate: whtRate,
        whtRatePercentage: `${(whtRate * 100).toFixed(2)}%`,
        whtType: whtInputData.procurementType || 'DEFAULT',
        whtTimestamp: new Date().toISOString(),
        whtIntegration: 'PERMANENT',
        
        // Calculate net payable after WHT
        netPayableAfterWHT: (whtInputData.amount - (calculation.wht || 0)),
        
        // Preserve original values for safety fallback
        originalWhtAmount: paymentData.whtAmount || 0,
        originalWhtRate: paymentData.whtRate || 0
      };
      
      console.log('[WHTIntegrationWrapper] ✓ Payment enhanced with WHT (PERMANENTLY INTEGRATED):', {
        originalAmount: whtInputData.amount,
        whtAmount: whtResult.whtAmount,
        netPayableAfterWHT: enhancedPayment.netPayableAfterWHT,
        calculationMethod: 'permanently_integrated',
        integration: 'PERMANENT'
      });
      
      return enhancedPayment;
      
    } catch (error) {
      console.error('[WHTIntegrationWrapper] Error enhancing payment with WHT:', error);
      
      // Return original payment data with error information
      return {
        ...paymentData,
        whtEnhanced: false,
        whtCalculationMethod: 'error',
        whtError: error.message,
        whtAmount: paymentData.whtAmount || 0,
        whtRate: paymentData.whtRate || 0
      };
    }
  }
  
  /**
   * Batch WHT enhancement for multiple payments
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Array} payments - Array of payment data
   * @param {Object} options - Integration options
   * @returns {Promise<Object>} - Batch enhancement result
   */
  static async enhanceBatchWithWHT(db, appId, payments, options = {}) {
    try {
      console.log('[WHTIntegrationWrapper] Enhancing batch with WHT:', payments.length, 'payments');
      
      // PERMANENTLY INTEGRATED - Always use enhanced WHT service
      console.log('[WHTIntegrationWrapper] Using permanently integrated enhanced WHT service for batch processing');
      
      const enhancedPayments = [];
      let enhancedCount = 0;
      let errorCount = 0;
      
      for (const payment of payments) {
        try {
          const enhancedPayment = await this.enhancePaymentWithWHT(db, appId, payment, options);
          enhancedPayments.push(enhancedPayment);
          
          if (enhancedPayment.whtEnhanced && !enhancedPayment.whtError) {
            enhancedCount++;
          } else if (enhancedPayment.whtError) {
            errorCount++;
          }
        } catch (error) {
          console.error('[WHTIntegrationWrapper] Error enhancing payment:', payment.id, error);
          enhancedPayments.push({
            ...payment,
            whtEnhanced: false,
            whtCalculationMethod: 'error',
            whtError: error.message
          });
          errorCount++;
        }
      }
      
      const summary = {
        totalPayments: payments.length,
        enhancedCount,
        errorCount,
        calculationMethod: 'enhanced',
        timestamp: new Date().toISOString()
      };
      
      console.log('[WHTIntegrationWrapper] ✓ Batch enhancement completed:', summary);
      
      return {
        payments: enhancedPayments,
        summary
      };
      
    } catch (error) {
      console.error('[WHTIntegrationWrapper] Error in batch enhancement:', error);
      throw error;
    }
  }
  
  /**
   * Wrapper for existing WHT calculation functions
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Function} originalWHTFunction - Original WHT calculation function
   * @param {Array} args - Arguments for the original function
   * @returns {Promise<Object>} - WHT calculation result
   */
  static async wrapWHTCalculation(db, appId, originalWHTFunction, ...args) {
    try {
      console.log('[WHTIntegrationWrapper] Wrapping WHT calculation function');
      
      // Check if enhanced WHT service is enabled
      if (!WHT_CONFIG.USE_ENHANCED_WHT_SERVICE) {
        console.log('[WHTIntegrationWrapper] Using original WHT calculation function');
        return await originalWHTFunction(...args);
      }
      
      // Extract payment data from arguments
      const paymentData = this.extractPaymentDataFromArgs(args);
      
      if (!paymentData) {
        console.warn('[WHTIntegrationWrapper] Could not extract payment data, using original function');
        return await originalWHTFunction(...args);
      }
      
      // Use enhanced WHT calculation
      const enhancedResult = await this.enhancePaymentWithWHT(db, appId, paymentData);
      
      // Format result to match original function output
      return this.formatResultForOriginalFunction(enhancedResult, originalWHTFunction.name);
      
    } catch (error) {
      console.error('[WHTIntegrationWrapper] Error in WHT calculation wrapper:', error);
      
      // Fallback to original function
      try {
        console.log('[WHTIntegrationWrapper] Falling back to original WHT calculation function');
        return await originalWHTFunction(...args);
      } catch (fallbackError) {
        console.error('[WHTIntegrationWrapper] Original function also failed:', fallbackError);
        throw error; // Throw original error
      }
    }
  }
  
  /**
   * Extract payment data from function arguments
   * @param {Array} args - Function arguments
   * @returns {Object|null} - Extracted payment data or null
   */
  static extractPaymentDataFromArgs(args) {
    try {
      // Look for payment data in common argument patterns
      for (const arg of args) {
        if (arg && typeof arg === 'object') {
          // Check if this looks like payment data
          if (arg.amount || arg.netPayable || arg.amountThisTransaction) {
            return arg;
          }
          
          // Check if it's an array of payments
          if (Array.isArray(arg) && arg.length > 0) {
            const firstPayment = arg[0];
            if (firstPayment && (firstPayment.amount || firstPayment.netPayable)) {
              return firstPayment;
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.warn('[WHTIntegrationWrapper] Error extracting payment data:', error);
      return null;
    }
  }
  
  /**
   * Format enhanced result to match original function output
   * @param {Object} enhancedResult - Enhanced WHT result
   * @param {string} originalFunctionName - Name of the original function
   * @returns {Object} - Formatted result
   */
  static formatResultForOriginalFunction(enhancedResult, originalFunctionName) {
    try {
      // Common formatting patterns based on function names
      switch (originalFunctionName.toLowerCase()) {
        case 'calculatewht':
        case 'calculatewithholdingtax':
          return {
            whtAmount: enhancedResult.whtAmount,
            whtRate: enhancedResult.whtRate,
            whtRatePercentage: enhancedResult.whtRatePercentage,
            whtType: enhancedResult.whtType,
            netPayable: enhancedResult.netPayableAfterWHT,
            calculationMethod: enhancedResult.whtCalculationMethod,
            enhanced: true
          };
          
        case 'processpayment':
        case 'finalizepayment':
          return {
            ...enhancedResult,
            // Ensure compatibility with existing payment processing
            whtAmount: enhancedResult.whtAmount,
            whtRate: enhancedResult.whtRate,
            netPayable: enhancedResult.netPayableAfterWHT
          };
          
        default:
          // Generic formatting
          return {
            ...enhancedResult,
            enhanced: true,
            originalFunction: originalFunctionName
          };
      }
    } catch (error) {
      console.error('[WHTIntegrationWrapper] Error formatting result:', error);
      return enhancedResult;
    }
  }
  
  /**
   * Validate integration compatibility
   * @param {Object} paymentData - Payment data to validate
   * @returns {Object} - Validation result
   */
  static validateIntegrationCompatibility(paymentData) {
    const validation = {
      isCompatible: true,
      warnings: [],
      errors: [],
      suggestions: []
    };
    
    try {
      // Check required fields
      if (!paymentData.amount && !paymentData.netPayable && !paymentData.amountThisTransaction) {
        validation.errors.push('Missing payment amount field');
        validation.isCompatible = false;
      }
      
      if (!paymentData.currency) {
        validation.warnings.push('Missing currency field - will default to GHS');
        validation.suggestions.push('Add currency field to payment data');
      }
      
      if (!paymentData.procurementType && !paymentData.whtType) {
        validation.warnings.push('Missing procurement type - will use DEFAULT');
        validation.suggestions.push('Add procurementType or whtType field');
      }
      
      // Check data types
      const amount = paymentData.amount || paymentData.netPayable || paymentData.amountThisTransaction;
      if (amount && typeof amount !== 'number') {
        validation.errors.push('Payment amount must be a number');
        validation.isCompatible = false;
      }
      
      // Check for potential conflicts
      if (paymentData.whtAmount && typeof paymentData.whtAmount === 'number' && paymentData.whtAmount > 0) {
        validation.warnings.push('Payment already has WHT amount - may be overwritten');
      }
      
    } catch (error) {
      validation.errors.push(`Validation error: ${error.message}`);
      validation.isCompatible = false;
    }
    
    return validation;
  }
  
  /**
   * Get integration status and statistics
   * @returns {Object} - Integration status
   */
  static getIntegrationStatus() {
    return {
      timestamp: new Date().toISOString(),
      enhancedWHTEnabled: WHT_CONFIG.USE_ENHANCED_WHT_SERVICE,
      dynamicRatesEnabled: WHT_CONFIG.USE_DYNAMIC_RATES,
      procurementManagerEnabled: WHT_CONFIG.ENABLE_PROCUREMENT_MANAGER,
      fallbackEnabled: WHT_CONFIG.FALLBACK_TO_HARDCODED,
      cacheEnabled: WHT_CONFIG.CACHE_PROCUREMENT_TYPES,
      status: WHT_CONFIG.USE_ENHANCED_WHT_SERVICE ? 'active' : 'inactive'
    };
  }
  
  /**
   * Test integration wrapper functionality
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @returns {Promise<Object>} - Test results
   */
  static async testIntegration(db, appId) {
    try {
      console.log('[WHTIntegrationWrapper] Testing integration wrapper...');
      
      const testResults = {
        timestamp: new Date().toISOString(),
        tests: [],
        summary: { passed: 0, failed: 0, total: 0 }
      };
      
      // Test 1: Single payment enhancement
      try {
        const testPayment = {
          id: 'test1',
          amount: 1000,
          currency: 'GHS',
          procurementType: 'SERVICES'
        };
        
        const result = await this.enhancePaymentWithWHT(db, appId, testPayment);
        
        if (result.whtEnhanced && result.whtAmount > 0) {
          testResults.tests.push({ name: 'Single Payment Enhancement', status: 'PASSED', details: result });
          testResults.summary.passed++;
        } else {
          testResults.tests.push({ name: 'Single Payment Enhancement', status: 'FAILED', details: result });
          testResults.summary.failed++;
        }
      } catch (error) {
        testResults.tests.push({ name: 'Single Payment Enhancement', status: 'ERROR', error: error.message });
        testResults.summary.failed++;
      }
      
      // Test 2: Batch enhancement
      try {
        const testPayments = [
          { id: 'test1', amount: 1000, currency: 'GHS', procurementType: 'SERVICES' },
          { id: 'test2', amount: 2000, currency: 'USD', procurementType: 'GOODS' }
        ];
        
        const result = await this.enhanceBatchWithWHT(db, appId, testPayments);
        
        if (result.payments.length === 2 && result.summary.totalPayments === 2) {
          testResults.tests.push({ name: 'Batch Enhancement', status: 'PASSED', details: result.summary });
          testResults.summary.passed++;
        } else {
          testResults.tests.push({ name: 'Batch Enhancement', status: 'FAILED', details: result.summary });
          testResults.summary.failed++;
        }
      } catch (error) {
        testResults.tests.push({ name: 'Batch Enhancement', status: 'ERROR', error: error.message });
        testResults.summary.failed++;
      }
      
      // Test 3: Integration compatibility validation
      try {
        const testPayment = { amount: 1000, currency: 'GHS', procurementType: 'SERVICES' };
        const validation = this.validateIntegrationCompatibility(testPayment);
        
        if (validation.isCompatible) {
          testResults.tests.push({ name: 'Compatibility Validation', status: 'PASSED', details: validation });
          testResults.summary.passed++;
        } else {
          testResults.tests.push({ name: 'Compatibility Validation', status: 'FAILED', details: validation });
          testResults.summary.failed++;
        }
      } catch (error) {
        testResults.tests.push({ name: 'Compatibility Validation', status: 'ERROR', error: error.message });
        testResults.summary.failed++;
      }
      
      testResults.summary.total = testResults.tests.length;
      
      console.log('[WHTIntegrationWrapper] ✓ Integration tests completed:', testResults.summary);
      return testResults;
      
    } catch (error) {
      console.error('[WHTIntegrationWrapper] Error testing integration:', error);
      return {
        timestamp: new Date().toISOString(),
        error: error.message,
        tests: [],
        summary: { passed: 0, failed: 0, total: 0 }
      };
    }
  }
}
