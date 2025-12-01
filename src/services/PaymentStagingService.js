// Payment Staging Service
// Handles payment staging, batching, preview, and finalization workflow
// This is the core missing piece from the VBA system

import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  writeBatch 
} from 'firebase/firestore';
import { BudgetBalanceService } from './BudgetBalanceService.js';
import { generateTransactionID, generateBatchID } from './FinancialEngine.js';

/**
 * Payment Staging Service
 * Manages the complete payment workflow: staging → batching → preview → finalization
 */
export class PaymentStagingService {
  
  /**
   * Stage a payment for processing (add to weekly sheet)
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Object} paymentData - Payment data from Payment Generator
   * @param {string} weeklySheetId - Weekly sheet ID to add payment to
   * @returns {Promise<Object>} Staged payment result
   */
  static async stagePayment(db, appId, paymentData, weeklySheetId) {
    try {
      const batch = writeBatch(db);
      
      // Generate unique transaction ID
      const transactionId = generateTransactionID();
      
      // Create staged payment object
      const stagedPayment = {
        id: transactionId,
        weeklySheetId,
        status: 'staged', // staged → batched → finalized
        stageDate: serverTimestamp(),
        
        // Payment details
        vendor: paymentData.vendor,
        paymentMode: paymentData.paymentMode,
        bank: paymentData.bank,
        procurementType: paymentData.procurementType,
        taxType: paymentData.taxType,
        currency: paymentData.currency,
        budgetLine: paymentData.budgetLine,
        
        // Financial details
        pretaxAmount: paymentData.pretaxAmount,
        whtAmount: paymentData.whtAmount,
        vatAmount: paymentData.vatAmount,
        levyAmount: paymentData.levyAmount,
        momoCharge: paymentData.momoCharge,
        subtotal: paymentData.subtotal,
        usdImpact: paymentData.usdImpact,
        
        // Budget impact
        budgetImpactUSD: paymentData.usdImpact,
        budgetLineId: paymentData.budgetLineId,
        
        // Metadata
        description: paymentData.description,
        reference: paymentData.reference,
        signatory: paymentData.signatory,
        notes: paymentData.notes,
        
        // Staging info
        stagedBy: paymentData.userId,
        stagedAt: serverTimestamp(),
        batchId: null, // Will be set when batched
        finalizationDate: null,
        finalizationStatus: null
      };
      
      // Add to staged payments collection
      const stagedRef = collection(db, `artifacts/${appId}/public/data/stagedPayments`);
      const stagedDocRef = doc(stagedRef, transactionId);
      batch.set(stagedDocRef, stagedPayment);
      
      // Add to weekly sheet transactions
      const weeklyRef = doc(db, `artifacts/${appId}/public/data/weeklySheets/${weeklySheetId}`);
      const weeklySnap = await getDoc(weeklyRef);
      
      if (!weeklySnap.exists()) {
        throw new Error(`Weekly sheet ${weeklySheetId} not found`);
      }
      
      const weeklyData = weeklySnap.data();
      const transactions = weeklyData.transactions || [];
      
      // Create a clean transaction reference without serverTimestamp values
      const transactionRef = {
        id: transactionId,
        type: 'staged',
        stagedPaymentId: transactionId,
        vendor: stagedPayment.vendor,
        amount: stagedPayment.subtotal,
        budgetLine: stagedPayment.budgetLine,
        stageDate: new Date().toISOString() // Use regular Date instead of serverTimestamp
      };
      
      transactions.push(transactionRef);
      
      batch.update(weeklyRef, {
        transactions,
        lastUpdated: serverTimestamp(),
        stagedPaymentCount: (weeklyData.stagedPaymentCount || 0) + 1
      });
      
      // Commit the batch
      await batch.commit();
      
      console.log(`Payment staged successfully: ${transactionId}`);
      
      return {
        success: true,
        transactionId,
        stagedPayment,
        message: 'Payment staged successfully'
      };
      
    } catch (error) {
      console.error('Error staging payment:', error);
      throw error;
    }
  }
  
