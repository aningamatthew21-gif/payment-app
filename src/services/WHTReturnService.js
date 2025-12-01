import { collection, addDoc, query, orderBy, onSnapshot, where, getDocs, doc, updateDoc, serverTimestamp, setDoc } from 'firebase/firestore';

/**
 * WHT Return Service - Modernized version of VBA WHT Return functionality
 * Handles creation and management of WHT return sheets
 */
export class WHTReturnService {

  /**
   * Create WHT return entries for a batch of payments
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Array} payments - Array of finalized payments
   * @param {string} batchId - Batch ID for grouping
   * @param {string} userId - User who finalized the batch
   * @returns {Promise<Object>} - Result with WHT entries created
   */
  static async createWHTReturnEntries(db, appId, payments, batchId, userId) {
    try {
      console.log('[WHTReturnService] Creating WHT return entries for batch:', batchId);

      // Filter payments that have WHT amounts AND are in GHS/GHC currency
      const whtPayments = payments.filter(payment => {
        const currency = (payment.currency || 'GHS').toUpperCase();
        const isGHS = currency === 'GHS' || currency === 'GHC';
        const hasWhtAmount = (payment.whtAmount || 0) > 0;
        const hasProcurementType = payment.procurementType && payment.procurementType.trim() !== '';
        const hasWhtRate = payment.whtRate && payment.whtRate > 0;

        const isValid = isGHS && hasWhtAmount && hasProcurementType && hasWhtRate;
        
        if (!isValid && hasWhtAmount) {
          console.log(`[WHTReturnService] Skipping payment ${payment.id}:`, {
            currency,
            isGHS,
            hasWhtAmount,
            hasProcurementType,
            hasWhtRate
          });
        }

        return isValid;
      });

      if (whtPayments.length === 0) {
        console.log('[WHTReturnService] No WHT payments found in batch');
        return {
          success: true,
          whtEntriesCreated: 0,
          message: 'No WHT payments found in batch'
        };
      }

      console.log(`[WHTReturnService] Found ${whtPayments.length} payments with WHT`);

      const whtEntries = [];
      const timestamp = new Date();

      // Create WHT return entries
      for (const payment of whtPayments) {
        // ✅ FIXED: Add validation check for payment object
        if (!payment || !payment.id) {
          console.error("Skipping WHT entry for invalid payment object:", payment);
          continue; // Skip this payment and continue with the next one
        }

        try {
          // Use the WHT rate directly from the payment data
          const whtRate = payment.whtRate || 0;
          const procurementName = payment.procurementType || 'UNKNOWN';
          const taxType = procurementName; // Using procurement type as tax type for now

          // New Schema Implementation
          const whtEntry = {
            // Core IDs
            batchId,
            paymentId: payment.id,
            transaction_id: payment.id, // FK to payment
            vendor_id: payment.vendorId || null, // FK to vendor if available

            // Tax Details
            tax_type: taxType,
            tax_base_amount: Number(payment.pretaxAmount || payment.amount || 0),
            tax_rate: Number(whtRate), // Stored as decimal (e.g., 0.05 for 5%)
            whtRate: Number(whtRate), // UI compatibility field (same as tax_rate)
            whtRatePercentage: Number(whtRate) * 100, // Percentage for display (e.g., 5.0 for 5%)
            tax_amount: Number(payment.whtAmount || 0),

            // Metadata
            vendor: payment.vendor,
            invoiceNo: payment.reference || payment.invoiceNo,
            description: payment.description,
            procurementType: procurementName,
            currency: payment.currency || 'GHS',
            fxRate: payment.fxRate || null,
            budgetLine: payment.budgetLine || payment.budgetItem,
            weeklySheetId: payment.weeklySheetId,

            // Status & Audit
            status: 'filed', // filed | pending | failed
            filing_date: timestamp,
            filed_by: userId,
            createdBy: userId,
            createdAt: timestamp,

            // Tax Period
            taxPeriod: this.getTaxPeriod(timestamp),
            year: timestamp.getFullYear(),

            // Source Payload Snapshot for Audit
            source_payload: {
              original_payment_id: payment.id,
              original_amount: payment.amount,
              original_wht_amount: payment.whtAmount,
              calculation_basis: 'pretax_amount * wht_rate'
            }
          };

          // Deterministic ID for duplicate prevention: WHT-{paymentId}-{taxType}
          // Sanitize IDs to ensure valid document ID
          const safePaymentId = payment.id.replace(/[^a-zA-Z0-9-_]/g, '_');
          const safeTaxType = taxType.replace(/[^a-zA-Z0-9-_]/g, '_');
          const docId = `WHT-${safePaymentId}-${safeTaxType}`;

          // Store in Firestore - try primary path first, fallback to public data path
          let whtReturnRef;
          let docRef;

          try {
            // Use setDoc with merge: true for upsert behavior (idempotency)
            const docPath = `artifacts/${appId}/whtReturns/${docId}`;
            docRef = doc(db, `artifacts/${appId}/whtReturns`, docId);
            await setDoc(docRef, whtEntry, { merge: true });
            console.log(`[WHTReturnService] WHT entry upserted: ${docId}`);
          } catch (error) {
            console.log('[WHTReturnService] Primary path failed, using fallback path');
            const docIdFallback = `WHT-${safePaymentId}-${safeTaxType}`;
            docRef = doc(db, `artifacts/${appId}/public/data/whtReturns`, docIdFallback);
            await setDoc(docRef, whtEntry, { merge: true });
            console.log(`[WHTReturnService] WHT entry upserted (fallback): ${docIdFallback}`);
          }

          whtEntries.push({
            id: docRef.id,
            ...whtEntry
          });

          console.log(`[WHTReturnService] WHT entry created for payment ${payment.id}:`, docRef.id);

        } catch (paymentError) {
          console.error(`[WHTReturnService] Error creating WHT entry for payment ${payment.id}:`, paymentError);
        }
      }

      // Create batch summary
      if (whtEntries.length > 0) {
        const batchSummary = {
          batchId,
          totalEntries: whtEntries.length,
          totalWHTAmount: whtEntries.reduce((sum, entry) => sum + entry.whtAmount, 0),
          currency: whtEntries[0]?.currency || 'GHS',
          createdBy: userId,
          createdAt: timestamp,
          status: 'pending',
          entries: whtEntries.map(entry => ({
            id: entry.id,
            vendor: entry.vendor,
            whtAmount: entry.whtAmount
          }))
        };

        // Try primary path first, fallback to public data path if permission denied
        let summaryRef;
        try {
          summaryRef = collection(db, `artifacts/${appId}/whtBatchSummaries`);
          await addDoc(summaryRef, batchSummary);
        } catch (error) {
          console.log('[WHTReturnService] Primary path failed, using fallback path for batch summary');
          summaryRef = collection(db, `artifacts/${appId}/public/data/whtBatchSummaries`);
          await addDoc(summaryRef, batchSummary);
        }

        console.log(`[WHTReturnService] WHT batch summary created for batch ${batchId}`);
      }

      return {
        success: true,
        whtEntriesCreated: whtEntries.length,
        whtEntries: whtEntries,
        totalWHTAmount: whtEntries.reduce((sum, entry) => sum + entry.whtAmount, 0),
        message: `Successfully created ${whtEntries.length} WHT return entries`
      };

    } catch (error) {
      console.error('[WHTReturnService] Error creating WHT return entries:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to create WHT return entries'
      };
    }
  }

