import React, { useState, useEffect, useContext } from 'react';
import { PaymentContext, actionTypes } from '../contexts/PaymentContext';
import { useSettings } from '../contexts/SettingsContext';
import { calculatePayment } from '../services/FinancialEngine';
import { collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, getDocs, runTransaction, query, limit } from 'firebase/firestore';
import {
  stagePayment,
  removePaymentFromBatch,
  clearBatch,
  finalizeSchedule,
  uploadSupportDocuments,
  updateWeeklySheetTransaction,
  addTransactionToWeeklySheet
} from '../services/paymentService';
import { WHTEnhancedService } from '../services/WHTEnhancedService.js';
import {
  PAYMENT_MODES,
  PROCUREMENT_TYPES,
  TAX_TYPES,
  VAT_OPTIONS,
  SIGNATORIES,
  DEPARTMENTS,
  PAYMENT_PRIORITIES
} from '../config/constants';
import { ProcurementTypesService } from '../services/ProcurementTypesService.js';
import { DocumentGenerationService } from '../services/DocumentGenerationService';
import { VoucherBalanceService } from '../services/VoucherBalanceService';
import { PaymentFinalizationService } from '../services/PaymentFinalizationService';
import { VendorService } from '../services/VendorService';
import { BankService } from '../services/BankService';
import ProcessingStatusModal from './ProcessingStatusModal';
import DocumentPreviewModal from './DocumentPreviewModal';
import PaymentStaging from './PaymentStaging'; // For Batch Finalize (BF) mode
import * as pdfjsLib from 'pdfjs-dist';

import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Set worker source for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// PDF Thumbnail Component
const PDFThumbnail = ({ file }) => {
  const [thumbnail, setThumbnail] = useState(null);

  useEffect(() => {
    const generateThumbnail = async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        const page = await pdf.getPage(1);

        const viewport = page.getViewport({ scale: 0.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;
        setThumbnail(canvas.toDataURL());
      } catch (error) {
        console.error('Error generating PDF thumbnail:', error);
      }
    };

    if (file) {
      generateThumbnail();
    }
  }, [file]);

  if (thumbnail) {
    return <img src={thumbnail} alt="PDF Preview" className="w-full h-full object-cover" />;
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400">
      <svg className="w-8 h-8 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span className="text-[10px]">PDF</span>
    </div>
  );
};

const PROCESSING_STEPS = [
  { id: 'VALIDATING', label: 'Validating Payment Details', icon: 'check-circle' },
  { id: 'UNDO_CAPTURE', label: 'Capturing Undo State', icon: 'camera' },
  { id: 'BUDGET_UPDATE', label: 'Updating Budget & Spend', icon: 'dollar-sign' },
  { id: 'WHT_FILING', label: 'Filing Withholding Tax', icon: 'file-text' },
  { id: 'TRANSACTION_LOG', label: 'Logging Transaction', icon: 'list' },
  { id: 'FINALIZING', label: 'Finalizing Payment', icon: 'check-square' },
  { id: 'COMPLETED', label: 'Process Completed', icon: 'check' }
];

