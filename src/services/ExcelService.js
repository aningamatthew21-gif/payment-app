// Excel Service - Handles Excel template export/import for weekly payment sheets
// This service provides comprehensive Excel functionality for data exchange

// ✅ REMOVED: import * as XLSX from 'xlsx'; - Using dynamic import for code splitting

// Excel template configuration - CLEAN VERSION (Input Fields Only)
const TEMPLATE_CONFIG = {
  // Column headers for the payment template - ONLY INPUT FIELDS
  HEADERS: [
    'DATE',
    'PAYMENT MODE',
    'INVOICE NUMBER',
    'VENDORS',
    'DESCRIPTIONS',
    'PROCUREMENT TYPE',
    'TAX TYPE',
    'VAT DECISION',
    'BUDGET LINE',
    'CURRENCY',
    'FX RATE',
    'BANK',
    'FULL PRE-TAX AMOUNT',
    'SERVICE CHARGE',
    'DEPARTMENTS',
    'PAYMENT PRIORITIES',
    'NOTES'
  ],

  // Column widths for better readability
  COLUMN_WIDTHS: [
    12,  // DATE
    15,  // PAYMENT MODE
    18,  // INVOICE NUMBER
    25,  // VENDORS
    35,  // DESCRIPTIONS
    18,  // PROCUREMENT TYPE
    12,  // TAX TYPE
    12,  // VAT DECISION
    20,  // BUDGET LINE
    10,  // CURRENCY
    12,  // FX RATE
    15,  // BANK
    18,  // FULL PRE-TAX AMOUNT
    15,  // SERVICE CHARGE
    20,  // DEPARTMENTS
    20,  // PAYMENT PRIORITIES
    30   // NOTES
  ]
};

// Dynamic validation lists - will be populated from system validation data
let DYNAMIC_VALIDATION_LISTS = {
  PAYMENT_MODE: [],
  PROCUREMENT_TYPE: [],
  TAX_TYPE: [],
  VAT_DECISION: ['YES', 'NO'], // This is always YES/NO
  CURRENCY: [],
  BANK: [],
  BUDGET_LINE: [],
  VENDORS: [], // Added vendor support
  DEPARTMENTS: [],
  PAYMENT_PRIORITIES: []
};

/**
 * Update validation lists with current system validation data
 * @param {Object} validationData - Current validation data from system
 */
export const updateValidationLists = (validationData) => {
  if (validationData && Object.keys(validationData).length > 0) {
    // Merge system validation with defaults, prioritizing system data
    DYNAMIC_VALIDATION_LISTS = {
      PAYMENT_MODE: validationData.paymentModes?.map(item => item.value) || DYNAMIC_VALIDATION_LISTS.PAYMENT_MODE,
      PROCUREMENT_TYPE: validationData.procurementTypes?.map(item => item.value) || DYNAMIC_VALIDATION_LISTS.PROCUREMENT_TYPE,
      TAX_TYPE: validationData.taxTypes?.map(item => item.value) || DYNAMIC_VALIDATION_LISTS.TAX_TYPE,
      VAT_DECISION: ['YES', 'NO'], // Always YES/NO
      CURRENCY: validationData.currencies?.map(item => item.value) || DYNAMIC_VALIDATION_LISTS.CURRENCY,
      BANK: validationData.banks?.map(item => item.value) || DYNAMIC_VALIDATION_LISTS.BANK,
      BUDGET_LINE: validationData.budgetLines?.map(item => item.value) || DYNAMIC_VALIDATION_LISTS.BUDGET_LINE,
      VENDORS: validationData.vendors?.map(item => item.value) || DYNAMIC_VALIDATION_LISTS.VENDORS, // Added vendor support
      DEPARTMENTS: validationData.departments?.map(item => item.value) || DYNAMIC_VALIDATION_LISTS.DEPARTMENTS,
      PAYMENT_PRIORITIES: validationData.paymentPriorities?.map(item => item.value) || DYNAMIC_VALIDATION_LISTS.PAYMENT_PRIORITIES
    };
    console.log('Updated validation lists with system data:', DYNAMIC_VALIDATION_LISTS);
  } else {
    console.log('Using default validation lists (no system validation data provided):', DYNAMIC_VALIDATION_LISTS);
  }
};

/**
 * Export a comprehensive Excel template for weekly payment sheets
 * @param {string} sheetName - Name of the weekly sheet
 * @param {Array} existingPayments - Array of existing payments to pre-populate
 * @param {Object} options - Export options
 * @returns {Blob} Excel file as blob
 */
