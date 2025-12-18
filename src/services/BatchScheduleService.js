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

// ============================================================================
// CONSTANTS
// ============================================================================

const COLORS = {
    lightGray: [220, 220, 220],
    sectionHeaderGray: [242, 242, 242],
    red: [255, 0, 0],
    headerBlue: [66, 66, 66],
    purple: [128, 0, 128]
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
     * Generate batch schedule PDF
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

        // Route to appropriate generator
        switch (resolvedType) {
            case 'SIMPLE_SINGLE':
                this._generateSimpleSingle(doc, payments[0], budgetDataMap);
                break;
            case 'SINGLE_VENDOR_MULTI_INVOICE':
                this._generateSingleVendorMultiInvoice(doc, payments, budgetDataMap);
                break;
            case 'AGGREGATED_SINGLE_BUDGET':
                this._generateAggregatedSingleBudget(doc, payments, budgetDataMap);
                break;
            case 'MULTI_BUDGET_LINE':
                this._generateMultiBudgetLine(doc, payments, budgetDataMap);
                break;
            case 'TABULAR_COMPONENTS':
                this._generateTabularComponents(doc, payments, budgetDataMap);
                break;
            case 'MULTI_SECTION_FX':
                this._generateMultiSectionFX(doc, payments, budgetDataMap);
                break;
            default:
                this._generateAggregatedSingleBudget(doc, payments, budgetDataMap);
        }

        // Return blob
        const pdfBytes = doc.output('arraybuffer');
        return new Blob([pdfBytes], { type: 'application/pdf' });
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

        if (budgetData && budgetData.found !== false) {
            const initial = safeNumber(budgetData.allocatedAmount || budgetData.initialBalance);
            const spent = safeNumber(budgetData.totalSpendToDate || budgetData.totalSpent);
            const balCD = safeNumber(budgetData.balCD || budgetData.currentBalance || (initial - spent));
            const balBD = balCD - currentRequestUSD;

            autoTable(doc, {
                startY: y,
                head: [['Budget Balance (USD)', 'Initial', 'Spend to Date', 'Bal C/D', 'Current Request', 'Bal B/D']],
                body: [[
                    budgetLineName,
                    formatUSD(initial),
                    formatUSD(spent),
                    formatUSD(balCD),
                    formatUSD(currentRequestUSD),
                    formatUSD(balBD)
                ]],
                theme: 'grid',
                headStyles: { fillColor: COLORS.headerBlue, fontSize: 8 },
                bodyStyles: { fontSize: 8 },
                columnStyles: {
                    5: {
                        textColor: balBD < 0 ? COLORS.red : [0, 0, 0],
                        fontStyle: 'bold'
                    }
                }
            });

            return doc.lastAutoTable.finalY + 10;
        } else {
            doc.setTextColor(...COLORS.red);
            doc.text('Budget details not found!', 15, y);
            doc.setTextColor(0, 0, 0);
            return y + 10;
        }
    },

    // ============================================================================
    // LAYOUT GENERATORS
    // ============================================================================

    /**
     * Simple Single Payment Schedule
     */
    _generateSimpleSingle(doc, payment, budgetDataMap) {
        const pageWidth = doc.internal.pageSize.width;
        const currency = payment.currency || 'GHS';
        const budgetLine = payment.budgetLine || payment.budgetItem || 'N/A';

        // Title
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`Payment Schedule - ${payment.vendor}`, pageWidth / 2, 20, { align: 'center' });

        // Partial Payment Note
        let currentY = 30;
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
        this._renderBudgetSection(doc, budgetLine, budgetDataMap[budgetLine], budgetImpact, currentY);
    },

    /**
     * Single Vendor - Multiple Invoices Schedule
     */
    _generateSingleVendorMultiInvoice(doc, payments, budgetDataMap) {
        const pageWidth = doc.internal.pageSize.width;
        const commonVendor = payments[0]?.vendor || 'Unknown Vendor';
        const commonBudget = payments[0]?.budgetLine || payments[0]?.budgetItem || 'N/A';
        const currency = payments[0]?.currency || 'GHS';

        // Title
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`Payment Schedule - ${commonVendor}`, pageWidth / 2, 20, { align: 'center' });

        // Invoices Table
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
            startY: 30,
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

        const currentY = doc.lastAutoTable.finalY + 15;

        // Budget Section
        const totalImpact = payments.reduce((sum, p) => sum + getBudgetImpactUSD(p), 0);
        this._renderBudgetSection(doc, commonBudget, budgetDataMap[commonBudget], totalImpact, currentY);
    },

    /**
     * Aggregated Items - Single Budget Line Schedule
     */
    _generateAggregatedSingleBudget(doc, payments, budgetDataMap) {
        const pageWidth = doc.internal.pageSize.width;
        const commonBudget = payments[0]?.budgetLine || payments[0]?.budgetItem || 'N/A';

        // Title
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Payment Schedule - Aggregated Items', pageWidth / 2, 20, { align: 'center' });

        let currentY = 30;
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
        this._renderBudgetSection(doc, commonBudget, budgetDataMap[commonBudget], totalImpact, currentY);
    },

    /**
     * Multi-Budget Line Schedule
     */
    _generateMultiBudgetLine(doc, payments, budgetDataMap) {
        const pageWidth = doc.internal.pageSize.width;

        // Title
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Payment Schedule - By Budget Line', pageWidth / 2, 20, { align: 'center' });

        // Group by budget line
        const groupedByBudget = {};
        for (const p of payments) {
            const bl = p.budgetLine || p.budgetItem || 'Unassigned';
            if (!groupedByBudget[bl]) groupedByBudget[bl] = [];
            groupedByBudget[bl].push(p);
        }

        let currentY = 35;
        let overallTotal = 0;

        for (const [budgetLine, items] of Object.entries(groupedByBudget)) {
            // Section Header
            doc.setFillColor(...COLORS.sectionHeaderGray);
            doc.rect(15, currentY - 5, pageWidth - 30, 8, 'F');
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(`Expenses for Budget Line: ${budgetLine}`, pageWidth / 2, currentY, { align: 'center' });
            currentY += 10;

            let sectionTotal = 0;
            let sectionImpact = 0;

            // Items in this budget line
            for (const payment of items) {
                const currency = payment.currency || 'GHS';
                const netPayable = getNetPayable(payment);
                sectionTotal += netPayable;
                sectionImpact += getBudgetImpactUSD(payment);

                const itemLabel = payment.invoiceNo
                    ? `${payment.vendor} - INV ${payment.invoiceNo}`
                    : `${payment.vendor} - ${payment.description}`;

                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.text(itemLabel, 20, currentY);
                doc.text(formatCurrency(netPayable, currency), pageWidth - 20, currentY, { align: 'right' });
                currentY += 6;
            }

            // Section subtotal
            doc.setFont('helvetica', 'bold');
            doc.text(`Section Total:`, 20, currentY);
            doc.text(formatCurrency(sectionTotal, items[0]?.currency || 'GHS'), pageWidth - 20, currentY, { align: 'right' });
            currentY += 8;

            // Budget details for this section
            currentY = this._renderBudgetSection(doc, budgetLine, budgetDataMap[budgetLine], sectionImpact, currentY);
            currentY += 5;

            overallTotal += sectionTotal;

            // Page break if needed
            if (currentY > 250) {
                doc.addPage();
                currentY = 20;
            }
        }

        // Overall Total
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(...COLORS.lightGray);
        doc.rect(15, currentY - 5, pageWidth - 30, 10, 'F');
        doc.text('OVERALL TOTAL PAYABLE:', 20, currentY);
        doc.text(formatCurrency(overallTotal, payments[0]?.currency || 'GHS'), pageWidth - 20, currentY, { align: 'right' });
    },

    /**
     * Tabular Components (Matrix) Schedule
     */
    _generateTabularComponents(doc, payments, budgetDataMap) {
        const pageWidth = doc.internal.pageSize.width;

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
                row.push(sum > 0 ? formatCurrency(sum, payments[0]?.currency || 'GHS') : '-');
                rowTotal += sum;
                colTotals[i] += sum;
            }

            row.push(formatCurrency(rowTotal, payments[0]?.currency || 'GHS'));
            grandTotal += rowTotal;
            body.push(row);
        }

        // Add totals row
        const totalsRow = ['TOTAL PAYABLE', ...colTotals.map(t => formatCurrency(t, payments[0]?.currency || 'GHS')), formatCurrency(grandTotal, payments[0]?.currency || 'GHS')];
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

        let currentY = doc.lastAutoTable.finalY + 15;

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
