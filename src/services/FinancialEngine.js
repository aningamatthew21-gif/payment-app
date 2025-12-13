// Financial Engine Service - Core financial calculations migrated from VBA
// This service handles WHT, VAT, Levies, Momo charges, and budget calculations
// NOW COMPLETELY DYNAMIC - No hard-coded rates!

// Company Information (from VBA constants)
// Company Information (Dynamic)
export const getCompanyInfo = (settings = {}) => {
  const defaults = {
    companyName: "MARGINS ID SYSTEMS APPLICATION LIMITED",
    companyTIN: "C0005254159",
    companyAddress: "P.O. Box KN 785, Kaneshie - Accra, Ghana.",
    companyPhone: "",
    companyEmail: "",
    currency: "GHS"
  };

  return { ...defaults, ...settings };
};

// Legacy constant for backward compatibility (warns when used)
export const COMPANY_INFO = {
  get NAME() { console.warn('Accessing legacy COMPANY_INFO.NAME'); return "MARGINS ID SYSTEMS APPLICATION LIMITED"; },
  get TIN() { console.warn('Accessing legacy COMPANY_INFO.TIN'); return "C0005254159"; },
  get ADDRESS() { console.warn('Accessing legacy COMPANY_INFO.ADDRESS'); return "P.O. Box KN 785, Kaneshie - Accra, Ghana."; },
  DEFAULT_TAX_OFFICE: "OSU-MTO",
  DEFAULT_VENDOR_LOCATION: "ACCRA",
  DEFAULT_RESIDENT_STATUS: "RESIDENT"
};

/**
 * Calculate WHT (Withholding Tax) amount using dynamic rate
 * @param {number} amount - Pre-tax amount
 * @param {number} whtRate - WHT rate as decimal (e.g., 0.05 for 5%)
 * @returns {number} WHT amount
 */
export const calculateWHT = (amount, whtRate = 0) => {
  if (!amount || amount <= 0 || !whtRate) return 0;
  return amount * whtRate;
};

/**
 * Calculate Levy amount using dynamic rate
 * @param {number} amount - Pre-tax amount
 * @param {number} levyRate - Levy rate as decimal (e.g., 0.06 for 6%)
 * @returns {number} Levy amount
 */
export const calculateLevy = (amount, levyRate = 0) => {
  if (!amount || amount <= 0 || !levyRate) return 0;
  return amount * levyRate;
};

/**
 * Calculate VAT amount using dynamic rate
 * @param {number} amount - Pre-tax amount
 * @param {number} vatRate - VAT rate as decimal (e.g., 0.15 for 15%)
 * @returns {number} VAT amount
 */
export const calculateVAT = (amount, vatRate = 0) => {
  if (!amount || amount <= 0 || !vatRate) return 0;
  return amount * vatRate;
};

/**
 * Calculate Momo charge using dynamic rate
 * @param {number} amount - Payment amount
 * @param {number} momoRate - Momo charge rate as decimal (e.g., 0.01 for 1%)
 * @returns {number} Momo charge amount
 */
export const calculateMomoCharge = (amount, momoRate = 0) => {
  if (!amount || amount <= 0 || !momoRate) return 0;
  return amount * momoRate;
};

/**
 * Calculate total tax amount for a transaction using dynamic rates
 * @param {Object} transaction - Transaction object with all required fields
 * @param {Object} rates - Dynamic rates object
 * @returns {Object} Tax breakdown and totals
 */
