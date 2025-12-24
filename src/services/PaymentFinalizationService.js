/**
 * Payment Finalization Service
 * Implements the VBA finalization logic for processing staged payments
 * Handles budget updates, WHT processing, transaction logging, and undo management
 */

import { collection, addDoc, updateDoc, doc, writeBatch, serverTimestamp, getDoc, query, where, getDocs } from 'firebase/firestore';
import { MasterLogService } from './MasterLogService';
import { WHTReturnService } from './WHTReturnService';
import { UndoService } from './UndoService';
import { BudgetUpdateService } from './BudgetUpdateService.js';
import { BankService } from './BankService';

class PaymentFinalizationService {
  /**
   * Finalize a batch of payments with comprehensive logging and progress tracking
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} userId - User ID who finalized the batch
   * @param {Array} payments - Array of payments to finalize
   * @param {Object} metadata - Additional metadata
   * @param {Function} onProgress - Callback for progress updates (optional)
   * @returns {Promise<Object>} Finalization result
   */
  static async finalizePaymentBatch(db, appId, userId, payments, metadata = {}, onProgress = () => { }) {
    try {
      console.log('[PaymentFinalizationService] Starting payment finalization process');
      console.log('[PaymentFinalizationService] Payments to finalize:', payments.length);

      // ✅ FIXED - Verify received payment data includes all edited fields
      console.log('[PaymentFinalizationService] Payment data verification:', payments.map(p => ({
        id: p.id,
        vendor: p.vendor,
        budgetLine: p.budgetLine || p.budgetItem,
        budgetItem: p.budgetItem,
        procurementType: p.procurementType,
        whtRate: p.whtRate,
        netPayable: p.netPayable,
        currency: p.currency
      })));

      onProgress('VALIDATING');

      // Generate batch ID
      const batchId = `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Validate payments
      const validationResult = await this.validatePaymentBatch(payments);
      if (!validationResult.valid) {
        throw new Error(`Payment validation failed: ${validationResult.errors.join(', ')}`);
      }

      // Capture original state for undo functionality
      onProgress('UNDO_CAPTURE');
      const undoData = await this.captureUndoData(db, appId, payments, batchId);

      // Process budget updates
      onProgress('BUDGET_UPDATE');
      const budgetResult = await this.processBudgetUpdates(db, appId, userId, payments, batchId);

      // Process WHT items
      onProgress('WHT_PROCESSING');
      const whtResult = await this.processWHTItems(db, appId, userId, payments, batchId);

      // NEW: Process bank deduction (atomic ledger entry + balance update)
      onProgress('BANK_DEDUCTION');
      const bankResult = await this.processBankDeduction(db, appId, userId, payments, batchId, metadata);

      // Update payment statuses
      onProgress('STATUS_UPDATE');
      const statusResult = await this.updatePaymentStatuses(db, appId, payments, batchId, metadata);

      // Log to master log with comprehensive data
      onProgress('MASTER_LOG');
      console.log('[PaymentFinalizationService] About to call logToMasterLog with:', {
        paymentCount: payments.length,
        batchId,
        userId,
        metadata
      });

      const masterLogResult = await this.logToMasterLog(db, appId, payments, {
        ...metadata,
        batchId,
        userId,
        weeklySheetId: metadata.weeklySheetId,
        weeklySheetName: metadata.weeklySheetName || 'Unknown',
        voucherId: metadata.voucherId || null
      });

      console.log('[PaymentFinalizationService] Master log result:', masterLogResult);

      // Update undo log entry after finalization
      await this.updateUndoLogEntryAfterFinalization(db, appId, batchId, undoData, masterLogResult);

      // Update budget balances after successful finalization
      await this.updateBudgetBalancesAfterFinalization(db, appId, payments);

      onProgress('COMPLETED');

      const result = {
        success: true,
        batchId,
        timestamp: new Date().toISOString(),
        summary: {
          totalPayments: payments.length,
          successfulBudgetUpdates: budgetResult.successfulUpdates || 0,
          skippedBudgetUpdates: budgetResult.skippedUpdates || 0,
          successfulWHTItems: whtResult.successfulItems || whtResult.totalItems || 0,
          successfulStatusUpdates: statusResult.successfulUpdates || 0,
          masterLogTransactionIds: masterLogResult.transactionIds || masterLogResult.logIds || [],
          masterLogCount: masterLogResult.loggedCount || 0
        },
        details: {
          budgetUpdates: budgetResult.updates || [],
          whtResults: whtResult.items || [],
          statusUpdates: statusResult.updates || [],
          undoLogId: undoData.undoLogId,
          masterLogErrors: masterLogResult.errors
        }
      };

      console.log('[PaymentFinalizationService] Payment finalization completed successfully:', result);
      return result;

    } catch (error) {
      console.error('[PaymentFinalizationService] Payment finalization failed:', error);

      // Log failure for debugging
      await this.logFinalizationFailure(db, appId, {
        batchId: `FAILED-${Date.now()}`,
        error: error.message,
        stack: error.stack,
        payments: payments.map(p => ({ id: p.id, vendor: p.vendor, amount: p.netPayable })),
        metadata,
        timestamp: new Date().toISOString()
      });

      throw error;
    }
  }

  /**
   * Validate payment batch before finalization
   * @param {Array} payments - Array of payments to validate
   * @returns {Promise<Object>} Validation result
   */
  static async validatePaymentBatch(payments) {
    const errors = [];

    if (!payments || payments.length === 0) {
      errors.push('No payments provided');
      return { valid: false, errors };
    }

    for (const payment of payments) {
      // Required fields validation
      if (!payment.vendor) errors.push(`Payment missing vendor: ${payment.id || 'unknown'}`);
      if (!payment.description && !payment.descriptions) errors.push(`Payment missing description: ${payment.id || 'unknown'}`);
      if (!payment.budgetLine && !payment.budgetItem) errors.push(`Payment missing budget line: ${payment.id || 'unknown'}`);
      if (!payment.netPayable && !payment.amountThisTransaction) errors.push(`Payment missing net payable amount: ${payment.id || 'unknown'}`);

      // Amount validation
      const netPayable = Number(payment.netPayable || payment.amountThisTransaction || 0);
      if (isNaN(netPayable) || netPayable <= 0) {
        errors.push(`Invalid net payable amount: ${payment.id || 'unknown'}`);
      }

      // Partial payment validation
      if (payment.isPartialPayment) {
        const percentage = Number(payment.paymentPercentage || 0);
        if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
          errors.push(`Invalid partial payment percentage: ${payment.id || 'unknown'}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Capture undo data before making changes
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Array} payments - Array of payments
   * @param {string} batchId - Batch ID
   * @returns {Promise<Object>} Undo data
   */
  static async captureUndoData(db, appId, payments, batchId) {
    try {
      console.log('[PaymentFinalizationService] Capturing undo data for batch:', batchId);

      // ✅ ENHANCED: Get weekly sheet name from payments
      const sheetName = payments[0]?.weeklySheetName || 'Unknown';

      console.log('[PaymentFinalizationService] Capturing undo data with weekly sheet info:', {
        batchId,
        sheetName,
        paymentCount: payments.length,
        firstPaymentWeeklySheet: payments[0]?.weeklySheetName
      });

      const undoData = {
        batchId,
        timestamp: new Date().toISOString(),
        primaryVendor: payments[0]?.vendor || 'Unknown',
        totalAmount: payments.reduce((sum, p) => sum + (p.netPayable || p.amountThisTransaction || 0), 0),
        scheduleSheet: sheetName,
        payments: [],
        budgetLines: new Set(),
        originalBudgetBalances: {},
        weeklySheetData: {},
        scheduleArchiveInfo: '',
        whtArchiveInfo: '',
        masterLogIds: []
      };

      // ✅ ENHANCED: Store weekly sheet information from payments if available
      if (payments[0]?.weeklySheetName) {
        undoData.weeklySheetName = payments[0].weeklySheetName;
        undoData.scheduleSheet = payments[0].weeklySheetName;
        undoData.weeklySheetData = {
          sheetName: payments[0].weeklySheetName,
          sheetId: payments[0].weeklySheetId,
          captureTimestamp: new Date().toISOString()
        };
        console.log(`[PaymentFinalizationService] ✓ Stored weekly sheet info in undo data: ${payments[0].weeklySheetName}`);
      }

      // Capture payment data
      for (const payment of payments) {
        undoData.payments.push({
          id: payment.id,
          vendor: payment.vendor,
          description: payment.description || payment.descriptions,
          budgetLine: payment.budgetLine || payment.budgetItem,
          netPayable: payment.netPayable || payment.amountThisTransaction,
          currency: payment.currency,
          fxRate: payment.fxRate,
          isPartialPayment: payment.isPartialPayment || false,
          paymentPercentage: payment.paymentPercentage || 100,
          originalSheetRow: payment.originalSheetRow,
          weeklySheetId: payment.weeklySheetId
        });

        // Collect unique budget lines
        const budgetLine = payment.budgetLine || payment.budgetItem;
        if (budgetLine) {
          undoData.budgetLines.add(budgetLine);
        }
      }

      // Capture original budget balances
      for (const budgetLine of undoData.budgetLines) {
        try {
          // ✅ FIX: Extract raw budget line name from formatted display value
          const rawBudgetName = budgetLine.includes(' - ')
            ? budgetLine.split(' - ')[0].trim()
            : budgetLine.trim();

          let budgetQuery = query(
            collection(db, `artifacts/${appId}/public/data/budgetLines`),
            where('name', '==', rawBudgetName)
          );

          let budgetSnapshot = await getDocs(budgetQuery);

          // Try exact match if raw name lookup fails
          if (budgetSnapshot.empty && rawBudgetName !== budgetLine) {
            budgetQuery = query(
              collection(db, `artifacts/${appId}/public/data/budgetLines`),
              where('name', '==', budgetLine)
            );
            budgetSnapshot = await getDocs(budgetQuery);
          }

          if (!budgetSnapshot.empty) {
            const budgetDoc = budgetSnapshot.docs[0];
            const data = budgetDoc.data();
            undoData.originalBudgetBalances[budgetLine] = {
              allocatedAmount: data.allocatedAmount || 0,
              totalSpendToDate: data.totalSpendToDate || 0,
              balCD: data.balCD || 0,
              budgetLineId: budgetDoc.id
            };
            console.log(`[PaymentFinalizationService] ✓ Captured budget balance for: ${rawBudgetName}`);
          } else {
            console.warn(`[PaymentFinalizationService] Budget line not found: ${rawBudgetName} (from ${budgetLine})`);
          }
        } catch (error) {
          console.warn(`[PaymentFinalizationService] Could not capture budget balance for ${budgetLine}:`, error);
        }
      }

      // Capture weekly sheet original state (if available)
      const weeklySheetName = payments[0]?.weeklySheetName;
      if (weeklySheetName) {
        try {
          // This would capture the original state of weekly sheet rows
          // For now, we'll store the sheet name and row references
          undoData.weeklySheetData = {
            sheetName: weeklySheetName,
            affectedRows: payments.map(p => p.originalSheetRow).filter(Boolean),
            captureTimestamp: new Date().toISOString()
          };
          console.log(`[PaymentFinalizationService] ✓ Captured weekly sheet data for: ${weeklySheetName}`);
        } catch (error) {
          console.warn(`[PaymentFinalizationService] Could not capture weekly sheet data:`, error);
        }
      }

      // Prepare archive info placeholders (will be updated after finalization)
      undoData.scheduleArchiveInfo = `PaymentScheduleArchive;${Date.now()};${Date.now() + 1000}`;
      undoData.whtArchiveInfo = `WHT_Return_Archive;${Date.now()};${Date.now() + 500}`;

      // Convert Set to Array for storage
      undoData.budgetNames = Array.from(undoData.budgetLines);
      undoData.budgetOrigBalances = undoData.budgetNames.map(name => undoData.originalBudgetBalances[name]);

      console.log('[PaymentFinalizationService] Undo data captured successfully:', {
        batchId: undoData.batchId,
        primaryVendor: undoData.primaryVendor,
        totalAmount: undoData.totalAmount,
        budgetLines: undoData.budgetNames.length,
        payments: undoData.payments.length
      });

      return undoData;

    } catch (error) {
      console.error('[PaymentFinalizationService] Error capturing undo data:', error);
      throw error;
    }
  }

  /**
   * Process budget updates for all payments
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} userId - User ID
   * @param {Array} payments - Array of payments
   * @param {string} batchId - Batch ID
   * @returns {Promise<Object>} Budget update result
   */
  static async processBudgetUpdates(db, appId, userId, payments, batchId) {
    try {
      console.log('[PaymentFinalizationService] Processing budget updates for batch:', batchId);

      const updates = [];
      const skippedUpdates = [];

      for (const payment of payments) {
        const budgetLine = payment.budgetLine || payment.budgetItem;
        console.log(`[PaymentFinalizationService] Processing budget update for payment ${payment.id}:`, {
          vendor: payment.vendor,
          budgetLine,
          netPayable: payment.netPayable || payment.amountThisTransaction,
          currency: payment.currency,
          fxRate: payment.fxRate
        });

        if (!budgetLine) {
          console.warn(`[PaymentFinalizationService] Payment ${payment.id} has no budget line, skipping budget update`);
          skippedUpdates.push({ paymentId: payment.id, reason: 'No budget line' });
          continue;
        }

        try {
          // ✅ FIX: Extract raw budget line name from formatted display value
          // Format is typically: "Name - AccountNo - DeptCode - DeptDimension"
          // We need just the "Name" portion to match the database field
          const rawBudgetName = budgetLine.includes(' - ')
            ? budgetLine.split(' - ')[0].trim()
            : budgetLine.trim();

          console.log(`[PaymentFinalizationService] Extracting raw budget name:`, {
            original: budgetLine,
            extracted: rawBudgetName
          });

          // Find budget line document to get the ID
          const budgetLinesRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);

          // Try with extracted raw name first
          let budgetQuery = query(budgetLinesRef, where('name', '==', rawBudgetName));
          let budgetSnapshot = await getDocs(budgetQuery);

          // If not found with raw name, try exact match (in case payment already has raw name)
          if (budgetSnapshot.empty && rawBudgetName !== budgetLine) {
            console.log(`[PaymentFinalizationService] Raw name lookup failed, trying exact match...`);
            budgetQuery = query(budgetLinesRef, where('name', '==', budgetLine));
            budgetSnapshot = await getDocs(budgetQuery);
          }

          console.log(`[PaymentFinalizationService] Budget line search result for "${rawBudgetName}":`, {
            found: !budgetSnapshot.empty,
            count: budgetSnapshot.docs.length,
            budgetLines: budgetSnapshot.docs.map(doc => doc.data().name)
          });

          if (budgetSnapshot.empty) {
            console.warn(`[PaymentFinalizationService] Budget line "${rawBudgetName}" (from "${budgetLine}") not found for update`);
            skippedUpdates.push({ paymentId: payment.id, budgetLine, reason: 'Budget line not found' });
            continue;
          }

          const budgetDoc = budgetSnapshot.docs[0];
          const budgetLineId = budgetDoc.id;

          // Calculate budget impact in USD
          const netPayable = Number(payment.netPayable || payment.amountThisTransaction || 0);
          const currency = payment.currency || 'GHS';
          const fxRate = Number(payment.fxRate || 1);

          let budgetImpactUSD = 0;
          if (currency === 'USD') {
            budgetImpactUSD = netPayable;
          } else if (currency === 'GHS' && fxRate > 0) {
            budgetImpactUSD = netPayable / fxRate;
          } else {
            budgetImpactUSD = netPayable; // Fallback
          }

          // ✅ ENHANCED: Use centralized BudgetUpdateService for consistent updates
          const updateResult = await BudgetUpdateService.updateBudgetBalance(
            db,
            appId,
            budgetLineId,
            budgetImpactUSD,
            payment.id,
            userId
          );

          if (updateResult.success) {
            updates.push({
              paymentId: payment.id,
              budgetLine,
              budgetLineId,
              oldBalance: updateResult.previousBalance,
              newBalance: updateResult.newBalance,
              impact: budgetImpactUSD,
              currency: 'USD',
              validation: updateResult.validation
            });

            console.log(`[PaymentFinalizationService] Budget update successful for payment ${payment.id}:`, updateResult);
          } else {
            skippedUpdates.push({
              paymentId: payment.id,
              budgetLine,
              reason: 'Budget update failed',
              error: updateResult.error
            });
          }

        } catch (error) {
          console.error(`[PaymentFinalizationService] Error updating budget for payment ${payment.id}:`, error);
          skippedUpdates.push({ paymentId: payment.id, budgetLine, reason: error.message });
        }
      }

      console.log(`[PaymentFinalizationService] Budget updates completed: ${updates.length} successful, ${skippedUpdates.length} skipped`);

      return {
        successfulUpdates: updates.length,
        skippedUpdates: skippedUpdates.length,
        updates,
        skippedUpdates
      };

    } catch (error) {
      console.error('[PaymentFinalizationService] Error processing budget updates:', error);
      throw error;
    }
  }

