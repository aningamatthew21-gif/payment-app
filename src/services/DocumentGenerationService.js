import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDFDocument } from 'pdf-lib';

// Helper functions for consistent field access across different payment object structures
const getNetPayable = (payment) => {
    // Priority order: netPayable > amountThisTransaction > amount > fullPretax
    const value = payment.netPayable || payment.amountThisTransaction || payment.amount || payment.fullPretax || 0;
    return parseFloat(value) || 0;
};

const getPreTaxAmount = (payment) => {
    // Priority order: fullPretax > preTaxAmount > pretaxAmount > amount
    const value = payment.fullPretax || payment.preTaxAmount || payment.pretaxAmount || payment.amount || 0;
    return parseFloat(value) || 0;
};

const getBudgetLineName = (payment) => {
    // Try to get from budgetData first, then from payment fields
    if (payment.budgetData) {
        return payment.budgetData.budgetLineName || payment.budgetData.budgetLine || 'N/A';
    }
    return payment.budgetLine || payment.budgetItem || 'N/A';
};

const formatCurrency = (amount, currency = 'GHS') => {
    const num = parseFloat(amount) || 0;
    return `${currency} ${num.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
};

const formatUSD = (amount) => {
    const num = parseFloat(amount) || 0;
    return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
};

export const DocumentGenerationService = {
    /**
     * Generates a Payment Voucher PDF
     * @param {Object} payment - The payment data
     * @param {Object} companySettings - Company settings (logo, name, etc.)
     */
    generatePaymentVoucher: (payment, companySettings) => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;

        // --- Header ---
        doc.setFontSize(18);
        doc.text('PAYMENT VOUCHER', pageWidth / 2, 20, { align: 'center' });

        doc.setFontSize(10);
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 15, 30);
        doc.text(`Voucher No: ${payment.id || 'N/A'}`, pageWidth - 15, 30, { align: 'right' });

        // --- Payee Details ---
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('PAYEE DETAILS', 15, 45);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Payee: ${payment.vendor}`, 15, 55);
        doc.text(`Payment Mode: ${payment.paymentMode}`, 15, 62);
        doc.text(`Bank: ${payment.bank || 'N/A'}`, 15, 69);

        // --- Payment Details Table ---
        const netPayable = getNetPayable(payment);
        const preTaxAmount = getPreTaxAmount(payment);

        autoTable(doc, {
            startY: 80,
            head: [['Description', 'Pre-Tax Amount', 'Net Payable']],
            body: [
                [payment.description || 'N/A', formatCurrency(preTaxAmount, payment.currency), formatCurrency(netPayable, payment.currency)]
            ],
            theme: 'grid',
            headStyles: { fillColor: [66, 66, 66] },
        });

        let finalY = doc.lastAutoTable.finalY + 10;

        // --- Tax Breakdown (if applicable) ---
        if (payment.whtAmount > 0 || payment.levyAmount > 0 || payment.vatAmount > 0) {
            doc.setFont('helvetica', 'bold');
            doc.text('TAX BREAKDOWN', 15, finalY);

            const taxData = [];
            if (payment.whtAmount > 0) taxData.push(['Withholding Tax', payment.whtAmount]);
            if (payment.levyAmount > 0) taxData.push(['Levies', payment.levyAmount]);
            if (payment.vatAmount > 0) taxData.push(['VAT', payment.vatAmount]);

            autoTable(doc, {
                startY: finalY + 5,
                head: [['Tax Type', 'Amount']],
                body: taxData.map(row => [row[0], `${payment.currency} ${parseFloat(row[1]).toLocaleString(undefined, { minimumFractionDigits: 2 })}`]),
                theme: 'plain',
                tableWidth: pageWidth / 2
            });

            finalY = doc.lastAutoTable.finalY + 10;
        }

        // --- Net Payable ---
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`NET PAYABLE: ${formatCurrency(netPayable, payment.currency)}`, pageWidth - 15, finalY, { align: 'right' });

        // --- Signatories ---
        finalY += 30;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        const sigY = finalY;
        doc.line(15, sigY, 65, sigY);
        doc.text('Prepared By', 15, sigY + 5);
        doc.text(payment.preparedBy || '', 15, sigY + 10);

        doc.line(75, sigY, 125, sigY);
        doc.text('Checked By', 75, sigY + 5);
        doc.text(payment.checkedBy || '', 75, sigY + 10);

        doc.line(135, sigY, 185, sigY);
        doc.text('Authorized By', 135, sigY + 5);
        doc.text(payment.authorizedBy || '', 135, sigY + 10);

        // Save
        doc.save(`Payment_Voucher_${payment.vendor}_${new Date().toISOString().slice(0, 10)}.pdf`);
    },

    /**
     * Generates a Transfer Instruction PDF
     * @param {Object} payment - The payment data
     */
    generateTransferInstruction: (payment) => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;

        // --- Header ---
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('TRANSFER INSTRUCTION', pageWidth / 2, 20, { align: 'center' });

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 15, 35);
        doc.text('The Manager', 15, 45);
        doc.text(`${payment.bank || 'Bank Name'}`, 15, 50);

        doc.setFont('helvetica', 'bold');
        doc.text('Dear Sir/Madam,', 15, 65);
        doc.text('PAYMENT INSTRUCTION', 15, 75);
        doc.line(15, 76, 60, 76); // Underline

        doc.setFont('helvetica', 'normal');
        doc.text('Kindly transfer the sum of:', 15, 85);

        // Amount
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`${payment.currency} ${parseFloat(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 15, 95);

        // Beneficiary
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('To the beneficiary details below:', 15, 110);

        autoTable(doc, {
            startY: 115,
            body: [
                ['Beneficiary Name', payment.vendor],
                // ✅ FIXED: Read vendor-specific fields for beneficiary details
                ['Account Number', payment.vendorAccountNumber || payment.accountNumber || 'N/A'],
                ['Bank', payment.vendorBank || payment.bankName || 'N/A'],
                ['Branch', payment.vendorBranch || payment.branch || 'N/A'],
                ['Description', payment.description]
            ],
            theme: 'grid',
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } }
        });

        let finalY = doc.lastAutoTable.finalY + 20;

        doc.text('Please debit our account accordingly.', 15, finalY);

        // --- Signatories ---
        finalY += 40;

        doc.line(15, finalY, 85, finalY);
        doc.text('Authorized Signatory', 15, finalY + 5);

        doc.line(115, finalY, 185, finalY);
        doc.text('Authorized Signatory', 115, finalY + 5);

        // Save
        doc.save(`Transfer_Instruction_${payment.vendor}_${new Date().toISOString().slice(0, 10)}.pdf`);
    },

    /**
     * Generates a Combined PDF (Voucher + Instruction + Support Docs)
     * @param {Object} payment - The payment data
     * @param {Object} companySettings - Company settings
     */
    generateCombinedDocument: async (payment, companySettings) => {
        // 1. Generate Base PDF (Voucher + Instruction) using jsPDF
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;

        // Get amounts using helper functions for consistent access
        const netPayable = getNetPayable(payment);
        const preTaxAmount = getPreTaxAmount(payment);
        const budgetLineName = getBudgetLineName(payment);

        // --- Page 1: Payment Voucher ---
        doc.setFontSize(18);
        doc.text('PAYMENT VOUCHER', pageWidth / 2, 20, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 15, 30);
        doc.text(`Voucher No: ${payment.id || 'N/A'}`, pageWidth - 15, 30, { align: 'right' });

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('PAYEE DETAILS', 15, 45);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Payee: ${payment.vendor || 'N/A'}`, 15, 55);
        doc.text(`Payment Mode: ${payment.paymentMode || 'N/A'}`, 15, 62);
        doc.text(`Bank: ${payment.bank || 'N/A'}`, 15, 69);
        doc.text(`Budget Line: ${budgetLineName}`, 15, 76);

        // Payment Details Table
        autoTable(doc, {
            startY: 85,
            head: [['Description', 'Pre-Tax Amount', 'Net Payable']],
            body: [[
                payment.description || 'N/A',
                formatCurrency(preTaxAmount, payment.currency),
                formatCurrency(netPayable, payment.currency)
            ]],
            theme: 'grid',
            headStyles: { fillColor: [66, 66, 66] },
        });

        let finalY = doc.lastAutoTable.finalY + 10;

        // Tax Breakdown (if applicable)
        if (payment.whtAmount > 0 || payment.levyAmount > 0 || payment.vatAmount > 0) {
            doc.setFont('helvetica', 'bold');
            doc.text('TAX BREAKDOWN', 15, finalY);
            const taxData = [];
            if (payment.whtAmount > 0) taxData.push(['Withholding Tax (WHT)', formatCurrency(payment.whtAmount, payment.currency)]);
            if (payment.levyAmount > 0) taxData.push(['Levies (NHIL/GETFund/COVID)', formatCurrency(payment.levyAmount, payment.currency)]);
            if (payment.vatAmount > 0) taxData.push(['VAT', formatCurrency(payment.vatAmount, payment.currency)]);
            if (payment.momoCharge > 0) taxData.push(['MoMo Charge', formatCurrency(payment.momoCharge, payment.currency)]);

            autoTable(doc, {
                startY: finalY + 5,
                head: [['Tax Type', 'Amount']],
                body: taxData,
                theme: 'plain',
                tableWidth: pageWidth / 2
            });
            finalY = doc.lastAutoTable.finalY + 10;
        }

        // --- Budget Breakdown (if available) ---
        if (payment.budgetData) {
            doc.setFont('helvetica', 'bold');
            doc.text('BUDGET BREAKDOWN', 15, finalY);

            const bData = payment.budgetData;
            // Use budgetLineName which should be set by the merge in PaymentGenerator
            const displayBudgetLine = bData.budgetLineName || bData.budgetLine || budgetLineName || 'N/A';

            autoTable(doc, {
                startY: finalY + 5,
                head: [['Budget Line', 'Allocated', 'Spent', 'Bal C/D', 'Request', 'Bal B/D']],
                body: [[
                    displayBudgetLine,
                    formatUSD(bData.allocatedAmount || 0),
                    formatUSD(bData.totalSpendToDate || 0),
                    formatUSD(bData.balCD || 0),
                    formatUSD(bData.request || 0),
                    formatUSD(bData.balBD || 0)
                ]],
                theme: 'grid',
                headStyles: { fillColor: [66, 66, 66] },
                styles: { fontSize: 8 }
            });

            finalY = doc.lastAutoTable.finalY + 10;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`NET PAYABLE: ${formatCurrency(netPayable, payment.currency)}`, pageWidth - 15, finalY, { align: 'right' });

        finalY += 30;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const sigY = finalY;
        doc.line(15, sigY, 65, sigY);
        doc.text('Prepared By', 15, sigY + 5);
        doc.text(payment.preparedBy || '', 15, sigY + 10);
        doc.line(75, sigY, 125, sigY);
        doc.text('Checked By', 75, sigY + 5);
        doc.text(payment.checkedBy || '', 75, sigY + 10);
        doc.line(135, sigY, 185, sigY);
        doc.text('Authorized By', 135, sigY + 5);
        doc.text(payment.authorizedBy || '', 135, sigY + 10);

        // --- Page 2: Transfer Instruction ---
        doc.addPage();
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('TRANSFER INSTRUCTION', pageWidth / 2, 20, { align: 'center' });
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 15, 35);
        doc.text('The Manager', 15, 45);
        doc.text(`${payment.bank || 'Bank Name'}`, 15, 50);
        doc.setFont('helvetica', 'bold');
        doc.text('Dear Sir/Madam,', 15, 65);
        doc.text('PAYMENT INSTRUCTION', 15, 75);
        doc.line(15, 76, 60, 76);
        doc.setFont('helvetica', 'normal');
        doc.text('Kindly transfer the sum of:', 15, 85);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(formatCurrency(netPayable, payment.currency), 15, 95);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('To the beneficiary details below:', 15, 110);
        autoTable(doc, {
            startY: 115,
            body: [
                ['Beneficiary Name', payment.vendor || 'N/A'],
                // ✅ FIXED: Read vendor-specific fields for beneficiary details  
                ['Account Number', payment.vendorAccountNumber || payment.accountNumber || 'N/A'],
                ['Bank', payment.vendorBank || payment.bankName || 'N/A'],
                ['Branch', payment.vendorBranch || payment.branch || 'N/A'],
                ['Description', payment.description || 'N/A'],
                ['Budget Line', budgetLineName]
            ],
            theme: 'grid',
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } }
        });
        finalY = doc.lastAutoTable.finalY + 20;
        doc.text('Please debit our account accordingly.', 15, finalY);
        finalY += 40;
        doc.line(15, finalY, 85, finalY);
        doc.text('Authorized Signatory', 15, finalY + 5);
        doc.line(115, finalY, 185, finalY);
        doc.text('Authorized Signatory', 115, finalY + 5);

        // 2. Convert jsPDF to ArrayBuffer
        const basePdfBytes = doc.output('arraybuffer');

        // 3. Create pdf-lib Document and merge
        const pdfDoc = await PDFDocument.create();
        const basePdf = await PDFDocument.load(basePdfBytes);
        const copiedPages = await pdfDoc.copyPages(basePdf, basePdf.getPageIndices());
        copiedPages.forEach((page) => pdfDoc.addPage(page));

        // 4. Append Support Documents
        if (payment.supportDocuments && payment.supportDocuments.length > 0) {
            for (const docItem of payment.supportDocuments) {
                try {
                    let arrayBuffer;
                    let docType = docItem.type;
                    let docName = docItem.name;

                    // 1. Handle Wrapper Object from React State (docItem.file)
                    if (docItem.file && docItem.file instanceof File) {
                        arrayBuffer = await docItem.file.arrayBuffer();
                    }
                    // 2. Handle Raw File Object (if passed directly)
                    else if (docItem instanceof File) {
                        arrayBuffer = await docItem.arrayBuffer();
                        // docType and docName are already set from docItem properties (File inherits them)
                    }
                    // 3. Handle Remote URLs (Existing Logic)
                    else if (docItem.url) {
                        // Handle remote URLs (existing logic)
                        // Use proxy if in development to bypass CORS
                        const isDev = import.meta.env.DEV;
                        let fetchUrl = docItem.url;
                        if (isDev && docItem.url.includes('firebasestorage.googleapis.com')) {
                            fetchUrl = docItem.url.replace('https://firebasestorage.googleapis.com', '/firebase-storage');
                        }
                        const response = await fetch(fetchUrl);
                        arrayBuffer = await response.arrayBuffer();
                    } else {
                        console.warn(`Skipping document with no URL or data: ${docName}`);
                        continue;
                    }

                    if (docType === 'application/pdf' || docName.toLowerCase().endsWith('.pdf')) {
                        // Merge PDF
                        const supportPdf = await PDFDocument.load(arrayBuffer);
                        const supportPages = await pdfDoc.copyPages(supportPdf, supportPdf.getPageIndices());
                        supportPages.forEach((page) => pdfDoc.addPage(page));
                    } else if (docItem.type.startsWith('image/') || docItem.name.match(/\.(jpeg|jpg|png)$/i)) {
                        // Embed Image
                        let image;
                        if (docItem.name.match(/\.(jpeg|jpg)$/i) || docItem.type === 'image/jpeg') {
                            image = await pdfDoc.embedJpg(arrayBuffer);
                        } else if (docItem.name.match(/\.png$/i) || docItem.type === 'image/png') {
                            image = await pdfDoc.embedPng(arrayBuffer);
                        }

                        if (image) {
                            const page = pdfDoc.addPage();
                            const { width, height } = image.scale(1);
                            const pageWidth = page.getWidth();
                            const pageHeight = page.getHeight();

                            // Scale to fit page
                            const scale = Math.min((pageWidth - 40) / width, (pageHeight - 40) / height);
                            const scaledWidth = width * scale;
                            const scaledHeight = height * scale;

                            page.drawImage(image, {
                                x: (pageWidth - scaledWidth) / 2,
                                y: pageHeight - scaledHeight - 20,
                                width: scaledWidth,
                                height: scaledHeight,
                            });

                            page.drawText(`Support Document: ${docItem.name}`, {
                                x: 20,
                                y: pageHeight - 20,
                                size: 12,
                            });
                        }
                    } else {
                        console.warn(`Skipping unsupported document type: ${docItem.name}`);
                    }
                } catch (err) {
                    console.error(`Failed to merge support document ${docItem.name}:`, err);
                }
            }
        }

        // 5. Return Blob for Preview/Download
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        return blob;
    }
};