export const exportWeeklySheetTemplate = async (sheetName, existingPayments = [], options = {}) => {
  try {
    // ✅ DYNAMIC IMPORT: Load xlsx only when needed for code splitting
    const XLSX = await import('xlsx');

    // Ensure validation lists are populated
    console.log('Exporting template with validation lists:', DYNAMIC_VALIDATION_LISTS);
    console.log('Vendors included in export:', DYNAMIC_VALIDATION_LISTS.VENDORS);

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Create main payments worksheet
    const paymentsData = createPaymentsWorksheet(sheetName, existingPayments, options);
    const paymentsWs = XLSX.utils.aoa_to_sheet(paymentsData);

    // Apply formatting and styling
    applyWorksheetFormatting(paymentsWs, paymentsData.length, TEMPLATE_CONFIG.HEADERS.length);

    // Add the worksheet to workbook
    XLSX.utils.book_append_sheet(wb, paymentsWs, sheetName);

    // Create instructions worksheet
    const instructionsData = createInstructionsWorksheet();
    const instructionsWs = XLSX.utils.aoa_to_sheet(instructionsData);
    XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');

    // Create validation worksheet (hidden)
    const validationData = createValidationWorksheet();
    console.log('Created validation worksheet with data:', validationData);
    const validationWs = XLSX.utils.aoa_to_sheet(validationData);
    validationWs['!visible'] = 'hidden';
    XLSX.utils.book_append_sheet(wb, validationWs, 'ValidationLists');

    // Generate Excel file
    const excelBuffer = XLSX.write(wb, {
      bookType: 'xlsx',
      type: 'array',
      bookSST: false,
      compression: true
    });

    return new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

  } catch (error) {
    console.error('Error exporting Excel template:', error);
    throw new Error('Failed to export Excel template');
  }
};

/**
 * Create the main payments worksheet data
 */
const createPaymentsWorksheet = (sheetName, existingPayments, options) => {
  const data = [];

  // Add title row
  data.push([`${sheetName} - PAYMENT SCHEDULE TEMPLATE`]);
  data.push([`Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`]);
  data.push([]);

  // Add headers
  data.push(TEMPLATE_CONFIG.HEADERS);

  // Add existing payments if provided
  if (existingPayments && existingPayments.length > 0) {
    existingPayments.forEach(payment => {
      data.push([
        payment.date || '',
        payment.paymentMode || '',
        payment.invoiceNo || '',
        payment.vendor || '',
        payment.description || '',
        payment.procurementType || '',
        payment.taxType || '',
        payment.vatDecision || '',
        payment.budgetLine || '',
        payment.currency || 'GHS',
        payment.fxRate || '1',
        payment.bank || '',
        payment.fullPretax || payment.amount || '',
        payment.serviceChargeAmount || '',
        payment.department || '',
        payment.paymentPriority || '',
        payment.notes || ''
      ]);
    });
  }

  // Add empty rows for new entries (no formulas needed - system will calculate)
  const emptyRows = options.emptyRows || 10;

  for (let i = 0; i < emptyRows; i++) {
    const row = Array(TEMPLATE_CONFIG.HEADERS.length).fill('');
    data.push(row);
  }

  return data;
};

/**
 * Create instructions worksheet
 */
const createInstructionsWorksheet = () => {
  return [
    ['INSTRUCTIONS FOR FILLING PAYMENT SCHEDULE TEMPLATE'],
    [''],
    ['1. GENERAL GUIDELINES:'],
    ['   - Do not delete or modify the header row'],
    ['   - Fill in data starting from row 5'],
    ['   - Leave empty rows for future entries'],
    ['   - Save the file before importing'],
    [''],
    ['2. REQUIRED FIELDS (Fill these in):'],
    ['   - DATE: Payment date (DD/MM/YYYY format)'],
    ['   - PAYMENT MODE: Use dropdown (BANK TRANSFER, MOMO TRANSFER, CASH, CHEQUE)'],
    ['   - INVOICE NUMBER: Vendor invoice reference'],
    ['   - VENDORS: Vendor/Supplier name'],
    ['   - DESCRIPTIONS: Payment description'],
    ['   - PROCUREMENT TYPE: Use dropdown (GOODS, SERVICES, FLAT RATE)'],
    ['   - TAX TYPE: Use dropdown (STANDARD, FLAT RATE, ST+TOURISM, ST+CST, EXEMPTED)'],
    ['   - VAT DECISION: Use dropdown (YES, NO)'],
    ['   - BUDGET LINE: Budget line for this payment'],
    ['   - CURRENCY: Payment currency (GHS, USD, EUR, GBP)'],
    ['   - FX RATE: Exchange rate if not GHS (default: 1)'],
    ['   - BANK: Bank name for payment'],
    ['   - FULL PRE-TAX AMOUNT: Original invoice amount'],
    ['   - DEPARTMENTS: Requesting department'],
    ['   - PAYMENT PRIORITIES: Urgency level'],
    ['   - NOTES: Additional information'],
    [''],
    ['3. SYSTEM CALCULATIONS:'],
    ['   - All tax calculations (WHT, Levy, VAT, Momo) are handled by the system'],
    ['   - Net payable, subtotal, and budget impact are calculated automatically'],
    ['   - Calculations use the VBA-aligned FinancialEngine for accuracy'],
    [''],
    ['4. IMPORT PROCESS:'],
    ['   - Fill the template with your payment data'],
    ['   - Save the Excel file'],
    ['   - Use the Import button to upload the file'],
    ['   - System will calculate all derived amounts automatically'],
    ['   - Review the imported data before finalizing'],
    [''],
    ['5. SUPPORT:'],
    ['   - For technical issues, contact your system administrator'],
    ['   - Keep backup copies of your templates'],
    ['   - Test with small datasets first'],
    ['   - All calculations are performed by the system for accuracy']
  ];
};

/**
 * Create validation worksheet with multi-column layout and proper spacing
 * Layout: Column A (Payment Mode) | Column B (blank) | Column C (Procurement Type) | Column D (blank) | Column E (Tax Type)
 */