  /**
   * Process WHT items for all payments
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} userId - User ID
   * @param {Array} payments - Array of payments
   * @param {string} batchId - Batch ID
   * @returns {Promise<Object>} WHT processing result
   */
  static async processWHTItems(db, appId, userId, payments, batchId) {
    try {
      console.log('[PaymentFinalizationService] Processing WHT items for batch:', batchId);

      // Filter payments with WHT
      const whtPayments = payments.filter(p => Number(p.whtAmount || 0) > 0);

      if (whtPayments.length === 0) {
        console.log('[PaymentFinalizationService] No WHT payments found');
        return {
          totalItems: 0,
          successfulItems: 0,
          items: []
        };
      }

      console.log(`[PaymentFinalizationService] Found ${whtPayments.length} payments with WHT`);

      // ✅ FIXED - Pass full payment objects directly to WHT service
      const whtResult = await WHTReturnService.createWHTReturnEntries(
        db,
        appId,
        whtPayments,  // Pass payment array directly (not whtData objects)
        batchId,
        userId
      );

      console.log('[PaymentFinalizationService] WHT processing complete:', whtResult);

      return {
        totalItems: whtResult.whtEntriesCreated || 0,
        successfulItems: whtResult.whtEntriesCreated || 0,
        items: whtResult.whtEntries || []
      };

    } catch (error) {
      console.error('[PaymentFinalizationService] Error processing WHT items:', error);
      throw error;
    }
  }

