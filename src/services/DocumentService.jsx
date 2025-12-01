import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } from 'docx';
import * as XLSX from 'xlsx';

class DocumentService {
  
  // Generate Payment Schedule Document (Word)
  static async generatePaymentSchedule(data) {
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          // Header
          new Paragraph({
            children: [
              new TextRun({
                text: "PAYMENT SCHEDULE",
                bold: true,
                size: 28,
                font: "Arial"
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
          }),
          
          // Weekly Sheet Info
          new Paragraph({
            children: [
              new TextRun({
                text: `Weekly Sheet: ${data.weeklySheetName}`,
                size: 20,
                font: "Arial"
              })
            ],
            spacing: { after: 200 }
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `Generation Date: ${new Date(data.generationDate).toLocaleDateString()}`,
                size: 16,
                font: "Arial"
              })
            ],
            spacing: { after: 400 }
          }),
          
          // Summary Table
          new Paragraph({
            children: [
              new TextRun({
                text: "Payment Summary",
                bold: true,
                size: 18,
                font: "Arial"
              })
            ],
            spacing: { after: 200 }
          }),
          
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Total Payments", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Total Amount", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Currency", bold: true })] })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: data.totalPayments.toString() })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: data.totalAmount.toFixed(2) })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "GHS" })] })] })
                ]
              })
            ]
          }),
          
          new Paragraph({ spacing: { after: 400 } }),
          
          // Detailed Payments Table
          new Paragraph({
            children: [
              new TextRun({
                text: "Detailed Payments",
                bold: true,
                size: 18,
                font: "Arial"
              })
            ],
            spacing: { after: 200 }
          }),
          
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              // Header Row
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Vendor", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Invoice", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Description", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Amount", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Budget Line", bold: true })] })] })
                ]
              }),
              // Data Rows
              ...data.transactions.map(payment => 
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: payment.vendor || "" })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: payment.invoiceNo || "" })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: payment.description || "" })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: payment.amount || "0.00" })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: payment.budgetLine || "" })] })] })
                  ]
                })
              )
            ]
          }),
          
          new Paragraph({ spacing: { after: 400 } }),
          
          // Budget Summary
          new Paragraph({
            children: [
              new TextRun({
                text: "Budget Line Summary",
                bold: true,
                size: 18,
                font: "Arial"
              })
            ],
            spacing: { after: 200 }
          }),
          
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Budget Line", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Amount", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Percentage", bold: true })] })] })
                ]
              }),
              ...data.budgetSummary.map(budget => 
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: budget.budgetLine })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: budget.amount.toFixed(2) })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: budget.percentage.toFixed(1) + "%" })] })] })
                  ]
                })
              )
            ]
          })
        ]
      }]
    });

    // Generate and return the document as a blob
    const blob = await Packer.toBlob(doc);
    return blob;
  }

  // Generate Bank Instructions Document (Word)
  static async generateBankInstructions(data) {
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          // Header
          new Paragraph({
            children: [
              new TextRun({
                text: "BANK TRANSFER INSTRUCTIONS",
                bold: true,
                size: 28,
                font: "Arial"
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
          }),
          
          // Weekly Sheet Info
          new Paragraph({
            children: [
              new TextRun({
                text: `Weekly Sheet: ${data.weeklySheetName}`,
                size: 20,
                font: "Arial"
              })
            ],
            spacing: { after: 200 }
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `Generation Date: ${new Date(data.generationDate).toLocaleDateString()}`,
                size: 16,
                font: "Arial"
              })
            ],
            spacing: { after: 400 }
          }),
          
          // Total Amount
          new Paragraph({
            children: [
              new TextRun({
                text: `Total Transfer Amount: GHS ${data.totalAmount.toFixed(2)}`,
                bold: true,
                size: 18,
                font: "Arial"
              })
            ],
            spacing: { after: 400 }
          }),
          
          // Bank-specific instructions
          ...Object.entries(data.bankGroups).map(([bank, payments]) => [
            new Paragraph({
              children: [
                new TextRun({
                  text: `Bank: ${bank}`,
                  bold: true,
                  size: 16,
                  font: "Arial"
                })
              ],
              spacing: { after: 200 }
            }),
            
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Vendor", bold: true })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Account Details", bold: true })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Amount", bold: true })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Reference", bold: true })] })] })
                  ]
                }),
                ...payments.map(payment => 
                  new TableRow({
                    children: [
                      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: payment.vendor || "" })] })] }),
                      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: payment.bankAccount || "N/A" })] })] }),
                      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: payment.amount || "0.00" })] })] }),
                      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: payment.invoiceNo || "" })] })] })
                  ]
                  })
                )
              ]
            }),
            
            new Paragraph({ spacing: { after: 400 } })
          ]).flat()
        ]
      }]
    });

    const blob = await Packer.toBlob(doc);
    return blob;
  }

  // Generate Excel Summary (Excel)
  static async generateExcelSummary(data) {
    // Create workbook and worksheets
    const wb = XLSX.utils.book();
    
    // Summary Sheet
    const summaryData = [
      ["Payment Summary Report"],
      [""],
      ["Weekly Sheet", data.weeklySheetName],
      ["Generation Date", new Date(data.generationDate).toLocaleDateString()],
      [""],
      ["Total Payments", data.summary.totalPayments],
      ["Total Amount", data.summary.totalAmount],
      ["Average Payment", data.summary.averagePayment.toFixed(2)],
      [""],
      ["Budget Line Analysis"],
      ["Budget Line", "Amount", "Percentage"],
      ...data.budgetAnalysis.map(budget => [
        budget.budgetLine,
        budget.amount,
        budget.percentage.toFixed(1) + "%"
      ])
    ];
    
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");
    
    // Detailed Data Sheet
    const detailedHeaders = [
      "Batch ID",
      "Vendor",
      "Invoice No",
      "Description",
      "Amount",
      "Currency",
      "Budget Line",
      "Payment Mode",
      "Tax Type",
      "WHT Amount",
      "VAT Amount",
      "Finalization Date"
    ];
    
    const detailedData = [
      detailedHeaders,
      ...data.detailedData.map(payment => [
        payment.batchId || "",
        payment.vendor || "",
        payment.invoiceNo || "",
        payment.description || "",
        payment.amount || "0.00",
        payment.currency || "GHS",
        payment.budgetLine || "",
        payment.paymentMode || "",
        payment.taxType || "",
        payment.whtAmount || "0.00",
        payment.vatAmount || "0.00",
        new Date(payment.finalizationDate).toLocaleDateString()
      ])
    ];
    
    const detailedWs = XLSX.utils.aoa_to_sheet(detailedData);
    XLSX.utils.book_append_sheet(wb, detailedWs, "Detailed Payments");
    
    // Generate Excel file
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    return blob;
  }

  // Generate WHT Return Document (Word)
  static async generateWHTReturn(data) {
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          // Header
          new Paragraph({
            children: [
              new TextRun({
                text: "WITHHOLDING TAX RETURN",
                bold: true,
                size: 28,
                font: "Arial"
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
          }),
          
          // Company Info
          new Paragraph({
            children: [
              new TextRun({
                text: "MARGINS ID SYSTEMS APPLICATION LIMITED",
                bold: true,
                size: 18,
                font: "Arial"
              })
            ],
            spacing: { after: 200 }
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: "TIN: C0005254159",
                size: 16,
                font: "Arial"
              })
            ],
            spacing: { after: 200 }
          }),
          
          // Period Info
          new Paragraph({
            children: [
              new TextRun({
                text: `Weekly Sheet: ${data.weeklySheetName}`,
                size: 16,
                font: "Arial"
              })
            ],
            spacing: { after: 200 }
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `Generation Date: ${new Date(data.generationDate).toLocaleDateString()}`,
                size: 16,
                font: "Arial"
              })
            ],
            spacing: { after: 400 }
          }),
          
          // Total WHT
          new Paragraph({
            children: [
              new TextRun({
                text: `Total WHT Amount: GHS ${data.totalWHT.toFixed(2)}`,
                bold: true,
                size: 18,
                font: "Arial"
              })
            ],
            spacing: { after: 400 }
          }),
          
          // WHT Details Table
          new Paragraph({
            children: [
              new TextRun({
                text: "WHT Payment Details",
                bold: true,
                size: 18,
                font: "Arial"
              })
            ],
            spacing: { after: 200 }
          }),
          
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Vendor", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Invoice No", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Gross Amount", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "WHT Rate", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "WHT Amount", bold: true })] })] })
                ]
              }),
              ...data.whtPayments.map(payment => 
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: payment.vendor || "" })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: payment.invoiceNo || "" })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: payment.originalAmount || "0.00" })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "5%" })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: payment.whtAmount || "0.00" })] })] })
                  ]
                })
              )
            ]
          }),
          
          new Paragraph({ spacing: { after: 400 } }),
          
          // Vendor Summary
          new Paragraph({
            children: [
              new TextRun({
                text: "Vendor Summary",
                bold: true,
                size: 18,
                font: "Arial"
              })
            ],
            spacing: { after: 200 }
          }),
          
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Vendor", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Total Amount", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "WHT Amount", bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Payment Count", bold: true })] })] })
                ]
              }),
              ...data.vendorSummary.map(vendor => 
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: vendor.vendor })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: vendor.totalAmount.toFixed(2) })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: vendor.whtAmount.toFixed(2) })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: vendor.paymentCount.toString() })] })] })
                  ]
                })
              )
            ]
          })
        ]
      }]
    });

    const blob = await Packer.toBlob(doc);
    return blob;
  }

  // Generate Payment Voucher (Word)
  static async generatePaymentVoucher(data) {
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          // Header
          new Paragraph({
            children: [
              new TextRun({
                text: "PAYMENT VOUCHER",
                bold: true,
                size: 28,
                font: "Arial"
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
          }),
          
          // Company Info
          new Paragraph({
            children: [
              new TextRun({
                text: "MARGINS ID SYSTEMS APPLICATION LIMITED",
                bold: true,
                size: 18,
                font: "Arial"
              })
            ],
            spacing: { after: 200 }
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: "P.O. Box KN 785, Kaneshie - Accra, Ghana",
                size: 16,
                font: "Arial"
              })
            ],
            spacing: { after: 400 }
          }),
          
          // Voucher Details
          new Paragraph({
            children: [
              new TextRun({
                text: `Weekly Sheet: ${data.weeklySheetName}`,
                size: 16,
                font: "Arial"
              })
            ],
            spacing: { after: 200 }
          }),
          
          new Paragraph({
            children: [
              new TextRun({
                text: `Generation Date: ${new Date(data.generationDate).toLocaleDateString()}`,
                size: 16,
                font: "Arial"
              })
            ],
            spacing: { after: 400 }
          }),
          
          // Individual Vouchers
          ...data.vouchers.map((voucher, index) => [
            new Paragraph({
              children: [
                new TextRun({
                  text: `Voucher ${index + 1}`,
                  bold: true,
                  size: 16,
                  font: "Arial"
                })
              ],
              spacing: { after: 200 }
            }),
            
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Field", bold: true })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Value", bold: true })] })] })
                  ]
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Vendor" })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: voucher.vendor || "" })] })] })
                  ]
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Invoice No" })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: voucher.invoiceNo || "" })] })] })
                  ]
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Description" })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: voucher.description || "" })] })] })
                  ]
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Amount" })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: voucher.amount || "0.00" })] })] })
                  ]
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Budget Line" })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: voucher.budgetLine || "" })] })] })
                  ]
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Batch ID" })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: voucher.batchId || "" })] })] })
                  ]
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Finalization Date" })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: new Date(voucher.finalizationDate).toLocaleDateString() })] })] })
                  ]
                })
              ]
            }),
            
            new Paragraph({ spacing: { after: 400 } })
          ]).flat()
        ]
      }]
    });

    const blob = await Packer.toBlob(doc);
    return blob;
  }

  // Main document generation method
  static async generateDocument(docType, data) {
    try {
      switch (docType.id) {
        case 'payment_schedule':
          return await this.generatePaymentSchedule(data);
        case 'bank_instructions':
          return await this.generateBankInstructions(data);
        case 'payment_voucher':
          return await this.generatePaymentVoucher(data);
        case 'excel_summary':
          return await this.generateExcelSummary(data);
        case 'wht_return':
          return await this.generateWHTReturn(data);
        default:
          throw new Error(`Unknown document type: ${docType.id}`);
      }
    } catch (error) {
      console.error('Document generation error:', error);
      throw error;
    }
  }

  // Create download link for generated document
  static createDownloadLink(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

export default DocumentService; 