export const calculateTotalTaxes = (transaction, rates = {}) => {
  const {
    fullPretax = 0,
    procurementType = 'GOODS',
    taxType = 'STANDARD',
    vatDecision = 'NO',
    paymentMode = 'BNK TRNSF',
    currency = 'USD',
    fxRate = 1
  } = transaction;

  // Extract dynamic rates (with fallbacks to prevent errors)
  const {
    whtRate = 0,      // WHT rate for procurement type
    levyRate = 0,     // Levy rate for tax type
    vatRate = 0.15,   // VAT rate (default 15%)
    momoRate = 0.01   // Momo charge rate (default 1%)
  } = rates;

  // VBA LOGIC: Follow exact sequence from VBA code
  // 1. Start with Original Pre-Tax Amount
  const originalPreTaxAmount = fullPretax;

  // 2. Calculate Levies FIRST (based on Tax Type) using dynamic rate
  const levy = calculateLevy(originalPreTaxAmount, levyRate);

  // 3. Calculate VAT on levy-inclusive amount (if VAT Decision is "YES") using dynamic rate
  let vat = 0;
  if (vatDecision === 'YES') {
    const vatBaseAmount = originalPreTaxAmount + levy; // VBA: VAT base = Pre-tax + Levy
    vat = vatBaseAmount * vatRate; // Dynamic VAT rate
  }

  // 4. Calculate Gross Amount (Pre-tax + Levy + VAT)
  const grossAmount = originalPreTaxAmount + levy + vat;

  // 5. Calculate WHT ONLY for GHS/GHC currency (VBA logic) using dynamic rate
  let wht = 0;
  if (currency === 'GHS' || currency === 'GHC') {
    wht = calculateWHT(originalPreTaxAmount, whtRate);
    console.log(`[FinancialEngine] WHT calculation:`, {
      currency,
      procurementType,
      preTaxAmount: originalPreTaxAmount,
      whtRate: whtRate,
      whtAmount: wht,
      whtRatePercentage: `${(whtRate * 100).toFixed(2)}%`
    });
  } else {
    console.log(`[FinancialEngine] WHT skipped - non-GHS currency: ${currency}`);
  }

  // 6. Calculate Net Payable to Supplier (Gross - WHT)
  const netPayableToSupplier = grossAmount - wht;

  // 7. Calculate MoMo Charge (if Payment Mode contains "MOMO") using dynamic rate
  let momoCharge = 0;
  const isMomoPayment = paymentMode && paymentMode.toUpperCase().includes('MOMO');
  if (isMomoPayment) {
    momoCharge = netPayableToSupplier * momoRate; // Calculated on Net Payable to Supplier
    console.log(`[FinancialEngine] MOMO charge calculated:`, {
      paymentMode,
      netPayableToSupplier,
      momoRate: momoRate,
      momoRatePercentage: `${(momoRate * 100).toFixed(2)}%`,
      momoCharge
    });
  }

  // 8. Calculate Final Net Payable (Net Payable to Supplier + MoMo Charge)
  const finalNetPayable = netPayableToSupplier + momoCharge;

  // 9. Calculate Budget Impact (USD)
  let budgetImpactUSD = 0;
  if (currency === 'USD') {
    budgetImpactUSD = finalNetPayable;
  } else {
    budgetImpactUSD = finalNetPayable / fxRate;
  }

  return {
    wht,
    levy,
    vat,
    momoCharge,
    totalTaxes: levy + vat + wht + momoCharge,
    netPayable: finalNetPayable,
    fullPretax: originalPreTaxAmount,
    currency: currency,
    originalAmount: originalPreTaxAmount,
    grossAmount: grossAmount,
    netPayableToSupplier: netPayableToSupplier,
    finalNetPayable: finalNetPayable,
    usdEquivalent: budgetImpactUSD, // Updated logic
    // Add rate information for debugging
    ratesUsed: {
      whtRate,
      levyRate,
      vatRate,
      momoRate
    }
  };
};

/**
 * Calculate partial payment amounts using dynamic rates
 * @param {Object} transaction - Full transaction object
 * @param {number} percentage - Percentage to pay (0-100)
 * @param {Object} rates - Dynamic rates object
 * @returns {Object} Partial payment breakdown
 */
export const calculatePartialPayment = (transaction, percentage, rates = {}) => {
  if (percentage <= 0 || percentage > 100) {
    throw new Error('Percentage must be between 0 and 100');
  }

  // VBA LOGIC: For partial payments, recalculate ALL taxes based on prorated pre-tax amount
  const paymentRatio = percentage / 100;
  const proratedPreTax = transaction.fullPretax * paymentRatio;

  // Create new transaction with prorated pre-tax amount
  const proratedTransaction = {
    ...transaction,
    fullPretax: proratedPreTax
  };

  // Recalculate all taxes using the prorated amount and dynamic rates (VBA logic)
  const proratedCalculation = calculateTotalTaxes(proratedTransaction, rates);

  return {
    originalAmount: transaction.fullPretax,
    paymentPercentage: percentage,
    proratedPreTax: proratedPreTax,
    netPayable: proratedCalculation.netPayable,
    wht: proratedCalculation.wht,
    levy: proratedCalculation.levy,
    vat: proratedCalculation.vat,
    momoCharge: proratedCalculation.momoCharge,
    totalTaxes: proratedCalculation.totalTaxes,
    grossAmount: proratedCalculation.grossAmount,
    netPayableToSupplier: proratedCalculation.netPayableToSupplier,
    finalNetPayable: proratedCalculation.finalNetPayable,
    usdEquivalent: proratedCalculation.usdEquivalent
  };
};