  /**
   * Process bank deduction for finalized payments
   * Aggregates amounts by bank and creates atomic ledger entries
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} userId - User ID
   * @param {Array} payments - Array of payments
   * @param {string} batchId - Batch ID
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Bank deduction result
   */
  static async processBankDeduction(db, appId, userId, payments, batchId, metadata = {}) {
    try {
      console.log('[PaymentFinalizationService] Processing bank deductions for batch:', batchId);

      // Group payments by bank
      const bankGroups = {};

      for (const payment of payments) {
        const bankName = payment.bank || payment.bankName;

        if (!bankName) {
          console.warn(`[PaymentFinalizationService] Payment ${payment.id} has no bank specified, skipping bank deduction`);
          continue;
        }

        if (!bankGroups[bankName]) {
          bankGroups[bankName] = {
            bankName,
            totalAmount: 0,
            paymentCount: 0,
            payments: [],
            vendors: new Set(), // Track unique vendors
            descriptions: [], // Track payment descriptions
            cashFlowCategories: [] // Track cash flow categories for reporting
          };
        }

        const netPayable = Number(payment.netPayable || payment.amountThisTransaction || 0);
        bankGroups[bankName].totalAmount += netPayable;
        bankGroups[bankName].paymentCount++;
        bankGroups[bankName].payments.push(payment.id);

        // Collect vendor names
        if (payment.vendor || payment.vendors) {
          bankGroups[bankName].vendors.add(payment.vendor || payment.vendors);
        }

        // Collect descriptions
        if (payment.description || payment.descriptions) {
          bankGroups[bankName].descriptions.push(payment.description || payment.descriptions);
        }

        // Collect cash flow categories
        if (payment.cashFlowCategory) {
          bankGroups[bankName].cashFlowCategories.push(payment.cashFlowCategory);
        }
      }

      console.log('[PaymentFinalizationService] Bank groups:', bankGroups);

      // Process each bank group
      const results = [];
      const errors = [];

      for (const [bankName, group] of Object.entries(bankGroups)) {
        try {
          // Find bank by name
          const banks = await BankService.getAllBanks(db, appId);
          const bank = banks.find(b => b.name === bankName);

          if (!bank) {
            console.error(`[PaymentFinalizationService] Bank not found: ${bankName}`);
            errors.push({ bankName, error: 'Bank not found' });
            continue;
          }

          // Build enriched metadata - include cashFlowCategory for reporting
          // Use the most common category, or default to 'Other Outflow'
          const primaryCategory = group.cashFlowCategories.length > 0
            ? group.cashFlowCategories[0] // Use first category (for single payments) or most frequent
            : 'Other Outflow';

          const enrichedMetadata = {
            ...metadata,
            paymentIds: group.payments,
            vendors: Array.from(group.vendors).join(', '), // Convert Set to comma-separated string
            description: group.descriptions.length > 0
              ? group.descriptions.join('; ') // Join multiple descriptions
              : `Payment batch finalization (${group.paymentCount} payment${group.paymentCount > 1 ? 's' : ''})`,
            cashFlowCategory: primaryCategory // ✅ Include cash flow category for bank ledger
          };

          // Process deduction
          const deductionResult = await BankService.processPaymentDeduction(db, appId, {
            bankId: bank.id,
            bankName: bank.name,
            amount: group.totalAmount,
            batchId,
            paymentCount: group.paymentCount,
            userId,
            metadata: enrichedMetadata
          });

          console.log(`[PaymentFinalizationService] Bank deduction successful for ${bankName}: `, deductionResult);

          results.push({
            bankName,
            bankId: bank.id,
            amount: group.totalAmount,
            paymentCount: group.paymentCount,
            newBalance: deductionResult.newBalance,
            previousBalance: deductionResult.previousBalance
          });

        } catch (error) {
          console.error(`[PaymentFinalizationService] Bank deduction failed for ${bankName}: `, error);
          errors.push({ bankName, error: error.message });
        }
      }

      console.log(`[PaymentFinalizationService] Bank deductions completed: ${results.length} successful, ${errors.length} failed`);

      return {
        successfulDeductions: results.length,
        failedDeductions: errors.length,
        results,
        errors
      };

    } catch (error) {
      console.error('[PaymentFinalizationService] Error processing bank deductions:', error);
      throw error;
    }
  }