  /**
   * Create a payment batch from staged payments
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Array} stagedPaymentIds - Array of staged payment IDs to batch
   * @param {string} batchName - Name for the batch
   * @param {string} batchDescription - Description for the batch
   * @returns {Promise<Object>} Batch creation result
   */
  static async createPaymentBatch(db, appId, stagedPaymentIds, batchName, batchDescription) {
    try {
      const batch = writeBatch(db);
      const batchId = generateBatchID();
      
      // Create batch object
      const paymentBatch = {
        id: batchId,
        name: batchName,
        description: batchDescription,
        status: 'pending', // pending → processing → completed → failed
        createdDate: serverTimestamp(),
        
        // Batch details
        stagedPaymentIds,
        paymentCount: stagedPaymentIds.length,
        totalAmount: 0,
        totalUSDImpact: 0,
        
        // Processing info
        processingDate: null,
        completionDate: null,
        processedBy: null,
        notes: null
      };
      
      // Calculate batch totals
      const stagedRef = collection(db, `artifacts/${appId}/public/data/stagedPayments`);
      const stagedDocs = await getDocs(query(stagedRef, where('id', 'in', stagedPaymentIds)));
      
      let totalAmount = 0;
      let totalUSDImpact = 0;
      
      stagedDocs.forEach(doc => {
        const payment = doc.data();
        totalAmount += payment.subtotal || 0;
        totalUSDImpact += payment.usdImpact || 0;
      });
      
      paymentBatch.totalAmount = totalAmount;
      paymentBatch.totalUSDImpact = totalUSDImpact;
      
      // Save batch
      const batchRef = collection(db, `artifacts/${appId}/public/data/paymentBatches`);
      const batchDocRef = doc(batchRef, batchId);
      batch.set(batchDocRef, paymentBatch);
      
      // Update staged payments with batch ID
      stagedPaymentIds.forEach(paymentId => {
        const paymentRef = doc(stagedRef, paymentId);
        batch.update(paymentRef, {
          batchId,
          status: 'batched',
          batchedAt: serverTimestamp()
        });
      });
      
      // Commit the batch
      await batch.commit();
      
      console.log(`Payment batch created successfully: ${batchId}`);
      
      return {
        success: true,
        batchId,
        paymentBatch,
        message: 'Payment batch created successfully'
      };
      
    } catch (error) {
      console.error('Error creating payment batch:', error);
      throw error;
    }
  }
  