const createValidationWorksheet = () => {
  const data = [];

  // Use only system validation data - no fallbacks
  const paymentModes = DYNAMIC_VALIDATION_LISTS.PAYMENT_MODE;
  const procurementTypes = DYNAMIC_VALIDATION_LISTS.PROCUREMENT_TYPE;
  const taxTypes = DYNAMIC_VALIDATION_LISTS.TAX_TYPE;
  const vendors = DYNAMIC_VALIDATION_LISTS.VENDORS;
  const currencies = DYNAMIC_VALIDATION_LISTS.CURRENCY;
  const banks = DYNAMIC_VALIDATION_LISTS.BANK;
  const budgetLines = DYNAMIC_VALIDATION_LISTS.BUDGET_LINE;

  // Find the maximum number of items across all validation lists
  const maxItems = Math.max(
    paymentModes.length,
    procurementTypes.length,
    taxTypes.length,
    vendors.length,
    currencies.length,
    banks.length,
    banks.length,
    budgetLines.length,
    DYNAMIC_VALIDATION_LISTS.VAT_DECISION.length,
    DYNAMIC_VALIDATION_LISTS.DEPARTMENTS.length,
    DYNAMIC_VALIDATION_LISTS.PAYMENT_PRIORITIES.length
  );

  // Add header row with column labels
  data.push([
    'PAYMENT MODE',           // Column A
    '',                       // Column B (blank)
    'PROCUREMENT TYPE',       // Column C
    '',                       // Column D (blank)
    'TAX TYPE',               // Column E
    '',                       // Column F (blank)
    'VENDORS',                // Column G
    '',                       // Column H (blank)
    'VAT DECISION',           // Column I
    '',                       // Column J (blank)
    'CURRENCY',               // Column K
    '',                       // Column L (blank)
    'BANK',                   // Column M
    '',                       // Column N (blank)
    'BUDGET LINE',            // Column O
    '',                       // Column P (blank)
    'DEPARTMENTS',            // Column Q
    '',                       // Column R (blank)
    'PAYMENT PRIORITIES'      // Column S
  ]);

  // Add data rows with multi-column layout
  for (let i = 0; i < maxItems; i++) {
    const row = [
      paymentModes[i] || '',                    // Column A: Payment Mode
      '',                                       // Column B: Blank
      procurementTypes[i] || '',                // Column C: Procurement Type
      '',                                       // Column D: Blank
      taxTypes[i] || '',                       // Column E: Tax Type
      '',                                       // Column F: Blank
      vendors[i] || '',                        // Column G: Vendors
      '',                                       // Column H: Blank
      DYNAMIC_VALIDATION_LISTS.VAT_DECISION[i] || '', // Column I: VAT Decision
      '',                                       // Column J: Blank
      currencies[i] || '',                     // Column K: Currency
      '',                                       // Column L: Blank
      banks[i] || '',                          // Column M: Bank
      '',                                       // Column N: Blank
      budgetLines[i] || '',                    // Column O: Budget Line
      '',                                       // Column P: Blank
      DYNAMIC_VALIDATION_LISTS.DEPARTMENTS[i] || '', // Column Q: Departments
      '',                                       // Column R: Blank
      DYNAMIC_VALIDATION_LISTS.PAYMENT_PRIORITIES[i] || '' // Column S: Payment Priorities
    ];

    data.push(row);
  }

  console.log('Created validation worksheet with multi-column layout:', {
    totalRows: data.length,
    totalColumns: 15,
    paymentModes: paymentModes.length,
    procurementTypes: procurementTypes.length,
    taxTypes: taxTypes.length,
    vendors: vendors.length,
    currencies: currencies.length,
    banks: banks.length,
    budgetLines: budgetLines.length,
    layout: 'Multi-column with spacing (A,C,E,G,I,K,M,O,Q,S)'
  });

  return data;
};

/**
 * Apply formatting to the worksheet
 */
const applyWorksheetFormatting = (worksheet, rowCount, colCount) => {
  // Set column widths
  worksheet['!cols'] = TEMPLATE_CONFIG.COLUMN_WIDTHS.map(width => ({ width }));

  // Set row heights for title rows
  worksheet['!rows'] = [];
  for (let i = 0; i < rowCount; i++) {
    if (i < 3) {
      worksheet['!rows'][i] = { hpt: 25 }; // Title rows
    } else if (i === 3) {
      worksheet['!rows'][i] = { hpt: 20 }; // Header row
    } else {
      worksheet['!rows'][i] = { hpt: 18 }; // Data rows
    }
  }

  // Apply cell formatting
  for (let row = 0; row < rowCount; row++) {
    for (let col = 0; col < colCount; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });

      if (row < 3) {
        // Title rows - bold, larger font
        worksheet[cellRef] = worksheet[cellRef] || { v: '' };
        worksheet[cellRef].s = {
          font: { bold: true, sz: 14 },
          alignment: { horizontal: 'center', vertical: 'center' }
        };
      } else if (row === 3) {
        // Header row - bold, background color
        worksheet[cellRef] = worksheet[cellRef] || { v: '' };
        worksheet[cellRef].s = {
          font: { bold: true, sz: 12 },
          fill: { fgColor: { rgb: "CCCCCC" } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: {
            top: { style: 'thin' },
            bottom: { style: 'thin' },
            left: { style: 'thin' },
            right: { style: 'thin' }
          }
        };
      } else if (row > 3) {
        // Data rows - all fields are input fields
        worksheet[cellRef] = worksheet[cellRef] || { v: '' };
        worksheet[cellRef].s = {
          alignment: { horizontal: 'left', vertical: 'center' },
          border: {
            top: { style: 'thin' },
            bottom: { style: 'thin' },
            left: { style: 'thin' },
            right: { style: 'thin' }
          }
        };
      }
    }
  }
};