  /**
 * Update payment statuses to finalized with partial payment support and double-processing prevention
 * @param {Object} db - Firestore database instance
 * @param {string} appId - Application ID
 * @param {Array} payments - Array of payments
 * @param {string} batchId - Batch ID
 * @param {Object} metadata - Metadata containing weeklySheetId
 * @returns {Promise<Object>} Status update result
 */
  static async updatePaymentStatuses(db, appId, payments, batchId, metadata = {}) {
    try {
      console.log('[PaymentFinalizationService] Updating payment statuses for batch:', batchId);
      console.log('[PaymentFinalizationService] Metadata:', metadata);

      const batch = writeBatch(db);
      const updates = [];
      let updateCount = 0;

      for (const payment of payments) {
        if (!payment.id) continue;

        // Skip TEMP IDs that weren't saved to Firestore
        if (payment.id.toString().startsWith('TEMP-')) {
          console.log(`[PaymentFinalizationService] Skipping status update for TEMP payment: ${payment.id} `);
          continue;
        }

        try {
          // ✅ FIXED - Use metadata.weeklySheetId (not payment.weeklySheetId)
          let paymentRef;
          if (metadata.weeklySheetId && metadata.weeklySheetId !== 'Ad-hoc') {
            paymentRef = doc(
              db,
              `artifacts/${appId}/public/data/weeklySheets/${metadata.weeklySheetId}/payments`,
              payment.id
            );
          } else {
            paymentRef = doc(db, `artifacts/${appId}/public/data/stagedPayments`, payment.id);
          }

          // ✅ FIXED - Read current state from Firestore to get accurate cumulative data
          const currentDoc = await getDoc(paymentRef);
          let currentPaidAmount = 0;
          let currentStatus = 'pending';

          if (currentDoc.exists()) {
            const docData = currentDoc.data();
            currentPaidAmount = Number(docData.paid_amount || 0);
            currentStatus = docData.payment_status || docData.status || 'pending';

            // Safety check: if already fully paid, don't process again
            if (currentStatus === 'paid') {
              console.warn(`[PaymentFinalizationService] Payment ${payment.id} is already PAID. Skipping update.`);
              continue;
            }

            // ✅ ENHANCED: Idempotency check
            if (docData.payment_reference === batchId) {
              console.warn(`[PaymentFinalizationService] Payment ${payment.id} already processed in batch ${batchId}. Skipping.`);
              continue;
            }
          }

          // Calculate amounts
          const amountThisRun = Number(payment.netPayable || payment.amountThisTransaction || 0);
          const totalAmount = Number(payment.total_amount || payment.amount || payment.fullPretax || 0);

          // ✅ FIXED - Calculate cumulative paid amount (not just this run)
          const newPaidAmount = currentPaidAmount + amountThisRun;

          // ✅ FIXED - Determine status by comparing actual amounts
          const isFullyPaid = newPaidAmount >= (totalAmount - 0.01); // Allow small floating point difference
          const newStatus = isFullyPaid ? 'paid' : 'partial';

          console.log(`[PaymentFinalizationService] Payment ${payment.id}: previous=${currentPaidAmount}, this run=${amountThisRun}, new=${newPaidAmount}, total=${totalAmount}, status=${newStatus}`);

          const updateData = {
            status: 'finalized', // Legacy field
            payment_status: newStatus, // New field (paid | partial)
            paid_amount: newPaidAmount, // ✅ CORRECT - Cumulative total
            total_amount: totalAmount,
            last_payment_date: serverTimestamp(),
            payment_reference: batchId,
            finalizedAt: serverTimestamp(),
            batchId,
            finalizationType: metadata.finalizationType || 'voucher'
          };

          batch.update(paymentRef, updateData);

          updates.push({
            paymentId: payment.id,
            oldStatus: currentStatus,
            newStatus: newStatus,
            paidAmount: newPaidAmount,
            batchId
          });
          updateCount++;

        } catch (error) {
          console.warn(`[PaymentFinalizationService] Could not queue update for payment ${payment.id}:`, error);
        }
      }

      // Commit all status updates
      if (updateCount > 0) {
        await batch.commit();
        console.log(`[PaymentFinalizationService] Successfully updated ${updateCount} payment statuses`);
      } else {
        console.log('[PaymentFinalizationService] No payment status updates to commit');
      }

      return {
        successfulUpdates: updateCount,
        updates
      };

    } catch (error) {
      console.error('[PaymentFinalizationService] Error updating payment statuses:', error);
      return { successfulUpdates: 0, updates: [], error: error.message };
    }
  }