  /**
   * Get real-time WHT return entries
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Function} callback - Callback function for real-time updates
   * @returns {Function} - Unsubscribe function
   */
  static subscribeToWHTReturns(db, appId, callback) {
    try {
      // Try primary path first, fallback to public data path if permission denied
      let whtReturnRef;
      try {
        whtReturnRef = collection(db, `artifacts/${appId}/whtReturns`);
      } catch (error) {
        console.log('[WHTReturnService] Primary path failed, using fallback path');
        whtReturnRef = collection(db, `artifacts/${appId}/public/data/whtReturns`);
      }

      const q = query(whtReturnRef, orderBy('createdAt', 'desc'));

      return onSnapshot(q, (snapshot) => {
        const whtEntries = [];
        snapshot.forEach(doc => {
          whtEntries.push({
            id: doc.id,
            ...doc.data()
          });
        });

        callback(whtEntries);
      }, (error) => {
        console.error('[WHTReturnService] Error subscribing to WHT returns:', error);
        // Try fallback path on error
        try {
          const fallbackRef = collection(db, `artifacts/${appId}/public/data/whtReturns`);
          const fallbackQ = query(fallbackRef, orderBy('createdAt', 'desc'));

          return onSnapshot(fallbackQ, (fallbackSnapshot) => {
            const fallbackEntries = [];
            fallbackSnapshot.forEach(doc => {
              fallbackEntries.push({
                id: doc.id,
                ...doc.data()
              });
            });
            callback(fallbackEntries);
          }, (fallbackError) => {
            console.error('[WHTReturnService] Fallback path also failed:', fallbackError);
            callback([]);
          });
        } catch (fallbackError) {
          console.error('[WHTReturnService] Failed to set up fallback subscription:', fallbackError);
          callback([]);
        }
      });

    } catch (error) {
      console.error('[WHTReturnService] Error setting up WHT return subscription:', error);
      callback([]);
      return () => { }; // Return empty unsubscribe function
    }
  }