/**
 * Import Excel file and extract payment data
 * @param {File} file - Excel file to import
 * @param {string} sheetName - Expected sheet name
 * @returns {Promise<Object>} Imported data with validation results
 */
export const importWeeklySheetTemplate = async (file, sheetName) => {
  try {
    console.log('ExcelService: Starting import for sheet:', sheetName);
    console.log('ExcelService: File name:', file.name);
    console.log('ExcelService: File size:', file.size, 'bytes');

    const data = await readExcelFile(file);
    console.log('ExcelService: File read successfully, data structure:', {
      sheetName: data.sheetName,
      rowCount: data.payments?.length || 0
    });

    // Validate the imported data
    console.log('ExcelService: Validating imported data...');
    const validationResult = validateImportedData(data, sheetName);

    if (!validationResult.isValid) {
      console.error('ExcelService: Validation failed:', validationResult.errors);
      throw new Error(`Validation failed: ${validationResult.errors.join(', ')}`);
    }

    console.log('ExcelService: Validation passed, transforming data...');
    // Transform the data to match our data structure
    const transformedData = transformImportedData(data.payments);
    console.log('ExcelService: Data transformed successfully:', {
      transformedCount: transformedData.length,
      samplePayment: transformedData[0]
    });

    const result = {
      success: true,
      sheetName: data.sheetName,
      payments: transformedData,
      summary: {
        totalPayments: transformedData.length,
        totalAmount: transformedData.reduce((sum, p) => sum + (parseFloat(p.fullPretax) || 0), 0),
        currencies: [...new Set(transformedData.map(p => p.currency))],
        budgetLines: [...new Set(transformedData.map(p => p.budgetLine).filter(Boolean))]
      }
    };

    console.log('ExcelService: Import completed successfully:', result.summary);
    return result;

  } catch (error) {
    console.error('ExcelService: Error importing Excel template:', error);
    return {
      success: false,
      error: error.message,
      payments: [],
      summary: {}
    };
  }
};

/**
 * Read Excel file and extract data
 */