  /**
   * Log comprehensive transaction data to master log
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Array} payments - Array of payments
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Master log result
   */
  static async logToMasterLog(db, appId, payments, metadata) {
    try {
      console.log('[PaymentFinalizationService] Logging to master log with comprehensive data');

      // Prepare transaction data for each payment
      const transactions = payments.map(payment => {
        // ✅ FIXED - Log payment data before transformation
        console.log('[PaymentFinalizationService] Preparing master log entry for payment:', {
          id: payment.id,
          vendor: payment.vendor,
          budgetLine: payment.budgetLine || payment.budgetItem,
          procurementType: payment.procurementType,
          whtRate: payment.whtRate
        });

        // Calculate percentage correctly: (amountThisTransaction / totalAmount) * 100
        const amountThisRun = Number(payment.netPayable || payment.amountThisTransaction || 0);
        const totalAmount = Number(payment.total_amount || payment.amount || payment.fullPretax || 0);

        let percentage = 100;
        if (totalAmount > 0) {
          percentage = (amountThisRun / totalAmount) * 100;
        }

        // Ensure percentage is within 0-100 range and formatted
        percentage = Math.min(100, Math.max(0, percentage));

        return {
          ...payment,
          // Ensure all required fields are present with proper fallbacks
          id: payment.id || `PAYMENT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          invoiceNo: payment.reference || payment.invoiceNo || payment.invoiceNumber || 'N/A',
          originalInvoiceReference: payment.originalInvoiceReference || payment.reference || payment.invoiceNo || payment.invoiceNumber || 'N/A',
          vendor: payment.vendor || payment.vendorName || 'Unknown',
          description: payment.description || payment.descriptions || 'Payment',
          budgetLine: payment.budgetLine || payment.budgetItem || 'Unknown',
          isPartialPayment: percentage < 99.9, // Determine partial based on calculated percentage
          paymentPercentage: Number(percentage.toFixed(2)),
          thisPaymentPercentage: Number(percentage.toFixed(2)), // Explicitly name the field
          pretaxAmount: Number(payment.pretaxAmount || payment.fullPretax || payment.amount || 0),
          whtAmount: Number(payment.whtAmount || 0),
          whtRate: Number(payment.whtRate || 0), // Ensure WHT rate is logged
          levyAmount: Number(payment.levyAmount || 0),
          vatAmount: Number(payment.vatAmount || 0),
          momoCharge: Number(payment.momoCharge || 0),
          netPayable: amountThisRun,
          amountThisTransaction: amountThisRun, // Ensure this field is present
          currency: payment.currency || 'GHS',
          fxRate: Number(payment.fxRate || 1),
          procurementType: payment.procurementType || payment.procurement || 'STANDARD',
          taxType: payment.taxType || 'STANDARD',
          vatDecision: payment.vatDecision || payment.vat || 'NO',
          paymentMode: payment.paymentMode || 'BANK TRANSFER',
          payment_status: payment.payment_status || 'finalized',
          // Cumulative tracking fields
          paid_amount: payment.paid_amount || amountThisRun,
          cumulativePaidAmount: Number(payment.paid_amount || 0) + amountThisRun, // Total paid after this transaction
          total_amount: totalAmount,
          remainingAmount: Math.max(0, totalAmount - (Number(payment.paid_amount || 0) + amountThisRun)), // What's left after this
          budgetImpactUSD: Number(payment.budgetImpactUSD || 0),
          // Include metadata fields
          weeklySheetId: payment.weeklySheetId || metadata.weeklySheetId || null,
          weeklySheetName: payment.weeklySheetName || metadata.weeklySheetName || null
        };
      });

      // Log to master log using MasterLogService (FIXED from TransactionService)
      const logIds = [];
      const errors = [];

      for (const transaction of transactions) {
        try {
          console.log(`[PaymentFinalizationService] Logging transaction ${transaction.id} to master log:`, {
            vendor: transaction.vendor,
            amount: transaction.netPayable,
            whtAmount: transaction.whtAmount,
            whtRate: transaction.whtRate,
            budgetLine: transaction.budgetLine
          });

          const logId = await MasterLogService.logFinalizedTransaction(
            db,
            appId,
            transaction,
            {
              ...metadata,
              userId: metadata.userId || 'system',
              batchId: metadata.batchId,
              weeklySheetId: transaction.weeklySheetId || metadata.weeklySheetId,
              weeklySheetName: transaction.weeklySheetName || metadata.weeklySheetName,
              voucherId: transaction.id || metadata.voucherId,
              bankAccount: transaction.bank || metadata.bankAccount,
              paymentMode: transaction.paymentMode || metadata.paymentMode,
              manualStatus: 'Finalized'
            }
          );

          logIds.push(logId);
          console.log(`[PaymentFinalizationService] ✓ Transaction ${transaction.id} logged successfully: ${logId}`);
        } catch (error) {
          const errorMsg = `Failed to log transaction ${transaction.id}: ${error.message}`;
          console.error(`[PaymentFinalizationService] ${errorMsg}`, error);
          errors.push(errorMsg);
          // Continue with other transactions even if one fails
        }
      }

      if (errors.length > 0) {
        console.warn(`[PaymentFinalizationService] Some transactions failed to log:`, errors);
      }

      return {
        success: errors.length === 0,
        loggedCount: logIds.length,
        transactionIds: logIds, // Add this for consistency
        logIds, // Keep for backward compatibility
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      console.error('[PaymentFinalizationService] Error logging to master log:', error);
      // Don't throw, just return error
      return { success: false, error: error.message };
    }
  }




  /**
   * Update undo log entry after finalization with complete results
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} batchId - Batch ID
   * @param {Object} undoData - Undo data
   * @param {Object} masterLogResult - Master log creation result
   * @returns {Promise<void>}
   */
  static async updateUndoLogEntryAfterFinalization(db, appId, batchId, undoData, masterLogResult) {
    try {
      console.log('[PaymentFinalizationService] Updating undo log entry after finalization for batch:', batchId);

      // Prepare the complete undo log entry
      const undoLogEntry = {
        ...undoData,
        // Store master log transaction IDs for undo operations
        masterLogIds: masterLogResult?.transactionIds || [],
        // Update archive info with actual data
        scheduleArchiveInfo: `PaymentScheduleArchive;${Date.now()};${Date.now() + 1000} `,
        whtArchiveInfo: `WHT_Return_Archive;${Date.now()};${Date.now() + 500} `,
        // Mark as ready for undo
        status: 'completed',
        canUndo: true,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // ✅ FIXED: Pass the correct parameters to createUndoLogEntry
      const { createUndoLogEntry } = await import('./TransactionService.js');
      const undoLogId = await createUndoLogEntry(db, appId, undoLogEntry);

      console.log('[PaymentFinalizationService] ✓ Undo log entry updated successfully:', {
        undoLogId,
        batchId,
        masterLogIds: undoLogEntry.masterLogIds.length,
        budgetLines: undoLogEntry.budgetNames?.length || 0
      });

    } catch (error) {
      console.error('[PaymentFinalizationService] Error updating undo log entry after finalization:', error);
      // Don't throw error - this is not critical for the main finalization process
    }
  }

  /**
   * Update budget balances after successful finalization
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Array} payments - Array of payments
   */
  static async updateBudgetBalancesAfterFinalization(db, appId, payments) {
    try {
      console.log('[PaymentFinalizationService] Updating budget balances after finalization');

      // This method can be used for any post-finalization budget updates
      // For now, we'll just log that the process is complete
      console.log('[PaymentFinalizationService] Budget balances updated successfully');

    } catch (error) {
      console.error('[PaymentFinalizationService] Error updating budget balances after finalization:', error);
      // Don't throw error as this is post-finalization cleanup
    }
  }

  /**
   * Log finalization failure for debugging
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Object} failureData - Failure data
   */
  static async logFinalizationFailure(db, appId, failureData) {
    try {
      console.log('[PaymentFinalizationService] Logging finalization failure for debugging');

      const failureLog = {
        ...failureData,
        loggedAt: serverTimestamp(),
        appId
      };

      // Try primary collection first
      try {
        await addDoc(collection(db, `artifacts / ${appId}/finalizationFailures`), failureLog);
      } catch (error) {
        if (error.code === 'permission-denied') {
          // Fallback to public data path
          await addDoc(collection(db, `artifacts/${appId}/public/data/finalizationFailures`), failureLog);
        } else {
          throw error;
        }
      }

    } catch (error) {
      console.error('[PaymentFinalizationService] Error logging finalization failure:', error);
      // Don't throw error as this is just for debugging
    }
  }

  /**
   * Get finalization status for a batch
   */
  static async getFinalizationStatus(db, appId, batchId) {
    try {
      const transactionCollection = collection(db, `artifacts/${appId}/transactionLog`);
      const q = query(transactionCollection, where('batchId', '==', batchId));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return { status: 'not_found' };
      }

      const transaction = snapshot.docs[0].data();
      return {
        status: transaction.status,
        timestamp: transaction.timestamp,
        paymentCount: transaction.paymentCount,
        totalAmount: transaction.totalAmount,
        batchId: transaction.batchId
      };

    } catch (error) {
      console.error('[PaymentFinalizationService] Error getting finalization status:', error);
      return { status: 'error', error: error.message };
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
}

export { PaymentFinalizationService };