  /**
   * Get WHT return entries with filtering
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} - Array of WHT return entries
   */
  static async getWHTReturnEntries(db, appId, filters = {}) {
    try {
      // Try primary path first, fallback to public data path if permission denied
      let whtReturnRef;
      try {
        whtReturnRef = collection(db, `artifacts/${appId}/whtReturns`);
      } catch (error) {
        console.log('[WHTReturnService] Primary path failed, using fallback path');
        whtReturnRef = collection(db, `artifacts/${appId}/public/data/whtReturns`);
      }
      let q = query(whtReturnRef, orderBy('createdAt', 'desc'));

      // Apply filters if provided
      if (filters.status) {
        q = query(q, where('status', '==', filters.status));
      }
      if (filters.batchId) {
        q = query(q, where('batchId', '==', filters.batchId));
      }
      if (filters.year) {
        q = query(q, where('year', '==', filters.year));
      }
      if (filters.vendor) {
        q = query(q, where('vendor', '==', filters.vendor));
      }

      const snapshot = await getDocs(q);
      const entries = [];
      snapshot.forEach(doc => {
        entries.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return entries;

    } catch (error) {
      console.error('[WHTReturnService] Error getting WHT return entries:', error);
      return [];
    }
  }

  /**
   * Get WHT batch summaries
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @returns {Promise<Array>} - Array of WHT batch summaries
   */
  static async getWHTBatchSummaries(db, appId) {
    try {
      // Try primary path first, fallback to public data path if permission denied
      let summaryRef;
      try {
        summaryRef = collection(db, `artifacts/${appId}/whtBatchSummaries`);
      } catch (error) {
        console.log('[WHTReturnService] Primary path failed, using fallback path for batch summaries');
        summaryRef = collection(db, `artifacts/${appId}/public/data/whtBatchSummaries`);
      }
      const q = query(summaryRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);

      const summaries = [];
      snapshot.forEach(doc => {
        summaries.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return summaries;

    } catch (error) {
      console.error('[WHTReturnService] Error getting WHT batch summaries:', error);
      return [];
    }
  }

  /**
   * Update WHT entry status
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} whtEntryId - WHT entry ID
   * @param {string} status - New status
   * @param {string} userId - User updating the status
   * @returns {Promise<Object>} - Result of status update
   */
  static async updateWHTEntryStatus(db, appId, whtEntryId, status, userId) {
    try {
      const whtEntryRef = doc(db, `artifacts/${appId}/whtReturns`, whtEntryId);
      await updateDoc(whtEntryRef, {
        status,
        updatedBy: userId,
        updatedAt: new Date()
      });

      return {
        success: true,
        message: `WHT entry status updated to ${status}`
      };

    } catch (error) {
      console.error('[WHTReturnService] Error updating WHT entry status:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to update WHT entry status'
      };
    }
  }

  /**
   * Get WHT statistics for reporting
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {number} year - Year for statistics
   * @returns {Promise<Object>} - WHT statistics
   */
  static async getWHTStatistics(db, appId, year) {
    try {
      // Try primary path first, fallback to public data path if permission denied
      let whtReturnRef;
      try {
        whtReturnRef = collection(db, `artifacts/${appId}/whtReturns`);
      } catch (error) {
        console.log('[WHTReturnService] Primary path failed, using fallback path for statistics');
        whtReturnRef = collection(db, `artifacts/${appId}/public/data/whtReturns`);
      }
      const q = query(
        whtReturnRef,
        where('year', '==', year),
        where('status', '==', 'pending')
      );

      const snapshot = await getDocs(q);
      const entries = [];
      snapshot.forEach(doc => {
        entries.push(doc.data());
      });

      // Calculate statistics
      const totalWHTAmount = entries.reduce((sum, entry) => sum + entry.whtAmount, 0);
      const vendorCount = new Set(entries.map(entry => entry.vendor)).size;
      const procurementTypes = entries.reduce((acc, entry) => {
        acc[entry.procurementType] = (acc[entry.procurementType] || 0) + entry.whtAmount;
        return acc;
      }, {});

      return {
        year,
        totalEntries: entries.length,
        totalWHTAmount,
        vendorCount,
        procurementTypes,
        entries: entries.slice(0, 100) // Limit to first 100 for performance
      };

    } catch (error) {
      console.error('[WHTReturnService] Error getting WHT statistics:', error);
      return {
        year,
        totalEntries: 0,
        totalWHTAmount: 0,
        vendorCount: 0,
        procurementTypes: {},
        entries: []
      };
    }
  }

  /**
   * Helper method to determine tax period
   * @param {Date} date - Date to determine tax period for
   * @returns {string} - Tax period (e.g., "Q1 2024", "Q2 2024")
   */
  static getTaxPeriod(date) {
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    if (month <= 3) return `Q1 ${year}`;
    if (month <= 6) return `Q2 ${year}`;
    if (month <= 9) return `Q3 ${year}`;
    return `Q4 ${year}`;
  }
}