const readExcelFile = async (file) => {
  // ✅ DYNAMIC IMPORT: Load xlsx only when needed for code splitting
  const XLSX = await import('xlsx');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // Find the main sheet (should match sheetName)
        const sheetNames = workbook.SheetNames;
        const mainSheetName = sheetNames.find(name =>
          name !== 'Instructions' && name !== 'ValidationLists'
        );

        if (!mainSheetName) {
          reject(new Error('No valid payment sheet found in the Excel file'));
          return;
        }

        const worksheet = workbook.Sheets[mainSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          raw: false, // This ensures we get calculated values from formulas
          defval: '' // Default value for empty cells
        });

        resolve({
          sheetName: mainSheetName,
          payments: jsonData
        });

      } catch (error) {
        reject(new Error('Failed to read Excel file: ' + error.message));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Validate imported data
 */
const validateImportedData = (data, expectedSheetName) => {
  console.log('ExcelService: validateImportedData called with:', {
    expectedSheetName,
    actualSheetName: data.sheetName,
    rowCount: data.payments?.length || 0
  });

  const errors = [];

  // Check if we have the expected sheet
  if (data.sheetName !== expectedSheetName) {
    errors.push(`Sheet name mismatch. Expected: ${expectedSheetName}, Found: ${data.sheetName}`);
  }

  // Check if we have data
  if (!data.payments || data.payments.length < 5) {
    errors.push('Insufficient data rows. Template should have at least 5 rows including headers.');
  }

  // Check headers
  if (data.payments.length >= 4) {
    const headers = data.payments[3]; // Row 4 (0-indexed)
    const expectedHeaders = TEMPLATE_CONFIG.HEADERS;

    console.log('ExcelService: Checking headers:', {
      actual: headers,
      expected: expectedHeaders
    });

    if (headers.length < expectedHeaders.length) {
      errors.push(`Insufficient columns. Expected ${expectedHeaders.length}, found ${headers.length}`);
    }

    // Check key headers
    const requiredHeaders = ['DATE', 'VENDORS', 'DESCRIPTIONS', 'FULL PRE-TAX AMOUNT'];
    requiredHeaders.forEach(header => {
      if (!headers.includes(header)) {
        errors.push(`Missing required header: ${header}`);
      }
    });
  }

  // Validate individual payment records
  if (data.payments && data.payments.length > 4) {
    data.payments.slice(4).forEach((payment, index) => {
      const rowNum = index + 5; // Excel row number (1-indexed)

      // Skip empty rows
      if (!payment.vendor && !payment.fullPretax) return;

      // Validate required fields
      if (!payment.date) {
        errors.push(`Row ${rowNum}: DATE is required`);
      }
      if (!payment.vendor) {
        errors.push(`Row ${rowNum}: VENDOR is required`);
      }
      if (!payment.description) {
        errors.push(`Row ${rowNum}: DESCRIPTION is required`);
      }
      if (!payment.fullPretax || payment.fullPretax <= 0) {
        errors.push(`Row ${rowNum}: FULL PRE-TAX AMOUNT must be greater than 0`);
      }
      if (!payment.budgetLine) {
        errors.push(`Row ${rowNum}: BUDGET LINE is required`);
      }

      // Validate field values against validation lists
      if (payment.paymentMode && !DYNAMIC_VALIDATION_LISTS.PAYMENT_MODE.includes(payment.paymentMode)) {
        errors.push(`Row ${rowNum}: Invalid PAYMENT MODE "${payment.paymentMode}". Valid options: ${DYNAMIC_VALIDATION_LISTS.PAYMENT_MODE.join(', ')}`);
      }
      if (payment.procurementType && !DYNAMIC_VALIDATION_LISTS.PROCUREMENT_TYPE.includes(payment.procurementType)) {
        errors.push(`Row ${rowNum}: Invalid PROCUREMENT TYPE "${payment.procurementType}". Valid options: ${DYNAMIC_VALIDATION_LISTS.PROCUREMENT_TYPE.join(', ')}`);
      }
      if (payment.taxType && !DYNAMIC_VALIDATION_LISTS.TAX_TYPE.includes(payment.taxType)) {
        errors.push(`Row ${rowNum}: Invalid TAX TYPE "${payment.taxType}". Valid options: ${DYNAMIC_VALIDATION_LISTS.TAX_TYPE.join(', ')}`);
      }
      if (payment.vatDecision && !DYNAMIC_VALIDATION_LISTS.VAT_DECISION.includes(payment.vatDecision)) {
        errors.push(`Row ${rowNum}: Invalid VAT DECISION "${payment.vatDecision}". Valid options: ${DYNAMIC_VALIDATION_LISTS.VAT_DECISION.join(', ')}`);
      }
      if (payment.currency && !DYNAMIC_VALIDATION_LISTS.CURRENCY.includes(payment.currency)) {
        errors.push(`Row ${rowNum}: Invalid CURRENCY "${payment.currency}". Valid options: ${DYNAMIC_VALIDATION_LISTS.CURRENCY.join(', ')}`);
      }
      if (payment.bank && !DYNAMIC_VALIDATION_LISTS.BANK.includes(payment.bank)) {
        errors.push(`Row ${rowNum}: Invalid BANK "${payment.bank}". Valid options: ${DYNAMIC_VALIDATION_LISTS.BANK.join(', ')}`);
      }
      if (payment.budgetLine && !DYNAMIC_VALIDATION_LISTS.BUDGET_LINE.includes(payment.budgetLine)) {
        errors.push(`Row ${rowNum}: Invalid BUDGET LINE "${payment.budgetLine}". Valid options: ${DYNAMIC_VALIDATION_LISTS.BUDGET_LINE.join(', ')}`);
      }

      // Validate data types
      if (payment.fxRate && (isNaN(payment.fxRate) || payment.fxRate <= 0)) {
        errors.push(`Row ${rowNum}: FX RATE must be a positive number`);
      }
    });
  }

  console.log('ExcelService: Validation completed with', errors.length, 'errors:', errors);

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Transform imported data to our data structure
 */
const transformImportedData = (rawData) => {
  console.log('ExcelService: transformImportedData called with', rawData.length, 'rows');
  const payments = [];

  // Skip title rows and headers (first 4 rows)
  for (let i = 4; i < rawData.length; i++) {
    const row = rawData[i];
    console.log(`ExcelService: Processing row ${i}:`, row);

    // Skip empty rows
    if (!row || !row[0] || !row[3]) {
      console.log(`ExcelService: Skipping row ${i} - missing date or vendor`);
      console.log(`  Row data:`, row);
      console.log(`  Row[0] (date):`, row[0]);
      console.log(`  Row[3] (vendor):`, row[3]);
      continue; // No date or vendor
    }

    const payment = {
      date: formatDate(row[0]),
      paymentMode: row[1] || 'BANK TRANSFER',
      invoiceNo: row[2] || '',
      vendor: row[3] || '',
      description: row[4] || '',
      procurementType: row[5] || 'SERVICES',
      taxType: row[6] || 'STANDARD',
      vatDecision: row[7] || 'NO',
      budgetLine: row[8] || '',
      currency: row[9] || 'GHS',
      fxRate: parseFloat(row[10]) || 1,
      bank: row[11] || '',
      fullPretax: parseFloat(row[12]) || 0,
      serviceChargeAmount: parseFloat(row[13]) || 0,
      department: row[14] || '',
      paymentPriority: row[15] || '',
      notes: row[16] || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    console.log(`ExcelService: Created payment object for row ${i}:`, payment);

    // Validate required fields
    if (payment.vendor && payment.fullPretax > 0) {
      payments.push(payment);
      console.log(`ExcelService: Added payment ${i} to list`);
    } else {
      console.log(`ExcelService: Skipping payment ${i} - invalid vendor or amount`);
    }
  }

  console.log('ExcelService: transformImportedData completed, returning', payments.length, 'payments');
  return payments;
};

/**
 * Format date from various Excel formats
 */
const formatDate = (dateValue) => {
  if (!dateValue) return '';

  try {
    // Handle Excel date numbers
    if (typeof dateValue === 'number') {
      const excelDate = new Date((dateValue - 25569) * 86400 * 1000);
      return excelDate.toISOString().split('T')[0];
    }

    // Handle string dates
    if (typeof dateValue === 'string') {
      // Try to parse various date formats
      const parsed = new Date(dateValue);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
    }

    // Handle Date objects
    if (dateValue instanceof Date) {
      return dateValue.toISOString().split('T')[0];
    }

    return '';
  } catch (error) {
    console.warn('Could not parse date:', dateValue);
    return '';
  }
};

/**
 * Generate a sample template for testing
 */
export const generateSampleTemplate = async (sheetName) => {
  const samplePayments = [
    {
      date: '2024-01-15',
      paymentMode: 'BANK TRANSFER',
      invoiceNo: 'INV-001-2024',
      vendor: 'Sample Vendor Ltd',
      description: 'Sample payment for services',
      procurementType: 'SERVICES',
      taxType: 'STANDARD',
      vatDecision: 'YES',
      budgetLine: 'IT Services',
      currency: 'GHS',
      fxRate: '1',
      bank: 'GCB BANK',
      fullPretax: '10000.00',
      momoCharge: '0',
      whtAmount: '500.00',
      levyAmount: '600.00',
      vatAmount: '1590.00',
      subtotal: '12190.00',
      netPayable: '11690.00',
      paymentPercentage: '100',
      amountThisTransaction: '11690.00',
      budgetImpactUSD: '11690.00',
      notes: 'Sample entry for testing'
    }
  ];

  return exportWeeklySheetTemplate(sheetName, samplePayments, { emptyRows: 5 });
};


/**
 * Export validation data to Excel in the VALIDATION LIST format
 * @param {Object} validationData - Validation data object
 * @returns {Promise<void>}
 */
export const exportValidationData = async (validationData) => {
  // ✅ DYNAMIC IMPORT: Load xlsx only when needed for code splitting
  const XLSX = await import('xlsx');

  const workbook = XLSX.utils.book_new();

  // Create main validation data worksheet in VALIDATION LIST format
  const mainData = [];

  // Add title
  mainData.push(['VALIDATION LIST']);
  mainData.push([]);

  // Add headers matching the new format (13 columns)
  mainData.push([
    'PAYMENT MODE',
    'PROCUREMENT TYPE',
    'WHT RATE (%)',
    'TAX TYPE',
    'LEVY RATE (%)',
    'VAT DECISION',
    'CURRENCY',
    'BANK',
    'BUDGET LINE',
    'VENDORS',
    'SIGNATORIES',
    'DEPARTMENTS',
    'PAYMENT PRIORITIES'
  ]);

  // Find the maximum number of items across all field types
  const maxItems = Math.max(
    validationData.paymentModes?.length || 0,
    validationData.procurementTypes?.length || 0,
    validationData.taxTypes?.length || 0,
    validationData.banks?.length || 0,
    validationData.currencies?.length || 0,
    validationData.budgetLines?.length || 0,
    validationData.vendors?.length || 0,
    validationData.signatories?.length || 0,
    validationData.departments?.length || 0,
    validationData.paymentPriorities?.length || 0
  );

  // Add data rows in the new 13-column format
  for (let i = 0; i < maxItems; i++) {
    const row = [
      validationData.paymentModes?.[i]?.value || '',
      validationData.procurementTypes?.[i]?.value || '',
      validationData.procurementTypes?.[i]?.rate || 0, // WHT Rate
      validationData.taxTypes?.[i]?.value || '',
      validationData.taxTypes?.[i]?.rate || 0, // Levy Rate
      'YES', // VAT decision - always YES for budget lines
      validationData.currencies?.[i]?.value || '',
      validationData.banks?.[i]?.value || '',
      validationData.budgetLines?.[i]?.value || '',
      validationData.vendors?.[i]?.value || '',
      validationData.signatories?.[i]?.value || '',
      validationData.departments?.[i]?.value || '',
      validationData.paymentPriorities?.[i]?.value || ''
    ];

    mainData.push(row);
  }

  const mainWorksheet = XLSX.utils.aoa_to_sheet(mainData);
  mainWorksheet['!cols'] = [
    { width: 18 }, // PAYMENT MODE
    { width: 20 }, // PROCUREMENT TYPE
    { width: 12 }, // WHT RATE
    { width: 18 }, // TAX TYPE
    { width: 12 }, // LEVY RATE
    { width: 15 }, // VAT DECISION
    { width: 12 }, // CURRENCY
    { width: 18 }, // BANK
    { width: 20 }, // BUDGET LINE
    { width: 25 }, // VENDORS
    { width: 20 }, // SIGNATORIES
    { width: 20 }, // DEPARTMENTS
    { width: 20 }  // PAYMENT PRIORITIES
  ];

  // Apply formatting
  for (let row = 0; row < mainData.length; row++) {
    for (let col = 0; col < mainData[row].length; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });

      if (row === 0) {
        // Title row
        mainWorksheet[cellRef].s = {
          font: { bold: true, sz: 16 },
          fill: { fgColor: { rgb: "4472C4" } }, // Dark blue background
          font: { bold: true, sz: 16, color: { rgb: "FFFFFF" } }, // White text
          alignment: { horizontal: 'center', vertical: 'center' },
          border: {
            top: { style: 'thin' },
            bottom: { style: 'thin' },
            left: { style: 'thin' },
            right: { style: 'thin' }
          }
        };
      } else if (row === 2) {
        // Header row
        const isRateColumn = col === 2 || col === 4; // WHT RATE or LEVY RATE
        mainWorksheet[cellRef].s = {
          font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: isRateColumn ? "5B9BD5" : "4472C4" } }, // Lighter blue for rates
          alignment: { horizontal: 'center', vertical: 'center' },
          border: {
            top: { style: 'thin' },
            bottom: { style: 'thin' },
            left: { style: 'thin' },
            right: { style: 'thin' }
          }
        };
      } else {
        // Data rows
        const isRateColumn = col === 2 || col === 4;
        mainWorksheet[cellRef].s = {
          alignment: { horizontal: isRateColumn ? 'center' : 'left', vertical: 'center' },
          fill: isRateColumn ? { fgColor: { rgb: "E7F0F9" } } : undefined, // Very light blue for rate data
          border: {
            top: { style: 'thin' },
            bottom: { style: 'thin' },
            left: { style: 'thin' },
            right: { style: 'thin' }
          }
        };
      }
    }
  }

  XLSX.utils.book_append_sheet(workbook, mainWorksheet, 'VALIDATION LIST');

  // Create instructions worksheet
  const instructionsData = [
    ['VALIDATION LIST - Instructions'],
    [''],
    ['This file contains validation data for payment fields in the exact format you requested.'],
    [''],
    ['Column Structure:'],
    ['- PAYMENT MODE: Available payment methods'],
    ['- PROCUREMENT TYPE: Types of procurement'],
    ['- WHT RATE (%): Withholding Tax rate for the procurement type (Numeric)'],
    ['- TAX TYPE: Tax classification types'],
    ['- LEVY RATE (%): Levy rate for the tax type (Numeric)'],
    ['- VAT DECISION: Whether VAT applies (YES/NO)'],
    ['- CURRENCY: Payment currencies'],
    ['- BANK: Banking institutions'],
    ['- BUDGET LINE: Budget line items'],
    ['- VENDORS: Vendor names'],
    ['- SIGNATORIES: Authorized signatories'],
    ['- DEPARTMENTS: Company departments'],
    ['- PAYMENT PRIORITIES: Priority levels'],
    [''],
    ['To use:'],
    ['1. Edit the values in the "VALIDATION LIST" sheet'],
    ['2. Add new rows for additional options'],
    ['3. Save the Excel file'],
    ['4. Use the Import button in the Validation Manager'],
    [''],
    ['Note: Importing will replace all existing validation data with your updated list.']
  ];

  const instructionsWorksheet = XLSX.utils.aoa_to_sheet(instructionsData);
  instructionsWorksheet['!cols'] = [{ width: 60 }];

  // Format instructions
  instructionsWorksheet['A1'].s = {
    font: { bold: true, sz: 14 },
    alignment: { horizontal: 'center' }
  };

  XLSX.utils.book_append_sheet(workbook, instructionsWorksheet, 'Instructions');

  // Export the file
  const fileName = `VALIDATION_LIST_${new Date().toISOString().split('T')[0]}.xlsx`;

  // Debug log to show total export summary
  console.log('=== VALIDATION DATA EXPORT SUMMARY ===');
  console.log('Total rows exported:', mainData.length - 3); // Subtract title, empty, and header rows
  console.log('Payment Modes:', validationData.paymentModes?.length || 0);
  console.log('Procurement Types:', validationData.procurementTypes?.length || 0);
  console.log('Tax Types:', validationData.taxTypes?.length || 0);
  console.log('Budget Lines:', validationData.budgetLines?.length || 0);
  console.log('Currencies:', validationData.currencies?.length || 0);
  console.log('Banks:', validationData.banks?.length || 0);
  console.log('Vendors:', validationData.vendors?.length || 0);
  console.log('Signatories:', validationData.signatories?.length || 0);
  console.log('Departments:', validationData.departments?.length || 0);
  console.log('Payment Priorities:', validationData.paymentPriorities?.length || 0);
  console.log('=====================================');

  XLSX.writeFile(workbook, fileName);
};

