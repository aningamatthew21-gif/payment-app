import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, deleteDoc, doc, getDocs, setDoc, addDoc } from 'firebase/firestore';
import { FileText, CreditCard, XCircle, ArrowLeft, RefreshCw, Trash2 } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; // Change this import

// CORE WHT INTEGRATION: Import enhanced WHT services
import { WHTEnhancedService } from '../services/WHTEnhancedService.js';
import { ProcurementTypesService } from '../services/ProcurementTypesService.js';
import { WHT_CONFIG } from '../config/WHTConfig.js';
import { calculateTotalTaxes } from '../services/FinancialEngine.js';

// ✅ SIMPLIFIED: autoTable is now automatically available via import

// ✅ SIMPLIFIED: autoTable is automatically available via import - no complex loading needed

// ✅ FIXED: Removed problematic fallback code that was causing warnings
import { VoucherBalanceService } from '../services/VoucherBalanceService';
import { PaymentFinalizationService } from '../services/PaymentFinalizationService';
import ProcessingStatusModal from './ProcessingStatusModal';
import { BatchScheduleService } from '../services/BatchScheduleService'; // VBA-style schedule layouts

function safeToFixed(val, digits = 2) {
  if (val === null || val === undefined) {
    console.warn('[PaymentStaging] safeToFixed called with null/undefined, returning 0.00');
    return '0.00';
  }
  const num = Number(val);
  return isNaN(num) ? '0.00' : num.toFixed(digits);
}