  /**
   * Get batch preview with detailed payment information and VBA-style grouping
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} batchId - Batch ID to preview
   * @returns {Promise<Object>} Batch preview data with enhanced grouping
   */
  static async getBatchPreview(db, appId, batchId) {
    try {
      // Get batch details
      const batchRef = doc(db, `artifacts/${appId}/public/data/paymentBatches/${batchId}`);
      const batchSnap = await getDoc(batchRef);
      
      if (!batchSnap.exists()) {
        throw new Error(`Batch ${batchId} not found`);
      }
      
      const batchData = batchSnap.data();
      
      // Get all payments in the batch
      const stagedRef = collection(db, `artifacts/${appId}/public/data/stagedPayments`);
      const stagedDocs = await getDocs(query(stagedRef, where('batchId', '==', batchId)));
      
      const payments = [];
      let totalBudgetImpact = 0;
      
      stagedDocs.forEach(doc => {
        const payment = doc.data();
        payments.push(payment);
        totalBudgetImpact += payment.budgetImpactUSD || 0;
      });
      
      // VBA-STYLE GROUPING LOGIC
      
      // 1. Group by Payment Mode (Primary grouping like VBA)
      const paymentModeGroups = {};
      payments.forEach(payment => {
        const mode = payment.paymentMode || 'BANK TRANSFER';
        if (!paymentModeGroups[mode]) {
          paymentModeGroups[mode] = {
            totalAmount: 0,
            paymentCount: 0,
            payments: [],
            bankGroups: {}, // Sub-group by bank for bank transfers
            budgetLineGroups: {}, // Sub-group by budget line
            taxTypeGroups: {} // Sub-group by tax type
          };
        }
        
        paymentModeGroups[mode].totalAmount += payment.subtotal || 0;
        paymentModeGroups[mode].paymentCount += 1;
        paymentModeGroups[mode].payments.push(payment);
        
        // Sub-group by bank (especially for bank transfers)
        const bank = payment.bank || 'UNKNOWN BANK';
        if (!paymentModeGroups[mode].bankGroups[bank]) {
          paymentModeGroups[mode].bankGroups[bank] = {
            totalAmount: 0,
            paymentCount: 0,
            payments: []
          };
        }
        paymentModeGroups[mode].bankGroups[bank].totalAmount += payment.subtotal || 0;
        paymentModeGroups[mode].bankGroups[bank].paymentCount += 1;
        paymentModeGroups[mode].bankGroups[bank].payments.push(payment);
        
        // Sub-group by budget line
        const budgetLine = payment.budgetLine || 'UNKNOWN BUDGET';
        if (!paymentModeGroups[mode].budgetLineGroups[budgetLine]) {
          paymentModeGroups[mode].budgetLineGroups[budgetLine] = {
            totalAmount: 0,
            paymentCount: 0,
            payments: []
          };
        }
        paymentModeGroups[mode].budgetLineGroups[budgetLine].totalAmount += payment.subtotal || 0;
        paymentModeGroups[mode].budgetLineGroups[budgetLine].paymentCount += 1;
        paymentModeGroups[mode].budgetLineGroups[budgetLine].payments.push(payment);
        
        // Sub-group by tax type
        const taxType = payment.taxType || 'STANDARD';
        if (!paymentModeGroups[mode].taxTypeGroups[taxType]) {
          paymentModeGroups[mode].taxTypeGroups[taxType] = {
            totalAmount: 0,
            paymentCount: 0,
            payments: [],
            totalWHT: 0,
            totalLevy: 0,
            totalVAT: 0
          };
        }
        paymentModeGroups[mode].taxTypeGroups[taxType].totalAmount += payment.subtotal || 0;
        paymentModeGroups[mode].taxTypeGroups[taxType].paymentCount += 1;
        paymentModeGroups[mode].taxTypeGroups[taxType].payments.push(payment);
        paymentModeGroups[mode].taxTypeGroups[taxType].totalWHT += payment.whtAmount || 0;
        paymentModeGroups[mode].taxTypeGroups[taxType].totalLevy += payment.levyAmount || 0;
        paymentModeGroups[mode].taxTypeGroups[taxType].totalVAT += payment.vatAmount || 0;
      });
      
      // 2. Group by Budget Line (Secondary grouping for budget impact)
      const budgetLineImpact = {};
      payments.forEach(payment => {
        const budgetLine = payment.budgetLine || 'UNKNOWN BUDGET';
        if (!budgetLineImpact[budgetLine]) {
          budgetLineImpact[budgetLine] = {
            totalAmount: 0,
            paymentCount: 0,
            payments: [],
            totalUSDImpact: 0,
            paymentModes: {},
            vendors: {}
          };
        }
        budgetLineImpact[budgetLine].totalAmount += payment.subtotal || 0;
        budgetLineImpact[budgetLine].paymentCount += 1;
        budgetLineImpact[budgetLine].payments.push(payment);
        budgetLineImpact[budgetLine].totalUSDImpact += payment.budgetImpactUSD || 0;
        
        // Track payment modes within budget line
        const mode = payment.paymentMode || 'BANK TRANSFER';
        if (!budgetLineImpact[budgetLine].paymentModes[mode]) {
          budgetLineImpact[budgetLine].paymentModes[mode] = 0;
        }
        budgetLineImpact[budgetLine].paymentModes[mode]++;
        
        // Track vendors within budget line
        const vendor = payment.vendor || 'UNKNOWN VENDOR';
        if (!budgetLineImpact[budgetLine].vendors[vendor]) {
          budgetLineImpact[budgetLine].vendors[vendor] = 0;
        }
        budgetLineImpact[budgetLine].vendors[vendor]++;
      });
      
      // 3. Group by Vendor (Tertiary grouping for vendor management)
      const vendorSummary = {};
      payments.forEach(payment => {
        const vendor = payment.vendor || 'UNKNOWN VENDOR';
        if (!vendorSummary[vendor]) {
          vendorSummary[vendor] = {
            totalAmount: 0,
            paymentCount: 0,
            payments: [],
            paymentModes: {},
            budgetLines: {},
            totalUSDImpact: 0
          };
        }
        vendorSummary[vendor].totalAmount += payment.subtotal || 0;
        vendorSummary[vendor].paymentCount += 1;
        vendorSummary[vendor].payments.push(payment);
        vendorSummary[vendor].totalUSDImpact += payment.budgetImpactUSD || 0;
        
        // Track payment modes per vendor
        const mode = payment.paymentMode || 'BANK TRANSFER';
        if (!vendorSummary[vendor].paymentModes[mode]) {
          vendorSummary[vendor].paymentModes[mode] = 0;
        }
        vendorSummary[vendor].paymentModes[mode]++;
        
        // Track budget lines per vendor
        const budgetLine = payment.budgetLine || 'UNKNOWN BUDGET';
        if (!vendorSummary[vendor].budgetLines[budgetLine]) {
          vendorSummary[vendor].budgetLines[budgetLine] = 0;
        }
        vendorSummary[vendor].budgetLines[budgetLine]++;
      });
      
      // 4. Tax Summary (Like VBA tax aggregation)
      const taxSummary = {
        totalWHT: 0,
        totalLevy: 0,
        totalVAT: 0,
        totalMomoCharge: 0,
        taxTypeBreakdown: {},
        procurementTypeBreakdown: {}
      };
      
      payments.forEach(payment => {
        taxSummary.totalWHT += payment.whtAmount || 0;
        taxSummary.totalLevy += payment.levyAmount || 0;
        taxSummary.totalVAT += payment.vatAmount || 0;
        taxSummary.totalMomoCharge += payment.momoCharge || 0;
        
        // Tax type breakdown
        const taxType = payment.taxType || 'STANDARD';
        if (!taxSummary.taxTypeBreakdown[taxType]) {
          taxSummary.taxTypeBreakdown[taxType] = {
            totalAmount: 0,
            paymentCount: 0,
            totalTax: 0
          };
        }
        taxSummary.taxTypeBreakdown[taxType].totalAmount += payment.subtotal || 0;
        taxSummary.taxTypeBreakdown[taxType].paymentCount += 1;
        taxSummary.taxTypeBreakdown[taxType].totalTax += (payment.whtAmount || 0) + (payment.levyAmount || 0) + (payment.vatAmount || 0);
        
        // Procurement type breakdown
        const procurementType = payment.procurementType || 'SERVICES';
        if (!taxSummary.procurementTypeBreakdown[procurementType]) {
          taxSummary.procurementTypeBreakdown[procurementType] = {
            totalAmount: 0,
            paymentCount: 0,
            totalWHT: 0
          };
        }
        taxSummary.procurementTypeBreakdown[procurementType].totalAmount += payment.subtotal || 0;
        taxSummary.procurementTypeBreakdown[procurementType].paymentCount += 1;
        taxSummary.procurementTypeBreakdown[procurementType].totalWHT += payment.whtAmount || 0;
      });
      
      // 5. Enhanced Budget Details (VBA Style - with real budget data)
      const enhancedBudgetDetails = {};
      
      // Get unique budget lines from payments
      const uniqueBudgetLines = [...new Set(payments.map(p => p.budgetLine).filter(Boolean))];
      
      for (const budgetLine of uniqueBudgetLines) {
        try {
          // Fetch real budget details from BudgetBalanceService
          const budgetDetails = await BudgetBalanceService.getBudgetLineDetails(db, appId, budgetLine);
          
          if (budgetDetails) {
            const budgetLinePayments = payments.filter(p => p.budgetLine === budgetLine);
            const totalUSDImpact = budgetLinePayments.reduce((sum, p) => sum + (p.budgetImpactUSD || 0), 0);
            
            enhancedBudgetDetails[budgetLine] = {
              // VBA-style budget information
              initialBalance: budgetDetails.initialBalance || 0,
              currentSpend: budgetDetails.totalSpent || 0,
              balanceCD: budgetDetails.currentBalance || 0, // Carried Down (before this request)
              currentRequest: totalUSDImpact, // This schedule's impact
              balanceBD: (budgetDetails.currentBalance || 0) - totalUSDImpact, // Brought Down (after this request)
              
              // Additional details
              budgetLineId: budgetDetails.id,
              monthlyBalances: budgetDetails.monthlyBalances || {},
              riskLevel: budgetDetails.riskLevel || 'NONE',
              utilizationRate: budgetDetails.utilizationRate || 0
            };
          } else {
            // Fallback if budget details not found
            const budgetLinePayments = payments.filter(p => p.budgetLine === budgetLine);
            const totalUSDImpact = budgetLinePayments.reduce((sum, p) => sum + (p.budgetImpactUSD || 0), 0);
            
            enhancedBudgetDetails[budgetLine] = {
              initialBalance: 0,
              currentSpend: 0,
              balanceCD: 0,
              currentRequest: totalUSDImpact,
              balanceBD: -totalUSDImpact,
              budgetLineId: null,
              monthlyBalances: {},
              riskLevel: 'UNKNOWN',
              utilizationRate: 0
            };
          }
        } catch (error) {
          console.error(`Error fetching budget details for ${budgetLine}:`, error);
          // Fallback with error state
          const budgetLinePayments = payments.filter(p => p.budgetLine === budgetLine);
          const totalUSDImpact = budgetLinePayments.reduce((sum, p) => sum + (p.budgetImpactUSD || 0), 0);
          
          enhancedBudgetDetails[budgetLine] = {
            initialBalance: 0,
            currentSpend: 0,
            balanceCD: 0,
            currentRequest: totalUSDImpact,
            balanceBD: -totalUSDImpact,
            budgetLineId: null,
            monthlyBalances: {},
            riskLevel: 'ERROR',
            utilizationRate: 0,
            error: error.message
          };
        }
      }
      
      // 6. VBA-STYLE SCHEDULE TYPE DETECTION & GENERATION
      // COMMENTED OUT: Payment Schedule Logic - Focusing on Voucher Generation
      /*
      const scheduleType = this.detectScheduleType(payments);
      const vbaStyleSchedule = this.generateVBAstyleSchedule(payments, scheduleType, batchData);
      */
      
      const preview = {
        batch: batchData,
        payments,
        summary: {
          totalPayments: payments.length,
          totalAmount: batchData.totalAmount,
          totalUSDImpact: batchData.totalUSDImpact,
          totalBudgetImpact,
          averagePaymentAmount: batchData.totalAmount / payments.length
        },
        // VBA-STYLE GROUPING
        paymentModeGroups,        // Primary grouping (like VBA)
        budgetLineImpact,         // Budget-focused grouping
        vendorSummary,            // Vendor-focused grouping
        taxSummary,               // Tax aggregation (like VBA)
        enhancedBudgetDetails,    // VBA-style budget details with real data
        
        // COMMENTED OUT: VBA Schedule Generation
        // scheduleType,             // Detected schedule type
        // vbaStyleSchedule,         // Generated VBA-style schedule
        generatedAt: new Date()
      };
      
      return preview;
      
    } catch (error) {
      console.error('Error getting batch preview:', error);
      throw error;
    }
  }