/**
 * Read Excel file specifically for validation data
 * @param {File} file - Excel file to read
 * @returns {Promise<Object>} Workbook object
 */
const readValidationExcelFile = async (file) => {
  // ✅ DYNAMIC IMPORT: Load xlsx only when needed for code splitting
  const XLSX = await import('xlsx');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        resolve(workbook);
      } catch (error) {
        reject(new Error('Failed to read Excel file: ' + error.message));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Import validation data from Excel in the VALIDATION LIST format
 * @param {File} file - Excel file to import
 * @returns {Promise<Object>} Parsed validation data
 */
export const importValidationData = async (file) => {
  try {
    const workbook = await readValidationExcelFile(file);

    // Log available sheet names for debugging
    console.log('Available sheets in Excel file:', workbook.SheetNames);

    // Try to find the right worksheet - be more flexible
    let worksheet = null;
    let sheetName = '';

    // First try to find by name
    if (workbook.Sheets['VALIDATION LIST']) {
      worksheet = workbook.Sheets['VALIDATION LIST'];
      sheetName = 'VALIDATION LIST';
    } else if (workbook.Sheets['Validation Data']) {
      worksheet = workbook.Sheets['Validation Data'];
      sheetName = 'Validation Data';
    } else {
      // Fall back to first sheet
      worksheet = workbook.Sheets[workbook.SheetNames[0]];
      sheetName = workbook.SheetNames[0];
    }

    if (!worksheet) {
      throw new Error(`No worksheet found in the file. Available sheets: ${workbook.SheetNames.join(', ')}`);
    }

    console.log(`Using worksheet: ${sheetName}`);

    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    console.log('Raw Excel data:', rawData);

    if (rawData.length < 4) {
      throw new Error(`File must contain at least 4 rows. Found: ${rawData.length} rows`);
    }

    // Parse the data from the 13-column format
    const validationData = {
      paymentModes: [],
      vendors: [],
      procurementTypes: [],
      taxTypes: [],
      banks: [],
      currencies: [],
      budgetLines: [],
      signatories: [],
      departments: [],
      paymentPriorities: []
    };

    // Skip title row (row 0), empty row (row 1), and header row (row 2)
    // Start from row 3 (index 3) - this is where your actual data starts
    for (let i = 3; i < rawData.length; i++) {
      const row = rawData[i];
      console.log(`Processing row ${i}:`, row);

      if (row && row.length >= 1) {
        const paymentMode = row[0]?.toString().trim(); // Column A
        const procurementType = row[1]?.toString().trim(); // Column B
        const whtRate = parseFloat(row[2]) || 0; // Column C (WHT RATE)
        const taxType = row[3]?.toString().trim(); // Column D
        const levyRate = parseFloat(row[4]) || 0; // Column E (LEVY RATE)
        const vatDecision = row[5]?.toString().trim(); // Column F
        const currency = row[6]?.toString().trim(); // Column G
        const bank = row[7]?.toString().trim(); // Column H
        const budgetLine = row[8]?.toString().trim(); // Column I
        const vendor = row[9]?.toString().trim(); // Column J
        const signatory = row[10]?.toString().trim(); // Column K
        const department = row[11]?.toString().trim(); // Column L
        const paymentPriority = row[12]?.toString().trim(); // Column M

        // Add payment mode if it exists
        if (paymentMode && !validationData.paymentModes.find(item => item.value === paymentMode)) {
          validationData.paymentModes.push({ value: paymentMode, description: '', isActive: true });
        }

        // Add procurement type if it exists
        if (procurementType && !validationData.procurementTypes.find(item => item.value === procurementType)) {
          validationData.procurementTypes.push({
            value: procurementType,
            description: '',
            rate: whtRate, // Capture rate
            isActive: true
          });
        }

        // Add tax type if it exists
        if (taxType && !validationData.taxTypes.find(item => item.value === taxType)) {
          validationData.taxTypes.push({
            value: taxType,
            description: '',
            rate: levyRate, // Capture rate
            isActive: true
          });
        }

        // Add currency if it exists
        if (currency && !validationData.currencies.find(item => item.value === currency)) {
          validationData.currencies.push({ value: currency, description: '', isActive: true });
        }

        // Add bank if it exists
        if (bank && !validationData.banks.find(item => item.value === bank)) {
          validationData.banks.push({ value: bank, description: '', isActive: true });
        }

        // Add budget line if it exists
        if (budgetLine && !validationData.budgetLines.find(item => item.value === budgetLine)) {
          validationData.budgetLines.push({ value: budgetLine, description: '', isActive: true });
        }

        // Add vendor if it exists
        if (vendor && !validationData.vendors.find(item => item.value === vendor)) {
          validationData.vendors.push({ value: vendor, description: '', isActive: true });
        }

        // Add signatory if it exists
        if (signatory && !validationData.signatories.find(item => item.value === signatory)) {
          validationData.signatories.push({ value: signatory, description: '', isActive: true });
        }

        // Add department if it exists
        if (department && !validationData.departments.find(item => item.value === department)) {
          validationData.departments.push({ value: department, description: '', isActive: true });
        }

        // Add payment priority if it exists
        if (paymentPriority && !validationData.paymentPriorities.find(item => item.value === paymentPriority)) {
          validationData.paymentPriorities.push({ value: paymentPriority, description: '', isActive: true });
        }
      }
    }

    console.log('=== VALIDATION DATA IMPORT SUMMARY ===');
    console.log('Total rows processed:', rawData.length - 3);
    console.log('Payment Modes imported:', validationData.paymentModes.length);
    console.log('Procurement Types imported:', validationData.procurementTypes.length);
    console.log('Tax Types imported:', validationData.taxTypes.length);
    console.log('Budget Lines imported:', validationData.budgetLines.length);
    console.log('Currencies imported:', validationData.currencies.length);
    console.log('Banks imported:', validationData.banks.length);
    console.log('Vendors imported:', validationData.vendors.length);
    console.log('Signatories imported:', validationData.signatories.length);
    console.log('Departments imported:', validationData.departments.length);
    console.log('Payment Priorities imported:', validationData.paymentPriorities.length);
    console.log('=====================================');

    console.log('Final parsed validation data:', validationData);
    return validationData;

  } catch (error) {
    console.error('Error importing validation data:', error);
    throw new Error(`Failed to import validation data: ${error.message}`);
  }
};