const PaymentGenerator = ({
  weeklySheetId,
  sheetName, // Changed from weeklySheetName
  availablePayments,
  onAddToBatch, // New prop
  onCancel, // New prop
  onPaymentGenerated,
  db,
  userId,
  appId,
  onLoadPayments, // New prop for loading payments
  sheets = [],
  onSheetSelect
}) => {
  const { state, dispatch } = useContext(PaymentContext);
  const { globalRates, companySettings } = useSettings();
  const [selectedSheetId, setSelectedSheetId] = useState(weeklySheetId || '');
  // FIX: Local state for instant UI updates
  const [localAvailablePayments, setAvailablePayments] = useState(availablePayments || []);

  // DUAL-MODE: SS (Simple Single) or BF (Batch Finalize)
  const [mode, setMode] = useState('SS');

  // Sync local state with prop
  useEffect(() => {
    if (weeklySheetId) {
      setSelectedSheetId(weeklySheetId);
    }
  }, [weeklySheetId]);

  // FIX: Sync local state when prop changes
  useEffect(() => {
    if (availablePayments) {
      setAvailablePayments(availablePayments);
    }
  }, [availablePayments]);

  const {
    stagedPayments,
    selectedAvailable,
    loading,
    error,
    vendor,
    invoiceNo,
    description,
    budgetLine,
    currency,
    paymentMode,
    procurementType,
    taxType,
    vatDecision,
    fxRate,
    isPartialPayment,
    paymentPercentage,
    checkedBy,
    approvedBy,
    authorizedBy,
    preparedBy,
    paymentPriority,
    approvalNotes,
    preTaxAmount,
    whtAmount,
    levyAmount,
    vatAmount,
    momoCharge,
    amountThisTransaction,
    budgetImpactUSD,
    bank,
    whtRate,
    supportDocuments, // Added supportDocuments
  } = state;

  // State for validation data (dropdown options)
  const [validationData, setValidationData] = useState({
    paymentModes: [],
    vendors: [],
    procurementTypes: [],
    taxTypes: [],
    banks: [],
    currencies: [],
    budgetLines: [],
    departments: [],
    paymentPriorities: [],
    signatories: []
  });

  // Overpayment prevention: track maximum allowed percentage
  const [maxPaymentPercentage, setMaxPaymentPercentage] = useState(100);
  const [selectedPaymentInfo, setSelectedPaymentInfo] = useState({
    totalAmount: 0,
    paidAmount: 0,
    remainingAmount: 0,
    hasPartialHistory: false
  });

  // Load validation data function
  const loadValidationData = async () => {
    if (!db || !userId || !appId) return;

    try {
      console.log('Loading validation data for PaymentGenerator...');
      const validationRef = collection(db, `artifacts/${appId}/public/data/validation`);
      // Optimization: Limit to 500 to prevent browser freeze on large datasets
      const q = query(validationRef, limit(500));
      const querySnapshot = await getDocs(q);

      const data = {
        paymentModes: [],
        vendors: [],
        procurementTypes: [],
        taxTypes: [],
        banks: [],
        currencies: [],
        budgetLines: [],
        departments: [],
        paymentPriorities: [],
        signatories: []
      };

      // Load regular validation data
      querySnapshot.forEach(doc => {
        const item = doc.data();
        // Handle Signatories specifically or generic mapping
        if (item.field === 'Signatories') {
          data.signatories.push({
            id: doc.id,
            value: item.value,
            description: item.description || '',
            rate: item.rate || 0,
            isActive: item.isActive !== false
          });
        } else if (data[item.field]) {
          data[item.field].push({
            id: doc.id,
            value: item.value,
            description: item.description || '',
            rate: item.rate || 0,
            isActive: item.isActive !== false
          });
        }
      });

      // Load enhanced budget line data
      try {
        const budgetRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);
        // Optimization: Limit budget lines as well
        const budgetQ = query(budgetRef, limit(500));
        const budgetQuerySnapshot = await getDocs(budgetQ);
        budgetQuerySnapshot.forEach(doc => {
          const budgetLine = doc.data();
          if (budgetLine.name) {
            // Build display string with only available fields
            let displayParts = [budgetLine.name];
            if (budgetLine.accountNo) displayParts.push(budgetLine.accountNo);
            if (budgetLine.deptCode) displayParts.push(budgetLine.deptCode);
            if (budgetLine.deptDimension) displayParts.push(budgetLine.deptDimension);

            const displayValue = displayParts.join(' - ');

            data.budgetLines.push({
              id: doc.id,
              value: displayValue, // Full formatted display
              name: budgetLine.name, // Original name for data storage
              description: '', // Clear, info is now in value
              isActive: true,
              budgetLineId: doc.id,
              accountNo: budgetLine.accountNo || '',
              deptCode: budgetLine.deptCode || '',
              deptDimension: budgetLine.deptDimension || ''
            });
          }
        });
      } catch (budgetError) {
        console.error('Error loading budget lines:', budgetError);
      }

      // Load enhanced procurement types
      try {
        const procurementTypes = await ProcurementTypesService.getProcurementTypes(db, appId);
        if (procurementTypes && procurementTypes.length > 0) {
          data.procurementTypes = procurementTypes.map(pt => ({
            id: pt.id,
            value: pt.name,
            description: pt.description,
            rate: pt.whtRate,
            isActive: true,
            whtRate: pt.whtRate
          }));
        }
      } catch (whtError) {
        console.warn('Error loading procurement types:', whtError);
      }

      // Load vendors from VendorService
      try {
        const vendors = await VendorService.getAllVendors(db, appId);
        data.vendors = vendors.map(v => ({
          id: v.id,
          value: v.name,
          description: v.banking?.bankName ? `${v.banking.bankName} - ${v.banking.accountNumber}` : '',
          isActive: v.status === 'active',
          // Store full vendor object for later use
          fullObject: v
        }));
      } catch (vendorError) {
        console.error('Error loading vendors:', vendorError);
      }

      // Load banks from BankService
      try {
        const banks = await BankService.getAllBanks(db, appId);
        data.banks = banks.map(b => ({
          id: b.id,
          value: b.name,
          description: `${b.accountNumber} - ${b.currency}`,
          isActive: b.status !== 'inactive'
        }));
        console.log(`[PaymentGenerator] Loaded ${data.banks.length} banks from BankService`);
      } catch (bankError) {
        console.error('[PaymentGenerator] Error loading banks:', bankError);
      }

      setValidationData(data);
    } catch (error) {
      console.error('Error loading validation data:', error);
    }
  };

  // Load validation data on mount
  useEffect(() => {
    loadValidationData();
  }, [db, userId, appId]);

  // Fetch staged payments from Firestore
  useEffect(() => {
    if (!db || !userId || !appId) {
      console.log('Missing required props for PaymentGenerator:', { db: !!db, userId, appId });
      dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'loading', value: false } });
      dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'error', value: 'Missing required props for PaymentGenerator.' } });
      return;
    }

    dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'loading', value: true } });
    const stagedCollection = collection(db, `artifacts/${appId}/public/data/stagedPayments`);
    const unsubscribe = onSnapshot(stagedCollection, (snapshot) => {
      const stagedData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      dispatch({ type: actionTypes.SET_STAGED_PAYMENTS, payload: stagedData });
      dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'loading', value: false } });
    }, (error) => {
      console.error("Error fetching staged payments:", error);
      dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'error', value: 'Failed to load staged payments.' } });
      dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'loading', value: false } });
    });

    return () => unsubscribe();
  }, [db, userId, appId, dispatch]);

  // Fetch effective WHT rate when procurement type changes (with fallback)
  useEffect(() => {
    const fetchWHTRate = async () => {
      if (!db || !appId || !procurementType) return;

      try {
        // Use getEffectiveWHTRate which handles DB lookup AND fallback automatically
        const rate = await WHTEnhancedService.getEffectiveWHTRate(db, appId, procurementType);
        dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'whtRate', value: rate } });
        console.log(`[PaymentGenerator] WHT Rate set to: ${(rate * 100).toFixed(2)}%`);
      } catch (error) {
        console.error('Error fetching WHT rate:', error);
        // No hardcoded fallback - rate must be in database
        // Set to 0 and log error so user knows to add rate to validation collection
        console.error(`[PaymentGenerator] Failed to retrieve WHT rate for ${procurementType}. Please ensure this procurement type exists in the validation collection with a rate.`);
        dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'whtRate', value: 0 } });
      }
    };

    fetchWHTRate();
  }, [db, appId, procurementType, dispatch]);

  // Calculate payment details when form changes
  useEffect(() => {
    const paymentData = {
      preTaxAmount,
      // NEW: Pass service charge only if toggle is ON
      serviceChargeAmount: state.useServiceCharge ? (state.serviceChargeAmount || 0) : 0,
      paymentPercentage,
      isPartialPayment,
      currency,
      fxRate,
      procurementType,
      taxType,
      vatDecision,
      paymentMode,
    };

    // Determine levy rate based on tax type
    let levyRateToUse = globalRates.levyRate || 0;

    // Try to find rate in validationData
    if (validationData.taxTypes.length > 0 && taxType) {
      const selectedTaxType = validationData.taxTypes.find(t => t.value === taxType);
      if (selectedTaxType && selectedTaxType.rate !== undefined) {
        levyRateToUse = selectedTaxType.rate;
      }
    } else if (taxType === 'STANDARD' || taxType === 'ST+CST') {
      // Fallback for standard tax types if not in validation data
      // This ensures we have a default if the DB is empty but the user selects Standard
      levyRateToUse = 0.06; // Default 6% for standard
    }

    // Helper to normalize rates (convert 6 to 0.06, 15 to 0.15)
    const normalizeRate = (rate) => {
      if (!rate) return 0;
      // If rate is > 1, assume it's a percentage (e.g. 6 or 15) and convert to decimal
      return rate > 1 ? rate / 100 : rate;
    };

    // Use the fetched whtRate and determined levyRate for calculations
    // Use customMomoRate if user has set it, otherwise use globalRates
    const effectiveMomoRate = state.customMomoRate !== undefined ? state.customMomoRate : (globalRates.momoRate || 0.01);
    const rates = {
      ...globalRates,
      whtRate: normalizeRate(whtRate),
      levyRate: normalizeRate(levyRateToUse),
      vatRate: normalizeRate(globalRates.vatRate || 0.15),
      momoRate: normalizeRate(effectiveMomoRate)
    };

    const calculation = calculatePayment(paymentData, rates);

    dispatch({
      type: actionTypes.SET_CALCULATED_VALUES,
      payload: calculation
    });
  }, [
    preTaxAmount,
    paymentPercentage,
    isPartialPayment,
    currency,
    fxRate,
    procurementType,
    taxType,
    vatDecision,
    paymentMode,
    globalRates,
    whtRate,
    validationData,
    state.customMomoRate,
    state.useServiceCharge, // Add to trigger recalculation when toggle changes
    state.serviceChargeAmount, // Add to trigger recalculation when amount changes
    dispatch
  ]);

  // Update bank details when vendor changes
  useEffect(() => {
    if (vendor && validationData.vendors.length > 0) {
      const selectedVendor = validationData.vendors.find(v => v.value === vendor);
      if (selectedVendor && selectedVendor.fullObject && selectedVendor.fullObject.banking) {
        const banking = selectedVendor.fullObject.banking;
        // Log vendor banking details for confirmation
        console.log('Selected Vendor Banking Details:', banking);

        // ❌ CRITICAL FIX: DO NOT auto-fill the 'bank' field with vendor's bank
        // The 'bank' field represents the COMPANY'S SOURCE BANK (where to deduct from)
        // Vendor's bank details are stored separately in the payment object as vendorBank, vendorAccountNumber, etc.
        // and used only for PDF generation (beneficiary details)

        // REMOVED: The line below was causing the bank variable conflict
        // if (banking.bankName) {
        //   dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'bank', value: banking.bankName } });
        // }
      }
    }
  }, [vendor, validationData.vendors, dispatch]);

  const handleAvailablePaymentSelect = async (index) => {
    dispatch({ type: actionTypes.SET_SELECTED_AVAILABLE, payload: index });
    const payment = availablePayments[index];

    console.log('[PaymentGenerator] Selected payment:', payment);

    // Map fields with fallbacks for potential naming mismatches (e.g. vendors vs vendor)
    dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'vendor', value: payment.vendor || payment.vendors || '' } });
    dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'invoiceNo', value: payment.invoiceNo || payment.invoiceNumber || '' } });
    dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'description', value: payment.description || payment.descriptions || '' } });
    dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'budgetLine', value: payment.budgetLine || payment.budgetLines || '' } });
    dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'currency', value: payment.currency || 'GHS' } });
    dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'paymentMode', value: payment.paymentMode || 'BANK TRANSFER' } });
    dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'procurementType', value: payment.procurementType || payment.procurement || 'GOODS' } });
    dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'taxType', value: payment.taxType || 'STANDARD' } });
    dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'vatDecision', value: payment.vatDecision || payment.vat || 'NO' } });
    dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'fxRate', value: parseFloat(payment.fxRate) || 1 } });
    dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'bank', value: payment.bank || '' } });
    // Map MOMO charge from imported data (can be percentage or raw value)
    const importedMomoCharge = parseFloat(payment.momoCharge) || 0;
    dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'customMomoRate', value: importedMomoCharge > 1 ? importedMomoCharge / 100 : importedMomoCharge } });

    // NEW: Handle Service Charge Logic from imported data
    const importedServiceCharge = parseFloat(payment.serviceChargeAmount) || 0;
    if (importedServiceCharge > 0) {
      // Activate the toggle and set value
      dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'useServiceCharge', value: true } });
      dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'serviceChargeAmount', value: importedServiceCharge } });
      console.log('[PaymentGenerator] Auto-detected Service Charge:', importedServiceCharge);
    } else {
      // Ensure it's reset if not present
      dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'useServiceCharge', value: false } });
      dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'serviceChargeAmount', value: 0 } });
    }

    // Map priority if available, converting to lowercase to match value (e.g. 'HIGH' -> 'high')
    // If priority is missing, default to 'normal'
    const priority = payment.priority ? payment.priority.toLowerCase() : 'normal';
    dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'paymentPriority', value: priority } });

    // Handle comma-separated strings
    const parseAmount = (val) => {
      if (typeof val === 'string') {
        return parseFloat(val.replace(/,/g, '')) || 0;
      }
      return parseFloat(val) || 0;
    };

    // Use fullPretax if available, otherwise fallback to amount
    // This is the TOTAL ORIGINAL AMOUNT
    const totalAmount = parseAmount(payment.total_amount || payment.fullPretax || payment.amount || 0);
    dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'preTaxAmount', value: totalAmount } });

    // PARTIAL PAYMENT LOGIC
    const paidAmount = Number(payment.paid_amount || 0);
    const isPartial = payment.payment_status === 'partial' || (paidAmount > 0 && paidAmount < totalAmount);

    // Calculate remaining amount (always needed for display)
    const remainingAmount = totalAmount - paidAmount;
    let maxPercentage = 100;
    if (totalAmount > 0) {
      maxPercentage = (remainingAmount / totalAmount) * 100;
    }
    maxPercentage = Number(maxPercentage.toFixed(2));

    // Set payment info for UI display
    setSelectedPaymentInfo({
      totalAmount,
      paidAmount,
      remainingAmount,
      hasPartialHistory: paidAmount > 0
    });
    setMaxPaymentPercentage(maxPercentage);

    if (isPartial) {
      console.log('[PaymentGenerator] Partial Payment Selected:', {
        totalAmount,
        paidAmount,
        remainingAmount,
        maxPercentage
      });

      dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'paymentPercentage', value: maxPercentage } });
      dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'isPartialPayment', value: true } });
    } else {
      // Full payment (default)
      dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'paymentPercentage', value: 100 } });
      dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'isPartialPayment', value: false } });
    }
  };

  const syncPaymentData = async () => {
    // 1. Validate Weekly Sheet Selection (Optional now)
    if (!sheetName) {
      console.log('No Weekly Sheet selected. Skipping Firestore sync.');
      // Proceed without syncing
    }

    // 2. Upload Support Documents
    let uploadedDocs = [];
    if (state.supportDocuments && state.supportDocuments.length > 0) {
      const tempId = selectedAvailable !== null ? availablePayments[selectedAvailable].id : `temp_${Date.now()}`;
      try {
        uploadedDocs = await uploadSupportDocuments(state.supportDocuments.map(d => d.file), tempId);
      } catch (uploadError) {
        console.warn("Support document upload failed (likely CORS), proceeding without attachments:", uploadError);
        // Proceed without uploaded docs
      }
    }

    // 3. Construct Base Payment Payload (The "Truth" Object)
    // Get original full amount from selected payment (for partial payment tracking)
    const originalPaymentData = selectedAvailable !== null ? availablePayments[selectedAvailable] : null;
    const originalFullAmount = originalPaymentData
      ? Number(originalPaymentData.total_amount || originalPaymentData.fullPretax || originalPaymentData.amount || preTaxAmount)
      : Number(preTaxAmount);
    const previousPaidAmount = originalPaymentData ? Number(originalPaymentData.paid_amount || 0) : 0;

    const newPayment = {
      date: new Date().toISOString().slice(0, 10),
      vendor,
      invoiceNo,
      description,
      amount: amountThisTransaction.toFixed(2),
      // ✅ FIXED - Explicitly include numeric fields for validation
      netPayable: Number(amountThisTransaction || 0),
      amountThisTransaction: Number(amountThisTransaction || 0),
      pretaxAmount: Number(preTaxAmount || 0),

      // ✅ NEW - Partial payment tracking fields
      fullPretax: originalFullAmount, // Original FULL invoice pre-tax amount
      total_amount: originalFullAmount, // Original FULL invoice amount (for status calculation)
      paid_amount: previousPaidAmount, // What was paid BEFORE this transaction (will be updated on finalization)
      isPartialPayment: isPartialPayment,
      paymentPercentage: paymentPercentage,
      payment_status: 'pending', // Will be updated to 'partial' or 'paid' on finalization

      budgetLine: budgetLine,  // ✅ FIXED - Explicitly set budgetLine for consistency
      budgetItem: budgetLine,  // Keep for backward compatibility
      // Enhanced data fields for better tracking
      originalAmount: preTaxAmount,
      currency,
      paymentMode,
      procurementType,
      taxType,
      vatDecision,
      fxRate: Number(fxRate),
      whtAmount: Number(whtAmount),
      whtRate: Number(whtRate),
      levyAmount: Number(levyAmount),
      vatAmount: Number(vatAmount),
      momoCharge: Number(momoCharge),
      budgetImpactUSD: Number(budgetImpactUSD),
      status: 'staged',
      timestamp: new Date().toISOString(),
      // Add weekly sheet reference for tracking
      weeklySheetId: sheetName || null,
      weeklySheetName: sheetName || 'Ad-hoc',
      // Approval selection data
      checkedBy,
      approvedBy,
      authorizedBy,
      preparedBy,
      paymentPriority,
      approvalNotes,

      // ✅ CRITICAL FIX: Strict Bank Field Separation
      bank, // Company's SOURCE bank (where money is deducted FROM)

      // ✅ NEW: Flat vendor banking fields for PDF generation (beneficiary details)
      vendorBank: validationData.vendors.find(v => v.value === vendor)?.fullObject?.banking?.bankName || '',
      vendorAccountNumber: validationData.vendors.find(v => v.value === vendor)?.fullObject?.banking?.accountNumber || '',
      vendorBranch: validationData.vendors.find(v => v.value === vendor)?.fullObject?.banking?.branchCode || '',

      supportDocuments: uploadedDocs,
      // Keep full object as backup for any additional fields needed
      vendorBanking: validationData.vendors.find(v => v.value === vendor)?.fullObject?.banking || null
    };

    // 4. Sync with Firestore
    if (sheetName) {
      if (selectedAvailable !== null) {
        // Existing payment -> Update with All-Fields Sync Protocol
        const originalPayment = availablePayments[selectedAvailable];

        // --- ALL-FIELDS SYNC PROTOCOL START ---
        // 2. DEFINE FIELDS TO MONITOR
        const fieldsToMonitor = {
          vendor: "Vendor",
          invoiceNo: "Invoice No",
          description: "Description",
          budgetLine: "Budget Line",  // ✅ FIXED - Monitor budget line changes
          paymentMode: "Payment Mode",
          bank: "Bank",
          procurementType: "Procurement Type",
          taxType: "Tax Type",
          currency: "Currency",
          vatDecision: "VAT Decision"
        };

        // 3. CHANGE DETECTION & AUDIT NOTE GENERATION
        let changes = [];

        // Check text/dropdown fields
        Object.entries(fieldsToMonitor).forEach(([field, label]) => {
          const currentValues = {
            vendor, invoiceNo, description, budgetLine, paymentMode, bank,  // ✅ FIXED - Include budgetLine
            procurementType, taxType, currency, vatDecision
          };

          const oldValue = originalPayment[field] || "";
          const newValue = currentValues[field] || "";

          // Simple string comparison (ignoring slight whitespace differences)
          if (String(oldValue).trim() !== String(newValue).trim()) {
            changes.push(`${label}: "${oldValue}" -> "${newValue}"`);
          }
        });

        // Check Amount Separately (Number comparison)
        const newNetPayable = Number(amountThisTransaction || 0);
        const oldNetPayable = Number(originalPayment.netPayable || originalPayment.amount || 0);
        const amountDiff = newNetPayable - oldNetPayable;

        if (Math.abs(amountDiff) > 0.001) { // Floating point safety
          changes.push(`Amount: ${oldNetPayable.toLocaleString()} -> ${newNetPayable.toLocaleString()}`);
        }

        // 4. CONSTRUCT AUDIT NOTE
        let correctionNote = originalPayment.modificationNote || "";
        if (changes.length > 0) {
          const timestamp = new Date().toLocaleTimeString();
          const changeLog = `[${timestamp}] Corrections: ${changes.join(', ')}`;

          // Append to existing notes
          correctionNote = correctionNote ? `${correctionNote} | ${changeLog}` : changeLog;
          console.log("Audit Log Generated:", changeLog);
        }

        // 5. PREPARE THE "TRUTH" OBJECT (ALL FIELDS)
        const paymentUpdatePayload = {
          ...newPayment, // Use the base payload constructed above
          id: originalPayment.id,

          // Audit Metadata
          lastUpdated: new Date().toISOString(),
          updatedBy: userId,
          modificationNote: correctionNote,
        };

        console.log("Syncing Complete Payment Data:", paymentUpdatePayload);

        // 6. ATOMIC UPDATE (Write-Back to Source)
        await updateWeeklySheetTransaction(db, appId, sheetName, originalPayment.id, paymentUpdatePayload);
        console.log('Updated existing transaction with sync protocol:', originalPayment.id);

        // 7. INSTANT UI REFRESH (The Fix)
        setAvailablePayments(prevPayments =>
          prevPayments.map(payment =>
            payment.id === originalPayment.id
              ? { ...payment, ...paymentUpdatePayload } // Merge new data
              : payment // Keep others same
          )
        );

        return paymentUpdatePayload;
        // --- ALL-FIELDS SYNC PROTOCOL END ---

      } else {
        // New payment -> Add
        const newId = await addTransactionToWeeklySheet(db, appId, sheetName, newPayment);
        console.log('Added new transaction:', newId);
        return { ...newPayment, id: newId };
      }
    } else {
      // No sheet selected -> Save to stagedPayments instead of TEMP ID
      try {
        const docRef = await addDoc(collection(db, `artifacts/${appId}/public/data/stagedPayments`), newPayment);
        console.log('Saved ad-hoc payment to stagedPayments:', docRef.id);
        return { ...newPayment, id: docRef.id };
      } catch (error) {
        console.error('Error saving to stagedPayments:', error);
        // Fallback to TEMP ID only if save fails
        return { ...newPayment, id: `TEMP-${Date.now()}` };
      }
    }
  };

  // Preview Modal State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [generatedBlob, setGeneratedBlob] = useState(null);

  // Processing Status State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('VALIDATING');
  const [processingError, setProcessingError] = useState(null);

  // Steps definition for the modal
  const PROCESSING_STEPS = [
    { id: 'VALIDATING', label: 'Validating Payment Data' },
    { id: 'UNDO_CAPTURE', label: 'Creating Undo Snapshot' },
    { id: 'BUDGET_UPDATE', label: 'Updating Budget Balances' },
    { id: 'WHT_PROCESSING', label: 'Processing Tax Returns (WHT)' },
    { id: 'STATUS_UPDATE', label: 'Updating Payment Status' },
    { id: 'MASTER_LOG', label: 'Logging to Master Transaction Log' },
    { id: 'COMPLETED', label: 'Finalization Complete' }
  ];
  const [budgetBalanceData, setBudgetBalanceData] = useState(null);

  // Fetch Budget Balance when Budget Line changes
  useEffect(() => {
    const fetchBudgetBalance = async () => {
      if (budgetLine && db && appId) {
        try {
          const balanceData = await VoucherBalanceService.getBudgetBalanceForVoucher(db, appId, budgetLine);
          // Calculate impact
          const impact = VoucherBalanceService.calculateVoucherBudgetImpact(balanceData, budgetImpactUSD || amountThisTransaction);

          // Merge data for the report
          setBudgetBalanceData({
            ...balanceData, // allocatedAmount, totalSpendToDate, etc.
            ...impact       // balCD, request, balBD (overrides balanceData.balCD if needed, but they should match)
          });
        } catch (err) {
          console.error("Error fetching budget balance:", err);
          setBudgetBalanceData(null);
        }
      } else {
        setBudgetBalanceData(null);
      }
    };

    fetchBudgetBalance();
  }, [budgetLine, db, appId, budgetImpactUSD, amountThisTransaction]);

  const handleGenerateDocuments = async () => {
    // 1. Validation
    if (!checkedBy || !approvedBy || !authorizedBy) {
      alert('Please select all required approval signatories.');
      return;
    }

    setIsProcessing(true);
    setProcessingStep('Syncing payment data...');

    try {
      // 2. Sync / Upload Data
      let syncedPayment = null;
      try {
        syncedPayment = await syncPaymentData();
      } catch (syncError) {
        console.error('Sync failed:', syncError);

        // ✅ FIXED - Save to Firestore instead of creating TEMP ID
        const paymentData = {
          // Basic info
          vendor: vendor || '',
          invoiceNo: invoiceNo || '',
          description: description || '',

          // Budget line (with alias for compatibility)
          budgetLine: budgetLine || '',
          budgetItem: budgetLine || '',

          // Financial fields (with aliases)
          pretaxAmount: Number(preTaxAmount || 0),
          fullPretax: Number(preTaxAmount || 0),
          netPayable: Number(amountThisTransaction || 0),
          amountThisTransaction: Number(amountThisTransaction || 0),
          amount: Number(amountThisTransaction || 0), // Legacy

          // Tax amounts
          whtAmount: Number(whtAmount || 0),
          whtRate: Number(whtRate || 0),
          levyAmount: Number(levyAmount || 0),
          vatAmount: Number(vatAmount || 0),
          momoCharge: Number(momoCharge || 0),

          // Tax and payment details
          procurementType: procurementType || 'SERVICES',
          taxType: taxType || 'STANDARD',
          vatDecision: vatDecision || 'NO',
          paymentMode: paymentMode || 'BANK TRANSFER',
          bank: bank || '',

          // Currency
          currency: currency || 'GHS',
          fxRate: Number(fxRate || 1),

          // Budget impact
          budgetImpactUSD: budgetImpactUSD || 0,

          // Status fields
          payment_status: 'pending',
          paid_amount: 0,
          total_amount: Number(amountThisTransaction || 0),
          status: 'pending',

          // Weekly sheet info
          weeklySheetId: sheetName || null,
          weeklySheetName: sheetName || 'Ad-hoc',

          // Approvals
          checkedBy,
          approvedBy,
          authorizedBy,
          paymentPriority: paymentPriority || 'normal',

          // Timestamps
          createdAt: serverTimestamp(),
          date: new Date().toISOString().slice(0, 10)
        };

        // Save to Firestore
        const collectionPath = sheetName
          ? `artifacts/${appId}/public/data/weeklySheets/${sheetName}/payments`
          : `artifacts/${appId}/public/data/stagedPayments`;

        const docRef = await addDoc(collection(db, collectionPath), paymentData);
        syncedPayment = { ...paymentData, id: docRef.id };
        console.log('✅ Saved payment to Firestore:', syncedPayment.id);
      }

      // 3. Finalize Payment
      if (syncedPayment) {
        setProcessingStep('Finalizing transaction...');

        const metadata = {
          weeklySheetId: sheetName || null,
          weeklySheetName: sheetName || 'Ad-hoc',
          generatedBy: 'PaymentGenerator',
          generationDate: new Date().toISOString(),
          voucherId: syncedPayment.id,
          userId: userId || 'system',
          batchId: `BATCH-${Date.now()}`,
          finalizationType: 'single_payment_generator'
        };

        try {
          const finalizationResult = await PaymentFinalizationService.finalizePaymentBatch(
            db,
            appId,
            userId || 'system',
            [syncedPayment],
            metadata,
            (status) => setProcessingStep(status)
          );

          console.log('✅ Payment finalized successfully:', finalizationResult);
          setProcessingStep('Generating documents...');

        } catch (finalizationError) {
          console.error('❌ Finalization failed:', finalizationError);
          alert(`Payment Finalization Failed: ${finalizationError.message}`);
          setIsProcessing(false);
          setProcessingStep('');
          return; // Stop - don't generate document if finalization fails
        }

        // 4. Generate Document ONLY after successful finalization
        const paymentForGen = {
          ...syncedPayment,
          supportDocuments: supportDocuments,
          budgetData: budgetBalanceData
        };

        const blob = await DocumentGenerationService.generateCombinedDocument(paymentForGen, companySettings);
        const url = URL.createObjectURL(blob);

        setGeneratedBlob(blob);
        setPreviewUrl(url);
        setIsPreviewOpen(true);
      }

    } catch (error) {
      console.error('Error in generation flow:', error);
      alert('Failed to process payment and generate documents.');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  const handleDownload = () => {
    if (generatedBlob) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(generatedBlob);
      link.download = `Payment_Document_${vendor || 'Unknown'}_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setIsPreviewOpen(false);
    }
  };

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setGeneratedBlob(null);
  };

  const handleRemoveFromBatch = async (paymentId) => {
    if (!db || !userId || !appId) return;

    try {
      await removePaymentFromBatch(db, appId, paymentId);
      console.log("Payment removed from batch");
    } catch (error) {
      console.error("Error removing payment from batch:", error);
      alert("Failed to remove payment from batch. Please try again.");
    }
  };

  const handleClearBatch = async () => {
    if (!db || !userId || !appId) return;

    try {
      await clearBatch(db, appId);
      dispatch({ type: actionTypes.SET_STAGED_PAYMENTS, payload: [] });
      console.log("Batch cleared successfully");
    } catch (error) {
      console.error("Error clearing batch:", error);
      alert("Failed to clear batch. Please try again.");
    }
  };

  const handleFinalizeSchedule = async () => {
    if (stagedPayments.length === 0) {
      alert("No payments staged for finalization.");
      return;
    }

    if (!confirm(`Are you sure you want to finalize ${stagedPayments.length} payments? This action cannot be undone.`)) {
      return;
    }

    try {
      await finalizeSchedule(db, appId, userId, weeklySheetId);
      await handleClearBatch();
      alert("Payment schedule finalized successfully!");
    } catch (error) {
      console.error("Finalization failed:", error);
      alert("Failed to finalize schedule. Please try again.");
    }
  };

  const handlePreviewSchedule = () => {
    if (stagedPayments.length === 0) {
      alert("No payments staged for preview.");
      return;
    }
    alert(`Preview functionality will be implemented. ${stagedPayments.length} payments are staged.`);
  };


  const handleClearReset = () => {
    dispatch({ type: actionTypes.RESET_FORM });
  };



  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading payment generator...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* MODE TOGGLE SWITCHER - SS (Simple Single) vs BF (Batch Finalize) */}
      <div className="flex justify-center mb-4">
        <div className="bg-slate-100 p-1.5 rounded-xl inline-flex shadow-inner border border-slate-200">
          <button
            onClick={() => setMode('SS')}
            className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all duration-200 ${mode === 'SS'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
              }`}
          >
            Simple Single (SS)
          </button>
          <button
            onClick={() => setMode('BF')}
            className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all duration-200 ${mode === 'BF'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
              }`}
          >
            Batch Finalize (BF)
          </button>
        </div>
      </div>

      {mode === 'SS' ? (
        /* ========== SIMPLE SINGLE MODE (Existing PaymentGenerator UI) ========== */
        <>
          {/* Grid Layout for Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Panel - Weekly Sheet Selection and Available Payments */}
            <div className="lg:col-span-1 space-y-6">
              {/* Select Weekly Sheet Section */}
              <div className="bg-gray-50 rounded-lg p-4 border border-blue-200 shadow-sm">
                <h3 className="text-lg font-bold text-gray-800 mb-2">Weekly Sheet Selection</h3>
                <p className="text-xs text-gray-500 mb-4 uppercase tracking-wide font-semibold">Required for Staging</p>
                <div className="flex gap-3">
                  <select
                    className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                    value={selectedSheetId}
                    onChange={(e) => {
                      setSelectedSheetId(e.target.value);
                      if (onSheetSelect) onSheetSelect(e.target.value);
                    }}
                  >
                    <option value="">Select a sheet...</option>
                    {sheets.map(sheet => (
                      <option key={sheet.id} value={sheet.id}>{sheet.name}</option>
                    ))}
                  </select>
                  <button
                    className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
                    onClick={() => onLoadPayments && onLoadPayments(selectedSheetId)}
                    disabled={!selectedSheetId}
                  >
                    Load
                  </button>
                </div>
              </div>

              {/* Available Payments Section */}
              <div className="bg-gray-50 rounded-lg p-4 border">
                <h3 className="text-lg font-semibold text-gray-700 mb-4">Available Payments</h3>
                {availablePayments.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                    <p>No payments available.</p>
                    <p className="text-sm mt-2">Select a weekly sheet and click "Load Payments" to see available payments.</p>
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto">
                    <table className="min-w-full">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {localAvailablePayments
                          .filter(payment => {
                            // Filter out fully paid payments
                            // Check both payment_status AND legacy paid boolean
                            if (payment.payment_status === 'paid') return false;
                            if (payment.paid === true && !payment.payment_status) return false;

                            // Also check if paid_amount >= total_amount (for safety)
                            const paid = Number(payment.paid_amount || 0);
                            const total = Number(payment.total_amount || payment.amount || 0);
                            if (total > 0 && paid >= (total - 0.01)) return false;

                            return true;
                          })
                          .map((payment, index) => {
                            const isPartial = payment.payment_status === 'partial';
                            const originalIndex = localAvailablePayments.indexOf(payment); // Keep track of original index for selection

                            return (
                              <tr
                                key={index}
                                className={`cursor-pointer hover:bg-gray-50 ${selectedAvailable === originalIndex ? 'bg-blue-100' : isPartial ? 'bg-yellow-50' : ''
                                  }`}
                                onClick={() => handleAvailablePaymentSelect(originalIndex)}
                              >
                                <td className="px-3 py-2 text-sm text-gray-900">{payment.date || 'N/A'}</td>
                                <td className="px-3 py-2 text-sm text-gray-900">{payment.vendor}</td>
                                <td className="px-3 py-2 text-sm text-gray-900">
                                  {payment.description}
                                  {isPartial && (
                                    <span className="block text-xs text-yellow-600 font-medium">
                                      Partially Paid: {Number(payment.paid_amount).toFixed(2)} / {Number(payment.total_amount || payment.amount).toFixed(2)}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-sm text-gray-900">
                                  {isPartial
                                    ? (Number(payment.total_amount || payment.amount) - Number(payment.paid_amount)).toFixed(2)
                                    : payment.amount}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel - Weekly Sheet Selection and Payment Details */}
            <div className="lg:col-span-2 space-y-6">
              {/* Weekly Sheet Selection Section */}

              {/* Selected Payment Details Section */}
              {selectedAvailable !== null && (
                <div className="bg-white rounded-lg p-6 border border-gray-200">
                  <h4 className="text-xl font-semibold text-gray-700 mb-6">Selected Payment Details</h4>

                  {/* Form Fields */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Vendor</label>
                      <select
                        value={vendor}
                        onChange={(e) => dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'vendor', value: e.target.value } })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        <option value="">Select a vendor</option>
                        {validationData.vendors.length > 0 ? (
                          validationData.vendors.map((opt, index) => (
                            <option key={opt.id || index} value={opt.value}>{opt.value}</option>
                          ))
                        ) : (
                          <option value="" disabled>No vendors available</option>
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Invoice No.</label>
                      <input
                        type="text"
                        value={invoiceNo}
                        onChange={(e) => dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'invoiceNo', value: e.target.value } })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                        placeholder="Invoice Number"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                      <input
                        type="text"
                        value={description}
                        onChange={(e) => dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'description', value: e.target.value } })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                        placeholder="Description"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Pre-tax Amount (Total Invoice)</label>
                      <input
                        type="number"
                        value={preTaxAmount}
                        onChange={(e) => dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'preTaxAmount', value: Number(e.target.value) } })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                        placeholder="0"
                      />
                    </div>

                    {/* SERVICE CHARGE SECTION */}
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-blue-800 flex items-center">
                          <input
                            type="checkbox"
                            checked={state.useServiceCharge || false}
                            onChange={(e) => {
                              dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'useServiceCharge', value: e.target.checked } });
                              // Reset amount if unchecked
                              if (!e.target.checked) {
                                dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'serviceChargeAmount', value: 0 } });
                              }
                            }}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mr-2"
                          />
                          Apply WHT on Service Charge Only?
                        </label>

                        {/* Tooltip/Help Icon */}
                        <div className="group relative">
                          <svg className="w-4 h-4 text-blue-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10">
                            Use this when WHT applies only to a specific fee (e.g., Boot Service Fee) and not the total invoice amount.
                          </span>
                        </div>
                      </div>

                      {state.useServiceCharge && (
                        <div>
                          <input
                            type="number"
                            value={state.serviceChargeAmount || ''}
                            onChange={(e) => dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'serviceChargeAmount', value: Number(e.target.value) } })}
                            className="w-full p-2 border border-blue-300 rounded-md focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                            placeholder="Enter Service Charge Amount"
                          />
                          <p className="text-xs text-blue-600 mt-1">
                            WHT ({((whtRate || 0) * 100).toFixed(1)}%) will be calculated on ₵{Number(state.serviceChargeAmount || 0).toLocaleString()} instead of the total.
                          </p>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Process as Partial Payment?</label>
                      <input
                        type="checkbox"
                        checked={isPartialPayment}
                        onChange={(e) => dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'isPartialPayment', value: e.target.checked } })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      {/* Show prior payment info if this is a partial payment */}
                      {selectedPaymentInfo.hasPartialHistory && (
                        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md text-sm">
                          <p className="font-medium text-yellow-800">⚠️ Previous Partial Payment Detected</p>
                          <div className="text-yellow-700 mt-1 space-y-1">
                            <p>Total Invoice: {currency === 'USD' ? '$' : '₵'}{selectedPaymentInfo.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            <p>Already Paid: {currency === 'USD' ? '$' : '₵'}{selectedPaymentInfo.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            <p className="font-bold">Remaining: {currency === 'USD' ? '$' : '₵'}{selectedPaymentInfo.remainingAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ({maxPaymentPercentage}%)</p>
                          </div>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Percentage to Pay (%)
                        {maxPaymentPercentage < 100 && (
                          <span className="text-orange-600 ml-2">Max: {maxPaymentPercentage}%</span>
                        )}
                      </label>
                      <input
                        type="number"
                        value={paymentPercentage}
                        onChange={(e) => {
                          const newValue = Number(e.target.value);
                          // Overpayment prevention
                          if (newValue > maxPaymentPercentage) {
                            alert(`Cannot pay more than ${maxPaymentPercentage.toFixed(1)}% (remaining balance)`);
                            dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'paymentPercentage', value: maxPaymentPercentage } });
                          } else {
                            dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'paymentPercentage', value: newValue } });
                          }
                        }}
                        className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white ${paymentPercentage > maxPaymentPercentage ? 'border-red-500' : 'border-gray-300'
                          }`}
                        placeholder="100"
                        min="1"
                        max={maxPaymentPercentage}
                      />
                      {paymentPercentage > maxPaymentPercentage && (
                        <p className="text-red-600 text-sm mt-1">
                          ⚠️ Exceeds remaining balance! Max allowed: {maxPaymentPercentage}%
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Payment Mode</label>
                      <select
                        value={paymentMode}
                        onChange={(e) => dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'paymentMode', value: e.target.value } })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        <option value="">Select a mode</option>
                        {validationData.paymentModes.length > 0 ? (
                          validationData.paymentModes.map((opt, index) => (
                            <option key={opt.id || index} value={opt.value}>{opt.value}</option>
                          ))
                        ) : (
                          // Fallback to constants if no dynamic data
                          PAYMENT_MODES.map(mode => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Bank</label>
                      <select
                        value={bank}
                        onChange={(e) => dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'bank', value: e.target.value } })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        <option value="">Select a bank</option>
                        {validationData.banks.length > 0 ? (
                          validationData.banks.map((opt, index) => (
                            <option key={opt.id || index} value={opt.value}>{opt.value}</option>
                          ))
                        ) : (
                          <option value="" disabled>No banks available</option>
                        )}
                      </select>
                    </div>
                    {/* MOMO Charge Rate - Always visible for user to set/view */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">MoMo Charge Rate (%)</label>
                      <input
                        type="number"
                        value={state.customMomoRate !== undefined ? (state.customMomoRate * 100) : ((globalRates.momoRate || 0.01) * 100)}
                        onChange={(e) => {
                          // Update momoRate in the calculation context
                          const newRate = Number(e.target.value) / 100;
                          dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'customMomoRate', value: newRate } });
                        }}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                        placeholder="1"
                        min="0"
                        step="0.1"
                      />
                      <p className="text-xs text-gray-500 mt-1">Applies when Payment Mode is MOMO</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Tax Type</label>
                      <select
                        value={taxType}
                        onChange={(e) => dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'taxType', value: e.target.value } })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        <option value="">Select a tax type</option>
                        {validationData.taxTypes.length > 0 ? (
                          validationData.taxTypes.map((opt, index) => (
                            <option key={opt.id || index} value={opt.value}>{opt.value}</option>
                          ))
                        ) : (
                          // Fallback
                          TAX_TYPES.map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Procurement Type</label>
                      <select
                        value={procurementType}
                        onChange={(e) => dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'procurementType', value: e.target.value } })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        <option value="">Select a type</option>
                        {validationData.procurementTypes.length > 0 ? (
                          validationData.procurementTypes.map((opt, index) => (
                            <option key={opt.id || index} value={opt.value}>{opt.value}</option>
                          ))
                        ) : (
                          // Fallback
                          PROCUREMENT_TYPES.map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">FX Rate</label>
                      <input
                        type="number"
                        value={fxRate}
                        onChange={(e) => dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'fxRate', value: Number(e.target.value) } })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                        placeholder="0"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">VAT (Yes/No)</label>
                      <select
                        value={vatDecision}
                        onChange={(e) => dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'vatDecision', value: e.target.value } })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        {VAT_OPTIONS.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Budget Line</label>
                      <select
                        value={budgetLine}
                        onChange={(e) => dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'budgetLine', value: e.target.value } })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        <option value="">Select a budget line</option>
                        {validationData.budgetLines.length > 0 ? (
                          validationData.budgetLines.map((opt, index) => (
                            <option key={opt.id || index} value={opt.value}>
                              {opt.value} {opt.description ? `- ${opt.description}` : ''}
                            </option>
                          ))
                        ) : (
                          <option value="" disabled>No budget lines available</option>
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Transaction Currency</label>
                      <select
                        value={currency}
                        onChange={(e) => dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'currency', value: e.target.value } })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        <option value="GHS">GHS</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                      </select>
                    </div>
                  </div>

                  {/* Calculated Values Display */}
                  <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                    <h5 className="text-lg font-semibold text-gray-700 mb-4">Calculated Values</h5>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-600">WHT Amount</label>
                        <p className="text-lg font-semibold text-gray-900">₵ {whtAmount.toFixed(2)}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600">Levy Amount</label>
                        <p className="text-lg font-semibold text-gray-900">₵ {levyAmount.toFixed(2)}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600">VAT Amount</label>
                        <p className="text-lg font-semibold text-gray-900">₵ {vatAmount.toFixed(2)}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600">MoMo Charge</label>
                        <p className="text-lg font-semibold text-gray-900">₵ {momoCharge.toFixed(2)}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600">Net Payable</label>
                        <p className="text-lg font-semibold text-gray-900">₵ {amountThisTransaction.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-600">Budget Impact (USD)</label>
                      <p className="text-lg font-semibold text-gray-900">$ {budgetImpactUSD.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-6 flex justify-end space-x-3">
                    <button
                      onClick={handleClearReset}
                      className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
                    >
                      Clear & Reset
                    </button>
                    <button
                      onClick={handleGenerateDocuments}
                      className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center font-semibold shadow-md"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Generate Payment Documents
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Approval Selection Options - Full Width */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
              <h4 className="text-lg font-semibold text-gray-700 mb-4">Approval Selection</h4>

              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <span className="font-medium">Required Fields:</span> Checked By, Approved By, and Authorized By must be selected before staging a payment.
                </p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Checked By <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={checkedBy}
                    onChange={(e) => dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'checkedBy', value: e.target.value } })}
                    className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white ${!checkedBy ? 'border-red-300' : 'border-gray-300'
                      }`}
                  >
                    <option value="">Select a signatory</option>
                    {validationData.signatories.length > 0 ? (
                      validationData.signatories.map((sig, index) => (
                        <option key={sig.id || index} value={sig.value}>{sig.value}</option>
                      ))
                    ) : (
                      SIGNATORIES.map(sig => (
                        <option key={sig.value} value={sig.value}>{sig.label}</option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Approved By <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={approvedBy}
                    onChange={(e) => dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'approvedBy', value: e.target.value } })}
                    className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white ${!approvedBy ? 'border-red-300' : 'border-gray-300'
                      }`}
                  >
                    <option value="">Select a signatory</option>
                    {validationData.signatories.length > 0 ? (
                      validationData.signatories.map((sig, index) => (
                        <option key={sig.id || index} value={sig.value}>{sig.value}</option>
                      ))
                    ) : (
                      SIGNATORIES.map(sig => (
                        <option key={sig.value} value={sig.value}>{sig.label}</option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Authorized By <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={authorizedBy}
                    onChange={(e) => dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'authorizedBy', value: e.target.value } })}
                    className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white ${!authorizedBy ? 'border-red-300' : 'border-gray-300'
                      }`}
                  >
                    <option value="">Select a signatory</option>
                    {validationData.signatories.length > 0 ? (
                      validationData.signatories.map((sig, index) => (
                        <option key={sig.id || index} value={sig.value}>{sig.value}</option>
                      ))
                    ) : (
                      SIGNATORIES.map(sig => (
                        <option key={sig.value} value={sig.value}>{sig.label}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Additional Approval Options */}
              <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Prepared By</label>
                  <select
                    value={preparedBy}
                    onChange={(e) => dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'preparedBy', value: e.target.value } })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    <option value="">Select prepared by</option>
                    {validationData.signatories.length > 0 ? (
                      validationData.signatories.map((sig, index) => (
                        <option key={sig.id || index} value={sig.value}>{sig.value}</option>
                      ))
                    ) : (
                      SIGNATORIES.map(sig => (
                        <option key={sig.value} value={sig.value}>{sig.label}</option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Payment Priority</label>
                  <select
                    value={paymentPriority}
                    onChange={(e) => dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'paymentPriority', value: e.target.value } })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    <option value="">Select priority</option>
                    {validationData.paymentPriorities.length > 0 ? (
                      validationData.paymentPriorities.map((opt, index) => (
                        <option key={opt.id || index} value={opt.value}>{opt.value}</option>
                      ))
                    ) : (
                      PAYMENT_PRIORITIES.map(priority => (
                        <option key={priority.value} value={priority.value}>{priority.label}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Approval Notes */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Approval Notes</label>
                <textarea
                  value={approvalNotes}
                  onChange={(e) => dispatch({ type: actionTypes.SET_FIELD, payload: { field: 'approvalNotes', value: e.target.value } })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  rows="3"
                  placeholder="Add any special notes or instructions for approval..."
                ></textarea>
              </div>
            </div>
          </div>

          {/* Support Documents Section */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-lg font-semibold text-gray-700">Support Documents</h4>
                <label className="cursor-pointer px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-2 font-medium">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Add Document
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files);
                      files.forEach(file => {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          dispatch({
                            type: actionTypes.ADD_SUPPORT_DOCUMENT,
                            payload: {
                              file,
                              name: file.name,
                              type: file.type,
                              preview: file.type.startsWith('image/') ? reader.result : null
                            }
                          });
                        };
                        reader.readAsDataURL(file);
                      });
                      e.target.value = ''; // Reset input
                    }}
                  />
                </label>
              </div>

              {state.supportDocuments && state.supportDocuments.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {state.supportDocuments.map((doc, index) => (
                    <div
                      key={index}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', index);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        e.preventDefault(); // Necessary to allow dropping
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                        if (fromIndex !== index) {
                          dispatch({
                            type: actionTypes.REORDER_SUPPORT_DOCUMENTS,
                            payload: { fromIndex, toIndex: index }
                          });
                        }
                      }}
                      className="relative group bg-gray-50 rounded-lg border border-gray-200 p-2 flex flex-col items-center cursor-move hover:shadow-md transition-shadow duration-200"
                    >
                      {/* Preview / Icon */}
                      <div className="w-full h-24 mb-2 bg-white rounded border border-gray-100 flex items-center justify-center overflow-hidden">
                        {doc.type.startsWith('image/') && doc.preview ? (
                          <img src={doc.preview} alt={doc.name} className="w-full h-full object-cover" />
                        ) : doc.type === 'application/pdf' ? (
                          <PDFThumbnail file={doc.file} />
                        ) : (
                          <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        )}
                      </div>

                      {/* Filename */}
                      <p className="text-xs text-gray-600 text-center truncate w-full mb-2" title={doc.name}>
                        {doc.name}
                      </p>

                      {/* Remove Button */}
                      <button
                        onClick={() => dispatch({ type: actionTypes.REMOVE_SUPPORT_DOCUMENT, payload: index })}
                        className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-md border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                        title="Remove document"
                      >
                        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                  <p className="text-gray-500 text-sm">No support documents added yet.</p>
                  <p className="text-gray-400 text-xs mt-1">Upload files to attach them to the payment voucher.</p>
                </div>
              )}
            </div>
          </div>

          <ProcessingStatusModal
            isOpen={isProcessing}
            steps={PROCESSING_STEPS}
            currentStep={processingStep}
            error={processingError}
            onClose={() => setIsProcessing(false)}
          />

          {/* Document Preview Modal */}
          <DocumentPreviewModal
            isOpen={isPreviewOpen}
            onClose={() => setIsPreviewOpen(false)}
            pdfUrl={previewUrl}
            blob={generatedBlob}
            paymentId={availablePayments[selectedAvailable]?.id}
            vendorName={vendor}
          />
        </> /* End of SS Mode Fragment */
      ) : (
        /* ========== BATCH FINALIZE MODE ========== */
        <div className="bg-white rounded-lg shadow-lg border border-purple-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-purple-800">Batch Finalize Mode</h2>
            <span className="text-sm text-purple-600 bg-purple-100 px-3 py-1 rounded-full">
              {sheetName || 'Select Weekly Sheet'}
            </span>
          </div>
          {sheetName ? (
            <PaymentStaging
              db={db}
              appId={appId}
              userId={userId}
              weeklySheetId={sheetName}
              onClose={() => setMode('SS')}
              payments={localAvailablePayments.map((p, idx) => ({ ...p, originalSheetRow: idx + 1 }))}
            />
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-purple-300 rounded-lg">
              <p className="text-purple-600 font-medium">Please select a Weekly Sheet first</p>
              <p className="text-sm text-purple-400 mt-2">Load payments from the dropdown in SS mode, then switch to BF mode</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PaymentGenerator;