  /**
   * COMMENTED OUT: Payment Schedule Logic - Focusing on Voucher Generation
   * 
   * Detect the appropriate VBA schedule type based on payment composition
   * @param {Array} payments - Array of payment objects
   * @returns {string} Schedule type identifier
   */
  /*
  static detectScheduleType(payments) {
    if (!payments || payments.length === 0) return 'UNKNOWN';
    
    // Extract unique values
    const uniqueVendors = [...new Set(payments.map(p => p.vendor).filter(Boolean))];
    const uniqueBudgetLines = [...new Set(payments.map(p => p.budgetLine).filter(Boolean))];
    const uniqueCurrencies = [...new Set(payments.map(p => p.currency).filter(Boolean))];
    
    // Check for thematic categories (like VBA MultiSectionFX)
    const hasThematicCategories = this.hasThematicCategories(payments);
    
    // Schedule type detection logic (matching VBA system)
    if (uniqueVendors.length === 1 && uniqueBudgetLines.length === 1) {
      return 'SINGLE_VENDOR_SINGLE_BUDGET';
    } else if (uniqueVendors.length > 1 && uniqueBudgetLines.length === 1) {
      return 'MULTI_VENDOR_SINGLE_BUDGET';
    } else if (uniqueBudgetLines.length > 1) {
      return 'MULTI_BUDGET_LINE';
    } else if (hasThematicCategories) {
      return 'THEMATIC_SECTIONS';
    } else {
      return 'TABULAR_COMPONENTS';
    }
  }
  */