/**
 * Calculate budget impact for a transaction
 * @param {Object} transaction - Transaction object
 * @param {Object} budgetLine - Budget line object with current balance
 * @returns {Object} Budget impact calculation
 */
export const calculateBudgetImpact = (transaction, budgetLine, rates = {}) => {
  const calculation = calculateTotalTaxes(transaction, rates);
  const currentBalance = budgetLine.balance || 0;

  // VBA LOGIC: Budget impact is always in USD
  let budgetImpactUSD = 0;
  if (transaction.currency === 'USD') {
    budgetImpactUSD = calculation.netPayable;
  } else if (transaction.fxRate > 0) {
    budgetImpactUSD = calculation.netPayable / transaction.fxRate;
  }

  const newBalance = currentBalance - budgetImpactUSD;

  return {
    budgetLineId: budgetLine.id,
    budgetLineName: budgetLine.name,
    currentBalance,
    transactionAmount: calculation.netPayable,
    budgetImpactUSD: budgetImpactUSD,
    newBalance,
    isOverBudget: newBalance < 0,
    overBudgetAmount: newBalance < 0 ? Math.abs(newBalance) : 0,
    currency: transaction.currency,
    fxRate: transaction.fxRate
  };
};

/**
 * Generate unique transaction ID
 * @param {string} prefix - Prefix for the ID
 * @param {Date} date - Date for the transaction
 * @returns {string} Unique transaction ID
 */
export const generateTransactionID = (prefix = 'TXN', date = new Date()) => {
  const timestamp = date.getTime();
  const random = Math.floor(Math.random() * 1000);
  return `${prefix}-${timestamp}-${random}`;
};

/**
 * Generate unique batch ID for payment schedules
 * @param {string} prefix - Prefix for the batch ID
 * @param {Date} date - Date for the batch
 * @returns {string} Unique batch ID
 */
export const generateBatchID = (prefix = 'BATCH', date = new Date()) => {
  const timestamp = date.getTime();
  const random = Math.floor(Math.random() * 10000);
  return `${prefix}-${timestamp}-${random}`;
};

/**
 * Format currency amount with proper formatting
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount, currency = 'USD', decimals = 2) => {
  if (typeof amount !== 'number' || isNaN(amount)) return '0.00';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(amount);
};

/**
 * Convert amount to words (simplified version)
 * @param {number} amount - Amount to convert
 * @returns {string} Amount in words
 */
export const amountToWords = (amount) => {
  if (amount === 0) return 'Zero';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  const convertLessThanOneThousand = (num) => {
    if (num === 0) return '';

    if (num < 10) return ones[num];
    if (num < 20) return teens[num - 10];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? ' ' + ones[num % 10] : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 !== 0 ? ' and ' + convertLessThanOneThousand(num % 100) : '');

    return '';
  };

  const convert = (num) => {
    if (num === 0) return 'Zero';

    const billion = Math.floor(num / 1000000000);
    const million = Math.floor((num % 1000000000) / 1000000);
    const thousand = Math.floor((num % 1000000) / 1000);
    const remainder = num % 1000;

    let result = '';

    if (billion) result += convertLessThanOneThousand(billion) + ' Billion ';
    if (million) result += convertLessThanOneThousand(million) + ' Million ';
    if (thousand) result += convertLessThanOneThousand(thousand) + ' Thousand ';
    if (remainder) result += convertLessThanOneThousand(remainder);

    return result.trim();
  };

  const dollars = Math.floor(amount);
  const cents = Math.round((amount - dollars) * 100);

  let result = convert(dollars) + ' Dollars';
  if (cents > 0) {
    result += ' and ' + convert(cents) + ' Cents';
  }

  return result;
};

/**
 * Validate transaction data
 * @param {Object} transaction - Transaction object to validate
 * @returns {Object} Validation result with errors array
 */
