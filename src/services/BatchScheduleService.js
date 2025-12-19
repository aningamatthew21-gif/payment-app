/**
 * BatchScheduleService.js
 * 
 * VBA-Style Batch Schedule Generation Service
 * Replicates the payment schedule layouts from the VBA system:
 * - Simple Single Payment
 * - Single Vendor Multi-Invoice
 * - Aggregated Items Single Budget
 * - Multi-Budget Line
 * - Tabular Components (Matrix)
 * - Multi-Section FX (Thematic)
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import companyLogo from '../assets/company-logo.png';

// ============================================================================
// CONSTANTS
// ============================================================================

const COLORS = {
    lightGray: [220, 220, 220],
    sectionHeaderGray: [242, 242, 242],
    red: [255, 0, 0],
    headerBlue: [66, 66, 66],
    purple: [128, 0, 128],
    darkBlue: [26, 35, 126]
};

const COMPANY_INFO = {
    name: 'MARGINS ID SYSTEMS APPLICATION LIMITED',
    address: 'P.O. Box KN 785, Kaneshie - Accra, Ghana.'
};

const SIGNATORIES = {
    preparedBy: 'Mattew Aninga',
    checkedBy: 'Enoch Asante',
    approvedBy: 'Vera Ogboo Adusu',
    authorized: 'BALTHAZAR KWESI ATTA PANYIN BAIDEI',
    authorizedTitle: 'DIRECTOR'
};

const THEMATIC_KEYWORDS = {
    'Travel & Per Diem': ['PER DIEM', 'TRANSPORT', 'TRAVEL ALLOWANCE', 'MILEAGE'],
    'Accommodation': ['HOTEL', 'LODGING', 'ACCOMMODATION'],
    'Airfare & Tickets': ['AIRFARE', 'TICKET', 'FLIGHT', 'RAIL']
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const formatCurrency = (amount, currency = 'GHS') => {
    const num = parseFloat(amount) || 0;
    return `${currency} ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatUSD = (amount) => {
    const num = parseFloat(amount) || 0;
    return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const safeNumber = (val) => parseFloat(val) || 0;

/**
 * Convert amount to words
 */
const amountToWords = (amount) => {
    const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
    const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
    const teens = ['TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];

    const convertHundreds = (num) => {
        if (num === 0) return '';
        if (num < 10) return ones[num];
        if (num < 20) return teens[num - 10];
        if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 > 0 ? ' ' + ones[num % 10] : '');
        return ones[Math.floor(num / 100)] + ' HUNDRED' + (num % 100 > 0 ? ' AND ' + convertHundreds(num % 100) : '');
    };

    const convert = (num) => {
        if (num === 0) return 'ZERO';
        const million = Math.floor(num / 1000000);
        const thousand = Math.floor((num % 1000000) / 1000);
        const remainder = num % 1000;

        let result = '';
        if (million) result += convertHundreds(million) + ' MILLION ';
        if (thousand) result += convertHundreds(thousand) + ' THOUSAND ';
        if (remainder) result += convertHundreds(remainder);
        return result.trim();
    };

    const wholePart = Math.floor(Math.abs(amount));
    const cents = Math.round((Math.abs(amount) - wholePart) * 100);

    return convert(wholePart) + ' CEDIS AND ' + cents + ' PESEWAS ONLY';
};

/**
 * Get budget impact in USD for a payment
 */
const getBudgetImpactUSD = (payment) => {
    if (payment.budgetImpactUSD) return safeNumber(payment.budgetImpactUSD);

    const netPayable = safeNumber(payment.netPayable || payment.amountThisTransaction || payment.amount);
    const fxRate = safeNumber(payment.fxRate) || 1;

    // If currency is GHS, convert to USD
    if (payment.currency === 'GHS' && fxRate > 0) {
        return netPayable / fxRate;
    }
    return netPayable;
};

/**
 * Get the net payable amount for a payment
 */
const getNetPayable = (payment) => {
    return safeNumber(payment.netPayable || payment.amountThisTransaction || payment.amount || payment.fullPretax);
};

/**
 * Get pre-tax amount for a payment
 */
const getPreTax = (payment) => {
    return safeNumber(payment.fullPretax || payment.preTaxAmount || payment.pretaxAmount || payment.amount);
};

// ============================================================================
// SCHEDULE TYPE DETECTION
// ============================================================================

