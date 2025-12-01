import React, { useState, useRef, useEffect } from 'react';
import { Download, Upload, FileSpreadsheet, AlertCircle, CheckCircle, Info, RefreshCw } from 'lucide-react';
import { 
  exportWeeklySheetTemplate, 
  importWeeklySheetTemplate, 
  generateSampleTemplate,
  updateValidationLists
} from '../services/ExcelService.js';
import { calculateTotalTaxes, calculatePartialPayment } from '../services/FinancialEngine.js';

const ExcelImportExport = ({ 
  sheetName, 
  existingPayments = [], 
  onImportComplete, 
  onExportComplete,
  db,
  userId,
  validationData = {}
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState(null);
  const [importSummary, setImportSummary] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  
  const fileInputRef = useRef(null);

  // Update validation lists when validationData changes
  useEffect(() => {
    console.log('ExcelImportExport: validationData changed:', validationData);
    console.log('ExcelImportExport: validationData keys:', validationData ? Object.keys(validationData) : 'undefined');
    console.log('ExcelImportExport: validationData.paymentModes:', validationData?.paymentModes);
    console.log('ExcelImportExport: validationData.procurementTypes:', validationData?.procurementTypes);
    console.log('ExcelImportExport: validationData.taxTypes:', validationData?.taxTypes);
    console.log('ExcelImportExport: validationData.banks:', validationData?.banks);
    console.log('ExcelImportExport: validationData.currencies:', validationData?.currencies);
    console.log('ExcelImportExport: validationData.budgetLines:', validationData?.budgetLines);
    
    if (validationData && Object.keys(validationData).length > 0) {
      updateValidationLists(validationData);
      console.log('Updated Excel validation lists with system validation data');
    } else {
      console.log('No validation data provided, using defaults');
      updateValidationLists({}); // This will use the default lists
    }
  }, [validationData]);

  // Force validation list update on component mount
  useEffect(() => {
    console.log('ExcelImportExport: Component mounted, updating validation lists');
    updateValidationLists(validationData || {});
  }, []);

  // Export functions
  const handleExportTemplate = async (includeExisting = true) => {
    setIsExporting(true);
    try {
      const payments = includeExisting ? existingPayments : [];
      const blob = exportWeeklySheetTemplate(sheetName, payments, { emptyRows: 15 });
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sheetName}_Template_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      setImportStatus({
        type: 'success',
        message: `Template exported successfully! File: ${a.download}`,
        details: `Exported ${payments.length} existing payments with 15 empty rows for new entries.`
      });
      
      if (onExportComplete) {
        onExportComplete({ success: true, fileName: a.download, paymentCount: payments.length });
      }
      
    } catch (error) {
      console.error('Export error:', error);
      setImportStatus({
        type: 'error',
        message: 'Failed to export template',
        details: error.message
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportSample = async () => {
    setIsExporting(true);
    try {
      const blob = generateSampleTemplate(sheetName);
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sheetName}_Sample_Template.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      setImportStatus({
        type: 'success',
        message: 'Sample template exported successfully!',
        details: 'This template includes sample data to help you understand the format.'
      });
      
    } catch (error) {
      console.error('Sample export error:', error);
      setImportStatus({
        type: 'error',
        message: 'Failed to export sample template',
        details: error.message
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Import functions
  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    console.log('=== EXCEL IMPORT DEBUG ===');
    console.log('File selected:', file.name, file.size, 'bytes');
    console.log('Sheet name expected:', sheetName);

    setIsImporting(true);
    setImportStatus(null);
    setImportSummary(null);
    setShowPreview(false);

    try {
      const result = await importWeeklySheetTemplate(file, sheetName);
      
      if (result.success) {
        // Process the imported data to calculate taxes and amounts
        const processedPayments = await processImportedPayments(result.payments);
        
        setImportSummary({
          totalPayments: result.summary.totalPayments,
          totalAmount: result.summary.totalAmount,
          currencies: result.summary.currencies,
          budgetLines: result.summary.budgetLines,
          processedPayments
        });
        
        setPreviewData({
          original: result.payments,
          processed: processedPayments
        });
        
        setShowPreview(true);
        
        setImportStatus({
          type: 'success',
          message: `File imported successfully!`,
          details: `Found ${result.summary.totalPayments} payments totaling ${result.summary.totalAmount.toLocaleString()} ${result.summary.currencies.join(', ')}`
        });
        
      } else {
        setImportStatus({
          type: 'error',
          message: 'Import failed',
          details: result.error
        });
      }
      
    } catch (error) {
      console.error('Import error:', error);
      setImportStatus({
        type: 'error',
        message: 'Failed to import file',
        details: error.message
      });
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Helper function to get dynamic rates for a payment - PERMANENTLY INTEGRATED
  const getDynamicRatesForPayment = (payment, validationData) => {
    if (!validationData || !payment) return {};
    
    // PERMANENTLY INTEGRATED - Get WHT rate from procurement type
    let whtRate = 0;
    if (validationData.procurementTypes && payment.procurementType) {
      const procurementItem = validationData.procurementTypes.find(
        item => item.value === payment.procurementType
      );
      if (procurementItem && procurementItem.rate) {
        whtRate = (procurementItem.rate / 100); // Convert percentage to decimal
        console.log(`[ExcelImportExport] Found WHT rate for ${payment.procurementType}: ${procurementItem.rate}% (PERMANENTLY INTEGRATED)`);
      }
    }
    
    // PERMANENTLY INTEGRATED - Get Levy rate from tax type
    let levyRate = 0;
    if (validationData.taxTypes && payment.taxType) {
      const taxItem = validationData.taxTypes.find(
        item => item.value === payment.taxType
      );
      if (taxItem && taxItem.rate) {
        levyRate = (taxItem.rate / 100); // Convert percentage to decimal
        console.log(`[ExcelImportExport] Found Levy rate for ${payment.taxType}: ${taxItem.rate}% (PERMANENTLY INTEGRATED)`);
      }
    }
    
    // Rates from validation data - no hardcoded defaults
    // If rate is 0, it means it wasn't found in validation collection
    const rates = {
      whtRate: whtRate || 0, // Rate from validation collection (0 if not found)
      levyRate: levyRate || 0, // Rate from validation collection (0 if not found)
      vatRate: 0.15, // Standard VAT rate (from global settings)
      momoRate: 0.01, // Standard MoMo charge rate (from global settings)
      integration: 'DATABASE_ONLY'
    };
    
    if (whtRate === 0) {
      console.warn(`[ExcelImportExport] WHT rate not found in validation data for ${payment.procurementType}. Please add it to validation collection.`);
    }
    if (levyRate === 0 && payment.taxType) {
      console.warn(`[ExcelImportExport] Levy rate not found in validation data for ${payment.taxType}. Please add it to validation collection.`);
    }
    
    console.log(`[ExcelImportExport] Final rates for payment (PERMANENTLY INTEGRATED):`, rates);
    return rates;
  };

  const processImportedPayments = async (payments) => {
    return payments.map(payment => {
      try {
        // Calculate taxes using FinancialEngine with dynamic rates
        const transaction = {
          fullPretax: parseFloat(payment.fullPretax) || 0,
          procurementType: payment.procurementType || 'SERVICES',
          taxType: payment.taxType || 'STANDARD',
          vatDecision: payment.vatDecision || 'NO',
          paymentMode: payment.paymentMode || 'BANK TRANSFER',
          currency: payment.currency || 'GHS',
          fxRate: parseFloat(payment.fxRate) || 1
        };

        // Get dynamic rates for WHT and Levy calculations
        const rates = getDynamicRatesForPayment(payment, validationData);
        console.log('[ExcelImportExport] Using dynamic rates for payment:', {
          procurementType: payment.procurementType,
          taxType: payment.taxType,
          rates
        });

        const calculation = calculateTotalTaxes(transaction, rates);
        
        // Enhanced logging for WHT calculation debugging
        console.log(`[ExcelImportExport] WHT Calculation for payment:`, {
          vendor: payment.vendor,
          procurementType: payment.procurementType,
          taxType: payment.taxType,
          currency: payment.currency,
          preTaxAmount: transaction.fullPretax,
          whtRate: rates.whtRate,
          whtAmount: calculation.wht,
          levyRate: rates.levyRate,
          levyAmount: calculation.levy,
          vatAmount: calculation.vat,
          netPayable: calculation.netPayable
        });
        
        // Calculate partial payment if needed
        let finalAmount = calculation.netPayable;
        if (payment.paymentPercentage && payment.paymentPercentage < 100) {
          const partialCalculation = calculatePartialPayment(transaction, payment.paymentPercentage);
          finalAmount = partialCalculation.netPayable;
        }

        // Calculate USD budget impact
        let usdImpact = 0;
        if (transaction.currency === 'USD') {
          usdImpact = finalAmount;
        } else if (transaction.fxRate > 0) {
          usdImpact = finalAmount / transaction.fxRate;
        }

        return {
          ...payment,
          whtAmount: calculation.wht,
          levyAmount: calculation.levy,
          vatAmount: calculation.vat,
          momoCharge: calculation.momoCharge,
          subtotal: calculation.fullPretax + calculation.levy + calculation.vat,
          netPayable: calculation.netPayable,
          amountThisTransaction: finalAmount,
          budgetImpactUSD: usdImpact,
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
      } catch (error) {
        console.error('Error processing payment:', error);
        return {
          ...payment,
          error: error.message,
          status: 'error'
        };
      }
    });
  };

  const handleConfirmImport = async () => {
    if (!importSummary || !importSummary.processedPayments) return;
    
    try {
      // Call the parent component's enhanced import handler
      if (onImportComplete) {
        const result = await onImportComplete(importSummary.processedPayments);
        
        if (result && result.success) {
          setImportStatus({
            type: 'success',
            message: 'Payments imported and saved successfully!',
            details: result.message || `${importSummary.processedPayments.length} payments have been added to the database.`
          });
          
          // Reset the component state
          setShowPreview(false);
          setImportSummary(null);
          setPreviewData(null);
          
        } else {
          setImportStatus({
            type: 'error',
            message: 'Failed to save payments',
            details: result?.error || 'Unknown error occurred while saving to database.'
          });
        }
      }
      
    } catch (error) {
      console.error('Error saving payments:', error);
      setImportStatus({
        type: 'error',
        message: 'Failed to save payments',
        details: error.message
      });
    }
  };

  const handleCancelImport = () => {
    setShowPreview(false);
    setImportSummary(null);
    setPreviewData(null);
    setImportStatus(null);
  };

  const clearStatus = () => {
    setImportStatus(null);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-gray-800 flex items-center">
          <FileSpreadsheet className="mr-2 text-blue-600" size={24} />
          Excel Import/Export
        </h3>
        <div className="text-sm text-gray-500">
          Sheet: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{sheetName}</span>
        </div>
      </div>

      {/* Status Messages */}
      {importStatus && (
        <div className={`mb-6 p-4 rounded-lg border ${
          importStatus.type === 'success' 
            ? 'bg-green-50 border-green-200 text-green-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {importStatus.type === 'success' ? (
                <CheckCircle className="mr-2" size={20} />
              ) : (
                <AlertCircle className="mr-2" size={20} />
              )}
              <div>
                <div className="font-semibold">{importStatus.message}</div>
                {importStatus.details && (
                  <div className="text-sm mt-1">{importStatus.details}</div>
                )}
              </div>
            </div>
            <button
              onClick={clearStatus}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Export Section */}
      <div className="mb-8">
        <h4 className="text-lg font-medium text-gray-700 mb-4 flex items-center">
          <Download className="mr-2 text-green-600" size={20} />
          Export Templates
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => handleExportTemplate(true)}
            disabled={isExporting}
            className="flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isExporting ? (
              <RefreshCw className="mr-2 animate-spin" size={20} />
            ) : (
              <Download className="mr-2" size={20} />
            )}
            Export with Existing Data
          </button>
          
          <button
            onClick={() => handleExportTemplate(false)}
            disabled={isExporting}
            className="flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isExporting ? (
              <RefreshCw className="mr-2 animate-spin" size={20} />
            ) : (
              <Download className="mr-2" size={20} />
            )}
            Export Empty Template
          </button>
          
          <button
            onClick={handleExportSample}
            disabled={isExporting}
            className="flex items-center justify-center px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isExporting ? (
              <RefreshCw className="mr-2 animate-spin" size={20} />
            ) : (
              <FileSpreadsheet className="mr-2" size={20} />
            )}
            Export Sample Template
          </button>
        </div>
        
        <div className="mt-3 text-sm text-gray-600">
          <Info className="inline mr-1" size={16} />
          Templates include instructions and validation. Choose "with Existing Data" to pre-populate current payments.
        </div>
        
        <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start">
            <Info className="mr-2 text-blue-600 mt-0.5" size={16} />
            <div className="text-sm text-blue-800">
              <div className="font-semibold mb-1">Automatic Calculations:</div>
              <div>Tax amounts (WHT, Levy, VAT), subtotals, and budget impact are automatically calculated in Excel. 
              Users only need to fill in basic payment information - the system handles all financial calculations.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Import Section */}
      <div className="mb-6">
        <h4 className="text-lg font-medium text-gray-700 mb-4 flex items-center">
          <Upload className="mr-2 text-orange-600" size={20} />
          Import Filled Template
        </h4>
        
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
            disabled={isImporting}
          />
          
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center justify-center mx-auto px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isImporting ? (
              <RefreshCw className="mr-2 animate-spin" size={20} />
            ) : (
              <Upload className="mr-2" size={20} />
            )}
            {isImporting ? 'Processing...' : 'Select Excel File'}
          </button>
          
          <div className="mt-3 text-sm text-gray-600">
            Upload your filled Excel template to import payment data
          </div>
        </div>
      </div>

      {/* Import Preview */}
      {showPreview && previewData && (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h5 className="font-medium text-blue-800 mb-3">Import Preview</h5>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-sm">
              <span className="font-medium">Total Payments:</span> {importSummary.totalPayments}
            </div>
            <div className="text-sm">
              <span className="font-medium">Total Amount:</span> {importSummary.totalAmount.toLocaleString()}
            </div>
            <div className="text-sm">
              <span className="font-medium">Currencies:</span> {importSummary.currencies.join(', ')}
            </div>
            <div className="text-sm">
              <span className="font-medium">Budget Lines:</span> {importSummary.budgetLines.length}
            </div>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={handleConfirmImport}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
            >
              Confirm Import
            </button>
            <button
              onClick={handleCancelImport}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h5 className="font-medium text-gray-700 mb-2 flex items-center">
          <Info className="mr-2 text-gray-600" size={16} />
          How to Use
        </h5>
        <div className="text-sm text-gray-600 space-y-1">
          <div>1. <strong>Export</strong> a template (with or without existing data)</div>
          <div>2. <strong>Fill</strong> the template in Excel with your payment information</div>
          <div>3. <strong>Save</strong> the Excel file</div>
          <div>4. <strong>Import</strong> the filled template back to the system</div>
          <div>5. <strong>Review</strong> the preview and confirm the import</div>
        </div>
      </div>
    </div>
  );
};

export default ExcelImportExport;