export const validateTransaction = (transaction) => {
  const errors = [];

  if (!transaction.vendor || transaction.vendor.trim() === '') {
    errors.push('Vendor name is required');
  }

  if (!transaction.description || transaction.description.trim() === '') {
    errors.push('Description is required');
  }

  if (!transaction.fullPretax || transaction.fullPretax <= 0) {
    errors.push('Full pre-tax amount must be greater than 0');
  }

  if (!transaction.budgetLine || transaction.budgetLine.trim() === '') {
    errors.push('Budget line is required');
  }

  if (!transaction.currency || transaction.currency.trim() === '') {
    errors.push('Currency is required');
  }

  if (!transaction.fxRate || transaction.fxRate <= 0) {
    errors.push('FX rate must be greater than 0');
  }

  if (!transaction.paymentMode || transaction.paymentMode.trim() === '') {
    errors.push('Payment mode is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * VBA-STYLE BUDGET MANAGEMENT: Get Budget Details
 * Matches VBA GetBudgetDetails function logic
 * @param {Object} budgetLine - Budget line object
 * @returns {Object} Budget details matching VBA format
 */
export const getBudgetDetails = (budgetLine) => {
  return {
    budgetLineName: budgetLine.name,
    initialBalance: budgetLine.initialBalance || 0,
    currentBalanceSheet: budgetLine.currentBalance || 0,
    totalSpend: budgetLine.totalSpend || 0,
    budgetBalanceCD: budgetLine.currentBalance || 0, // Carried Down
    budgetBalanceBD: 0 // Brought Down - will be calculated
  };
};



/**
 * VBA-STYLE BUDGET MANAGEMENT: Update Budget Balances After Archive
 * Matches VBA UpdateBudgetBalancesAfterArchive subroutine
 * @param {Array} transactions - Array of finalized transactions
 * @param {Object} budgetLines - Budget lines data
 * @returns {Object} Budget update results
 */
export const updateBudgetBalancesAfterArchive = (transactions, budgetLines) => {
  const budgetUpdates = {};
  const budgetLog = [];

  // Group transactions by budget line
  const budgetLineGroups = transactions.reduce((groups, transaction) => {
    const budgetLine = transaction.budgetLine;
    if (!groups[budgetLine]) {
      groups[budgetLine] = [];
    }
    groups[budgetLine].push(transaction);
    return groups;
  }, {});

  // Process each budget line
  Object.entries(budgetLineGroups).forEach(([budgetLineName, lineTransactions]) => {
    const budgetLine = budgetLines.find(bl => bl.name === budgetLineName);
    if (!budgetLine) return;

    // Calculate total impact for this budget line
    const totalImpactUSD = lineTransactions.reduce((sum, transaction) => {
      return sum + (transaction.budgetImpactUSD || 0);
    }, 0);

    // Backup old balance (for undo functionality)
    const oldBalance = budgetLine.currentBalance || 0;
    const newBalance = oldBalance - totalImpactUSD;

    budgetUpdates[budgetLineName] = {
      oldBalance,
      newBalance,
      impact: totalImpactUSD,
      transactionCount: lineTransactions.length
    };

    // Log the change (VBA BUDGET_LOG sheet equivalent)
    budgetLog.push({
      timestamp: new Date().toISOString(),
      budgetLineName,
      oldBalance,
      impact: totalImpactUSD,
      newBalance,
      transactionCount: lineTransactions.length,
      scheduleReference: `Batch-${Date.now()}`
    });
  });

  return {
    budgetUpdates,
    budgetLog,
    success: true
  };
};

/**
 * Calculate payment details for Payment Generator UI
 * This is a wrapper function that adapts the data structure for the PaymentGenerator component
 * @param {Object} paymentData - Payment form data from PaymentGenerator
 * @param {Object} rates - Dynamic rates object
 * @returns {Object} Calculation result with UI-friendly field names
 */
export const calculatePayment = (paymentData, rates = {}) => {
  const {
    preTaxAmount = 0,
    paymentPercentage = 100,
    isPartialPayment = false,
    currency = 'GHS',
    fxRate = 1,
    procurementType = 'GOODS',
    taxType = 'STANDARD',
    vatDecision = 'NO',
    paymentMode = 'BANK TRANSFER',
  } = paymentData;

  // Build transaction object for calculateTotalTaxes
  const transaction = {
    fullPretax: preTaxAmount,
    procurementType,
    taxType,
    vatDecision,
    paymentMode,
    currency,
    fxRate
  };

  // Calculate taxes
  let calculation;
  if (isPartialPayment && paymentPercentage < 100 && paymentPercentage > 0) {
    calculation = calculatePartialPayment(transaction, paymentPercentage, rates);
  } else {
    calculation = calculateTotalTaxes(transaction, rates);
  }

  // Map to PaymentGenerator expected field names
  return {
    whtAmount: calculation.wht || 0,
    levyAmount: calculation.levy || 0,
    vatAmount: calculation.vat || 0,
    momoCharge: calculation.momoCharge || 0,
    amountThisTransaction: calculation.finalNetPayable || 0,
    budgetImpactUSD: calculation.usdEquivalent || 0,
    netPayable: calculation.netPayable || 0,
    grossAmount: calculation.grossAmount || 0,
    netPayableToSupplier: calculation.netPayableToSupplier || 0,
    preTaxAmount: calculation.fullPretax || preTaxAmount
  };
};

