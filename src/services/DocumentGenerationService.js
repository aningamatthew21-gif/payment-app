import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDFDocument } from 'pdf-lib';

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
        autoTable(doc, {
            startY: 80,
            head: [['Description', 'Amount']],
            body: [
                [payment.description, `${payment.currency} ${parseFloat(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`]
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
        doc.text(`NET PAYABLE: ${payment.currency} ${parseFloat(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, pageWidth - 15, finalY, { align: 'right' });

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
                ['Account Number', payment.accountNumber || 'N/A'],
                ['Bank', payment.bank || 'N/A'],
                ['Branch', payment.branch || 'N/A'],
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
        doc.text(`Payee: ${payment.vendor}`, 15, 55);
        doc.text(`Payment Mode: ${payment.paymentMode}`, 15, 62);
        doc.text(`Bank: ${payment.bank || 'N/A'}`, 15, 69);

        autoTable(doc, {
            startY: 80,
            head: [['Description', 'Amount']],
            body: [[payment.description, `${payment.currency} ${parseFloat(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`]],
            theme: 'grid',
            headStyles: { fillColor: [66, 66, 66] },
        });

        let finalY = doc.lastAutoTable.finalY + 10;

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

        // --- Budget Breakdown (if available) ---
        if (payment.budgetData) {
            doc.setFont('helvetica', 'bold');
            doc.text('BUDGET BREAKDOWN', 15, finalY);

            const bData = payment.budgetData;
            autoTable(doc, {
                startY: finalY + 5,
                head: [['Budget Line', 'Allocated', 'Spent to Date', 'Bal C/D', 'Request', 'Bal B/D']],
                body: [[
                    bData.budgetLine || 'N/A',
                    `$${(bData.balCD + (bData.request || 0) + (bData.totalSpendToDate || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, // Approximate allocated if not passed directly, or we can use balCD + spent
                    // Actually, let's use the formatted values if available or raw numbers
                    // The service returns formatted values like '$1,000.00'
                    // But for PDF we might want to control formatting.
                    // Let's use raw numbers if possible.
                    // Wait, VoucherBalanceService returns: balCD, request, balBD (numbers)
                    // It doesn't return allocatedAmount directly in the result object I saw in the file view?
                    // Let's check VoucherBalanceService.calculateVoucherBudgetImpact again.
                    // It returns: budgetLine, balCD, request, balBD.
                    // It does NOT return allocated or spentToDate in the *result* object.
                    // I should update PaymentGenerator to pass the raw balanceData as well, OR update calculateVoucherBudgetImpact to include them.
                    // Or I can just calculate them here: Allocated ~ Bal C/D + Spent (if I had spent).
                    // Actually, let's look at what I passed. I passed `impact`.
                    // `impact` has balCD, request, balBD.
                    // It does NOT have allocated or spent.
                    // I should probably pass the FULL data.
                    // Let's stick to what we have for now: Bal C/D, Request, Bal B/D are the most important.
                    // But the user asked for "budget allocated... spent... balance brought down... budget impact... budget carried down".
                    // I need ALL of them.
                    // I will update PaymentGenerator to pass the raw `balanceData` AND the `impact`.
                    // OR, I can just rely on the fact that `balCD` is the "Opening Balance" for this transaction.
                    // Let's check `VoucherBalanceService` again.
                    // `getBudgetBalanceForVoucher` returns `allocatedAmount`, `totalSpendToDate`, `balCD`.
                    // `calculateVoucherBudgetImpact` returns `balCD`, `request`, `balBD`.
                    // So I need to merge them.
                ]],
            });
            // Wait, I need to fix the data passing first.
            // I will assume for this step that I will fix the data passing in PaymentGenerator in the next step or I will merge it here.
            // Actually, I can't merge it here if I don't have it.
            // I will update this step to just render what I have, and then I will refine the data passing.
            // NO, I should do it right.
            // I will update PaymentGenerator to pass a merged object.
            // But I am already in the middle of editing DocumentGenerationService?
            // No, I am queuing tool calls.
            // I will update DocumentGenerationService to EXPECT the full data.
            // And I will update PaymentGenerator to PASS the full data.

            // Let's write the code assuming `payment.budgetData` has:
            // budgetLine, allocatedAmount, totalSpendToDate, balCD, request, balBD.

            // Re-reading VoucherBalanceService:
            // getBudgetBalanceForVoucher returns: { allocatedAmount, totalSpendToDate, balCD ... }
            // calculateVoucherBudgetImpact returns: { balCD, request, balBD ... }

            // So in PaymentGenerator, I should merge them.

            // Back to DocumentGenerationService code:

            // columns: Budget Line, Allocated, Spent, Bal C/D, Request, Bal B/D

            // body:
            // [
            //   bData.budgetLine,
            //   formatCurrency(bData.allocatedAmount),
            //   formatCurrency(bData.totalSpendToDate),
            //   formatCurrency(bData.balCD),
            //   formatCurrency(bData.request),
            //   formatCurrency(bData.balBD)
            // ]

            autoTable(doc, {
                startY: finalY + 5,
                head: [['Budget Line', 'Allocated', 'Spent', 'Bal C/D', 'Request', 'Bal B/D']],
                body: [[
                    bData.budgetLine || 'N/A',
                    `$${(bData.allocatedAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                    `$${(bData.totalSpendToDate || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                    `$${(bData.balCD || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                    `$${(bData.request || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                    `$${(bData.balBD || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                ]],
                theme: 'grid',
                headStyles: { fillColor: [66, 66, 66] },
                styles: { fontSize: 8 }
            });

            finalY = doc.lastAutoTable.finalY + 10;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`NET PAYABLE: ${payment.currency} ${parseFloat(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, pageWidth - 15, finalY, { align: 'right' });

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
        doc.text(`${payment.currency} ${parseFloat(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 15, 95);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('To the beneficiary details below:', 15, 110);
        autoTable(doc, {
            startY: 115,
            body: [
                ['Beneficiary Name', payment.vendor],
                ['Account Number', payment.accountNumber || 'N/A'],
                ['Bank', payment.bank || 'N/A'],
                ['Branch', payment.branch || 'N/A'],
                ['Description', payment.description]
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