  /**
   * COMMENTED OUT: Payment Schedule Logic - Focusing on Voucher Generation
   * 
   * Check if payments have thematic categories (Travel, Accommodation, etc.)
   * @param {Array} payments - Array of payment objects
   * @returns {boolean} True if thematic categories detected
   */
  /*
  static hasThematicCategories(payments) {
    const thematicKeywords = [
      'PER DIEM', 'TRANSPORT', 'TRAVEL ALLOWANCE', 'MILEAGE',
      'HOTEL', 'LODGING', 'ACCOMMODATION',
      'AIRFARE', 'TICKET', 'FLIGHT', 'RAIL'
    ];
    
    return payments.some(payment => {
      const description = (payment.description || '').toUpperCase();
      return thematicKeywords.some(keyword => description.includes(keyword));
    });
  }
  */

  /**
   * COMMENTED OUT: Payment Schedule Logic - Focusing on Voucher Generation
   * 
   * Generate VBA-style schedule based on detected type
   * @param {Array} payments - Array of payment objects
   * @param {string} scheduleType - Detected schedule type
   * @param {Object} batchData - Batch information
   * @returns {Object} VBA-style schedule data
   */
  /*
  static generateVBAstyleSchedule(payments, scheduleType, batchData) {
    // Map React fields to VBA-style fields for consistency
    const mappedPayments = payments.map(payment => ({
      // VBA-style field names
      PreTax_Transaction_Val: payment.preTaxAmount || 0,
      WHT_Transaction_Val: payment.whtAmount || 0,
      VAT_Transaction_Val: payment.vatAmount || 0,
      Levy_Transaction_Val: payment.levyAmount || 0,
      MomoCharge_Transaction_Val: payment.momoCharge || 0,
      Subtotal_Transaction_Val: payment.subtotal || 0,
      NetPayable_Transaction_Val: payment.netPayable || 0,
      BudgetImpactUSD_Val: payment.budgetImpactUSD || 0,
      
      // Original fields for reference
      vendor: payment.vendor,
      description: payment.description,
      invoiceNo: payment.invoiceNo,
      budgetLine: payment.budgetLine,
      currency: payment.currency,
      isPartialPayment: payment.isPartialPayment || false,
      paymentPercentage: payment.paymentPercentage || 100,
      originalFullInvoiceNet: payment.originalFullInvoiceNet || 0,
      
      // Additional VBA fields
      Invoice_FullNetPayable_Val: payment.originalFullInvoiceNet || payment.netPayable || 0,
      IsPartialPayment: payment.isPartialPayment || false,
      PaymentPercentageThisTime: payment.paymentPercentage || 100,
      CurrencyOrig: payment.currency || 'GHS'
    }));

    switch (scheduleType) {
      case 'SINGLE_VENDOR_SINGLE_BUDGET':
        return this.generateSingleVendorSchedule(mappedPayments, batchData);
      case 'MULTI_VENDOR_SINGLE_BUDGET':
        return this.generateAggregatedItemsSchedule(mappedPayments, batchData);
      case 'MULTI_BUDGET_LINE':
        return this.generateMultiBudgetLineSchedule(mappedPayments, batchData);
      case 'THEMATIC_SECTIONS':
        return this.generateThematicSectionsSchedule(mappedPayments, batchData);
      case 'TABULAR_COMPONENTS':
        return this.generateTabularComponentsSchedule(mappedPayments, batchData);
      default:
        return this.generateDefaultSchedule(mappedPayments, batchData);
    }
  }
  */