const PaymentStaging = ({ db, appId, userId, weeklySheetId, onClose, payments: propPayments }) => {
  const [stagedPayments, setStagedPayments] = useState([]);
  const [selectedPayments, setSelectedPayments] = useState([]);
  const [loading, setLoading] = useState(!propPayments);
  const [voucherData, setVoucherData] = useState({
    voucherDate: new Date().toISOString().slice(0, 10),
    purpose: ''
  });
  const [showVoucherPreview, setShowVoucherPreview] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizationResult, setFinalizationResult] = useState(null);

  // Modal state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('VALIDATING');
  const [processingError, setProcessingError] = useState(null);

  // VBA-style schedule layout selection
  const [selectedLayout, setSelectedLayout] = useState('AUTO');
  const [generatingSchedule, setGeneratingSchedule] = useState(false);
  const [showSchedulePreview, setShowSchedulePreview] = useState(false);
  const [schedulePreviewUrl, setSchedulePreviewUrl] = useState(null);

  const PROCESSING_STEPS = [
    { id: 'VALIDATING', label: 'Validating Payments' },
    { id: 'UNDO_CAPTURE', label: 'Creating Undo Point' },
    { id: 'BUDGET_UPDATE', label: 'Updating Budget Balances' },
    { id: 'WHT_PROCESSING', label: 'Processing Withholding Tax' },
    { id: 'STATUS_UPDATE', label: 'Updating Payment Status' },
    { id: 'MASTER_LOG', label: 'Logging to Master Transaction Log' },
    { id: 'COMPLETED', label: 'Finalization Complete' }
  ];

  useEffect(() => {
    // If payments are passed as props, use them directly
    if (propPayments) {
      console.log('[PaymentStaging] Using payments passed via props:', propPayments.length);
      setStagedPayments(propPayments);
      setLoading(false);
      return;
    }

    if (!db || !appId || !weeklySheetId) return;

    const loadStagedPayments = async () => {
      try {
        setLoading(true);
        const stagedRef = collection(db, `artifacts/${appId}/public/data/stagedPayments`);
        const q = query(stagedRef);

        const unsubscribe = onSnapshot(q, (snapshot) => {
          const payments = [];
          snapshot.forEach(doc => {
            const payment = { id: doc.id, ...doc.data() };
            if (payment.weeklySheetId === weeklySheetId) {
              payments.push(payment);
            }
          });
          setStagedPayments(payments);
          setLoading(false);
        });

        return unsubscribe;
      } catch (error) {
        console.error('Error loading staged payments:', error);
        setLoading(false);
      }
    };

    loadStagedPayments();
  }, [db, appId, weeklySheetId, propPayments]);

  const handlePaymentSelection = (paymentId, isSelected) => {
    if (isSelected) {
      setSelectedPayments(prev => [...prev, paymentId]);
    } else {
      setSelectedPayments(prev => prev.filter(id => id !== paymentId));
    }
  };

  const generateVoucher = async () => {
    if (selectedPayments.length === 0) {
      alert('Please select at least one payment to generate a voucher.');
      return;
    }

    console.log(`[PaymentStaging] Generating voucher for ${selectedPayments.length} payments`);
    console.log(`[PaymentStaging] Selected payment IDs:`, selectedPayments);

    const selectedPaymentData = stagedPayments.filter(payment =>
      selectedPayments.includes(payment.id)
    );

    if (selectedPaymentData.length === 0) {
      alert('No valid payment data found for the selected payments.');
      return;
    }

    console.log(`[PaymentStaging] Selected payment data:`, selectedPaymentData);

    const hasPartialPayment = selectedPaymentData.some(payment =>
      payment.isPartialPayment && payment.paymentPercentage < 100
    );

    // Debug: Check fxRate and currency values
    console.log(`[PaymentStaging] First payment fxRate:`, selectedPaymentData[0]?.fxRate);
    console.log(`[PaymentStaging] First payment currency:`, selectedPaymentData[0]?.currency);
    console.log(`[PaymentStaging] First payment full data:`, selectedPaymentData[0]);

    // Debug: Check all possible fxRate fields
    console.log(`[PaymentStaging] Checking all possible fxRate fields:`);
    console.log(`  - payment.fxRate:`, selectedPaymentData[0]?.fxRate);
    console.log(`  - payment.exchangeRate:`, selectedPaymentData[0]?.exchangeRate);
    console.log(`  - payment.rate:`, selectedPaymentData[0]?.rate);
    console.log(`  - payment.fx:`, selectedPaymentData[0]?.fx);
    console.log(`  - All payment keys:`, Object.keys(selectedPaymentData[0] || {}));

    // Debug: Check if fxRate is being lost during processing
    console.log(`[PaymentStaging] FX Rate Debug - Before Processing:`);
    selectedPaymentData.forEach((payment, index) => {
      console.log(`  Payment ${index + 1}:`, {
        id: payment.id,
        fxRate: payment.fxRate,
        fxRateType: typeof payment.fxRate,
        currency: payment.currency,
        vendor: payment.vendor
      });
    });

    // NEW: Group payments by budget line and calculate budget impact for each
    console.log(`[PaymentStaging] Grouping payments by budget line...`);
    const paymentsByBudgetLine = selectedPaymentData.reduce((acc, payment) => {
      const budgetLine = payment.budgetLine || payment.budgetItem || 'Unknown';
      if (!acc[budgetLine]) {
        acc[budgetLine] = [];
      }
      acc[budgetLine].push(payment);
      return acc;
    }, {});

    console.log(`[PaymentStaging] Payments grouped by budget line:`, paymentsByBudgetLine);

    // NEW: Enhanced budget line resolution system
    const budgetBalances = [];
    const uniqueBudgetLines = Object.keys(paymentsByBudgetLine);

    console.log(`[PaymentStaging] Processing ${uniqueBudgetLines.length} unique budget lines:`, uniqueBudgetLines);

    for (const budgetLine of uniqueBudgetLines) {
      const payments = paymentsByBudgetLine[budgetLine];
      const firstPayment = payments[0];

      console.log(`[PaymentStaging] Processing budget line: ${budgetLine}`);
      console.log(`[PaymentStaging] Number of payments for this line: ${payments.length}`);
      console.log(`[PaymentStaging] First payment budget line ID: ${firstPayment.budgetLineId}`);

      // ENHANCED: Try multiple methods to resolve budget line
      let budgetLineId = null;
      let balanceData = null;

      // Method 1: Use existing budgetLineId if available
      if (firstPayment.budgetLineId) {
        budgetLineId = firstPayment.budgetLineId;
        console.log(`[PaymentStaging] Using existing budget line ID: ${budgetLineId}`);
      } else {
        // Method 2: Search for budget line by name in the database
        // ✅ FIX: Extract raw budget line name from formatted display value
        // Format is typically: "Name - AccountNo - DeptCode - DeptDimension"
        const rawBudgetName = budgetLine.includes(' - ')
          ? budgetLine.split(' - ')[0].trim()
          : budgetLine.trim();

        console.log(`[PaymentStaging] Searching by name: "${rawBudgetName}" (from "${budgetLine}")`);
        try {
          const budgetLinesRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);
          let budgetLinesQuery = query(budgetLinesRef, where('name', '==', rawBudgetName));
          let budgetLinesSnapshot = await getDocs(budgetLinesQuery);

          // If not found with raw name, try exact match
          if (budgetLinesSnapshot.empty && rawBudgetName !== budgetLine) {
            console.log(`[PaymentStaging] Raw name lookup failed, trying exact match...`);
            budgetLinesQuery = query(budgetLinesRef, where('name', '==', budgetLine));
            budgetLinesSnapshot = await getDocs(budgetLinesQuery);
          }

          if (!budgetLinesSnapshot.empty) {
            const budgetLineDoc = budgetLinesSnapshot.docs[0];
            budgetLineId = budgetLineDoc.id;
            console.log(`[PaymentStaging] Found budget line: "${rawBudgetName}" -> ID: ${budgetLineId}`);
          } else {
            console.warn(`[PaymentStaging] No budget line found for: "${rawBudgetName}"`);
          }
        } catch (searchError) {
          console.error(`[PaymentStaging] Error searching for budget line:`, searchError);
        }
      }

      // Method 3: Try to fetch budget balance data
      if (budgetLineId) {
        try {
          console.log(`[PaymentStaging] Fetching budget balance for budget line ID: ${budgetLineId}`);
          balanceData = await VoucherBalanceService.getBudgetBalanceForVoucher(
            db,
            appId,
            budgetLineId
          );
          console.log(`[PaymentStaging] Budget balance data retrieved:`, balanceData);
        } catch (error) {
          console.error(`[PaymentStaging] Error fetching budget balance for ${budgetLine}:`, error);
          balanceData = null;
        }
      }

      // Calculate total budget impact for this budget line
      const totalImpact = payments.reduce((sum, p) => sum + Number(p.budgetImpactUSD || 0), 0);

      // Create budget balance object with enhanced data
      const budgetBalance = {
        budgetLineName: budgetLine,
        budgetLineId: budgetLineId,
        allocatedAmount: balanceData?.allocatedAmount || 0,
        totalSpendToDate: balanceData?.totalSpendToDate || 0,
        balCD: balanceData?.balCD || 0,
        request: totalImpact,
        balBD: (balanceData?.balCD || 0) - totalImpact,
        paymentCount: payments.length,
        payments: payments,
        // Enhanced error tracking
        error: budgetLineId ? null : 'Budget line not found in database',
        warning: !balanceData ? 'Could not fetch budget balance data' : null,
        // Debug information
        debug: {
          searchMethod: firstPayment.budgetLineId ? 'existing_id' : 'database_search',
          foundInDatabase: !!budgetLineId,
          balanceDataRetrieved: !!balanceData
        }
      };

      budgetBalances.push(budgetBalance);
      console.log(`[PaymentStaging] Budget balance calculated for ${budgetLine}:`, budgetBalance);
    }

    console.log(`[PaymentStaging] All budget balances calculated:`, budgetBalances);

    // Calculate overall totals
    const totalBudgetImpact = budgetBalances.reduce((sum, bb) => sum + bb.request, 0);
    const hasMultipleBudgetLines = budgetBalances.length > 1;

    console.log(`[PaymentStaging] Total budget impact across all lines: ${totalBudgetImpact}`);
    console.log(`[PaymentStaging] Has multiple budget lines: ${hasMultipleBudgetLines}`);

    // CORE WHT INTEGRATION: Calculate WHT using enhanced service
    console.log('[PaymentStaging] Calculating WHT using enhanced service...');

    // Process each payment with enhanced WHT calculation
    const processedPayments = await Promise.all(selectedPaymentData.map(async (payment) => {
      try {
        // Prepare payment data for WHT calculation
        const paymentData = {
          ...payment,
          amount: Number(payment.pretaxAmount || payment.fullPretax || payment.amount || 0), // WHT service expects 'amount'
          pretaxAmount: Number(payment.pretaxAmount || payment.fullPretax || payment.amount || 0),
          levyAmount: Number(payment.levyAmount || 0),
          vatAmount: Number(payment.vatAmount || 0),
          momoCharge: Number(payment.momoCharge || 0),
          netPayable: Number(payment.netPayable || payment.amountThisTransaction || 0),
          procurementType: payment.procurementType || payment.procurement || 'STANDARD',
          isPartialPayment: payment.isPartialPayment || false,
          paymentPercentage: Number(payment.paymentPercentage || 100),
          originalNetPayable: Number(payment.netPayable || 0),
          partialAmount: Number(payment.amountThisTransaction || payment.netPayable || 0),
          // Explicitly preserve fxRate and currency
          fxRate: payment.fxRate ? Number(payment.fxRate) : undefined,
          currency: payment.currency || 'GHS'
        };

        // Debug: Check if fxRate is preserved during processing
        console.log(`[PaymentStaging] Payment ${payment.id} fxRate processing:`, {
          original: payment.fxRate,
          processed: paymentData.fxRate,
          currency: paymentData.currency
        });

        // Calculate WHT using FinancialEngine (unified calculation system)
        // WHT is already calculated in PaymentGenerator, but we verify/recalculate here if needed
        if (paymentData.currency === 'GHS' || paymentData.currency === 'GHC') {
          try {
            // Get effective WHT rate (with fallback)
            const whtRate = await WHTEnhancedService.getEffectiveWHTRate(
              db,
              appId,
              paymentData.procurementType || 'DEFAULT'
            );

            // Prepare transaction for FinancialEngine
            const transaction = {
              fullPretax: Number(paymentData.pretaxAmount || paymentData.amount || 0),
              procurementType: paymentData.procurementType || 'DEFAULT',
              taxType: paymentData.taxType || 'STANDARD',
              vatDecision: paymentData.vatDecision || paymentData.vat || 'NO',
              paymentMode: paymentData.paymentMode || 'BANK TRANSFER',
              currency: paymentData.currency || 'GHS',
              fxRate: Number(paymentData.fxRate || 1)
            };

            // Calculate using FinancialEngine (unified system)
            const calculation = calculateTotalTaxes(transaction, { whtRate });

            if (calculation && calculation.wht > 0) {
              console.log(`[PaymentStaging] WHT recalculated for payment ${payment.id}:`, {
                whtRate: `${(whtRate * 100).toFixed(2)}%`,
                whtAmount: calculation.wht
              });

              return {
                ...paymentData,
                whtAmount: calculation.wht,
                whtRate: whtRate,
                whtType: paymentData.procurementType || 'DEFAULT',
                // Update net payable if WHT was recalculated
                netPayable: calculation.netPayable || paymentData.netPayable,
                // Enhanced WHT metadata
                whtCalculated: true,
                whtCalculationMethod: 'financial_engine',
                whtCalculationTimestamp: new Date().toISOString()
              };
            }
          } catch (whtError) {
            console.warn(`[PaymentStaging] WHT calculation failed, using existing values:`, whtError);
          }
        }

        // Fallback to existing WHT values (already calculated by PaymentGenerator)
        return {
          ...paymentData,
          whtAmount: Number(payment.whtAmount || 0),
          whtRate: Number(payment.whtRate || 0),
          whtType: payment.procurementType || payment.procurement || 'STANDARD',
          whtCalculated: !!payment.whtAmount,
          whtCalculationMethod: payment.whtCalculationMethod || 'payment_generator'
        };
      } catch (error) {
        console.error(`[PaymentStaging] Error processing payment ${payment.id} for WHT:`, error);
        // Return payment with fallback WHT values
        return {
          ...payment,
          amount: Number(payment.pretaxAmount || payment.fullPretax || payment.amount || 0), // WHT service expects 'amount'
          pretaxAmount: Number(payment.pretaxAmount || payment.fullPretax || payment.amount || 0),
          whtAmount: Number(payment.whtAmount || 0),
          levyAmount: Number(payment.levyAmount || 0),
          vatAmount: Number(payment.vatAmount || 0),
          momoCharge: Number(payment.momoCharge || 0),
          netPayable: Number(payment.netPayable || payment.amountThisTransaction || 0),
          procurementType: payment.procurementType || payment.procurement || 'STANDARD',
          whtRate: Number(payment.whtRate || 0),
          isPartialPayment: payment.isPartialPayment || false,
          paymentPercentage: Number(payment.paymentPercentage || 100),
          originalNetPayable: Number(payment.netPayable || 0),
          partialAmount: Number(payment.amountThisTransaction || payment.netPayable || 0),
          fxRate: payment.fxRate ? Number(payment.fxRate) : undefined,
          currency: payment.currency || 'GHS',
          whtCalculated: false,
          whtCalculationMethod: 'error_fallback'
        };

        // Debug: Check if fxRate is preserved in error fallback
        console.log(`[PaymentStaging] Payment ${payment.id} fxRate error fallback:`, {
          original: payment.fxRate,
          fallback: payment.fxRate ? Number(payment.fxRate) : undefined,
          currency: payment.currency || 'GHS'
        });
      }
    }));

    console.log('[PaymentStaging] Processed payments with enhanced WHT:', processedPayments);

    // Debug: Log fxRate information for each payment
    console.log('[PaymentStaging] FX Rate Debug Information:');
    processedPayments.forEach((payment, index) => {
      console.log(`  Payment ${index + 1}:`, {
        id: payment.id,
        currency: payment.currency,
        fxRate: payment.fxRate,
        fxRateType: typeof payment.fxRate,
        vendor: payment.vendor,
        amount: payment.amount
      });
    });

    const voucherData = {
      voucherDate: new Date().toISOString().split('T')[0],
      payments: processedPayments,
      totalAmount: selectedPaymentData.reduce((sum, p) => sum + Number(p.amountThisTransaction || p.netPayable || 0), 0),
      originalTotalAmount: selectedPaymentData.reduce((sum, p) => sum + Number(p.netPayable || 0), 0),
      purpose: selectedPaymentData.map(p => p.description || p.descriptions || 'Payment').join(', '),
      budgetImpact: totalBudgetImpact,
      hasPartialPayment,
      // NEW: Multiple budget lines support
      budgetBalances: budgetBalances,
      hasMultipleBudgetLines: hasMultipleBudgetLines,
      // Legacy support for single budget line
      budgetBalance: budgetBalances.length === 1 ? budgetBalances[0] : null
    };

    console.log(`[PaymentStaging] Voucher data prepared:`, voucherData);
    console.log(`[PaymentStaging] Budget balances for voucher:`, voucherData.budgetBalances);

    // Debug: Log final fxRate information in voucher data
    console.log('[PaymentStaging] Final FX Rate Information in Voucher:');
    voucherData.payments.forEach((payment, index) => {
      console.log(`  Voucher Payment ${index + 1}:`, {
        id: payment.id,
        currency: payment.currency,
        fxRate: payment.fxRate,
        fxRateType: typeof payment.fxRate,
        vendor: payment.vendor
      });
    });

    setVoucherData(voucherData);
    setShowVoucherPreview(true);
  };

  const convertAmountToWords = (amount, depth = 0) => {
    // Prevent infinite recursion
    if (depth > 10) return 'NUMBER TOO LARGE';

    // Handle invalid inputs
    if (amount === null || amount === undefined || isNaN(amount)) return 'ZERO';

    // Ensure we're working with a positive integer
    amount = Math.abs(Math.floor(Number(amount)));

    const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
    const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
    const teens = ['TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];

    if (amount === 0) return depth === 0 ? 'ZERO' : '';
    if (amount < 10) return ones[amount];
    if (amount < 20) return teens[amount - 10];
    if (amount < 100) return tens[Math.floor(amount / 10)] + (amount % 10 > 0 ? ' ' + ones[amount % 10] : '');
    if (amount < 1000) return ones[Math.floor(amount / 100)] + ' HUNDRED' + (amount % 100 > 0 ? ' AND ' + convertAmountToWords(amount % 100, depth + 1) : '');
    if (amount < 1000000) return convertAmountToWords(Math.floor(amount / 1000), depth + 1) + ' THOUSAND' + (amount % 1000 > 0 ? ' ' + convertAmountToWords(amount % 1000, depth + 1) : '');
    if (amount < 1000000000) return convertAmountToWords(Math.floor(amount / 1000000), depth + 1) + ' MILLION' + (amount % 1000000 > 0 ? ' ' + convertAmountToWords(amount % 1000000, depth + 1) : '');
    return convertAmountToWords(Math.floor(amount / 1000000000), depth + 1) + ' BILLION' + (amount % 1000000000 > 0 ? ' ' + convertAmountToWords(amount % 1000000000, depth + 1) : '');
  };

  const finalizePayments = async () => {
    console.log('[PaymentStaging] finalizePayments called');
    console.log('[PaymentStaging] voucherData:', voucherData);
    console.log('[PaymentStaging] finalizing state:', finalizing);

    if (!voucherData || !voucherData.payments || voucherData.payments.length === 0) {
      console.error('[PaymentStaging] No voucher data available for finalization');
      alert('No voucher data available for finalization. Please generate a voucher first.');
      return;
    }

    alert(">>>>>>>>>>>>>>>>>>>>>>>>>>.... 1");

    if (!confirm(`Are you sure you want to finalize ${voucherData.payments.length} payment(s)?\n\nThis action will:\n• Update budget balances\n• Process WHT items\n• Mark payments as finalized\n• Create transaction logs\n• Generate PDF voucher\n\nThis action cannot be undone easily.`)) {
      console.log('[PaymentStaging] User cancelled finalization');
      return;
    }

    console.log('[PaymentStaging] Setting finalizing to true');
    setFinalizing(true);
    setFinalizationResult(null);

    try {
      console.log('[PaymentStaging] Starting payment finalization process');

      // CRITICAL FIX: Create a deep copy of voucher data BEFORE finalization
      // This prevents data mutation issues during PDF generation
      const voucherDataForPDF = JSON.parse(JSON.stringify(voucherData));
      console.log('[PaymentStaging] Created stable copy of voucher data for PDF generation');

      // Prepare metadata for finalization
      const metadata = {
        weeklySheetId,
        weeklySheetName: weeklySheetId, // Use the actual sheet name instead of "Weekly Sheet" prefix
        finalizationType: 'voucher',
        voucherGenerated: true
      };

      // ✅ ENHANCED: Ensure all payments have weekly sheet information
      const enhancedPayments = voucherData.payments.map(payment => ({
        ...payment,
        weeklySheetId: weeklySheetId,
        weeklySheetName: weeklySheetId // Add weekly sheet name to each payment
      }));

      console.log('[PaymentStaging] Enhanced payments with weekly sheet info:', enhancedPayments.map(p => ({
        id: p.id,
        vendor: p.vendor,
        weeklySheetId: p.weeklySheetId,
        weeklySheetName: p.weeklySheetName
      })));

      // CORE WHT INTEGRATION: Log WHT transactions before finalization
      if (WHT_CONFIG.USE_ENHANCED_WHT_SERVICE) {
        try {
          console.log('[PaymentStaging] Logging WHT transactions to WHT Returns log...');

          // Filter GHS transactions with WHT
          const whtTransactions = voucherData.payments.filter(p =>
            p.currency === 'GHS' && p.whtAmount > 0 && p.whtCalculated
          );

          if (whtTransactions.length > 0) {
            console.log(`[PaymentStaging] Found ${whtTransactions.length} WHT transactions to log:`, whtTransactions);

            // Log each WHT transaction
            for (const transaction of whtTransactions) {
              try {
                // Create WHT return entry
                const whtReturnData = {
                  transactionId: transaction.id,
                  vendorName: transaction.vendor,
                  procurementType: transaction.procurementType,
                  whtRate: transaction.whtRate,
                  whtAmount: transaction.whtAmount,
                  pretaxAmount: transaction.pretaxAmount,
                  netPayable: transaction.netPayable,
                  currency: transaction.currency,
                  weeklySheetId: weeklySheetId,
                  voucherId: `VOUCHER-${Date.now()}`,
                  finalizationDate: new Date().toISOString(),
                  whtCalculationMethod: transaction.whtCalculationMethod,
                  whtCalculationTimestamp: transaction.whtCalculationTimestamp,
                  status: 'active',
                  createdAt: new Date().toISOString()
                };

                // Add to WHT returns collection
                const whtReturnsRef = collection(db, `artifacts/${appId}/public/data/whtReturns`);
                await addDoc(whtReturnsRef, whtReturnData);

                console.log(`[PaymentStaging] ✓ WHT transaction logged: ${transaction.id}`);
              } catch (whtLogError) {
                console.error(`[PaymentStaging] Failed to log WHT transaction ${transaction.id}:`, whtLogError);
                // Continue with other transactions
              }
            }
          } else {
            console.log('[PaymentStaging] No WHT transactions found to log');
          }
        } catch (whtError) {
          console.warn('[PaymentStaging] WHT logging failed, continuing with finalization:', whtError);
        }
      }

      // Call the PaymentFinalizationService
      console.log('[PaymentStaging] Calling PaymentFinalizationService with:', {
        db: !!db,
        appId,
        userId
      });

      const result = await PaymentFinalizationService.finalizePaymentBatch(
        db,
        appId,
        userId,
        enhancedPayments,
        metadata,
        (step) => setProcessingStep(step)
      );

      if (result.success) {
        console.log('[PaymentStaging] Finalization successful:', result);
        setFinalizationResult(result);
        setProcessingStep('COMPLETED');

        // Generate PDF after successful finalization using the stable copy
        await generateVoucherPDF(voucherDataForPDF, true);

        // Close modal after a delay
        setTimeout(() => {
          setFinalizing(false);
          onClose();
        }, 2000);
      }
    } catch (error) {
      console.error('[PaymentStaging] Finalization failed:', error);
      setProcessingStep('ERROR');
      setProcessingError(error.message);
    }
  };

  const generateVoucherPDF = async (dataToUse, isStableCopy = false) => {
    if (!dataToUse) {
      console.error('[PaymentStaging] No voucher data available for PDF generation');
      alert('No voucher data available. Please generate a voucher first.');
      return;
    }

    console.log('[PaymentStaging] PDF generation using data source:', isStableCopy ? 'stable copy' : 'original voucherData');

    try {
      console.log(`[PaymentStaging] Starting PDF generation for voucher`);
      console.log(`[PaymentStaging] Voucher data:`, dataToUse);

      // CRITICAL: Validate data structure before proceeding
      if (!dataToUse.payments || !Array.isArray(dataToUse.payments) || dataToUse.payments.length === 0) {
        throw new Error('Invalid voucher data structure: payments array is missing or empty');
      }

      if (!dataToUse.budgetBalances || !Array.isArray(dataToUse.budgetBalances) || dataToUse.budgetBalances.length === 0) {
        throw new Error('Invalid voucher data structure: budgetBalances array is missing or empty');
      }

      // Validate each payment has required fields
      dataToUse.payments.forEach((payment, index) => {
        if (!payment.reference && !payment.invoiceNo) {
          console.warn(`[PaymentStaging] Payment ${index} missing reference/invoiceNo, using 'N/A'`);
        }
        if (!payment.description) {
          console.warn(`[PaymentStaging] Payment ${index} missing description, using 'N/A'`);
        }
      });

      console.log(`[PaymentStaging] Data structure validation passed`);

      // FIXED: Create PDF with proper initialization
      console.log('[PaymentStaging] Creating PDF instance...');
      const pdfDoc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = pdfDoc.internal.pageSize.width;
      const margin = 20;
      let yPosition = 30;

      // Company Header
      pdfDoc.setFontSize(18);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.text('MARGINS ID SYSTEMS APPLICATION LIMITED', pageWidth / 2, yPosition, { align: 'center' });

      yPosition += 8;
      pdfDoc.setFontSize(10);
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.text('P.O. Box KN 785, Kaneshie - Accra, Ghana.', pageWidth / 2, yPosition, { align: 'center' });

      yPosition += 12;
      pdfDoc.setFontSize(16);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.text('PAYMENT VOUCHER', pageWidth / 2, yPosition, { align: 'center' });

      yPosition += 20;

      // Voucher Details
      pdfDoc.setFontSize(10);
      pdfDoc.setFont('helvetica', 'normal');

      pdfDoc.text('Pay To:', margin, yPosition);
      pdfDoc.text(dataToUse.payments[0]?.vendor || 'N/A', margin + 30, yPosition);

      yPosition += 6;
      pdfDoc.text('Purpose:', margin, yPosition);
      pdfDoc.text(dataToUse.purpose || 'N/A', margin + 30, yPosition);

      yPosition += 6;
      pdfDoc.text('Amount Payable (In Words):', margin, yPosition);
      yPosition += 6;
      pdfDoc.setFontSize(9);
      const amountInWords = convertAmountToWords(Math.floor(dataToUse.totalAmount)) + ' CEDIS AND ' +
        Math.round((dataToUse.totalAmount % 1) * 100) + ' PESEWAS ONLY';
      pdfDoc.text(amountInWords, margin + 5, yPosition);

      // Right column
      yPosition -= 12;
      pdfDoc.setFontSize(10);
      pdfDoc.setFont('helvetica', 'normal');

      pdfDoc.text('Voucher No.:', pageWidth - margin - 60, yPosition);
      pdfDoc.text('MIDSA-FIN-' + Date.now(), pageWidth - margin - 20, yPosition);

      yPosition += 6;
      pdfDoc.text('Voucher Date:', pageWidth - margin - 60, yPosition);
      pdfDoc.text(dataToUse.voucherDate, pageWidth - margin - 20, yPosition);

      yPosition += 6;
      pdfDoc.text('Amount Payable:', pageWidth - margin - 60, yPosition);
      pdfDoc.setFontSize(14);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.text(getCurrencySymbol(dataToUse.payments[0]?.currency || 'GHS') + dataToUse.totalAmount.toFixed(2), pageWidth - margin - 20, yPosition);

      yPosition += 20;

      // Payment Details Table
      const tableHeaders = ['S/N', 'Invoice No', 'Description', 'Budget Line', 'Pre-Tax Amt', 'WHT Type', 'WHT Rate', 'WHT Amt (-)', 'Levy Amt (+)', 'VAT Amt (+)', 'MoMo Chg (+)', 'Net Payable'];

      const tableData = dataToUse.payments.map((payment, index) => {
        const whtAmount = payment.whtAmount || 0;
        const levyAmount = payment.levyAmount || 0;
        const vatAmount = payment.vatAmount || 0;
        const momoCharge = payment.momoCharge || 0;
        const netPayable = payment.netPayable || payment.pretaxAmount || 0;
        const currency = payment.currency || 'USD';

        return [
          (index + 1).toString(),
          payment.invoiceNo || payment.reference || 'N/A',
          payment.description || 'N/A',
          payment.budgetLine || payment.budgetItem || payment.budgetLineName || 'N/A',
          getCurrencySymbol(currency) + (payment.pretaxAmount || 0).toFixed(2),
          payment.whtType || payment.procurementType || 'N/A',
          payment.whtRate ? (payment.whtRate * 100).toFixed(2) + '%' : 'N/A',
          getCurrencySymbol(currency) + whtAmount.toFixed(2),
          getCurrencySymbol(currency) + levyAmount.toFixed(2),
          getCurrencySymbol(currency) + vatAmount.toFixed(2),
          getCurrencySymbol(currency) + momoCharge.toFixed(2),
          getCurrencySymbol(currency) + netPayable.toFixed(2)
        ];
      });

      console.log('[PaymentStaging] Payment table data prepared:', tableData);

      // FIXED: Use autoTable directly without checking for function availability
      autoTable(pdfDoc, {
        head: [tableHeaders],
        body: tableData,
        startY: yPosition,
        margin: { left: margin, right: margin },
        styles: {
          fontSize: 7,
          cellPadding: 2,
          overflow: 'linebreak',
          halign: 'left'
        },
        headStyles: {
          fillColor: [55, 65, 81],
          textColor: 255,
          fontStyle: 'bold'
        },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },   // S/N
          1: { cellWidth: 20, halign: 'left' },    // Invoice No
          2: { cellWidth: 30, halign: 'left' },    // Description
          3: { cellWidth: 22, halign: 'left' },    // Budget Line
          4: { cellWidth: 18, halign: 'right' },   // Pre-Tax Amt
          5: { cellWidth: 15, halign: 'center' },  // WHT Type
          6: { cellWidth: 12, halign: 'center' },  // WHT Rate
          7: { cellWidth: 16, halign: 'right' },   // WHT Amt
          8: { cellWidth: 16, halign: 'right' },   // Levy Amt
          9: { cellWidth: 16, halign: 'right' },   // VAT Amt
          10: { cellWidth: 16, halign: 'right' },  // MoMo Chg
          11: { cellWidth: 18, halign: 'right' }   // Net Payable
        }
      });

      console.log('[PaymentStaging] Payment details table generated successfully');

      // Update yPosition after table
      yPosition = pdfDoc.lastAutoTable.finalY + 15;

      // Budget Impact Table
      const budgetHeaders = ['Budget Line', 'Allocated (USD)', 'Spent to Date (USD)', 'Balance C/D (USD)', 'Request (USD)', 'Balance B/D (USD)'];

      const budgetData = dataToUse.budgetBalances.map(bb => {
        return [
          bb.budgetLineName || 'N/A',
          (bb.allocatedAmount || 0).toFixed(2),
          (bb.totalSpendToDate || 0).toFixed(2),
          (bb.balCD || 0).toFixed(2),
          (bb.request || 0).toFixed(2),
          (bb.balBD || 0).toFixed(2)
        ];
      });

      console.log('[PaymentStaging] Budget table data prepared:', budgetData);

      // Generate budget impact table
      autoTable(pdfDoc, {
        head: [budgetHeaders],
        body: budgetData,
        startY: yPosition,
        margin: { left: margin, right: margin },
        styles: {
          fontSize: 7,
          cellPadding: 2,
          overflow: 'linebreak'
        },
        headStyles: {
          fillColor: [55, 65, 81],
          textColor: 255,
          fontStyle: 'bold'
        },
        columnStyles: {
          0: { cellWidth: 40, halign: 'left' },    // Budget Line
          1: { cellWidth: 25, halign: 'right' },   // Allocated Amount
          2: { cellWidth: 28, halign: 'right' },   // Total Spend to Date
          3: { cellWidth: 25, halign: 'right' },   // Balance C/D
          4: { cellWidth: 20, halign: 'right' },   // Request
          5: { cellWidth: 25, halign: 'right' }    // Balance B/D
        }
      });

      console.log('[PaymentStaging] Budget impact table generated successfully');

      // Update yPosition after budget table
      yPosition = pdfDoc.lastAutoTable.finalY + 15;

      // Approval Section
      pdfDoc.setFontSize(12);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.text('Approval & Authorization', margin, yPosition);

      yPosition += 8;
      pdfDoc.setFontSize(10);
      pdfDoc.setFont('helvetica', 'normal');

      pdfDoc.text('Prepared By: Mattew Aninga', margin, yPosition);
      yPosition += 6;
      pdfDoc.text('Checked By: Enoch Asante', margin, yPosition);

      yPosition -= 6;
      pdfDoc.text('Approved By: Vera Ogboo Adusu', pageWidth - margin - 60, yPosition);
      yPosition += 6;
      pdfDoc.text('Authorized: BALTHAZAR KWESI ATTA PANYIN BAIDEI', pageWidth - margin - 80, yPosition);

      const fileName = `Payment_Voucher_${dataToUse.voucherDate}_${Date.now()}.pdf`;
      pdfDoc.save(fileName);
      setShowVoucherPreview(false);

      console.log('[PaymentStaging] PDF generated and saved successfully');

    } catch (error) {
      console.error(`[PaymentStaging] Error generating PDF:`, error);

      let errorMessage = 'Failed to generate PDF. ';
      if (error.message.includes('jsPDF')) {
        errorMessage += 'PDF library error. ';
      } else if (error.message.includes('autoTable')) {
        errorMessage += 'Table generation error. ';
      } else if (error.message.includes('font')) {
        errorMessage += 'Font error. ';
      }

      errorMessage += 'Please try again or contact support.';
      alert(errorMessage);

      console.error('[PaymentStaging] PDF Generation Error Details:', {
        error: error.message,
        stack: error.stack,
        voucherData: dataToUse ? {
          hasPayments: !!dataToUse.payments,
          paymentCount: dataToUse.payments?.length,
          hasBudgetBalances: !!dataToUse.budgetBalances,
          dataSource: isStableCopy ? 'stable copy' : 'original voucherData'
        } : 'No voucher data'
      });
    }
  };

  const getCurrencySymbol = (currency) => {
    switch (currency) {
      case 'GHS': return '₵';
      case 'USD': return '$';
      default: return currency;
    }
  };

  // Test function for debugging multiple budget line functionality
  const testMultipleBudgetLines = () => {
    console.log('=== TESTING MULTIPLE BUDGET LINES ===');
    console.log('Staged payments:', stagedPayments);
    console.log('Selected payments:', selectedPayments);

    if (voucherData) {
      console.log('Voucher data:', voucherData);
      console.log('Budget balances:', voucherData.budgetBalances);
      console.log('Has multiple budget lines:', voucherData.hasMultipleBudgetLines);
      console.log('Total budget impact:', voucherData.budgetImpact);

      if (voucherData.budgetBalances) {
        voucherData.budgetBalances.forEach((bb, index) => {
          console.log(`Budget line ${index + 1}:`, {
            name: bb.budgetLineName,
            id: bb.budgetLineId,
            allocatedAmount: bb.allocatedAmount,
            totalSpendToDate: bb.totalSpendToDate,
            balCD: bb.balCD,
            request: bb.request,
            balBD: bb.balBD,
            paymentCount: bb.paymentCount,
            rawData: bb.rawData
          });
        });
      }
    } else {
      console.log('No voucher data available');
    }
    console.log('=== END TEST ===');
  };

  // Test function for debugging finalization process
  const testFinalizationProcess = async () => {
    console.log('=== TESTING FINALIZATION PROCESS ===');

    if (!voucherData || !voucherData.payments || voucherData.payments.length === 0) {
      console.log('No voucher data available for testing finalization');
      return;
    }

    console.log('Voucher data for finalization test:', voucherData);
    console.log('Number of payments:', voucherData.payments.length);

    // Test validation
    console.log('Testing payment validation...');
    const validationTest = await PaymentFinalizationService.validatePaymentBatch(voucherData.payments);
    console.log('Validation result:', validationTest);

    // Test budget update processing
    console.log('Testing budget update processing...');
    try {
      const budgetTest = await PaymentFinalizationService.processBudgetUpdates(
        db,
        appId,
        userId || 'test_user',
        voucherData.payments.slice(0, 1), // Test with just one payment
        'TEST_BATCH_' + Date.now()
      );
      console.log('Budget update test result:', budgetTest);
    } catch (error) {
      console.log('Budget update test failed (expected in test mode):', error.message);
    }

    // Test WHT processing
    console.log('Testing WHT processing...');
    try {
      const whtTest = await PaymentFinalizationService.processWHTItems(
        db,
        appId,
        userId || 'test_user',
        voucherData.payments.slice(0, 1), // Test with just one payment
        'TEST_BATCH_' + Date.now()
      );
      console.log('WHT processing test result:', whtTest);
    } catch (error) {
      console.log('WHT processing test failed (expected in test mode):', error.message);
    }

    console.log('=== END FINALIZATION TEST ===');
  };

  // NEW: Test function for budget line resolution
  const testBudgetLineResolution = async () => {
    try {
      console.log('[PaymentStaging] Testing budget line resolution...');

      if (selectedPayments.length === 0) {
        alert('Please select at least one payment to test budget line resolution.');
        return;
      }

      const selectedPaymentData = stagedPayments.filter(payment =>
        selectedPayments.includes(payment.id)
      );

      console.log('[PaymentStaging] Selected payments for testing:', selectedPaymentData);

      // Test budget line resolution for each payment
      for (const payment of selectedPaymentData) {
        const budgetLine = payment.budgetLine || payment.budgetItem || 'Unknown';
        // ✅ FIX: Extract raw budget line name from formatted display value
        const rawBudgetName = budgetLine.includes(' - ')
          ? budgetLine.split(' - ')[0].trim()
          : budgetLine.trim();
        console.log(`\n[PaymentStaging] Testing budget line: "${rawBudgetName}" (from "${budgetLine}")`);
        console.log(`[PaymentStaging] Payment budget line ID: ${payment.budgetLineId}`);

        // Test database search
        try {
          const budgetLinesRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);
          const budgetLinesQuery = query(budgetLinesRef, where('name', '==', rawBudgetName));
          const budgetLinesSnapshot = await getDocs(budgetLinesQuery);

          if (!budgetLinesSnapshot.empty) {
            const budgetLineDoc = budgetLinesSnapshot.docs[0];
            console.log(`[PaymentStaging] ✓ Found budget line in database:`, {
              id: budgetLineDoc.id,
              name: budgetLineDoc.data().name,
              data: budgetLineDoc.data()
            });

            // Test budget balance fetching
            try {
              const balanceData = await VoucherBalanceService.getBudgetBalanceForVoucher(
                db,
                appId,
                budgetLineDoc.id
              );
              console.log(`[PaymentStaging] ✓ Budget balance data retrieved:`, balanceData);
            } catch (balanceError) {
              console.error(`[PaymentStaging] ✗ Error fetching budget balance:`, balanceError);
            }
          } else {
            console.warn(`[PaymentStaging] ✗ No budget line found in database for: ${budgetLine}`);
          }
        } catch (searchError) {
          console.error(`[PaymentStaging] ✗ Error searching database:`, searchError);
        }
      }

      alert('Budget line resolution test completed. Check console for detailed results.');

    } catch (error) {
      console.error('[PaymentStaging] Budget line resolution test failed:', error);
      alert(`Test failed: ${error.message}`);
    }
  };

  // NEW: Function to remove problematic budget lines from database
  const removeProblematicBudgetLines = async () => {
    try {
      if (!db || !appId) {
        alert('Database connection not available');
        return;
      }

      if (!confirm(`⚠️ WARNING: This will permanently delete the following budget lines from your database:

  • GEN OFFICE CONSUMERBE S
  • REPAIRS AND MAINTANANCE  
  • WATER
  • MEALS AND REFRESHMENTS

  This action cannot be undone and will affect any payments using these budget lines.

  Are you sure you want to proceed?`)) {
        return;
      }

      console.log('[PaymentStaging] Starting removal of problematic budget lines...');

      const budgetLinesRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);
      const snapshot = await getDocs(budgetLinesRef);

      const problematicNames = [
        'GEN OFFICE CONSUMERBE S',
        'REPAIRS AND MAINTANANCE',
        'WATER',
        'MEALS AND REFRESHMENTS'
      ];

      let removedCount = 0;
      let errorCount = 0;

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const budgetLineName = data.name || data.budgetLine || data.description;

        if (problematicNames.includes(budgetLineName)) {
          try {
            console.log(`[PaymentStaging] Removing budget line: ${budgetLineName} (ID: ${doc.id})`);
            await deleteDoc(doc.ref);
            removedCount++;
            console.log(`[PaymentStaging] ✓ Successfully removed: ${budgetLineName}`);
          } catch (error) {
            console.error(`[PaymentStaging] ✗ Error removing ${budgetLineName}:`, error);
            errorCount++;
          }
        }
      }

      const message = `Budget line cleanup completed!

  ✅ Successfully removed: ${removedCount} budget lines
  ❌ Errors: ${errorCount} budget lines

  Removed budget lines:
  ${problematicNames.join('\n')}

  The system will now only use properly configured budget lines from your database.`;

      alert(message);
      console.log('[PaymentStaging] Budget line cleanup completed:', { removedCount, errorCount });

      // Refresh the component to reflect changes
      window.location.reload();

    } catch (error) {
      console.error('[PaymentStaging] Budget line cleanup failed:', error);
      alert(`Cleanup failed: ${error.message}`);
    }
  };

  // NEW: Comprehensive PDF generation debugging function
  const debugPDFGeneration = async () => {
    try {
      console.log('=== PDF GENERATION DEBUGGING ===');

      // Test 1: Check jsPDF availability
      console.log('[PDF Debug] jsPDF available:', typeof jsPDF === 'function');
      console.log('[PDF Debug] jsPDF version:', jsPDF.version);

      // Test 2: Check autoTable plugin status
      console.log('[PDF Debug] autoTable on prototype:', typeof jsPDF.prototype.autoTable === 'function');
      console.log('[PDF Debug] autoTable on class:', typeof jsPDF.autoTable === 'function');
      console.log('[PDF Debug] autoTable property exists:', 'autoTable' in jsPDF.prototype);

      // Test 3: Create jsPDF instance
      console.log('[PDF Debug] Creating jsPDF instance...');
      const testPdf = new jsPDF();
      console.log('[PDF Debug] jsPDF instance created:', !!testPdf);
      console.log('[PDF Debug] Instance autoTable available:', typeof testPdf.autoTable === 'function');

      // Test 4: Check if autoTable can be called
      if (typeof testPdf.autoTable === 'function') {
        console.log('[PDF Debug] ✓ autoTable function is callable');

        // Test 5: Try to generate a simple table
        try {
          console.log('[PDF Debug] Testing simple table generation...');
          testPdf.autoTable({
            head: [['Test', 'Header']],
            body: [['Test', 'Data']],
            startY: 20
          });
          console.log('[PDF Debug] ✓ Simple table generated successfully');
        } catch (tableError) {
          console.error('[PDF Debug] ✗ Simple table generation failed:', tableError);
        }
      } else {
        console.log('[PDF Debug] ✗ autoTable function not available on instance');

        // Test 6: Try to attach autoTable manually
        console.log('[PDF Debug] Attempting manual autoTable attachment...');
        try {
          const autoTableModule = await import('jspdf-autotable');
          console.log('[PDF Debug] Dynamic import result:', {
            moduleType: typeof autoTableModule,
            hasDefault: !!autoTableModule.default,
            hasAutoTable: !!autoTableModule.autoTable
          });

          if (autoTableModule.default) {
            testPdf.autoTable = autoTableModule.default;
            console.log('[PDF Debug] ✓ autoTable attached to instance');
          } else if (autoTableModule.autoTable) {
            testPdf.autoTable = autoTableModule.autoTable;
            console.log('[PDF Debug] ✓ autoTable attached to instance via named export');
          } else {
            console.log('[PDF Debug] ✗ autoTable module structure unexpected');
          }
        } catch (importError) {
          console.error('[PDF Debug] ✗ Dynamic import failed:', importError);
        }
      }

      // Test 7: Check package dependencies
      console.log('[PDF Debug] Checking package dependencies...');
      try {
        const packageInfo = await fetch('/package.json');
        if (packageInfo.ok) {
          const packageData = await packageInfo.json();
          console.log('[PDF Debug] Package dependencies:', {
            jspdf: packageData.dependencies?.jspdf,
            jspdfAutotable: packageData.dependencies?.['jspdf-autotable']
          });
        }
      } catch (error) {
        console.log('[PDF Debug] Could not fetch package.json:', error.message);
      }

      console.log('=== END PDF DEBUGGING ===');

      // Show summary to user
      const summary = {
        jsPDFAvailable: typeof jsPDF === 'function',
        autoTableOnPrototype: typeof jsPDF.prototype.autoTable === 'function',
        autoTableOnInstance: typeof testPdf.autoTable === 'function',
        jsPDFVersion: jsPDF.version
      };

      alert(`PDF Generation Debug Complete!

  Check console for detailed results.

  Summary:
  • jsPDF Available: ${summary.jsPDFAvailable ? '✓' : '✗'}
  • autoTable on Prototype: ${summary.autoTableOnPrototype ? '✓' : '✗'}
  • autoTable on Instance: ${summary.autoTableOnInstance ? '✓' : '✗'}
  • jsPDF Version: ${summary.jsPDFVersion}

  See console for detailed debugging information.`);

    } catch (error) {
      console.error('[PDF Debug] Debugging function failed:', error);
      alert(`PDF debugging failed: ${error.message}`);
    }
  };

  // Function to help migrate existing budget lines to new schema
  const migrateBudgetLineSchema = async () => {
    if (!db || !appId) {
      console.error('Database or appId not available for migration');
      return;
    }

    try {
      console.log('=== STARTING BUDGET LINE SCHEMA MIGRATION ===');

      const budgetLinesRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);
      const snapshot = await getDocs(budgetLinesRef);

      console.log(`Found ${snapshot.size} budget lines to migrate`);

      let migratedCount = 0;
      let errorCount = 0;

      for (const doc of snapshot.docs) {
        try {
          const data = doc.data();
          console.log(`Migrating budget line: ${doc.id}`, data);

          // Check if already migrated
          if (data.allocatedAmount !== undefined && data.totalSpendToDate !== undefined) {
            console.log(`Budget line ${doc.id} already migrated, skipping`);
            continue;
          }

          // Calculate new fields from existing data
          let allocatedAmount = 0;
          let totalSpendToDate = 0;

          if (data.monthlyValues && Array.isArray(data.monthlyValues)) {
            allocatedAmount = data.monthlyValues.reduce((sum, val) => sum + Number(val || 0), 0);
          } else if (data.totalBudget !== undefined) {
            allocatedAmount = Number(data.totalBudget);
          } else if (data.budget !== undefined) {
            allocatedAmount = Number(data.budget);
          }

          // For now, set totalSpendToDate to 0 (will be calculated from payment history)
          totalSpendToDate = 0;

          // Update the document with new fields
          await setDoc(doc.ref, {
            ...data,
            allocatedAmount,
            totalSpendToDate,
            lastSchemaUpdate: new Date().toISOString()
          }, { merge: true });

          console.log(`Successfully migrated budget line ${doc.id}:`, {
            allocatedAmount,
            totalSpendToDate
          });

          migratedCount++;

        } catch (error) {
          console.error(`Error migrating budget line ${doc.id}:`, error);
          errorCount++;
        }
      }

      console.log(`=== MIGRATION COMPLETE ===`);
      console.log(`Successfully migrated: ${migratedCount} budget lines`);
      console.log(`Errors: ${errorCount} budget lines`);

      alert(`Migration complete!\nSuccessfully migrated: ${migratedCount} budget lines\nErrors: ${errorCount} budget lines`);

    } catch (error) {
      console.error('Error during budget line migration:', error);
      alert('Migration failed: ' + error.message);
    }
  };

  // NEW: Check migration status function
  const checkMigrationStatus = async () => {
    if (!db || !appId) {
      alert('Database or appId not available');
      return;
    }

    try {
      console.log('[PaymentStaging] Checking migration status...');

      const budgetLinesRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);
      const snapshot = await getDocs(budgetLinesRef);

      if (snapshot.size === 0) {
        alert('No budget lines found in the system.');
        return;
      }

      let migratedCount = 0;
      let needsMigrationCount = 0;
      const needsMigrationList = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.allocatedAmount !== undefined && data.totalSpendToDate !== undefined) {
          migratedCount++;
        } else {
          needsMigrationCount++;
          needsMigrationList.push({
            id: doc.id,
            name: data.name || data.budgetLine || data.description || 'Unknown',
            hasMonthlyValues: !!data.monthlyValues,
            hasTotalBudget: !!data.totalBudget,
            hasBudget: !!data.budget
          });
        }
      });

      let statusMessage = `Migration Status:\n\n`;
      statusMessage += `Total Budget Lines: ${snapshot.size}\n`;
      statusMessage += `Already Migrated: ${migratedCount}\n`;
      statusMessage += `Need Migration: ${needsMigrationCount}\n\n`;

      if (needsMigrationCount > 0) {
        statusMessage += `Budget Lines Needing Migration:\n`;
        needsMigrationList.forEach(item => {
          statusMessage += `• ${item.name} (ID: ${item.id})\n`;
          statusMessage += `  - Has monthly values: ${item.hasMonthlyValues}\n`;
          statusMessage += `  - Has total budget: ${item.hasTotalBudget}\n`;
          statusMessage += `  - Has budget: ${item.hasBudget}\n\n`;
        });

        statusMessage += `Click "Migrate DB" to update these budget lines.`;
      } else {
        statusMessage += `✅ All budget lines are up to date!\nNo migration needed.`;
      }

      alert(statusMessage);

    } catch (error) {
      console.error('[PaymentStaging] Error checking migration status:', error);
      alert('Error checking migration status: ' + error.message);
    }
  };

  // Automatic migration function that runs silently on component mount
  const autoMigrateIfNeeded = async () => {
    if (!db || !appId) {
      console.log('[PaymentStaging] Auto-migration skipped: Database or appId not available');
      return;
    }

    try {
      console.log('[PaymentStaging] Checking for budget lines that need migration...');

      const budgetLinesRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);
      const snapshot = await getDocs(budgetLinesRef);

      if (snapshot.size === 0) {
        console.log('[PaymentStaging] No budget lines found, migration not needed');
        return;
      }

      let needsMigration = false;
      let migrationCount = 0;

      // Quick check: see if any budget lines need migration
      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (data.allocatedAmount === undefined || data.totalSpendToDate === undefined) {
          needsMigration = true;
          break;
        }
      }

      if (!needsMigration) {
        console.log('[PaymentStaging] All budget lines already migrated, no action needed');
        return;
      }

      console.log('[PaymentStaging] Some budget lines need migration, starting automatic migration...');

      // Perform silent migration
      for (const doc of snapshot.docs) {
        try {
          const data = doc.data();

          // Skip if already migrated
          if (data.allocatedAmount !== undefined && data.totalSpendToDate !== undefined) {
            continue;
          }

          // Calculate new fields from existing data
          let allocatedAmount = 0;
          let totalSpendToDate = 0;

          if (data.monthlyValues && Array.isArray(data.monthlyValues)) {
            allocatedAmount = data.monthlyValues.reduce((sum, val) => sum + Number(val || 0), 0);
          } else if (data.totalBudget !== undefined) {
            allocatedAmount = Number(data.totalBudget);
          } else if (data.budget !== undefined) {
            allocatedAmount = Number(data.budget);
          }

          // Update the document with new fields
          await setDoc(doc.ref, {
            ...data,
            allocatedAmount,
            totalSpendToDate,
            lastSchemaUpdate: new Date().toISOString(),
            autoMigrated: true
          }, { merge: true });

          migrationCount++;

        } catch (error) {
          console.error(`[PaymentStaging] Auto-migration failed for budget line ${doc.id}:`, error);
        }
      }

      if (migrationCount > 0) {
        console.log(`[PaymentStaging] Auto-migration completed: ${migrationCount} budget lines migrated`);
      } else {
        console.log('[PaymentStaging] Auto-migration completed: No budget lines needed migration');
      }

    } catch (error) {
      console.error('[PaymentStaging] Auto-migration failed:', error);
    }
  };

  const deleteStagedPayment = async (paymentId) => {
    if (!confirm('Are you sure you want to delete this staged payment?')) return;

    try {
      await deleteDoc(doc(db, `artifacts/${appId}/public/data/stagedPayments`, paymentId));
      alert('Payment deleted successfully');
    } catch (error) {
      console.error('Error deleting payment:', error);
      alert('Failed to delete payment: ' + error.message);
    }
  };

  const renderVoucherPreview = () => {
    if (!voucherData) return null;
    // Safety check for payments array
    if (!voucherData.payments || voucherData.payments.length === 0) {
      console.warn('[PaymentStaging] renderVoucherPreview: No payments in voucherData');
      return null;
    }

    const totalAmount = voucherData.totalAmount;
    const amountInWords = convertAmountToWords(Math.floor(totalAmount)) + ' CEDIS AND ' +
      Math.round((totalAmount % 1) * 100) + ' PESEWAS ONLY';

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">Payment Voucher Preview</h2>
              <button onClick={() => setShowVoucherPreview(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle size={24} />
              </button>
            </div>
          </div>

          <div className="p-6">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900">MARGINS ID SYSTEMS APPLICATION LIMITED</h1>
              <p className="text-gray-600">P.O. Box KN 785, Kaneshie - Accra, Ghana.</p>
              <h2 className="text-xl font-bold text-gray-900 mt-4">PAYMENT VOUCHER</h2>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-6">
              <div className="space-y-3">
                <div><span className="font-semibold">Pay To:</span> <span className="ml-2">{voucherData.payments[0]?.vendor || 'N/A'}</span></div>
                <div><span className="font-semibold">Purpose:</span> <span className="ml-2">{voucherData.purpose}</span></div>
                <div><span className="font-semibold">Amount Payable (In Words):</span>
                  <div className="font-bold text-lg mt-1 text-gray-800">{amountInWords}</div>
                </div>
              </div>
              <div className="space-y-3 text-right">
                <div><span className="font-semibold">Voucher No.:</span> <span className="ml-2 font-mono">MIDSA-FIN-{Date.now()}</span></div>
                <div><span className="font-semibold">Voucher Date:</span> <span className="ml-2">{voucherData.voucherDate}</span></div>
                <div><span className="font-semibold">Amount Payable:</span>
                  <div className="text-2xl font-bold text-gray-900 mt-1">
                    {getCurrencySymbol(voucherData.payments[0]?.currency || 'GHS')} {totalAmount.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {voucherData.hasPartialPayment && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-3">Amount Details</h3>
                <div className="flex justify-start">
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200 w-80">
                    <h4 className="text-sm font-medium text-green-800">Amount Payable</h4>
                    <p className="text-2xl font-bold text-green-900 mt-2">
                      {voucherData.payments[0]?.currency === 'USD' ? '$' : '₵'} {voucherData.totalAmount.toFixed(2)}
                    </p>
                    <div className="text-sm text-green-700 mt-2 space-y-1">
                      <div><span className="font-medium">Original Amount:</span> {voucherData.payments[0]?.currency === 'USD' ? '$' : '₵'} {voucherData.originalTotalAmount.toFixed(2)}</div>
                      <div><span className="font-medium">Percentage to Pay:</span> {voucherData.payments[0]?.paymentPercentage || 100}%</div>
                      <div><span className="font-medium">Remaining Balance:</span> {voucherData.payments[0]?.currency === 'USD' ? '$' : '₵'} {(voucherData.originalTotalAmount - voucherData.totalAmount).toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {voucherData.hasPartialPayment && <hr className="border-gray-300 my-6" />}

            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Payment Details</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-300">
                  <thead className="bg-blue-600 text-white">
                    <tr>
                      <th className="border border-gray-300 px-3 py-2 text-sm">S/N</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm">Invoice No</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm">Description</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm">Budget Line</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm">Pre-Tax Amt</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm">WHT Type</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm">WHT Rate</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm">WHT Amt (-)</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm">Levy Amt (+)</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm">VAT Amt (+)</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm">MoMo Chg (+)</th>
                      <th className="border border-gray-300 px-3 py-2 text-sm">Net Payable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voucherData.payments.map((payment, index) => (
                      <tr key={index} className="bg-white">
                        <td className="px-4 py-2 border border-gray-300 text-center whitespace-nowrap">{index + 1}</td>
                        <td className="px-4 py-2 border border-gray-300 whitespace-nowrap">{payment.reference || 'N/A'}</td>
                        <td className="px-4 py-2 border border-gray-300 whitespace-nowrap">{payment.description || 'N/A'}</td>
                        <td className="px-4 py-2 border border-gray-300 whitespace-nowrap text-sm text-gray-600">{payment.budgetLine || payment.budgetItem || 'N/A'}</td>
                        <td className="px-4 py-2 border border-gray-300 text-right whitespace-nowrap">
                          {payment.currency === 'USD' ? '$' : '₵'} {safeToFixed(payment.pretaxAmount)}
                        </td>
                        <td className="px-4 py-2 border border-gray-300 text-center whitespace-nowrap">{payment.procurementType}</td>
                        <td className="px-4 py-2 border border-gray-300 text-center whitespace-nowrap">{(payment.whtRate * 100).toFixed(2)}%</td>
                        <td className="px-4 py-2 border border-gray-300 text-right whitespace-nowrap">
                          -{payment.currency === 'USD' ? '$' : '₵'} {safeToFixed(payment.whtAmount)}
                        </td>
                        <td className="px-4 py-2 border border-gray-300 text-right whitespace-nowrap">
                          +{payment.currency === 'USD' ? '$' : '₵'} {safeToFixed(payment.levyAmount)}
                        </td>
                        <td className="px-4 py-2 border border-gray-300 text-right whitespace-nowrap">
                          +{payment.currency === 'USD' ? '$' : '₵'} {safeToFixed(payment.vatAmount)}
                        </td>
                        <td className="px-4 py-2 border border-gray-300 text-right whitespace-nowrap">
                          +{payment.currency === 'USD' ? '$' : '₵'} {safeToFixed(payment.momoCharge)}
                        </td>
                        <td className="px-4 py-2 border border-gray-300 text-right font-bold whitespace-nowrap">
                          {payment.currency === 'USD' ? '$' : '₵'} {safeToFixed(payment.netPayable)}
                        </td>
                      </tr>
                    ))}

                    {voucherData.hasPartialPayment && (
                      <tr className="bg-yellow-50 border-2 border-yellow-300">
                        <td colSpan="11" className="px-4 py-3 text-center font-semibold text-yellow-800 whitespace-nowrap">
                          AMOUNT TO BE PAID
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-yellow-800 whitespace-nowrap">
                          ₵ {safeToFixed(voucherData.totalAmount)}
                        </td>
                      </tr>
                    )}

                    {/* Totals Row */}
                    <tr className="bg-gray-100 font-bold">
                      <td colSpan="4" className="px-4 py-2 border border-gray-300 text-center whitespace-nowrap">TOTALS</td>
                      <td className="px-4 py-2 border border-gray-300 text-right whitespace-nowrap">
                        {voucherData.payments[0]?.currency === 'USD' ? '$' : '₵'} {safeToFixed(voucherData.payments.reduce((sum, p) => sum + p.pretaxAmount, 0))}
                      </td>
                      <td className="px-4 py-2 border border-gray-300 whitespace-nowrap"></td>
                      <td className="px-4 py-2 border border-gray-300 whitespace-nowrap"></td>
                      <td className="px-4 py-2 border border-gray-300 text-right whitespace-nowrap">
                        -{voucherData.payments[0]?.currency === 'USD' ? '$' : '₵'} {safeToFixed(voucherData.payments.reduce((sum, p) => sum + p.whtAmount, 0))}
                      </td>
                      <td className="px-4 py-2 border border-gray-300 text-right whitespace-nowrap">
                        +{voucherData.payments[0]?.currency === 'USD' ? '$' : '₵'} {safeToFixed(voucherData.payments.reduce((sum, p) => sum + p.levyAmount, 0))}
                      </td>
                      <td className="px-4 py-2 border border-gray-300 text-right whitespace-nowrap">
                        +{voucherData.payments[0]?.currency === 'USD' ? '$' : '₵'} {safeToFixed(voucherData.payments.reduce((sum, p) => sum + p.vatAmount, 0))}
                      </td>
                      <td className="px-4 py-2 border border-gray-300 text-right whitespace-nowrap">
                        +{voucherData.payments[0]?.currency === 'USD' ? '$' : '₵'} {safeToFixed(voucherData.payments.reduce((sum, p) => sum + p.momoCharge, 0))}
                      </td>
                      <td className="px-4 py-2 border border-gray-300 text-right whitespace-nowrap">
                        {voucherData.payments[0]?.currency === 'USD' ? '$' : '₵'} {safeToFixed(voucherData.totalAmount)}
                        {voucherData.hasPartialPayment && (
                          <div className="text-xs text-blue-600 mt-1">
                            <div>Original: {voucherData.payments[0]?.currency === 'USD' ? '$' : '₵'} {safeToFixed(voucherData.originalTotalAmount)}</div>
                            <div>Partial: {voucherData.payments[0]?.currency === 'USD' ? '$' : '₵'} {safeToFixed(voucherData.totalAmount)} ({voucherData.payments[0]?.paymentPercentage || 100}%)</div>
                          </div>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <hr className="border-gray-300 my-6" />

            {voucherData.hasMultipleBudgetLines && (
              <div className="mt-6 mb-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-blue-800 mb-2">Multiple Budget Lines Summary</h4>
                  <div className="text-sm text-blue-700 space-y-1">
                    <div><span className="font-medium">Total Budget Lines:</span> {voucherData.budgetBalances.length}</div>
                    <div><span className="font-medium">Total Budget Impact:</span> ${safeToFixed(voucherData.budgetImpact)} USD</div>
                    <div><span className="font-medium">Total Allocated Amount:</span> ${safeToFixed(voucherData.budgetBalances.reduce((sum, bb) => sum + (bb.allocatedAmount || 0), 0))} USD</div>
                    <div><span className="font-medium">Total Spent to Date:</span> ${safeToFixed(voucherData.budgetBalances.reduce((sum, bb) => sum + (bb.totalSpendToDate || 0), 0))} USD</div>
                    <div><span className="font-medium">Budget Lines:</span> {voucherData.budgetBalances.map(bb => bb.budgetLineName).join(', ')}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-3">Budget Impact</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-300">
                  <thead className="bg-gray-700 text-white">
                    <tr>
                      <th className="px-4 py-2 text-left">Budget Line</th>
                      <th className="px-4 py-2 text-right">Allocated Amount (USD)</th>
                      <th className="px-4 py-2 text-right">Total Spend to Date (USD)</th>
                      <th className="px-4 py-2 text-right">Balance C/D (USD)</th>
                      <th className="px-4 py-2 text-right">Request (USD)</th>
                      <th className="px-4 py-2 text-right">Balance B/D (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voucherData.budgetBalances.map((budgetBalance, index) => (
                      <tr key={index} className="bg-white">
                        <td className="px-4 py-2 border border-gray-300">
                          {budgetBalance.budgetLineName}
                        </td>
                        <td className="px-4 py-2 border border-gray-300 text-right">
                          ${safeToFixed(budgetBalance.allocatedAmount || 0)}
                        </td>
                        <td className="px-4 py-2 border border-gray-300 text-right">
                          ${safeToFixed(budgetBalance.totalSpendToDate || 0)}
                        </td>
                        <td className="px-4 py-2 border border-gray-300 text-right">
                          ${safeToFixed(budgetBalance.balCD || 0)}
                        </td>
                        <td className="px-4 py-2 border border-gray-300 text-right font-bold">
                          ${safeToFixed(budgetBalance.request)}
                        </td>
                        <td className={`px-4 py-2 border border-gray-300 text-right ${(budgetBalance.balCD || 0) - budgetBalance.request < 0 ? 'text-red-600 font-bold' : ''
                          }`}>
                          {(budgetBalance.balCD || 0) - budgetBalance.request < 0 ?
                            `-$${safeToFixed(Math.abs((budgetBalance.balCD || 0) - budgetBalance.request))}` :
                            `$${safeToFixed((budgetBalance.balCD || 0) - budgetBalance.request)}`
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-sm text-gray-600 italic">
                  Note: Budget impact is always calculated in USD for consistency with budget tracking.
                </p>
                <div className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-md">
                  <span className="font-medium">FX Rate:</span> {
                    (() => {
                      const uniqueRates = [...new Set(voucherData.payments.map(p => p.fxRate).filter(rate => rate !== undefined && rate !== null))];
                      if (uniqueRates.length === 0) {
                        return 'N/A';
                      } else if (uniqueRates.length === 1) {
                        const rate = uniqueRates[0];
                        const currency = voucherData.payments[0]?.currency || 'GHS';
                        if (currency === 'GHS') {
                          return `1 GHS = 1 GHS (Local Currency)`;
                        } else {
                          return `1 ${currency} = ${rate} GHS`;
                        }
                      } else {
                        return `Multiple rates (${uniqueRates.length} different rates)`;
                      }
                    })()
                  }
                  {(() => {
                    const uniqueRates = [...new Set(voucherData.payments.map(p => p.fxRate).filter(rate => rate !== undefined && rate !== null))];
                    if (uniqueRates.length === 0) {
                      return (
                        <div className="text-xs text-red-500 mt-1">
                          Warning: FX Rate not available for this transaction
                        </div>
                      );
                    } else if (uniqueRates.length > 1) {
                      const currencies = [...new Set(voucherData.payments.map(p => p.currency))];
                      return (
                        <div className="text-xs text-blue-500 mt-1">
                          Multiple currencies detected: {currencies.join(', ')} with different rates
                        </div>
                      );
                    } else if (uniqueRates.length === 1 && uniqueRates[0] === 0) {
                      // Check if this is a GHS transaction (rate 0 is valid for GHS)
                      const currencies = [...new Set(voucherData.payments.map(p => p.currency))];
                      if (currencies.length === 1 && currencies[0] === 'GHS') {
                        return null; // No warning needed for GHS transactions
                      } else {
                        return (
                          <div className="text-xs text-orange-500 mt-1">
                            Warning: FX Rate is 0, which may indicate an error for non-GHS transactions
                          </div>
                        );
                      }
                    }
                    return null;
                  })()}
                </div>
              </div>
            </div>

            {finalizationResult && (
              <div className="mt-6 mb-4">
                <div className={`border rounded-lg p-4 ${finalizationResult.success
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
                  }`}>
                  <h4 className={`text-sm font-semibold mb-2 ${finalizationResult.success ? 'text-green-800' : 'text-red-800'
                    }`}>
                    {finalizationResult.success ? '✅ Finalization Complete' : '❌ Finalization Failed'}
                  </h4>
                  {finalizationResult.success ? (
                    <div className="text-sm space-y-1">
                      <div><span className="font-medium">Batch ID:</span> {finalizationResult.batchId}</div>
                      <div><span className="font-medium">Transaction Log:</span> {finalizationResult.transactionLogId}</div>
                      <div><span className="font-medium">Budget Updates:</span> {finalizationResult.budgetUpdates?.length || 0}</div>
                      <div><span className="font-medium">WHT Items:</span> {finalizationResult.whtResults?.length || 0}</div>
                      <div><span className="font-medium">Completed:</span> {finalizationResult.timestamp}</div>
                    </div>
                  ) : (
                    <div className="text-sm text-red-700">
                      <div><span className="font-medium">Error:</span> {finalizationResult.error}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-4">Approval & Authorization</h3>
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-3">
                  <div><span className="font-semibold">Prepared By:</span> <span className="ml-2">Mattew Aninga</span></div>
                  <div><span className="font-semibold">Checked By:</span> <span className="ml-2">Enoch Asante</span></div>
                </div>
                <div className="space-y-3">
                  <div><span className="font-semibold">Approved By:</span> <span className="ml-2">Vera Ogboo Adusu</span></div>
                  <div><span className="font-semibold">Authorized:</span> <span className="ml-2">BALTHAZAR KWESI ATTA PANYIN BAIDEI</span>
                    <div className="text-sm text-gray-600">DIRECTOR</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
            <button
              onClick={() => {
                console.log('[PaymentStaging] Debug: Current state');
                console.log('voucherData:', voucherData);
                console.log('finalizing:', finalizing);
                console.log('showVoucherPreview:', showVoucherPreview);
                alert('Check console for debug info');
              }}
              className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600"
            >
              Debug State
            </button>
            <button onClick={() => setShowVoucherPreview(false)} className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600">
              Close
            </button>
            <button
              onClick={() => {
                console.log('[PaymentStaging] Finalize button clicked');
                console.log('[PaymentStaging] Button disabled state:', finalizing);
                console.log('[PaymentStaging] voucherData available:', !!voucherData);
                finalizePayments();
              }}
              disabled={finalizing}
              className={`px-4 py-2 text-white rounded-md flex items-center space-x-2 ${finalizing
                ? 'bg-blue-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
                }`}
            >
              {finalizing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Finalizing...</span>
                </>
              ) : (
                <>
                  <FileText size={16} />
                  <span>Finalize & Generate PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-2xl font-bold">Payment Staging & Voucher System</h1>
                <p className="text-gray-600">Weekly Sheet: {weeklySheetId}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <XCircle size={24} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h3 className="text-lg font-semibold text-blue-800 mb-2">Payment Staging</h3>
              <p className="text-blue-700 text-sm">
                Payments staged from the Payment Generator will appear here. Select payments to generate vouchers.
              </p>
            </div>

            {loading ? (
              <div className="text-center py-8">
                <RefreshCw className="animate-spin mx-auto h-8 w-8 text-blue-500" />
                <p className="mt-2 text-gray-600">Loading staged payments...</p>
              </div>
            ) : stagedPayments.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <CreditCard className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No staged payments</h3>
                <p className="mt-1 text-sm text-gray-500">Use the Payment Generator to stage payments first.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-lg font-medium">Staged Payments ({stagedPayments.length})</h4>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        setStagedPayments([]);
                        setLoading(true);
                        setTimeout(() => {
                          const loadStagedPayments = async () => {
                            try {
                              const stagedRef = collection(db, `artifacts/${appId}/public/data/stagedPayments`);
                              const q = query(stagedRef);
                              const querySnapshot = await getDocs(q);
                              const payments = [];
                              querySnapshot.forEach(doc => {
                                const payment = { id: doc.id, ...doc.data() };
                                if (payment.weeklySheetId === weeklySheetId) {
                                  payments.push(payment);
                                }
                              });
                              setStagedPayments(payments);
                              setLoading(false);
                            } catch (error) {
                              console.error('Error refreshing staged payments:', error);
                              setLoading(false);
                            }
                          };
                          loadStagedPayments();
                        }, 100);
                      }}
                      className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center space-x-2"
                      disabled={loading}
                    >
                      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </button>
                    {selectedPayments.length > 0 && (
                      <button
                        onClick={generateVoucher}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center space-x-2"
                      >
                        <FileText size={16} />
                        <span>Generate Voucher ({selectedPayments.length})</span>
                      </button>
                    )}

                    {/* VBA-Style Batch Schedule Generator - Opens Preview Modal */}
                    {selectedPayments.length > 0 && (
                      <div className="flex items-center space-x-2 ml-2 border-l border-gray-300 pl-2">
                        <select
                          value={selectedLayout}
                          onChange={(e) => setSelectedLayout(e.target.value)}
                          className="px-2 py-2 border border-purple-300 rounded-md text-sm bg-purple-50 focus:ring-2 focus:ring-purple-500"
                        >
                          {BatchScheduleService.getScheduleTypes().map(type => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={async () => {
                            if (selectedPayments.length === 0) {
                              alert('Please select at least one payment.');
                              return;
                            }
                            setGeneratingSchedule(true);
                            try {
                              const selectedData = stagedPayments.filter(p => selectedPayments.includes(p.id));
                              // Build budget data map from payments
                              const budgetDataMap = {};
                              selectedData.forEach(p => {
                                const bl = p.budgetLine || p.budgetItem || 'Unknown';
                                if (!budgetDataMap[bl] && p.budgetData) {
                                  budgetDataMap[bl] = p.budgetData;
                                }
                              });
                              const blob = await BatchScheduleService.generateBatchSchedulePDF(selectedData, selectedLayout, budgetDataMap);
                              const url = URL.createObjectURL(blob);
                              // Store URL and show preview modal
                              setSchedulePreviewUrl(url);
                              setShowSchedulePreview(true);
                            } catch (error) {
                              console.error('[PaymentStaging] Batch schedule generation failed:', error);
                              alert('Failed to generate batch schedule: ' + error.message);
                            } finally {
                              setGeneratingSchedule(false);
                            }
                          }}
                          disabled={generatingSchedule}
                          className={`px-4 py-2 text-white rounded-md flex items-center space-x-2 ${generatingSchedule ? 'bg-purple-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}
                        >
                          {generatingSchedule ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              <span>Generating...</span>
                            </>
                          ) : (
                            <>
                              <FileText size={16} />
                              <span>VBA Schedule</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                  </div>
                </div>

                <div className="bg-white rounded-lg border overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          <input
                            type="checkbox"
                            checked={selectedPayments.length === stagedPayments.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedPayments(stagedPayments.map(p => p.id));
                              } else {
                                setSelectedPayments([]);
                              }
                            }}
                            className="rounded border-gray-300"
                          />
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Budget Line</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">FX Rate</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {stagedPayments.map((payment) => (
                        <tr key={payment.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selectedPayments.includes(payment.id)}
                              onChange={(e) => handlePaymentSelection(payment.id, e.target.checked)}
                              className="rounded border-gray-300"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {payment.vendor}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                            {payment.description}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {payment.budgetLine || payment.budgetItem || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {getCurrencySymbol(payment.currency)}{payment.netPayable?.toFixed(2) || '0.00'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {payment.currency}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {payment.fxRate || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${payment.status === 'staged' ? 'bg-blue-100 text-blue-800' :
                              payment.status === 'finalized' ? 'bg-green-100 text-green-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                              {payment.status || 'staged'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button
                              onClick={() => deleteStagedPayment(payment.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showVoucherPreview && renderVoucherPreview()}

      {/* VBA Schedule Preview Modal */}
      {showSchedulePreview && schedulePreviewUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-11/12 h-5/6 max-w-6xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-xl font-bold text-gray-800">VBA Schedule Preview</h2>
              <button
                onClick={() => {
                  setShowSchedulePreview(false);
                  URL.revokeObjectURL(schedulePreviewUrl);
                  setSchedulePreviewUrl(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <XCircle size={24} />
              </button>
            </div>

            {/* PDF Preview */}
            <div className="flex-1 p-2 overflow-hidden">
              <iframe
                src={schedulePreviewUrl}
                className="w-full h-full border rounded"
                title="VBA Schedule Preview"
              />
            </div>

            {/* Footer with Actions */}
            <div className="flex items-center justify-end space-x-3 p-4 border-t bg-gray-50">
              <button
                onClick={() => {
                  setShowSchedulePreview(false);
                  URL.revokeObjectURL(schedulePreviewUrl);
                  setSchedulePreviewUrl(null);
                }}
                className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
              >
                Go Back & Edit
              </button>
              <button
                onClick={() => {
                  // Open PDF in new tab for printing/saving
                  window.open(schedulePreviewUrl, '_blank');
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2"
              >
                <FileText size={16} />
                <span>Open PDF</span>
              </button>
              <button
                onClick={() => {
                  // Proceed with finalization
                  setShowSchedulePreview(false);
                  setShowVoucherPreview(true);
                }}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center space-x-2"
              >
                <CreditCard size={16} />
                <span>Finalize & Generate PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <ProcessingStatusModal
        isOpen={finalizing || processingStep !== 'VALIDATING' && processingStep !== 'COMPLETED'}
        steps={PROCESSING_STEPS}
        currentStep={processingStep}
        error={processingError}
        onClose={() => {
          setFinalizing(false);
          setProcessingStep('VALIDATING');
        }}
      />
    </div>
  );
};

export default PaymentStaging;
