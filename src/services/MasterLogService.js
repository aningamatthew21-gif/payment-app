import { collection, addDoc, onSnapshot, query, orderBy, getDocs, doc, getDoc, serverTimestamp, where } from 'firebase/firestore';

/**
 * Master Log Service - Modernized version of VBA Master Log functionality
 * Handles logging of all finalized transactions with real-time updates
 */
export class MasterLogService {

  /**
   * Log a finalized transaction with comprehensive data matching VBA system
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Object} transactionData - Complete transaction data
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<string>} Transaction ID
   */
  static async logFinalizedTransaction(db, appId, transactionData, metadata = {}) {
    try {
      console.log('[MasterLogService] Logging finalized transaction with comprehensive data');
      console.log('[MasterLogService] Transaction data:', transactionData);
      console.log('[MasterLogService] Metadata:', metadata);
      console.log('[MasterLogService] AppId:', appId);

      // Generate unique transaction ID
      const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Calculate all the fields that VBA system collects
      const masterLogEntry = {
        // 1. Transaction Identification
        logTimestamp: serverTimestamp(),
        transactionID: transactionId,
        finalizationDate: new Date().toISOString().split('T')[0],
        sourceWeeklySheet: metadata.weeklySheetName || 'Unknown',
        originalSheetRow: transactionData.originalSheetRow || null,

        // 2. Invoice & Reference Data
        invoiceNo: transactionData.invoiceNo || transactionData.reference || 'N/A',
        originalInvoiceReference: transactionData.originalInvoiceReference || transactionData.reference || 'N/A',
        vendorName: transactionData.vendor || 'Unknown',
        description: transactionData.description || transactionData.descriptions || 'Payment',

        // 3. Budget & Financial Data
        budgetLine: transactionData.budgetLine || transactionData.budgetItem || 'Unknown',
        isPartialPayment: transactionData.isPartialPayment || false,
        paymentPercentage: transactionData.paymentPercentage || 100,
        thisPaymentPercentage: transactionData.thisPaymentPercentage || transactionData.paymentPercentage || 100,
        originalFullPreTax_Inv: this.calculateOriginalAmount(transactionData, 'pretaxAmount'),
        fullNetPayable_Inv: this.calculateOriginalAmount(transactionData, 'netPayable'),

        // 4. Transaction-Specific Amounts (This Transaction)
        preTax_ThisTx: Number(transactionData.pretaxAmount || transactionData.fullPretax || 0),
        whtType_ThisTx: transactionData.procurementType || 'STANDARD',
        whtRate_ThisTx: Number(transactionData.whtRate || 0),
        whtAmount_ThisTx: Number(transactionData.whtAmount || 0),
        levyAmount_ThisTx: Number(transactionData.levyAmount || 0),
        vatAmount_ThisTx: Number(transactionData.vatAmount || 0),
        moMoCharge_ThisTx: Number(transactionData.momoCharge || 0),
        subtotal_ThisTx: this.calculateSubtotal(transactionData),
        netPayable_ThisTx: Number(transactionData.netPayable || transactionData.amountThisTransaction || 0),

        // 5. Currency & Budget Impact
        currency_Tx: transactionData.currency || 'GHS',
        budgetImpactUSD_ThisTx: this.calculateBudgetImpactUSD(transactionData),

        // 6. Cumulative Payment Tracking
        total_amount: Number(transactionData.total_amount || 0),
        paid_amount: Number(transactionData.paid_amount || 0),
        cumulativePaidAmount: Number(transactionData.cumulativePaidAmount || transactionData.paid_amount || 0),
        remainingAmount: Number(transactionData.remainingAmount || 0),

        // 7. Payment & Status Information
        bankPaidFrom: metadata.bankAccount || 'Default Bank',
        paymentMode_Tx: metadata.paymentMode || 'Transfer',
        userFinalized: metadata.userId || 'system',
        manualStatusAtFinalization: metadata.manualStatus || 'Finalized',
        scheduleArchiveRef: metadata.archiveReference || 'N/A',

        // 8. Additional Metadata
        fxRate: Number(transactionData.fxRate || 1),
        weeklySheetId: metadata.weeklySheetId || null,
        voucherId: metadata.voucherId || null,
        batchId: metadata.batchId || null,

        // 9. Timestamps
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      console.log('[MasterLogService] Master log entry prepared:', masterLogEntry);

      // Use the correct collection path
      const collectionPath = `artifacts/${appId}/public/data/masterLog`;
      console.log('[MasterLogService] Using collection path:', collectionPath);
      const docRef = await addDoc(collection(db, collectionPath), masterLogEntry);
      console.log('[MasterLogService] Transaction logged to collection:', docRef.id);

      return transactionId;

    } catch (error) {
      console.error('[MasterLogService] Error logging finalized transaction:', error);
      throw new Error(`Failed to log transaction: ${error.message}`);
    }
  }

  /**
   * Calculate original amount for partial payments
   * @param {Object} transactionData - Transaction data
   * @param {string} fieldName - Field to calculate
   * @returns {number} Original amount
   */
  static calculateOriginalAmount(transactionData, fieldName) {
    if (transactionData.isPartialPayment && transactionData.paymentPercentage < 100) {
      // For partial payments, calculate original amount
      const currentAmount = Number(transactionData[fieldName] || 0);
      const percentage = Number(transactionData.paymentPercentage || 100);
      return (currentAmount / percentage) * 100;
    } else {
      // For full payments, return current amount
      return Number(transactionData[fieldName] || 0);
    }
  }

  /**
   * Calculate subtotal for this transaction
   * @param {Object} transactionData - Transaction data
   * @returns {number} Subtotal amount
   */
  static calculateSubtotal(transactionData) {
    const preTax = Number(transactionData.pretaxAmount || transactionData.fullPretax || 0);
    const whtAmount = Number(transactionData.whtAmount || 0);
    const levyAmount = Number(transactionData.levyAmount || 0);

    return preTax - whtAmount + levyAmount;
  }

  /**
   * Calculate budget impact in USD
   * @param {Object} transactionData - Transaction data
   * @returns {number} Budget impact in USD
   */
  static calculateBudgetImpactUSD(transactionData) {
    const netPayable = Number(transactionData.netPayable || transactionData.amountThisTransaction || 0);
    const currency = transactionData.currency || 'GHS';
    const fxRate = Number(transactionData.fxRate || 1);

    if (currency === 'USD') {
      return netPayable;
    } else if (currency === 'GHS' && fxRate > 0) {
      return netPayable / fxRate;
    } else {
      // Fallback: assume 1:1 if no FX rate
      return netPayable;
    }
  }

  /**
   * Log multiple finalized transactions in a batch
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Array} transactions - Array of transaction data
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Array>} Array of transaction IDs
   */
  static async logFinalizedTransactionBatch(db, appId, transactions, metadata = {}) {
    try {
      console.log(`[MasterLogService] Logging batch of ${transactions.length} transactions`);
      console.log('[MasterLogService] Batch metadata:', metadata);
      console.log('[MasterLogService] First transaction sample:', transactions[0]);

      const transactionIds = [];

      for (const transaction of transactions) {
        console.log('[MasterLogService] Processing transaction:', transaction.id || 'no-id');
        const transactionId = await this.logFinalizedTransaction(db, appId, transaction, metadata);
        transactionIds.push(transactionId);
        console.log('[MasterLogService] Transaction processed, ID:', transactionId);
      }

      console.log(`[MasterLogService] Successfully logged ${transactionIds.length} transactions`);
      return transactionIds;

    } catch (error) {
      console.error('[MasterLogService] Error logging transaction batch:', error);
      throw new Error(`Failed to log transaction batch: ${error.message}`);
    }
  }

  /**
   * Subscribe to master log entries with real-time updates
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Function} callback - Callback function for updates
   * @param {Object} filters - Optional filters
   * @returns {Function} Unsubscribe function
   */
  static subscribeToMasterLog(db, appId, callback, filters = {}) {
    try {
      let q = collection(db, `artifacts/${appId}/public/data/masterLog`);

      // Apply filters
      if (filters.budgetLine) {
        q = query(q, where('budgetLine', '==', filters.budgetLine));
      }
      if (filters.vendor) {
        q = query(q, where('vendorName', '==', filters.vendor));
      }
      if (filters.dateFrom) {
        q = query(q, where('finalizationDate', '>=', filters.dateFrom));
      }
      if (filters.dateTo) {
        q = query(q, where('finalizationDate', '<=', filters.dateTo));
      }

      // Order by timestamp
      q = query(q, orderBy('logTimestamp', 'desc'));

      return onSnapshot(q, (snapshot) => {
        const entries = [];
        snapshot.forEach(doc => {
          entries.push({ id: doc.id, ...doc.data() });
        });
        callback(entries);
      }, (error) => {
        console.error('[MasterLogService] Error subscribing to master log:', error);
        callback([]);
      });

    } catch (error) {
      console.error('[MasterLogService] Error setting up master log subscription:', error);
      callback([]);
    }
  }

  /**
   * Get master log entries with optional filtering
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} Array of master log entries
   */
  static async getMasterLogEntries(db, appId, filters = {}) {
    try {
      let q = collection(db, `artifacts/${appId}/public/data/masterLog`);

      // Apply filters
      if (filters.budgetLine) {
        q = query(q, where('budgetLine', '==', filters.budgetLine));
      }
      if (filters.vendor) {
        q = query(q, where('vendorName', '==', filters.vendor));
      }
      if (filters.dateFrom) {
        q = query(q, where('finalizationDate', '>=', filters.dateFrom));
      }
      if (filters.dateTo) {
        q = query(q, where('finalizationDate', '<=', filters.dateTo));
      }

      // Order by timestamp
      q = query(q, orderBy('logTimestamp', 'desc'));

      const snapshot = await getDocs(q);
      const entries = [];
      snapshot.forEach(doc => {
        entries.push({ id: doc.id, ...doc.data() });
      });

      return entries;

    } catch (error) {
      console.error('[MasterLogService] Error getting master log entries:', error);
      return [];
    }
  }

  /**
   * Get detailed information for a specific master log entry
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} entryId - Master log entry ID
   * @returns {Promise<Object>} Master log entry details
   */
  static async getMasterLogDetails(db, appId, entryId) {
    try {
      const docRef = doc(db, `artifacts/${appId}/public/data/masterLog`, entryId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      } else {
        throw new Error('Master log entry not found');
      }

    } catch (error) {
      console.error('[MasterLogService] Error getting master log details:', error);
      throw new Error(`Failed to get master log details: ${error.message}`);
    }
  }

  /**
   * Test function to verify Master Log service functionality
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @returns {Promise<Object>} Test results
   */
  static async testMasterLogService(db, appId) {
    console.log('[MasterLogService] Testing Master Log service functionality...');

    try {
      // Test 1: Collection access
      const { collection, getDocs, query, orderBy } = await import('firebase/firestore');
      const masterLogCollection = collection(db, `artifacts/${appId}/public/data/masterLog`);
      console.log('[MasterLogService] ✓ Collection reference created');

      // Test 2: Query documents
      const q = query(masterLogCollection, orderBy('logTimestamp', 'desc'));
      const snapshot = await getDocs(q);
      console.log(`[MasterLogService] ✓ Documents retrieved: ${snapshot.size}`);

      // Test 3: Service methods
      const entries = await this.getMasterLogEntries(db, appId);
      console.log(`[MasterLogService] ✓ getMasterLogEntries returned: ${entries.length} entries`);

      if (entries.length > 0) {
        console.log('[MasterLogService] ✓ Sample entry structure:', entries[0]);
      }

      return {
        success: true,
        collectionAccess: true,
        documentCount: snapshot.size,
        serviceEntries: entries.length,
        sampleEntry: entries[0] || null
      };

    } catch (error) {
      console.error('[MasterLogService] ✗ Test failed:', error);
      return {
        success: false,
        error: error.message,
        code: error.code,
        stack: error.stack
      };
    }
  }

  /**
   * Get summary statistics for master log
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Object} filters - Optional filters
   * @returns {Promise<Object>} Summary statistics
   */
  static async getMasterLogSummary(db, appId, filters = {}) {
    try {
      const entries = await this.getMasterLogEntries(db, appId, filters);

      const summary = {
        totalTransactions: entries.length,
        totalAmount: 0,
        totalBudgetImpactUSD: 0,
        uniqueVendors: new Set(),
        uniqueBudgetLines: new Set(),
        partialPayments: 0,
        fullPayments: 0,
        currencyBreakdown: {},
        budgetLineBreakdown: {}
      };

      entries.forEach(entry => {
        // Total amounts
        summary.totalAmount += Number(entry.netPayable_ThisTx || 0);
        summary.totalBudgetImpactUSD += Number(entry.budgetImpactUSD_ThisTx || 0);

        // Unique counts
        summary.uniqueVendors.add(entry.vendorName);
        summary.uniqueBudgetLines.add(entry.budgetLine);

        // Payment type counts
        if (entry.isPartialPayment) {
          summary.partialPayments++;
        } else {
          summary.fullPayments++;
        }

        // Currency breakdown
        const currency = entry.currency_Tx || 'Unknown';
        if (!summary.currencyBreakdown[currency]) {
          summary.currencyBreakdown[currency] = 0;
        }
        summary.currencyBreakdown[currency] += Number(entry.netPayable_ThisTx || 0);

        // Budget line breakdown
        const budgetLine = entry.budgetLine || 'Unknown';
        if (!summary.budgetLineBreakdown[budgetLine]) {
          summary.budgetLineBreakdown[budgetLine] = 0;
        }
        summary.budgetLineBreakdown[budgetLine] += Number(entry.budgetImpactUSD_ThisTx || 0);
      });

      // Convert Sets to counts
      summary.uniqueVendorsCount = summary.uniqueVendors.size;
      summary.uniqueBudgetLinesCount = summary.uniqueBudgetLines.size;
      summary.uniqueVendors = Array.from(summary.uniqueVendors);
      summary.uniqueBudgetLines = Array.from(summary.uniqueBudgetLines);

      return summary;

    } catch (error) {
      console.error('[MasterLogService] Error getting master log summary:', error);
      throw new Error(`Failed to get master log summary: ${error.message}`);
    }
  }
}