  /**
   * COMMENTED OUT: Payment Schedule Logic - Focusing on Voucher Generation
   * 
   * Generate Single Vendor - Multiple Invoices Schedule (VBA Style)
   * @param {Array} payments - Mapped payment objects
   * @param {Object} batchData - Batch information
   * @returns {Object} Schedule data
   */
  /*
  static generateSingleVendorSchedule(payments, batchData) {
    const vendor = payments[0].vendor;
    const budgetLine = payments[0].budgetLine;
    const currency = payments[0].CurrencyOrig;
    
    return {
      type: 'SINGLE_VENDOR_SINGLE_BUDGET',
      title: `Payment Schedule - ${vendor}`,
      vendor,
      budgetLine,
      currency,
      payments: payments.map(payment => ({
        invoiceDetails: payment.invoiceNo ? 
          `${payment.vendor} - INV ${payment.invoiceNo}` : 
          `${payment.vendor} - ${payment.description}`,
        preTaxAmount: payment.PreTax_Transaction_Val,
        whtAmount: payment.WHT_Transaction_Val,
        subtotal: payment.Subtotal_Transaction_Val,
        vatAmount: payment.VAT_Transaction_Val,
        momoCharge: payment.MomoCharge_Transaction_Val,
        netPayable: payment.NetPayable_Transaction_Val,
        isPartialPayment: payment.IsPartialPayment,
        paymentPercentage: payment.PaymentPercentageThisTime,
        originalFullInvoiceNet: payment.Invoice_FullNetPayable_Val
      })),
      totalAmount: payments.reduce((sum, p) => sum + p.NetPayable_Transaction_Val, 0),
      totalUSDImpact: payments.reduce((sum, p) => sum + p.BudgetImpactUSD_Val, 0)
    };
  }
  */

  /**
   * COMMENTED OUT: Payment Schedule Logic - Focusing on Voucher Generation
   * 
   * Generate Aggregated Items - Single Budget Schedule (VBA Style)
   * @param {Array} payments - Mapped payment objects
   * @param {Object} batchData - Batch information
   * @returns {Object} Schedule data
   */
  /*
  static generateAggregatedItemsSchedule(payments, batchData) {
    const budgetLine = payments[0].budgetLine;
    
    return {
      type: 'MULTI_VENDOR_SINGLE_BUDGET',
      title: 'Payment Schedule - Aggregated Items',
      budgetLine,
      payments: payments.map(payment => ({
        vendor: payment.vendor,
        description: payment.description,
        invoiceNo: payment.invoiceNo,
        preTaxAmount: payment.PreTax_Transaction_Val,
        whtAmount: payment.WHT_Transaction_Val,
        levyAmount: payment.Levy_Transaction_Val,
        subtotal: payment.Subtotal_Transaction_Val,
        vatAmount: payment.VAT_Transaction_Val,
        momoCharge: payment.MomoCharge_Transaction_Val,
        netPayable: payment.NetPayable_Transaction_Val,
        isPartialPayment: payment.IsPartialPayment,
        paymentPercentage: payment.PaymentPercentageThisTime,
        originalFullInvoiceNet: payment.Invoice_FullNetPayable_Val,
        currency: payment.CurrencyOrig
      })),
      totalAmount: payments.reduce((sum, p) => sum + p.NetPayable_Transaction_Val, 0),
      totalUSDImpact: payments.reduce((sum, p) => sum + p.BudgetImpactUSD_Val, 0)
    };
  }
  */

  /**
   * COMMENTED OUT: Payment Schedule Logic - Focusing on Voucher Generation
   * 
   * Generate Multi-Budget Line Schedule (VBA Style)
   * @param {Array} payments - Mapped payment objects
   * @param {Object} batchData - Batch information
   * @returns {Object} Schedule data
   */
  /*
  static generateMultiBudgetLineSchedule(payments, batchData) {
    // Group by budget line
    const budgetLineGroups = {};
    payments.forEach(payment => {
      const budgetLine = payment.budgetLine;
      if (!budgetLineGroups[budgetLine]) {
        budgetLineGroups[budgetLine] = [];
      }
      budgetLineGroups[budgetLine].push(payment);
    });

    return {
      type: 'MULTI_BUDGET_LINE',
      title: 'Payment Schedule - By Budget Line',
      budgetLineGroups: Object.entries(budgetLineGroups).map(([budgetLine, groupPayments]) => ({
        budgetLine,
        payments: groupPayments.map(payment => ({
          vendor: payment.vendor,
          description: payment.description,
          invoiceNo: payment.invoiceNo,
          preTaxAmount: payment.PreTax_Transaction_Val,
          whtAmount: payment.WHT_Transaction_Val,
          levyAmount: payment.Levy_Transaction_Val,
          subtotal: payment.Subtotal_Transaction_Val,
          vatAmount: payment.VAT_Transaction_Val,
          momoCharge: payment.MomoCharge_Transaction_Val,
          netPayable: payment.NetPayable_Transaction_Val,
          isPartialPayment: payment.IsPartialPayment,
          paymentPercentage: payment.PaymentPercentageThisTime,
          originalFullInvoiceNet: payment.Invoice_FullNetPayable_Val,
          currency: payment.CurrencyOrig
        })),
        totalAmount: groupPayments.reduce((sum, p) => sum + p.NetPayable_Transaction_Val, 0),
        totalUSDImpact: groupPayments.reduce((sum, p) => sum + p.BudgetImpactUSD_Val, 0)
      })),
      totalAmount: payments.reduce((sum, p) => sum + p.NetPayable_Transaction_Val, 0),
      totalUSDImpact: payments.reduce((sum, p) => sum + p.BudgetImpactUSD_Val, 0)
    };
  }
  */

