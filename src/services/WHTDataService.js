import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';

/**
 * WHT Data Service - Extracts WHT data from existing masterLog collection
 * This approach reuses existing data instead of creating new collections
 */
export class WHTDataService {
  
  /**
   * Get WHT entries from existing master log data
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} Array of WHT entries
   */
  static async getWHTEntriesFromMasterLog(db, appId, filters = {}) {
    try {
      console.log('[WHTDataService] Extracting WHT data from master log...');
      
      // Get master log entries
      const masterLogRef = collection(db, `artifacts/${appId}/public/data/masterLog`);
      let q = query(masterLogRef, orderBy('logTimestamp', 'desc'));
      
      // Apply filters
      if (filters.year) {
        q = query(q, where('finalizationDate', '>=', `${filters.year}-01-01`));
        q = query(q, where('finalizationDate', '<=', `${filters.year}-12-31`));
      }
      if (filters.vendor) {
        q = query(q, where('vendorName', '==', filters.vendor));
      }
      if (filters.status) {
        q = query(q, where('manualStatusAtFinalization', '==', filters.status));
      }
      
      const snapshot = await getDocs(q);
      const whtEntries = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        
        // Only include entries that have WHT data
        if (data.whtAmount_ThisTx && data.whtAmount_ThisTx > 0) {
          whtEntries.push({
            id: doc.id,
            vendor: data.vendorName || 'Unknown',
            invoiceNo: data.invoiceNo || 'N/A',
            description: data.description || 'Payment',
            pretaxAmount: data.preTax_ThisTx || 0,
            whtRate: data.whtRate_ThisTx || 0,
            whtAmount: data.whtAmount_ThisTx || 0,
            procurementType: data.whtType_ThisTx || 'STANDARD',
            currency: data.currency_Tx || 'GHS',
            fxRate: data.fxRate || 1,
            budgetLine: data.budgetLine || 'Unknown',
            taxPeriod: this.getTaxPeriod(data.finalizationDate),
            year: new Date(data.finalizationDate).getFullYear(),
            status: data.manualStatusAtFinalization || 'Finalized',
            batchId: data.batchId || null,
            createdAt: data.logTimestamp || data.createdAt,
            finalizationDate: data.finalizationDate
          });
        }
      });
      
      console.log(`[WHTDataService] Extracted ${whtEntries.length} WHT entries from master log`);
      return whtEntries;
      
    } catch (error) {
      console.error('[WHTDataService] Error extracting WHT data from master log:', error);
      throw error;
    }
  }
  
  /**
   * Get WHT batch summaries from master log data
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @returns {Promise<Array>} Array of batch summaries
   */
  static async getWHTBatchSummariesFromMasterLog(db, appId) {
    try {
      console.log('[WHTDataService] Generating WHT batch summaries from master log...');
      
      const whtEntries = await this.getWHTEntriesFromMasterLog(db, appId);
      
      // Group by batch
      const batchGroups = {};
      whtEntries.forEach(entry => {
        const batchId = entry.batchId || 'NO_BATCH';
        if (!batchGroups[batchId]) {
          batchGroups[batchId] = [];
        }
        batchGroups[batchId].push(entry);
      });
      
      // Create batch summaries
      const batchSummaries = Object.entries(batchGroups).map(([batchId, entries]) => {
        const totalWHT = entries.reduce((sum, entry) => sum + (entry.whtAmount || 0), 0);
        const totalPretax = entries.reduce((sum, entry) => sum + (entry.pretaxAmount || 0), 0);
        const uniqueVendors = [...new Set(entries.map(entry => entry.vendor))];
        
        return {
          id: batchId,
          batchId,
          totalEntries: entries.length,
          totalWHTAmount: totalWHT,
          totalPretaxAmount: totalPretax,
          vendorCount: uniqueVendors.length,
          vendors: uniqueVendors,
          status: entries[0]?.status || 'Finalized',
          createdAt: entries[0]?.createdAt || new Date(),
          finalizationDate: entries[0]?.finalizationDate || new Date().toISOString().split('T')[0]
        };
      });
      
      console.log(`[WHTDataService] Generated ${batchSummaries.length} batch summaries`);
      return batchSummaries;
      
    } catch (error) {
      console.error('[WHTDataService] Error generating batch summaries:', error);
      throw error;
    }
  }
  
  /**
   * Get WHT statistics from master log data
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {number} year - Year to get statistics for
   * @returns {Promise<Object>} WHT statistics
   */
  static async getWHTStatisticsFromMasterLog(db, appId, year) {
    try {
      console.log(`[WHTDataService] Getting WHT statistics for year ${year}...`);
      
      const whtEntries = await this.getWHTEntriesFromMasterLog(db, appId, { year });
      
      const stats = {
        totalEntries: whtEntries.length,
        totalWHTAmount: whtEntries.reduce((sum, entry) => sum + (entry.whtAmount || 0), 0),
        totalPretaxAmount: whtEntries.reduce((sum, entry) => sum + (entry.pretaxAmount || 0), 0),
        averageWHTRate: 0,
        vendorCount: new Set(whtEntries.map(entry => entry.vendor)).size,
        procurementTypeBreakdown: {},
        monthlyBreakdown: {},
        year
      };
      
      // Calculate average WHT rate
      const entriesWithRate = whtEntries.filter(entry => entry.whtRate > 0);
      if (entriesWithRate.length > 0) {
        stats.averageWHTRate = entriesWithRate.reduce((sum, entry) => sum + entry.whtRate, 0) / entriesWithRate.length;
      }
      
      // Procurement type breakdown
      whtEntries.forEach(entry => {
        const type = entry.procurementType || 'UNKNOWN';
        if (!stats.procurementTypeBreakdown[type]) {
          stats.procurementTypeBreakdown[type] = {
            count: 0,
            totalAmount: 0,
            totalWHT: 0
          };
        }
        stats.procurementTypeBreakdown[type].count++;
        stats.procurementTypeBreakdown[type].totalAmount += entry.pretaxAmount || 0;
        stats.procurementTypeBreakdown[type].totalWHT += entry.whtAmount || 0;
      });
      
      // Monthly breakdown
      whtEntries.forEach(entry => {
        const month = new Date(entry.finalizationDate).getMonth();
        const monthName = new Date(2024, month).toLocaleString('default', { month: 'long' });
        
        if (!stats.monthlyBreakdown[monthName]) {
          stats.monthlyBreakdown[monthName] = {
            count: 0,
            totalAmount: 0,
            totalWHT: 0
          };
        }
        stats.monthlyBreakdown[monthName].count++;
        stats.monthlyBreakdown[monthName].totalAmount += entry.pretaxAmount || 0;
        stats.monthlyBreakdown[monthName].totalWHT += entry.whtAmount || 0;
      });
      
      console.log(`[WHTDataService] Generated statistics for ${year}:`, stats);
      return stats;
      
    } catch (error) {
      console.error('[WHTDataService] Error getting WHT statistics:', error);
      throw error;
    }
  }
  
  /**
   * Get tax period from date (month of finalization)
   * @param {string} dateString - Date string
   * @returns {string} Tax period (month name and year)
   */
  static getTaxPeriod(dateString) {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    const monthName = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();
    
    return `${monthName} ${year}`;
  }
}