export const BatchScheduleService = {
    /**
     * Detect the best schedule type based on payment composition
     * @param {Array} payments - Array of payment objects
     * @returns {string} Schedule type identifier
     */
    detectScheduleType(payments) {
        if (!payments || payments.length === 0) return 'SIMPLE_SINGLE';
        if (payments.length === 1) return 'SIMPLE_SINGLE';

        // Get unique values
        const uniqueVendors = [...new Set(payments.map(p => p.vendor))];
        const uniqueBudgetLines = [...new Set(payments.map(p => p.budgetLine || p.budgetItem).filter(Boolean))];
        const hasThematic = this.hasThematicCategories(payments);

        // Decision tree (matching VBA logic)
        if (uniqueVendors.length === 1 && uniqueBudgetLines.length === 1) {
            return 'SINGLE_VENDOR_MULTI_INVOICE';
        }

        if (uniqueBudgetLines.length === 1 && uniqueVendors.length > 1) {
            return 'AGGREGATED_SINGLE_BUDGET';
        }

        if (uniqueBudgetLines.length > 1) {
            // Check if it's thematic (travel-related)
            if (hasThematic) {
                return 'MULTI_SECTION_FX';
            }
            return 'MULTI_BUDGET_LINE';
        }

        // If multiple vendors with distinct descriptions, use tabular
        const uniqueDescriptions = [...new Set(payments.map(p => p.description).filter(Boolean))];
        if (uniqueVendors.length > 2 && uniqueDescriptions.length > 2) {
            return 'TABULAR_COMPONENTS';
        }

        return 'AGGREGATED_SINGLE_BUDGET';
    },

    /**
     * Check if payments have thematic categories (travel, accommodation, etc.)
     */
    hasThematicCategories(payments) {
        let categoriesFound = 0;

        for (const categoryKeywords of Object.values(THEMATIC_KEYWORDS)) {
            const hasCategory = payments.some(p => {
                const desc = (p.description || '').toUpperCase();
                return categoryKeywords.some(kw => desc.includes(kw));
            });
            if (hasCategory) categoriesFound++;
        }

        return categoriesFound >= 2; // At least 2 thematic categories
    },

    /**
     * Get available schedule types for UI dropdown
     */
    getScheduleTypes() {
        return [
            { value: 'AUTO', label: 'Auto-Detect (Recommended)' },
            { value: 'SIMPLE_SINGLE', label: 'Simple Single Payment' },
            { value: 'SINGLE_VENDOR_MULTI_INVOICE', label: 'Single Vendor - Multiple Invoices' },
            { value: 'AGGREGATED_SINGLE_BUDGET', label: 'Aggregated Items - Single Budget' },
            { value: 'MULTI_BUDGET_LINE', label: 'Multi-Budget Line Payments' },
            { value: 'TABULAR_COMPONENTS', label: 'Tabular Components (Matrix)' },
            { value: 'MULTI_SECTION_FX', label: 'Multi-Section FX (Thematic)' }
        ];
    },

    // ============================================================================
    // MAIN PDF GENERATOR
    // ============================================================================

    /**
     * Generate batch schedule PDF with voucher-style header and signatories
     * @param {Array} payments - Selected payments
     * @param {string} layoutType - Schedule type ('AUTO' for auto-detect)
     * @param {Object} budgetDataMap - Map of budget line name to budget details
     * @returns {Blob} PDF blob
     */
    async generateBatchSchedulePDF(payments, layoutType = 'AUTO', budgetDataMap = {}) {
        if (!payments || payments.length === 0) {
            throw new Error('No payments provided for schedule generation');
        }

        // Auto-detect if needed
        const resolvedType = layoutType === 'AUTO'
            ? this.detectScheduleType(payments)
            : layoutType;

        console.log(`[BatchScheduleService] Generating ${resolvedType} schedule for ${payments.length} payments`);

        const doc = new jsPDF();

        // Calculate total amount payable
        const totalAmount = payments.reduce((sum, p) => sum + getNetPayable(p), 0);

        // 1. Render Voucher Header (logo, company, pay to, purpose, amount in words)
        let currentY = this._renderVoucherHeader(doc, payments, totalAmount);

        // 2. For multi-budget layouts, add budget lines summary
        const uniqueBudgetLines = [...new Set(payments.map(p => p.budgetLine || p.budgetItem).filter(Boolean))];
        if (uniqueBudgetLines.length > 1) {
            currentY = this._renderBudgetLinesSummary(doc, payments, currentY);
        }

        // 3. Add "Payment Details" section header
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Payment Details', 15, currentY);
        currentY += 5;

        // 4. Route to appropriate layout generator (pass startY for positioning)
        switch (resolvedType) {
            case 'SIMPLE_SINGLE':
                currentY = this._generateSimpleSingle(doc, payments[0], budgetDataMap, currentY);
                break;
            case 'SINGLE_VENDOR_MULTI_INVOICE':
                currentY = this._generateSingleVendorMultiInvoice(doc, payments, budgetDataMap, currentY);
                break;
            case 'AGGREGATED_SINGLE_BUDGET':
                currentY = this._generateAggregatedSingleBudget(doc, payments, budgetDataMap, currentY);
                break;
            case 'MULTI_BUDGET_LINE':
                currentY = this._generateMultiBudgetLine(doc, payments, budgetDataMap, currentY);
                break;
            case 'TABULAR_COMPONENTS':
                currentY = this._generateTabularComponents(doc, payments, budgetDataMap, currentY);
                break;
            case 'MULTI_SECTION_FX':
                currentY = this._generateMultiSectionFX(doc, payments, budgetDataMap, currentY);
                break;
            default:
                currentY = this._generateAggregatedSingleBudget(doc, payments, budgetDataMap, currentY);
        }

        // 5. Add page if signatory section won't fit
        if (currentY > 250) {
            doc.addPage();
            currentY = 20;
        }

        // 6. Render Signatory Section at the bottom
        this._renderSignatories(doc, currentY + 10);

        // Return blob
        const pdfBytes = doc.output('arraybuffer');
        return new Blob([pdfBytes], { type: 'application/pdf' });
    },

    // ============================================================================
    // VOUCHER HEADER RENDERER
    // ============================================================================

    /**
     * Render voucher-style header with logo, company info, and payment details
     * @returns {number} Final Y position after header
     */
    _renderVoucherHeader(doc, payments, totalAmount) {
        const pageWidth = doc.internal.pageSize.width;
        const currency = payments[0]?.currency || 'GHS';
        const voucherNo = `MIDSA-FIN-${Date.now()}`;
        const voucherDate = new Date().toISOString().slice(0, 10);

        // Get unique vendors and purposes
        const vendors = [...new Set(payments.map(p => p.vendor))];
        const payTo = vendors.length === 1 ? vendors[0] : `${vendors.length} Vendors`;
        const purposes = payments.map(p => p.description || 'Payment').slice(0, 3);
        const purposeText = purposes.join(', ') + (payments.length > 3 ? `, +${payments.length - 3} more` : '');

        let y = 15;

        // Logo (top left) - try to add logo image
        try {
            doc.addImage(companyLogo, 'PNG', 15, y, 25, 25);
        } catch (error) {
            console.log('[BatchScheduleService] Logo could not be loaded:', error);
        }

        // Company Header (centered)
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.darkBlue);
        doc.text(COMPANY_INFO.name, pageWidth / 2, y + 8, { align: 'center' });

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        doc.text(COMPANY_INFO.address, pageWidth / 2, y + 15, { align: 'center' });

        y += 25;

        // Title: PAYMENT VOUCHER
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.darkBlue);
        doc.text('PAYMENT VOUCHER', pageWidth / 2, y, { align: 'center' });
        doc.setTextColor(0, 0, 0);

        y += 12;

        // Two-column layout: Left side (Pay To, Purpose, Amount in Words) | Right side (Voucher No, Date, Amount)
        const leftMargin = 15;
        const rightColStart = pageWidth - 70;

        // Left Column
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Pay To:', leftMargin, y);
        doc.setFont('helvetica', 'normal');
        doc.text(payTo.substring(0, 40), leftMargin + 22, y);

        // Right Column
        doc.setFont('helvetica', 'bold');
        doc.text('Voucher No.:', rightColStart, y);
        doc.setFont('helvetica', 'normal');
        doc.text(voucherNo, rightColStart + 25, y);

        y += 6;

        // Purpose
        doc.setFont('helvetica', 'bold');
        doc.text('Purpose:', leftMargin, y);
        doc.setFont('helvetica', 'normal');
        const wrappedPurpose = doc.splitTextToSize(purposeText, 100);
        doc.text(wrappedPurpose[0], leftMargin + 22, y);

        // Voucher Date
        doc.setFont('helvetica', 'bold');
        doc.text('Voucher Date:', rightColStart, y);
        doc.setFont('helvetica', 'normal');
        doc.text(voucherDate, rightColStart + 28, y);

        y += 10;

        // Amount Payable in Words
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('Amount Payable (In Words):', leftMargin, y);
        y += 5;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        const amountWords = amountToWords(totalAmount);
        const wrappedWords = doc.splitTextToSize(amountWords, 110);
        doc.text(wrappedWords, leftMargin, y);

        // Amount Payable (right side, large)
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('Amount Payable:', rightColStart, y - 5);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(formatCurrency(totalAmount, currency), pageWidth - 15, y + 3, { align: 'right' });

        y += wrappedWords.length * 4 + 8;

        // Horizontal line
        doc.setDrawColor(200, 200, 200);
        doc.line(leftMargin, y, pageWidth - leftMargin, y);

        return y + 5;
    },

    // ============================================================================
    // BUDGET LINES SUMMARY RENDERER
    // ============================================================================

    /**
     * Render multiple budget lines summary section
     */
    _renderBudgetLinesSummary(doc, payments, startY) {
        const pageWidth = doc.internal.pageSize.width;
        let y = startY;

        // Get unique budget lines and calculate totals
        const budgetLinesMap = {};
        payments.forEach(p => {
            const bl = p.budgetLine || p.budgetItem || 'Unassigned';
            if (!budgetLinesMap[bl]) {
                budgetLinesMap[bl] = { name: bl, impact: 0, count: 0 };
            }
            budgetLinesMap[bl].impact += getBudgetImpactUSD(p);
            budgetLinesMap[bl].count++;
        });

        const budgetLines = Object.values(budgetLinesMap);
        const totalImpact = budgetLines.reduce((sum, bl) => sum + bl.impact, 0);

        // Section header
        doc.setFillColor(235, 245, 255);
        doc.rect(15, y - 3, pageWidth - 30, 28, 'F');

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(66, 66, 255);
        doc.text('Multiple Budget Lines Summary', 20, y + 3);

        y += 8;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`Total Budget Lines: ${budgetLines.length}`, 20, y);
        y += 4;
        doc.text(`Total Budget Impact: ${formatUSD(totalImpact)}`, 20, y);
        y += 4;
        doc.text(`Budget Lines: ${budgetLines.map(bl => bl.name.substring(0, 15)).join(', ')}`, 20, y);

        doc.setTextColor(0, 0, 0);

        return y + 10;
    },

    // ============================================================================
    // SIGNATORY SECTION RENDERER
    // ============================================================================

    /**
     * Render signatory section at the bottom of the PDF
     */
    _renderSignatories(doc, startY) {
        const pageWidth = doc.internal.pageSize.width;
        let y = startY;

        // Signatory header
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Approval and Authorization', 15, y);
        y += 10;

        // Two columns layout
        const col1X = 15;
        const col2X = pageWidth / 2 + 10;

        doc.setFontSize(9);

        // Row 1: Prepared By | Approved By
        doc.setFont('helvetica', 'bold');
        doc.text('Prepared By:', col1X, y);
        doc.setFont('helvetica', 'normal');
        doc.text(SIGNATORIES.preparedBy, col1X + 28, y);

        doc.setFont('helvetica', 'bold');
        doc.text('Approved By:', col2X, y);
        doc.setFont('helvetica', 'normal');
        doc.text(SIGNATORIES.approvedBy, col2X + 28, y);

        y += 8;

        // Row 2: Checked By | Authorized
        doc.setFont('helvetica', 'bold');
        doc.text('Checked By:', col1X, y);
        doc.setFont('helvetica', 'normal');
        doc.text(SIGNATORIES.checkedBy, col1X + 28, y);

        doc.setFont('helvetica', 'bold');
        doc.text('Authorized:', col2X, y);
        doc.setFont('helvetica', 'normal');
        doc.text(SIGNATORIES.authorized, col2X + 28, y);

        y += 5;
        doc.setFontSize(8);
        doc.text(SIGNATORIES.authorizedTitle, col2X + 28, y);

        return y + 10;
    },

    // ============================================================================
    // BUDGET SECTION RENDERER (Used by all layouts)
    // ============================================================================

    _renderBudgetSection(doc, budgetLineName, budgetData, currentRequestUSD, startY) {
        const pageWidth = doc.internal.pageSize.width;
        let y = startY;

        // Budget Line Header
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Budget Line:', 15, y);
        doc.setFont('helvetica', 'normal');
        doc.text(budgetLineName || 'N/A', 50, y);
        y += 8;

        // Always show the budget impact table, even if budgetData is incomplete
        // Use available data or show "N/A" for missing values
        const initial = budgetData ? safeNumber(budgetData.allocatedAmount || budgetData.initialBalance) : 0;
        const spent = budgetData ? safeNumber(budgetData.totalSpendToDate || budgetData.totalSpent) : 0;
        const balCD = budgetData ? safeNumber(budgetData.balCD || budgetData.currentBalance || (initial - spent)) : 0;
        const balBD = balCD - currentRequestUSD;

        // Determine if we have full budget details or just showing the request
        const hasFullBudgetData = budgetData && (initial > 0 || spent > 0 || balCD > 0);

        autoTable(doc, {
            startY: y,
            head: [['Budget Balance (USD)', 'Initial', 'Spend to Date', 'Bal C/D', 'Current Request', 'Bal B/D']],
            body: [[
                budgetLineName || 'N/A',
                hasFullBudgetData ? formatUSD(initial) : 'N/A',
                hasFullBudgetData ? formatUSD(spent) : 'N/A',
                hasFullBudgetData ? formatUSD(balCD) : 'N/A',
                formatUSD(currentRequestUSD),
                hasFullBudgetData ? formatUSD(balBD) : 'N/A'
            ]],
            theme: 'grid',
            headStyles: { fillColor: COLORS.headerBlue, fontSize: 8 },
            bodyStyles: { fontSize: 8 },
            columnStyles: {
                4: { fontStyle: 'bold' }, // Highlight current request
                5: {
                    textColor: (hasFullBudgetData && balBD < 0) ? COLORS.red : [0, 0, 0],
                    fontStyle: 'bold'
                }
            }
        });

        return doc.lastAutoTable.finalY + 10;
    },

    // ============================================================================
    // LAYOUT GENERATORS
    // ============================================================================

    /**
     * Simple Single Payment Schedule
     * @param {number} startY - Starting Y position
     * @returns {number} Final Y position
     */
    _generateSimpleSingle(doc, payment, budgetDataMap, startY = 30) {
        const pageWidth = doc.internal.pageSize.width;
        const currency = payment.currency || 'GHS';
        const budgetLine = payment.budgetLine || payment.budgetItem || 'N/A';

        // Partial Payment Note
        let currentY = startY;
        if (payment.isPartialPayment && payment.paymentPercentage < 100) {
            doc.setFontSize(10);
            doc.setFont('helvetica', 'italic');
            doc.text(`PARTIAL PAYMENT (${payment.paymentPercentage}% of Original Invoice)`, pageWidth / 2, currentY, { align: 'center' });
            currentY += 8;
        }

        // Payment Details Table
        const preTax = getPreTax(payment);
        const wht = safeNumber(payment.whtAmount);
        const levy = safeNumber(payment.levyAmount);
        const subtotal = preTax - wht + levy;
        const vat = safeNumber(payment.vatAmount);
        const momo = safeNumber(payment.momoCharge);
        const netPayable = getNetPayable(payment);

        const bodyData = [
            ['Pre-Tax Amount', formatCurrency(preTax, currency)]
        ];
        if (wht > 0) bodyData.push(['Withholding Tax (-)', formatCurrency(-wht, currency)]);
        if (levy > 0) bodyData.push(['Levies (+)', formatCurrency(levy, currency)]);
        bodyData.push(['Subtotal', formatCurrency(subtotal, currency)]);
        if (vat > 0) bodyData.push(['VAT (+)', formatCurrency(vat, currency)]);
        if (momo > 0) bodyData.push(['MoMo Charge (+)', formatCurrency(momo, currency)]);
        bodyData.push(['NET PAYABLE', formatCurrency(netPayable, currency)]);

        autoTable(doc, {
            startY: currentY,
            head: [['Component', `Amount (${currency})`]],
            body: bodyData,
            theme: 'grid',
            headStyles: { fillColor: COLORS.headerBlue },
            columnStyles: { 1: { halign: 'right' } },
            didParseCell: (data) => {
                if (data.row.index === bodyData.length - 1) {
                    data.cell.styles.fillColor = COLORS.lightGray;
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });

        currentY = doc.lastAutoTable.finalY + 15;

        // Budget Section
        const budgetImpact = getBudgetImpactUSD(payment);
        currentY = this._renderBudgetSection(doc, budgetLine, budgetDataMap[budgetLine], budgetImpact, currentY);
        return currentY;
    },

    /**
     * Single Vendor - Multiple Invoices Schedule
     * @param {number} startY - Starting Y position
     * @returns {number} Final Y position
     */
    _generateSingleVendorMultiInvoice(doc, payments, budgetDataMap, startY = 35) {
        const pageWidth = doc.internal.pageSize.width;
        const commonVendor = payments[0]?.vendor || 'Unknown Vendor';
        const commonBudget = payments[0]?.budgetLine || payments[0]?.budgetItem || 'N/A';
        const currency = payments[0]?.currency || 'GHS';
        let currentY = startY;

        // Invoices Table (title is now in voucher header)
        const tableBody = payments.map(p => {
            const preTax = getPreTax(p);
            const wht = safeNumber(p.whtAmount);
            const vatLevy = safeNumber(p.vatAmount) + safeNumber(p.levyAmount);
            const net = getNetPayable(p);

            let desc = `Invoice: ${p.invoiceNo || 'N/A'} - ${p.description || ''}`;
            if (p.isPartialPayment && p.paymentPercentage < 100) {
                desc += ` (${p.paymentPercentage}%)`;
            }

            return [desc, formatCurrency(preTax, currency), formatCurrency(-wht, currency), formatCurrency(vatLevy, currency), formatCurrency(net, currency)];
        });

        const grandTotal = payments.reduce((sum, p) => sum + getNetPayable(p), 0);
        tableBody.push(['TOTAL AMOUNT PAYABLE', '', '', '', formatCurrency(grandTotal, currency)]);

        autoTable(doc, {
            startY: currentY,
            head: [['Invoice Details', `Pre-Tax (${currency})`, `WHT (-) (${currency})`, `VAT/Levies (+) (${currency})`, `Net Payable (${currency})`]],
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: COLORS.headerBlue, fontSize: 8 },
            bodyStyles: { fontSize: 8 },
            columnStyles: {
                0: { cellWidth: 60 },
                1: { halign: 'right' },
                2: { halign: 'right' },
                3: { halign: 'right' },
                4: { halign: 'right' }
            },
            didParseCell: (data) => {
                if (data.row.index === tableBody.length - 1) {
                    data.cell.styles.fillColor = COLORS.lightGray;
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });

        currentY = doc.lastAutoTable.finalY + 15;

        // Budget Section
        const totalImpact = payments.reduce((sum, p) => sum + getBudgetImpactUSD(p), 0);
        currentY = this._renderBudgetSection(doc, commonBudget, budgetDataMap[commonBudget], totalImpact, currentY);
        return currentY;
    },

    /**
     * Aggregated Items - Single Budget Line Schedule
     * @param {number} startY - Starting Y position (after voucher header)
     * @returns {number} Final Y position
     */
    _generateAggregatedSingleBudget(doc, payments, budgetDataMap, startY = 30) {
        const pageWidth = doc.internal.pageSize.width;
        const commonBudget = payments[0]?.budgetLine || payments[0]?.budgetItem || 'N/A';

        let currentY = startY;
        let grandTotal = 0;

        // Render each payment as a block
        for (const payment of payments) {
            const currency = payment.currency || 'GHS';
            const preTax = getPreTax(payment);
            const wht = safeNumber(payment.whtAmount);
            const levy = safeNumber(payment.levyAmount);
            const vat = safeNumber(payment.vatAmount);
            const momo = safeNumber(payment.momoCharge);
            const netPayable = getNetPayable(payment);
            grandTotal += netPayable;

            // Item header
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            const itemLabel = payment.invoiceNo
                ? `${payment.vendor} - INV ${payment.invoiceNo}`
                : `${payment.vendor} - ${payment.description}`;
            doc.text(itemLabel, 15, currentY);

            if (payment.isPartialPayment && payment.paymentPercentage < 100) {
                currentY += 5;
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(8);
                doc.text(`PARTIAL (${payment.paymentPercentage}%)`, 15, currentY);
            }

            currentY += 5;

            // Components table
            const bodyData = [
                ['Pre-Tax', formatCurrency(preTax, currency)]
            ];
            if (wht > 0) bodyData.push(['WHT (-)', formatCurrency(-wht, currency)]);
            if (levy > 0) bodyData.push(['Levies (+)', formatCurrency(levy, currency)]);
            if (vat > 0) bodyData.push(['VAT (+)', formatCurrency(vat, currency)]);
            if (momo > 0) bodyData.push(['MoMo (+)', formatCurrency(momo, currency)]);
            bodyData.push(['NET PAYABLE', formatCurrency(netPayable, currency)]);

            autoTable(doc, {
                startY: currentY,
                body: bodyData,
                theme: 'plain',
                styles: { fontSize: 8 },
                columnStyles: { 0: { cellWidth: 40 }, 1: { halign: 'right' } },
                didParseCell: (data) => {
                    if (data.row.index === bodyData.length - 1) {
                        data.cell.styles.fillColor = COLORS.lightGray;
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            });

            currentY = doc.lastAutoTable.finalY + 8;

            // Add new page if needed
            if (currentY > 250) {
                doc.addPage();
                currentY = 20;
            }
        }

        // Grand Total
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('TOTAL AMOUNT PAYABLE (All Items):', 15, currentY);
        doc.text(formatCurrency(grandTotal, payments[0]?.currency || 'GHS'), pageWidth - 15, currentY, { align: 'right' });

        currentY += 15;

        // Budget Section
        const totalImpact = payments.reduce((sum, p) => sum + getBudgetImpactUSD(p), 0);
        currentY = this._renderBudgetSection(doc, commonBudget, budgetDataMap[commonBudget], totalImpact, currentY);
        return currentY;
    },

    /**
     * Multi-Budget Line Schedule
     * VBA-Style: Groups payments by budget line with proper table formatting
     * @param {jsPDF} doc - PDF document
     * @param {Array} payments - Payment objects
     * @param {Object} budgetDataMap - Budget data lookup
     * @param {number} startY - Starting Y position (after voucher header)
     * @returns {number} Final Y position
     */
    _generateMultiBudgetLine(doc, payments, budgetDataMap, startY = 38) {
        const pageWidth = doc.internal.pageSize.width;

        // Group by budget line
        const groupedByBudget = {};
        for (const p of payments) {
            const bl = p.budgetLine || p.budgetItem || 'Unassigned';
            if (!groupedByBudget[bl]) groupedByBudget[bl] = [];
            groupedByBudget[bl].push(p);
        }

        let currentY = startY;
        let overallTotal = 0;

        for (const [budgetLine, items] of Object.entries(groupedByBudget)) {
            // Section Header (styled box)
            doc.setFillColor(...COLORS.sectionHeaderGray);
            doc.rect(15, currentY - 5, pageWidth - 30, 8, 'F');
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text(`BUDGET LINE: ${budgetLine.toUpperCase()}`, pageWidth / 2, currentY, { align: 'center' });
            currentY += 8;

            let sectionTotal = 0;
            let sectionImpact = 0;
            const currency = items[0]?.currency || 'GHS';

            // Build table data for this section
            const tableBody = items.map((payment, idx) => {
                const netPayable = getNetPayable(payment);
                const preTax = getPreTax(payment);
                const wht = safeNumber(payment.whtAmount);
                const levyVat = safeNumber(payment.levyAmount) + safeNumber(payment.vatAmount);

                sectionTotal += netPayable;
                sectionImpact += getBudgetImpactUSD(payment);

                const vendorLabel = payment.invoiceNo
                    ? `${payment.vendor} - INV ${payment.invoiceNo}`
                    : `${payment.vendor}`;

                return [
                    (idx + 1).toString(),
                    vendorLabel,
                    payment.description || 'N/A',
                    formatCurrency(preTax, currency),
                    wht > 0 ? formatCurrency(-wht, currency) : '-',
                    levyVat > 0 ? formatCurrency(levyVat, currency) : '-',
                    formatCurrency(netPayable, currency)
                ];
            });

            // Add subtotal row
            tableBody.push([
                '', 'SUBTOTAL', '', '', '', '', formatCurrency(sectionTotal, currency)
            ]);

            // Render table with grid
            autoTable(doc, {
                startY: currentY,
                head: [['#', 'Vendor', 'Description', 'Pre-Tax', 'WHT (-)', 'Levies/VAT (+)', 'Net Payable']],
                body: tableBody,
                theme: 'grid',
                headStyles: { fillColor: COLORS.headerBlue, fontSize: 7, halign: 'center' },
                bodyStyles: { fontSize: 7 },
                columnStyles: {
                    0: { cellWidth: 8, halign: 'center' },
                    1: { cellWidth: 35 },
                    2: { cellWidth: 40 },
                    3: { cellWidth: 22, halign: 'right' },
                    4: { cellWidth: 20, halign: 'right' },
                    5: { cellWidth: 22, halign: 'right' },
                    6: { cellWidth: 25, halign: 'right' }
                },
                didParseCell: (data) => {
                    // Style subtotal row
                    if (data.row.index === tableBody.length - 1) {
                        data.cell.styles.fillColor = COLORS.lightGray;
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            });

            currentY = doc.lastAutoTable.finalY + 5;

            // Budget details for this section
            currentY = this._renderBudgetSection(doc, budgetLine, budgetDataMap[budgetLine], sectionImpact, currentY);
            currentY += 10;

            overallTotal += sectionTotal;

            // Page break if needed
            if (currentY > 250) {
                doc.addPage();
                currentY = 20;
            }
        }

        // Overall Total (styled box)
        doc.setFillColor(...COLORS.lightGray);
        doc.rect(15, currentY - 5, pageWidth - 30, 12, 'F');
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('GRAND TOTAL PAYABLE:', 20, currentY + 2);
        doc.text(formatCurrency(overallTotal, payments[0]?.currency || 'GHS'), pageWidth - 20, currentY + 2, { align: 'right' });

        return currentY + 15;
    },

    /**
     * Tabular Components (Matrix) Schedule
     * VBA-Style: Shows vendors × components matrix with MoMo fee summary
     */
    _generateTabularComponents(doc, payments, budgetDataMap) {
        const pageWidth = doc.internal.pageSize.width;
        const currency = payments[0]?.currency || 'GHS';

        // Title
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Payment Schedule - Component Summary', pageWidth / 2, 20, { align: 'center' });

        // Get unique vendors and components
        const vendors = [...new Set(payments.map(p => p.vendor))];
        const components = [...new Set(payments.map(p => p.description))];

        // Build matrix data
        const headers = ['Vendor / Entity', ...components, 'TOTAL'];
        const body = [];
        let colTotals = new Array(components.length).fill(0);
        let grandTotal = 0;

        for (const vendor of vendors) {
            const row = [vendor];
            let rowTotal = 0;

            for (let i = 0; i < components.length; i++) {
                const comp = components[i];
                const matchingPayments = payments.filter(p => p.vendor === vendor && p.description === comp);
                const sum = matchingPayments.reduce((s, p) => s + getNetPayable(p), 0);
                row.push(sum > 0 ? formatCurrency(sum, currency) : '-');
                rowTotal += sum;
                colTotals[i] += sum;
            }

            row.push(formatCurrency(rowTotal, currency));
            grandTotal += rowTotal;
            body.push(row);
        }

        // Add totals row
        const totalsRow = ['COMPONENT TOTALS', ...colTotals.map(t => formatCurrency(t, currency)), formatCurrency(grandTotal, currency)];
        body.push(totalsRow);

        autoTable(doc, {
            startY: 30,
            head: [headers],
            body: body,
            theme: 'grid',
            headStyles: { fillColor: COLORS.headerBlue, fontSize: 7 },
            bodyStyles: { fontSize: 7 },
            didParseCell: (data) => {
                if (data.row.index === body.length - 1) {
                    data.cell.styles.fillColor = COLORS.lightGray;
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });

        let currentY = doc.lastAutoTable.finalY + 10;

        // Check for MoMo payments and calculate fees
        const hasMoMo = payments.some(p => (p.paymentMode || '').toUpperCase().includes('MOMO'));
        const totalMoMoCharge = payments.reduce((sum, p) => sum + safeNumber(p.momoCharge || 0), 0);

        // If MoMo payments exist OR there are MoMo charges, show the fee summary
        if (hasMoMo || totalMoMoCharge > 0) {
            const momoRate = 0.01; // 1% default
            const calculatedMoMoFee = totalMoMoCharge > 0 ? totalMoMoCharge : (grandTotal * momoRate);
            const totalCashRequired = grandTotal + calculatedMoMoFee;

            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.text('Payment Mode: Mobile Money (Bulk)', 15, currentY);
            currentY += 6;

            doc.text(`Transaction Fees (1%):`, 15, currentY);
            doc.setTextColor(...COLORS.red);
            doc.text(`+${formatCurrency(calculatedMoMoFee, currency)}`, pageWidth - 15, currentY, { align: 'right' });
            doc.setTextColor(0, 0, 0);
            currentY += 2;

            // Divider line
            doc.setDrawColor(150, 150, 150);
            doc.line(15, currentY, pageWidth - 15, currentY);
            currentY += 6;

            // Total Cash Required
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('TOTAL CASH REQUIRED:', 15, currentY);
            doc.text(formatCurrency(totalCashRequired, currency), pageWidth - 15, currentY, { align: 'right' });
            currentY += 10;
        }

        // Budget sections for all affected budget lines
        const budgetLines = [...new Set(payments.map(p => p.budgetLine || p.budgetItem).filter(Boolean))];
        for (const bl of budgetLines) {
            const blPayments = payments.filter(p => (p.budgetLine || p.budgetItem) === bl);
            const impact = blPayments.reduce((sum, p) => sum + getBudgetImpactUSD(p), 0);
            currentY = this._renderBudgetSection(doc, bl, budgetDataMap[bl], impact, currentY);
        }
    },

    /**
     * Multi-Section FX (Thematic) Schedule
     */
    _generateMultiSectionFX(doc, payments, budgetDataMap) {
        const pageWidth = doc.internal.pageSize.width;

        // Title
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Payment Schedule - Thematic Breakdown', pageWidth / 2, 20, { align: 'center' });

        // Categorize payments
        const sections = {};
        for (const [section, keywords] of Object.entries(THEMATIC_KEYWORDS)) {
            sections[section] = [];
        }
        sections['Other Expenses'] = [];

        for (const payment of payments) {
            const desc = (payment.description || '').toUpperCase();
            let categorized = false;

            for (const [section, keywords] of Object.entries(THEMATIC_KEYWORDS)) {
                if (keywords.some(kw => desc.includes(kw))) {
                    sections[section].push(payment);
                    categorized = true;
                    break;
                }
            }

            if (!categorized) {
                sections['Other Expenses'].push(payment);
            }
        }

        let currentY = 35;
        let overallUSDTotal = 0;
        let applicableFXRate = 0;

        // Render each section
        for (const [sectionName, sectionPayments] of Object.entries(sections)) {
            if (sectionPayments.length === 0) continue;

            // Section header
            doc.setFillColor(...COLORS.sectionHeaderGray);
            doc.rect(15, currentY - 5, pageWidth - 30, 8, 'F');
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(sectionName.toUpperCase(), pageWidth / 2, currentY, { align: 'center' });
            currentY += 10;

            let sectionTotal = 0;

            for (const payment of sectionPayments) {
                const currency = payment.currency || 'GHS';
                const netPayable = getNetPayable(payment);
                sectionTotal += netPayable;
                overallUSDTotal += getBudgetImpactUSD(payment);

                if (currency === 'GHS' && payment.fxRate > 0) {
                    applicableFXRate = payment.fxRate;
                }

                const itemLabel = `${payment.vendor} - ${payment.description}`;
                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.text(itemLabel.substring(0, 60), 20, currentY);
                doc.text(formatCurrency(netPayable, currency), pageWidth - 20, currentY, { align: 'right' });
                currentY += 6;
            }

            // Section total
            doc.setFont('helvetica', 'bold');
            doc.text(`TOTAL FOR ${sectionName.toUpperCase()}:`, 20, currentY);
            doc.text(formatCurrency(sectionTotal, sectionPayments[0]?.currency || 'GHS'), pageWidth - 20, currentY, { align: 'right' });
            currentY += 12;

            // Page break if needed
            if (currentY > 250) {
                doc.addPage();
                currentY = 20;
            }
        }

        // Overall USD Total
        currentY += 5;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('OVERALL BUDGET IMPACT (USD):', 20, currentY);
        doc.text(formatUSD(overallUSDTotal), pageWidth - 20, currentY, { align: 'right' });
        currentY += 8;

        // FX Conversion
        if (applicableFXRate > 0) {
            doc.setFont('helvetica', 'normal');
            doc.text(`Exchange Rate (GHS/USD): ${applicableFXRate.toFixed(4)}`, 20, currentY);
            currentY += 6;
            doc.setFont('helvetica', 'bold');
            const ghsEquivalent = overallUSDTotal * applicableFXRate;
            doc.text('EQUIVALENT TO WITHDRAW (GHS):', 20, currentY);
            doc.text(formatCurrency(ghsEquivalent, 'GHS'), pageWidth - 20, currentY, { align: 'right' });
        }
    }
};

export default BatchScheduleService;