  /**
   * COMMENTED OUT: Payment Schedule Logic - Focusing on Voucher Generation
   * 
   * Generate Thematic Sections Schedule (VBA Style)
   * @param {Array} payments - Mapped payment objects
   * @param {Object} batchData - Batch information
   * @returns {Object} Schedule data
   */
  /*
  static generateThematicSectionsSchedule(payments, batchData) {
    // Define thematic categories (matching VBA logic)
    const categories = {
      'Travel & Per Diem': ['PER DIEM', 'TRANSPORT', 'TRAVEL ALLOWANCE', 'MILEAGE'],
      'Accommodation': ['HOTEL', 'LODGING', 'ACCOMMODATION'],
      'Airfare & Tickets': ['AIRFARE', 'TICKET', 'FLIGHT', 'RAIL'],
      'Other Expenses': []
    };

    // Categorize payments
    const categorizedPayments = {};
    Object.keys(categories).forEach(category => {
      categorizedPayments[category] = [];
    });

    payments.forEach(payment => {
      const description = (payment.description || '').toUpperCase();
      let categorized = false;
      
      for (const [category, keywords] of Object.entries(categories)) {
        if (keywords.some(keyword => description.includes(keyword))) {
          categorizedPayments[category].push(payment);
          categorized = true;
          break;
        }
      }
      
      if (!categorized) {
        categorizedPayments['Other Expenses'].push(payment);
      }
    });

    return {
      type: 'THEMATIC_SECTIONS',
      title: 'Payment Schedule - Thematic Breakdown',
      categories: Object.entries(categorizedPayments)
        .filter(([category, payments]) => payments.length > 0)
        .map(([category, categoryPayments]) => ({
          category,
          payments: categoryPayments.map(payment => ({
            vendor: payment.vendor,
            description: payment.description,
            invoiceNo: payment.invoiceNo,
            preTaxAmount: payment.PreTax_Transaction_Val,
            whtAmount: payment.WHT_Transaction_Val,
            levyAmount: payment.Levy_Transaction_Val,
            subtotal: payment.Subtotal_Transaction_Val,
            vatAmount: payment.VAT_Transaction_Val,
            momoCharge: payment.MomoCharge_Transaction_Val,
            netPayable: payment.NetPayable_Transaction_Val,
            isPartialPayment: payment.IsPartialPayment,
            paymentPercentage: payment.PaymentPercentageThisTime,
            originalFullInvoiceNet: payment.Invoice_FullNetPayable_Val,
            currency: payment.CurrencyOrig
          })),
          totalAmount: categoryPayments.reduce((sum, p) => sum + p.NetPayable_Transaction_Val, 0),
          totalUSDImpact: categoryPayments.reduce((sum, p) => sum + p.BudgetImpactUSD_Val, 0)
        })),
      totalAmount: payments.reduce((sum, p) => sum + p.NetPayable_Transaction_Val, 0),
      totalUSDImpact: payments.reduce((sum, p) => sum + p.BudgetImpactUSD_Val, 0)
    };
  }
  */

  // ✅ REMOVED: Old tabular components schedule logic - replaced by voucher system

  /**
   * COMMENTED OUT: Payment Schedule Logic - Focusing on Voucher Generation
   * 
   * Generate Default Schedule (fallback)
   * @param {Array} payments - Mapped payment objects
   * @param {Object} batchData - Batch information
   * @returns {Object} Schedule data
   */
  /*
  static generateDefaultSchedule(payments, batchData) {
    return {
      type: 'DEFAULT',
      title: 'Payment Schedule',
      payments: payments.map(payment => ({
        vendor: payment.vendor,
        description: payment.description,
        invoiceNo: payment.invoiceNo,
        preTaxAmount: payment.PreTax_Transaction_Val,
        whtAmount: payment.WHT_Transaction_Val,
        levyAmount: payment.Levy_Transaction_Val,
        subtotal: payment.Subtotal_Transaction_Val,
        vatAmount: payment.VAT_Transaction_Val,
        momoCharge: payment.MomoCharge_Transaction_Val,
        netPayable: payment.NetPayable_Transaction_Val,
        isPartialPayment: payment.IsPartialPayment,
        paymentPercentage: payment.PaymentPercentageThisTime,
        originalFullInvoiceNet: payment.Invoice_FullNetPayable_Val,
        currency: payment.CurrencyOrig
      })),
      totalAmount: payments.reduce((sum, p) => sum + p.NetPayable_Transaction_Val, 0),
      totalUSDImpact: payments.reduce((sum, p) => sum + p.BudgetImpactUSD_Val, 0)
    };
  }
  */
  
