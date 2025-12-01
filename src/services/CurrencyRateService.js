/**
 * Currency Rate Service
 * Manages dynamic currency exchange rates for the payment system
 */

import { collection, query, where, orderBy, limit, getDocs, addDoc } from 'firebase/firestore';

class CurrencyRateService {
  constructor() {
    this.rates = new Map();
    this.lastUpdate = null;
    this.updateInterval = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Get the appropriate exchange rate for a currency
   * @param {string} currency - Currency code (GHS, USD, EUR, etc.)
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @returns {Promise<number>} - Exchange rate
   */
  static async getExchangeRate(currency, db, appId) {
    try {
      // For GHS (local currency), rate is always 1
      if (currency === 'GHS' || currency === 'GHC') {
        return 1;
      }

      // For USD, try to get from database or use default
      if (currency === 'USD') {
        const rate = await this.getUSDExchangeRate(db, appId);
        return rate;
      }

      // For other currencies, try to get from database
      const rate = await this.getCurrencyRateFromDB(db, appId, currency);
      if (rate) {
        return rate;
      }

      // Fallback: try to get from external API or use reasonable defaults
      return await this.getExternalExchangeRate(currency);
    } catch (error) {
      console.error(`[CurrencyRateService] Error getting exchange rate for ${currency}:`, error);
      // Return reasonable fallback rates
      return this.getFallbackRate(currency);
    }
  }

  /**
   * Get USD exchange rate from database
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @returns {Promise<number>} - USD exchange rate
   */
  static async getUSDExchangeRate(db, appId) {
    try {
      // Try to get from currency rates collection
      const ratesRef = collection(db, `artifacts/${appId}/public/data/currencyRates`);
      const usdQuery = query(ratesRef, where('currency', '==', 'USD'), orderBy('timestamp', 'desc'), limit(1));
      const snapshot = await getDocs(usdQuery);
      
      if (!snapshot.empty) {
        const rateData = snapshot.docs[0].data();
        console.log(`[CurrencyRateService] Found USD rate in DB: ${rateData.rate}`);
        return parseFloat(rateData.rate);
      }

      // If no rate in DB, try to get from master log (historical data)
      const masterLogRef = collection(db, `artifacts/${appId}/public/data/masterLog`);
      const masterLogQuery = query(
        masterLogRef, 
        where('currency', '==', 'USD'), 
        where('fxRate', '>', 0),
        orderBy('fxRate', 'desc'),
        limit(10)
      );
      const masterLogSnapshot = await getDocs(masterLogQuery);
      
      if (!masterLogSnapshot.empty) {
        // Calculate average rate from recent transactions
        const rates = masterLogSnapshot.docs.map(doc => parseFloat(doc.data().fxRate)).filter(rate => rate > 0);
        if (rates.length > 0) {
          const avgRate = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
          console.log(`[CurrencyRateService] Calculated USD rate from master log: ${avgRate}`);
          return avgRate;
        }
      }

      // If still no rate, use a reasonable default based on current market
      console.log('[CurrencyRateService] No USD rate found, using default');
      return 10.25; // Default USD to GHS rate
    } catch (error) {
      console.error('[CurrencyRateService] Error getting USD rate from DB:', error);
      return 10.25; // Fallback rate
    }
  }

  /**
   * Get currency rate from database
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} currency - Currency code
   * @returns {Promise<number|null>} - Exchange rate or null if not found
   */
  static async getCurrencyRateFromDB(db, appId, currency) {
    try {
      const ratesRef = collection(db, `artifacts/${appId}/public/data/currencyRates`);
      const currencyQuery = query(ratesRef, where('currency', '==', currency), orderBy('timestamp', 'desc'), limit(1));
      const snapshot = await getDocs(currencyQuery);
      
      if (!snapshot.empty) {
        const rateData = snapshot.docs[0].data();
        return parseFloat(rateData.rate);
      }
      
      return null;
    } catch (error) {
      console.error(`[CurrencyRateService] Error getting ${currency} rate from DB:`, error);
      return null;
    }
  }

  /**
   * Get exchange rate from external API (placeholder for future implementation)
   * @param {string} currency - Currency code
   * @returns {Promise<number>} - Exchange rate
   */
  static async getExternalExchangeRate(currency) {
    // TODO: Implement external API integration (e.g., Fixer.io, ExchangeRate-API)
    // For now, return reasonable defaults
    console.log(`[CurrencyRateService] External API not implemented, using default for ${currency}`);
    return this.getFallbackRate(currency);
  }

  /**
   * Get fallback exchange rate for a currency
   * @param {string} currency - Currency code
   * @returns {number} - Fallback exchange rate
   */
  static getFallbackRate(currency) {
    const fallbackRates = {
      'USD': 10.25,    // 1 USD = 10.25 GHS
      'EUR': 11.50,    // 1 EUR = 11.50 GHS
      'GBP': 13.00,    // 1 GBP = 13.00 GHS
      'CAD': 7.50,     // 1 CAD = 7.50 GHS
      'AUD': 6.75,     // 1 AUD = 6.75 GHS
      'GHS': 1,        // 1 GHS = 1 GHS
      'GHC': 1         // 1 GHC = 1 GHS
    };
    
    return fallbackRates[currency] || 1;
  }

  /**
   * Update exchange rate in database
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} currency - Currency code
   * @param {number} rate - Exchange rate
   * @param {string} source - Source of the rate (manual, api, etc.)
   * @returns {Promise<void>}
   */
  static async updateExchangeRate(db, appId, currency, rate, source = 'manual') {
    try {
      const ratesRef = collection(db, `artifacts/${appId}/public/data/currencyRates`);
      const rateData = {
        currency,
        rate: parseFloat(rate),
        source,
        timestamp: new Date().toISOString(),
        updatedBy: 'system'
      };
      
      await addDoc(ratesRef, rateData);
      console.log(`[CurrencyRateService] Updated ${currency} rate to ${rate}`);
    } catch (error) {
      console.error(`[CurrencyRateService] Error updating ${currency} rate:`, error);
      throw error;
    }
  }

  /**
   * Get all available currency rates
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @returns {Promise<Array>} - Array of currency rates
   */
  static async getAllRates(db, appId) {
    try {
      const ratesRef = collection(db, `artifacts/${appId}/public/data/currencyRates`);
      const snapshot = await getDocs(ratesRef);
      
      const rates = [];
      snapshot.forEach(doc => {
        rates.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return rates;
    } catch (error) {
      console.error('[CurrencyRateService] Error getting all rates:', error);
      return [];
    }
  }

  /**
   * Validate if an exchange rate is reasonable
   * @param {string} currency - Currency code
   * @param {number} rate - Exchange rate
   * @returns {boolean} - True if rate is reasonable
   */
  static validateRate(currency, rate) {
    if (!rate || rate <= 0) return false;
    
    const reasonableRanges = {
      'USD': { min: 5, max: 20 },      // USD to GHS: 5-20
      'EUR': { min: 6, max: 25 },      // EUR to GHS: 6-25
      'GBP': { min: 7, max: 30 },      // GBP to GHS: 7-30
      'CAD': { min: 4, max: 15 },      // CAD to GHS: 4-15
      'AUD': { min: 3, max: 12 },      // AUD to GHS: 3-12
      'GHS': { min: 1, max: 1 },       // GHS to GHS: 1
      'GHC': { min: 1, max: 1 }        // GHC to GHS: 1
    };
    
    const range = reasonableRanges[currency];
    if (!range) return true; // Unknown currency, accept any positive rate
    
    return rate >= range.min && rate <= range.max;
  }
}

export default CurrencyRateService;
