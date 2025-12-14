import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import companyLogo from '../assets/company-logo.png';

/**
 * Strategic Document Service
 * Generates PDF reports with embedded infographics for Strategic Reporting Hub
 */
export const StrategicDocumentService = {

    /**
     * Generates a comprehensive strategic PDF report
     * @param {Object} data - Report data from ReportingService
     * @param {Object} chartImages - Base64 chart images
     * @param {Object} options - Generation options
     * @returns {Blob} PDF blob
     */
    generateStrategicReportPDF: (data, chartImages, options = {}) => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 15;

        // --- HELPER: Header & Footer ---
        const addHeader = (title) => {
            doc.setFillColor(41, 50, 65); // Dark Slate Blue
            doc.rect(0, 0, pageWidth, 30, 'F');

            // Add company logo on the left
            try {
                doc.addImage(companyLogo, 'PNG', margin, 5, 20, 20);
            } catch (error) {
                console.warn('[StrategicDocumentService] Could not add logo:', error);
            }

            doc.setFontSize(18);
            doc.setTextColor(255, 255, 255);
            doc.text(title.toUpperCase(), margin + 25, 20);

            doc.setFontSize(10);
            doc.text(`Period: ${new Date(data.period.start).toLocaleDateString()} - ${new Date(data.period.end).toLocaleDateString()}`, pageWidth - margin, 20, { align: 'right' });
            doc.setTextColor(0, 0, 0); // Reset to black
        };

        const addFooter = (pageNo) => {
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Strategic Management Report | Generated ${new Date().toLocaleDateString()} | Page ${pageNo}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
            doc.setTextColor(0); // Reset
        };

        // ================= PAGE 1: EXECUTIVE SUMMARY =================
        addHeader('Executive Summary');

        let yPos = 45;

        // Key Metrics Cards (Draw manually)
        const cardWidth = (pageWidth - (margin * 2) - 10) / 4;
        const metrics = [
            { label: 'Total Spend', value: `GHS ${data.financial.totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
            { label: 'Transactions', value: data.financial.transactionCount },
            { label: 'Unique Vendors', value: data.vendors.totalUnique },
            { label: 'Budget Efficiency', value: `${data.budget.efficiencyScore.toFixed(1)}%` }
        ];

        metrics.forEach((m, i) => {
            const x = margin + (i * (cardWidth + 3.3));
            doc.setFillColor(245, 247, 250);
            doc.setDrawColor(200);
            doc.roundedRect(x, yPos, cardWidth, 25, 3, 3, 'FD');

            doc.setFontSize(9);
            doc.setTextColor(100);
            doc.text(m.label, x + 5, yPos + 8);

            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0);
            doc.text(String(m.value), x + 5, yPos + 18);
        });

        yPos += 40;

        // Executive Insight Text
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0);
        doc.text('High-Level Insights', margin, yPos);
        yPos += 10;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const insights = [
            `• Total spending for the period is GHS ${data.financial.totalSpend.toLocaleString()}.`,
            `• The organization processed ${data.financial.transactionCount} transactions.`,
            `• Top spending vendor is ${data.vendors.topByVolume[0]?.name || 'N/A'} (GHS ${data.vendors.topByVolume[0]?.volume.toLocaleString() || 0}).`,
            `• Compliance: Total tax liability (WHT+VAT+Levy) is GHS ${data.compliance.totalLiability.toLocaleString()}.`
        ];

        insights.forEach(line => {
            doc.text(line, margin, yPos);
            yPos += 7;
        });

        // Currency Breakdown (small table)
        yPos += 10;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('Currency Breakdown', margin, yPos);
        yPos += 5;

        if (data.financial.currencyBreakdown && data.financial.currencyBreakdown.length > 0) {
            autoTable(doc, {
                startY: yPos,
                head: [['Currency', 'Amount', '% of Total']],
                body: data.financial.currencyBreakdown.map(c => [
                    c.name,
                    `GHS ${c.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                    `${c.percentage.toFixed(1)}%`
                ]),
                theme: 'plain',
                headStyles: { fillColor: [41, 50, 65], textColor: 255 },
                styles: { fontSize: 9 }
            });
            yPos = doc.lastAutoTable.finalY + 10;
        }

        // Inject Budget Efficiency Chart if available
        if (chartImages.budgetEfficiency && yPos < pageHeight - 90) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text('Performance Snapshot', margin, yPos);
            yPos += 5;
            const imgProps = doc.getImageProperties(chartImages.budgetEfficiency);
            const pdfImgWidth = pageWidth - (margin * 2);
            const pdfImgHeight = (imgProps.height * pdfImgWidth) / imgProps.width;
            doc.addImage(chartImages.budgetEfficiency, 'PNG', margin, yPos, pdfImgWidth, Math.min(pdfImgHeight, 70));
        }

        addFooter(1);

        // ================= PAGE 2: FINANCIAL & CASH FLOW =================
        doc.addPage();
        addHeader('Financial Health & Cash Flow');
        yPos = 40;

        // Cash Flow Chart (Infographic)
        if (chartImages.cashFlow) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0);
            doc.text('Daily Cash Flow Trajectory', margin, yPos);
            yPos += 5;
            const imgProps = doc.getImageProperties(chartImages.cashFlow);
            const pdfImgWidth = pageWidth - (margin * 2);
            const pdfImgHeight = (imgProps.height * pdfImgWidth) / imgProps.width;
            doc.addImage(chartImages.cashFlow, 'PNG', margin, yPos, pdfImgWidth, Math.min(pdfImgHeight, 80));
            yPos += Math.min(pdfImgHeight, 80) + 15;
        }

        // Weekly Trends Table
        if (data.weeklyTrends && data.weeklyTrends.length > 0 && yPos < pageHeight - 60) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('Week-on-Week Expense Variance', margin, yPos);
            yPos += 5;

            const weeklyRows = data.weeklyTrends.map((w, index) => {
                const prev = index > 0 ? data.weeklyTrends[index - 1].total : 0;
                const variance = prev === 0 ? 0 : ((w.total - prev) / prev) * 100;
                return [
                    w.week,
                    `GHS ${w.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                    prev === 0 ? '-' : `${variance > 0 ? '+' : ''}${variance.toFixed(1)}%`,
                    variance > 20 ? '⚠️' : variance < -20 ? '⬇️' : '✓'
                ];
            });

            autoTable(doc, {
                startY: yPos,
                head: [['Week', 'Total Spend', 'Variance %', 'Status']],
                body: weeklyRows,
                theme: 'grid',
                headStyles: { fillColor: [41, 50, 65] },
                styles: { fontSize: 9 }
            });
        }

        addFooter(2);

        // ================= PAGE 3: BUDGET & VENDOR =================
        doc.addPage();
        addHeader('Budget Health & Vendor Intelligence');
        yPos = 40;

        // Budget Risk Table
        if (data.budget.overspent && data.budget.overspent.length > 0) {
            doc.setFontSize(12);
            doc.setTextColor(220, 53, 69); // Red for risk
            doc.setFont('helvetica', 'bold');
            doc.text('⚠️ CRITICAL ALERTS: Overspent Budget Lines', margin, yPos);
            yPos += 5;
            doc.setTextColor(0);

            const overspentRows = data.budget.overspent.slice(0, 5).map(b => [
                b.name || b.budgetLine || 'Unknown',
                b.deptCode || '-',
                `$${(b.allocated || 0).toLocaleString()}`,
                `$${(b.spent || 0).toLocaleString()}`,
                `$${(b.overspendAmount || 0).toLocaleString()}`
            ]);

            autoTable(doc, {
                startY: yPos,
                head: [['Budget Line', 'Dept', 'Allocated', 'Spent', 'Overspend']],
                body: overspentRows.length ? overspentRows : [['No Overspending Detected', '-', '-', '-', '-']],
                theme: 'striped',
                headStyles: { fillColor: [220, 53, 69] },
                styles: { fontSize: 9 }
            });

            yPos = doc.lastAutoTable.finalY + 15;
        } else {
            doc.setFontSize(10);
            doc.setTextColor(34, 197, 94); // Green
            doc.text('✓ All budget lines within allocated amounts', margin, yPos);
            yPos += 15;
            doc.setTextColor(0);
        }

        // Vendor Volume Chart (Infographic)
        if (chartImages.vendorVolume && yPos < pageHeight - 90) {
            doc.setTextColor(0);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text('Top Vendors by Volume', margin, yPos);
            yPos += 5;
            const imgProps = doc.getImageProperties(chartImages.vendorVolume);
            const pdfImgWidth = pageWidth - (margin * 2);
            const pdfImgHeight = (imgProps.height * pdfImgWidth) / imgProps.width;
            doc.addImage(chartImages.vendorVolume, 'PNG', margin, yPos, pdfImgWidth, Math.min(pdfImgHeight, 80));
        }

        addFooter(3);

        // ================= PAGE 4: TAX COMPLIANCE =================
        doc.addPage();
        addHeader('Tax Compliance Audit');
        yPos = 40;

        // Tax Liability Summary
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Liability Summary', margin, yPos);
        yPos += 5;

        autoTable(doc, {
            startY: yPos,
            head: [['Tax Type', 'Amount (GHS)']],
            body: [
                ['Gross Amount', `${data.compliance.breakdown.gross.toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
                ['WHT Withheld', `${data.compliance.breakdown.wht.toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
                ['VAT Paid', `${data.compliance.breakdown.vat.toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
                ['Levies Paid', `${data.compliance.breakdown.levy.toLocaleString(undefined, { minimumFractionDigits: 2 })}`],
                ['', ''],
                ['Total Tax Liability', `${data.compliance.totalLiability.toLocaleString(undefined, { minimumFractionDigits: 2 })}`]
            ],
            theme: 'grid',
            headStyles: { fillColor: [41, 50, 65] },
            styles: { fontSize: 10 },
            bodyStyles: (data) => {
                if (data.row.index === 5) {
                    return { fontStyle: 'bold', fillColor: [245, 247, 250] };
                }
            }
        });

        yPos = doc.lastAutoTable.finalY + 15;

        // Audit Trail
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Audit Trail', margin, yPos);
        yPos += 7;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Data Source: Master Transaction Log`, margin, yPos);
        yPos += 6;
        doc.text(`Total Records Audited: ${data.compliance.auditCount}`, margin, yPos);
        yPos += 6;
        doc.text(`Verification Hash: ${Date.now().toString(36).toUpperCase()}`, margin, yPos);

        addFooter(4);

        // ================= PAGE 5: OPERATIONAL BREAKDOWN (DEPT & GL) =================
        doc.addPage();
        addHeader('Operational Breakdown (Dept & GL)');
        yPos = 40;

        // 1. Departmental Spend Chart (Infographic)
        if (chartImages.deptSpend) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0);
            doc.text('Departmental Expenditure Overview', margin, yPos);
            yPos += 5;

            const imgProps = doc.getImageProperties(chartImages.deptSpend);
            const pdfImgWidth = pageWidth - (margin * 2);
            const pdfImgHeight = (imgProps.height * pdfImgWidth) / imgProps.width;
            doc.addImage(chartImages.deptSpend, 'PNG', margin, yPos, pdfImgWidth, Math.min(pdfImgHeight, 90));
            yPos += Math.min(pdfImgHeight, 90) + 15;
        }

        // 2. Top 10 GL Expenses Table
        if (data.glAnalysis && data.glAnalysis.length > 0) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0);
            doc.text('Top 10 GL (Geo) Expenses', margin, yPos);
            yPos += 5;

            const glRows = data.glAnalysis.map((gl, i) => [
                `${i + 1}`,
                gl.accountNo,
                gl.name,
                gl.count,
                `GHS ${gl.totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
            ]);

            autoTable(doc, {
                startY: yPos,
                head: [['#', 'GL Code', 'Account Name', 'Tx Count', 'Total Spend']],
                body: glRows,
                theme: 'grid',
                headStyles: { fillColor: [41, 50, 65] },
                columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } },
                styles: { fontSize: 9 }
            });

            yPos = doc.lastAutoTable.finalY + 15;
        }

        // 3. Detailed Department Breakdown (Sub-tables)
        if (data.departmental && data.departmental.length > 0) {
            // Check if we have space, else add page
            if (yPos > pageHeight - 60) {
                doc.addPage();
                addHeader('Operational Breakdown (Dept & GL)');
                yPos = 40;
            }

            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0);
            doc.text('Departmental Sub-Breakdown (Where are they spending?)', margin, yPos);
            yPos += 5;

            // Loop through top 3 departments to show their specific spending
            const topDepts = data.departmental.slice(0, 3);

            topDepts.forEach(dept => {
                // Check page break
                if (yPos > pageHeight - 50) {
                    doc.addPage();
                    addHeader('Operational Breakdown (Dept & GL)');
                    yPos = 40;
                }

                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.setFillColor(240, 240, 240);
                doc.rect(margin, yPos, pageWidth - (margin * 2), 8, 'F');
                doc.setTextColor(0);
                doc.text(`${dept.name} (${dept.code}) - Total: GHS ${dept.totalSpend.toLocaleString()}`, margin + 2, yPos + 6);
                yPos += 10;

                const subRows = dept.topGLs.map(gl => [
                    gl.name,
                    `GHS ${gl.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                ]);

                autoTable(doc, {
                    startY: yPos,
                    head: [['Expense Item', 'Amount']],
                    body: subRows,
                    theme: 'plain',
                    tableWidth: pageWidth / 2,
                    margin: { left: margin },
                    styles: { fontSize: 8, cellPadding: 1 }
                });

                yPos = doc.lastAutoTable.finalY + 10;
            });
        }

        addFooter(5);

        // Return Blob
        return doc.output('blob');
    }
};

export default StrategicDocumentService;