  /**
   * Finalize a payment batch (process all payments)
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} batchId - Batch ID to finalize
   * @param {string} userId - User ID finalizing the batch
   * @param {string} notes - Finalization notes
   * @returns {Promise<Object>} Finalization result
   */
  static async finalizePaymentBatch(db, appId, batchId, userId, notes = '') {
    try {
      const batch = writeBatch(db);
      
      // Get batch details
      const batchRef = doc(db, `artifacts/${appId}/public/data/paymentBatches/${batchId}`);
      const batchSnap = await getDoc(batchRef);
      
      if (!batchSnap.exists()) {
        throw new Error(`Batch ${batchId} not found`);
      }
      
      const batchData = batchSnap.data();
      
      if (batchData.status !== 'pending') {
        throw new Error(`Batch ${batchId} is not in pending status`);
      }
      
      // Get all payments in the batch
      const stagedRef = collection(db, `artifacts/${appId}/public/data/stagedPayments`);
      const stagedDocs = await getDocs(query(stagedRef, where('batchId', '==', batchId)));
      
      const payments = stagedDocs.docs.map(doc => doc.data());
      
      // Update batch status to processing
      batch.update(batchRef, {
        status: 'processing',
        processingDate: serverTimestamp(),
        processedBy: userId,
        notes
      });
      
      // Process each payment
      const processedPayments = [];
      const budgetUpdates = [];
      
      for (const payment of payments) {
        try {
          // Update payment status to finalized
          const paymentRef = doc(stagedRef, payment.id);
          batch.update(paymentRef, {
            status: 'finalized',
            finalizationDate: serverTimestamp(),
            finalizationStatus: 'completed'
          });
          
          // Update budget line balance if budget line exists
          if (payment.budgetLineId) {
            const budgetUpdate = await BudgetBalanceService.updateBudgetLineBalance(
              db, 
              payment.budgetLineId, 
              payment, 
              this.getCurrentMonth()
            );
            budgetUpdates.push(budgetUpdate);
          }
          
          processedPayments.push({
            id: payment.id,
            status: 'finalized',
            budgetUpdate: payment.budgetLineId ? 'completed' : 'skipped'
          });
          
        } catch (paymentError) {
          console.error(`Error processing payment ${payment.id}:`, paymentError);
          processedPayments.push({
            id: payment.id,
            status: 'failed',
            error: paymentError.message
          });
        }
      }
      
      // Update batch status to completed
      batch.update(batchRef, {
        status: 'completed',
        completionDate: serverTimestamp(),
        processedPayments,
        budgetUpdates,
        finalizationNotes: notes
      });
      
      // Commit all changes
      await batch.commit();
      
      console.log(`Payment batch ${batchId} finalized successfully`);
      
      return {
        success: true,
        batchId,
        processedPayments,
        budgetUpdates,
        message: 'Payment batch finalized successfully'
      };
      
    } catch (error) {
      console.error('Error finalizing payment batch:', error);
      throw error;
    }
  }
  
  /**
   * Get staged payments for a weekly sheet
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} weeklySheetId - Weekly sheet ID
   * @returns {Promise<Array>} Array of staged payments
   */
  static async getStagedPayments(db, appId, weeklySheetId) {
    try {
      const stagedRef = collection(db, `artifacts/${appId}/public/data/stagedPayments`);
      const stagedDocs = await getDocs(
        query(
          stagedRef, 
          where('weeklySheetId', '==', weeklySheetId),
          where('status', '==', 'staged')
          // Removed orderBy temporarily to avoid indexing requirement
        )
      );
      
      // Sort in memory instead of in the database
      const payments = stagedDocs.docs.map(doc => doc.data());
      return payments.sort((a, b) => {
        const dateA = a.stageDate?.toDate?.() || new Date(0);
        const dateB = b.stageDate?.toDate?.() || new Date(0);
        return dateB - dateA; // Descending order
      });
      
    } catch (error) {
      console.error('Error getting staged payments:', error);
      throw error;
    }
  }
  
  /**
   * Get all payment batches
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @returns {Promise<Array>} Array of payment batches
   */
  static async getPaymentBatches(db, appId) {
    try {
      const batchRef = collection(db, `artifacts/${appId}/public/data/paymentBatches`);
      const batchDocs = await getDocs(
        query(batchRef, orderBy('createdDate', 'desc'))
      );
      
      return batchDocs.docs.map(doc => doc.data());
      
    } catch (error) {
      console.error('Error getting payment batches:', error);
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
}

// Export utility functions
export const getPaymentStatusColor = (status) => {
  switch (status) {
    case 'staged': return 'text-blue-600 bg-blue-100';
    case 'batched': return 'text-yellow-600 bg-yellow-100';
    case 'finalized': return 'text-green-600 bg-green-100';
    case 'failed': return 'text-red-600 bg-red-100';
    default: return 'text-gray-600 bg-gray-100';
  }
};

export const getBatchStatusColor = (status) => {
  switch (status) {
    case 'pending': return 'text-yellow-600 bg-yellow-100';
    case 'processing': return 'text-blue-600 bg-blue-100';
    case 'completed': return 'text-green-600 bg-green-100';
    case 'failed': return 'text-red-600 bg-red-100';
    default: return 'text-gray-600 bg-gray-100';
  }
};
