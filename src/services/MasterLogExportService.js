import { getDocs, collection, query, orderBy, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';

/**
 * Master Log Export Service
 * Handles exporting master log data in various formats (CSV, Excel)
 * Exports data at transaction level with comprehensive details
 */
export class MasterLogExportService {

  /**
   * Export master log data to Excel with comprehensive fields matching VBA system
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Object} filters - Optional filters
   * @param {string} format - Export format ('xlsx', 'csv')
   * @returns {Promise<Blob>} Exported file blob
   */
  static async exportMasterLogToExcel(db, appId, filters = {}, format = 'xlsx') {
    try {
      console.log('[MasterLogExportService] Exporting master log data to Excel');

      // Get master log data
      const entries = await this.getMasterLogData(db, appId, filters);

      if (entries.length === 0) {
        throw new Error('No master log data found for export');
      }

      // Transform data to match VBA system structure
      const transformedData = this.transformDataForExport(entries);

      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(transformedData);

      // Set column headers to match VBA system exactly
      const headers = [
        'LogTimestamp',
        'TransactionID',
        'FinalizationDate',
        'SourceWeeklySheet',
        'OriginalSheetRow',
        'InvoiceNo',
        'OriginalInvoiceReference',
        'VendorName',
        'Description',
        'BudgetLine',
        'IsPartialPayment',
        'PaymentPercentage',
        'OriginalFullPreTax_Inv',
        'FullNetPayable_Inv',
        'PreTax_ThisTx',
        'WHT_Type_ThisTx',
        'WHT_Rate_ThisTx',
        'WHT_Amount_ThisTx',
        'Levy_Amount_ThisTx',
        'VAT_Amount_ThisTx',
        'MoMoCharge_ThisTx',
        'Subtotal_ThisTx',
        'NetPayable_ThisTx',
        'Currency_Tx',
        'BudgetImpactUSD_ThisTx',
        'BankPaidFrom',
        'PaymentMode_Tx',
        'UserFinalized',
        'ManualStatusAtFinalization',
        'ScheduleArchiveRef',
        'FX_Rate',
        'WeeklySheetID',
        'VoucherID',
        'BatchID'
      ];

      // Set column headers
      XLSX.utils.sheet_add_aoa(worksheet, [headers], { origin: 'A1' });

      // Auto-size columns
      const columnWidths = headers.map(header => {
        // Calculate appropriate width based on header length and content
        const maxLength = Math.max(
          header.length,
          ...transformedData.map(row => String(row[header] || '').length)
        );
        return Math.min(Math.max(maxLength + 2, 10), 50); // Min 10, Max 50
      });

      worksheet['!cols'] = columnWidths.map(width => ({ width }));

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'MasterLogData');

      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const filename = `MasterLog_Export_${timestamp}.${format}`;

      // Export to blob
      const blob = XLSX.write(workbook, { bookType: format, type: 'blob' });

      console.log(`[MasterLogExportService] Successfully exported ${transformedData.length} records to ${format}`);
      return { blob, filename };

    } catch (error) {
      console.error('[MasterLogExportService] Error exporting master log to Excel:', error);
      throw new Error(`Export failed: ${error.message}`);
    }
  }

  /**
   * Export master log data to CSV format
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Object} filters - Optional filters
   * @returns {Promise<Blob>} Exported CSV blob
   */
  static async exportMasterLogToCSV(db, appId, filters = {}) {
    try {
      console.log('[MasterLogExportService] Exporting master log data to CSV');

      // Get master log data
      const entries = await this.getMasterLogData(db, appId, filters);

      if (entries.length === 0) {
        throw new Error('No master log data found for export');
      }

      // Transform data to match VBA system structure
      const transformedData = this.transformDataForExport(entries);

      // Create CSV content
      const headers = [
        'LogTimestamp',
        'TransactionID',
        'FinalizationDate',
        'SourceWeeklySheet',
        'OriginalSheetRow',
        'InvoiceNo',
        'OriginalInvoiceReference',
        'VendorName',
        'Description',
        'BudgetLine',
        'IsPartialPayment',
        'PaymentPercentage',
        'OriginalFullPreTax_Inv',
        'FullNetPayable_Inv',
        'PreTax_ThisTx',
        'WHT_Type_ThisTx',
        'WHT_Rate_ThisTx',
        'WHT_Amount_ThisTx',
        'Levy_Amount_ThisTx',
        'VAT_Amount_ThisTx',
        'MoMoCharge_ThisTx',
        'Subtotal_ThisTx',
        'NetPayable_ThisTx',
        'Currency_Tx',
        'BudgetImpactUSD_ThisTx',
        'BankPaidFrom',
        'PaymentMode_Tx',
        'UserFinalized',
        'ManualStatusAtFinalization',
        'ScheduleArchiveRef',
        'FX_Rate',
        'WeeklySheetID',
        'VoucherID',
        'BatchID'
      ];

      // Create CSV rows
      const csvRows = [
        headers.join(','), // Header row
        ...transformedData.map(row =>
          headers.map(header => {
            const value = row[header];
            // Escape CSV values properly
            if (value === null || value === undefined) return '';
            const stringValue = String(value);
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          }).join(',')
        )
      ];

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const filename = `MasterLog_Export_${timestamp}.csv`;

      console.log(`[MasterLogExportService] Successfully exported ${transformedData.length} records to CSV`);
      return { blob, filename };

    } catch (error) {
      console.error('[MasterLogExportService] Error exporting master log to CSV:', error);
      throw new Error(`CSV export failed: ${error.message}`);
    }
  }

  /**
   * Get master log data from Firestore
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} Array of master log entries
   */
  static async getMasterLogData(db, appId, filters = {}) {
    try {
      console.log('[MasterLogExportService] Fetching master log data with filters:', filters);

      // ✅ FIX: Use correct collection path (matches where MasterLogService stores data)
      const collectionPath = `artifacts/${appId}/public/data/masterLog`;
      console.log('[MasterLogExportService] Using collection path:', collectionPath);

      let q = collection(db, collectionPath);

      // Build query with filters
      const queryConstraints = [];

      if (filters.budgetLine) {
        queryConstraints.push(where('budgetLine', '==', filters.budgetLine));
      }
      if (filters.vendor) {
        queryConstraints.push(where('vendorName', '==', filters.vendor));
      }
      if (filters.dateFrom) {
        queryConstraints.push(where('finalizationDate', '>=', filters.dateFrom));
      }
      if (filters.dateTo) {
        queryConstraints.push(where('finalizationDate', '<=', filters.dateTo));
      }
      if (filters.currency) {
        queryConstraints.push(where('currency_Tx', '==', filters.currency));
      }
      if (filters.isPartialPayment !== undefined) {
        queryConstraints.push(where('isPartialPayment', '==', filters.isPartialPayment));
      }

      // Apply constraints and order
      if (queryConstraints.length > 0) {
        q = query(q, ...queryConstraints, orderBy('logTimestamp', 'desc'));
      } else {
        q = query(q, orderBy('logTimestamp', 'desc'));
      }

      const snapshot = await getDocs(q);

      const entries = [];
      snapshot.forEach(doc => {
        entries.push({ id: doc.id, ...doc.data() });
      });

      console.log(`[MasterLogExportService] Retrieved ${entries.length} master log entries`);
      return entries;

    } catch (error) {
      console.error('[MasterLogExportService] Error fetching master log data:', error);
      throw new Error(`Failed to fetch master log data: ${error.message}`);
    }
  }

  /**
   * Transform data to match VBA system export format exactly
   * @param {Array} entries - Raw master log entries
   * @returns {Array} Transformed data for export
   */
  static transformDataForExport(entries) {
    return entries.map(entry => {
      // Transform timestamp to readable format
      let logTimestamp = 'N/A';
      if (entry.logTimestamp) {
        if (entry.logTimestamp.toDate) {
          logTimestamp = entry.logTimestamp.toDate().toISOString();
        } else if (entry.logTimestamp instanceof Date) {
          logTimestamp = entry.logTimestamp.toISOString();
        } else {
          logTimestamp = entry.logTimestamp;
        }
      }

      // Transform boolean to string for Excel compatibility
      const isPartialPayment = entry.isPartialPayment ? 'TRUE' : 'FALSE';

      // Ensure all numeric fields are properly formatted
      const paymentPercentage = entry.isPartialPayment ? (entry.paymentPercentage || 100) : 100;

      return {
        LogTimestamp: logTimestamp,
        TransactionID: entry.transactionID || 'N/A',
        FinalizationDate: entry.finalizationDate || 'N/A',
        SourceWeeklySheet: entry.sourceWeeklySheet || 'N/A',
        OriginalSheetRow: entry.originalSheetRow || 'N/A',
        InvoiceNo: entry.invoiceNo || 'N/A',
        OriginalInvoiceReference: entry.originalInvoiceReference || 'N/A',
        VendorName: entry.vendorName || 'N/A',
        Description: entry.description || 'N/A',
        BudgetLine: entry.budgetLine || 'N/A',
        IsPartialPayment: isPartialPayment,
        PaymentPercentage: paymentPercentage,
        OriginalFullPreTax_Inv: this.formatNumber(entry.originalFullPreTax_Inv),
        FullNetPayable_Inv: this.formatNumber(entry.fullNetPayable_Inv),
        PreTax_ThisTx: this.formatNumber(entry.preTax_ThisTx),
        WHT_Type_ThisTx: entry.whtType_ThisTx || 'N/A',
        WHT_Rate_ThisTx: this.formatNumber(entry.whtRate_ThisTx),
        WHT_Amount_ThisTx: this.formatNumber(entry.whtAmount_ThisTx),
        Levy_Amount_ThisTx: this.formatNumber(entry.levyAmount_ThisTx),
        VAT_Amount_ThisTx: this.formatNumber(entry.vatAmount_ThisTx),
        MoMoCharge_ThisTx: this.formatNumber(entry.moMoCharge_ThisTx),
        Subtotal_ThisTx: this.formatNumber(entry.subtotal_ThisTx),
        NetPayable_ThisTx: this.formatNumber(entry.netPayable_ThisTx),
        Currency_Tx: entry.currency_Tx || 'N/A',
        BudgetImpactUSD_ThisTx: this.formatNumber(entry.budgetImpactUSD_ThisTx),
        BankPaidFrom: entry.bankPaidFrom || 'N/A',
        PaymentMode_Tx: entry.paymentMode_Tx || 'N/A',
        UserFinalized: entry.userFinalized || 'N/A',
        ManualStatusAtFinalization: entry.manualStatusAtFinalization || 'N/A',
        ScheduleArchiveRef: entry.scheduleArchiveRef || 'N/A',
        FX_Rate: this.formatNumber(entry.fxRate),
        WeeklySheetID: entry.weeklySheetId || 'N/A',
        VoucherID: entry.voucherId || 'N/A',
        BatchID: entry.batchId || 'N/A'
      };
    });
  }

  /**
   * Format number for export (handle null/undefined and ensure proper decimal places)
   * @param {number} value - Number value to format
   * @returns {string} Formatted number string
   */
  static formatNumber(value) {
    if (value === null || value === undefined || isNaN(value)) {
      return '0.00';
    }

    const num = Number(value);
    if (isNaN(num)) {
      return '0.00';
    }

    return num.toFixed(2);
  }

  /**
   * Download file blob
   * @param {Blob} blob - File blob to download
   * @param {string} filename - Filename for download
   */
  static downloadFile(blob, filename) {
    try {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      console.log(`[MasterLogExportService] File downloaded successfully: ${filename}`);
    } catch (error) {
      console.error('[MasterLogExportService] Error downloading file:', error);
      throw new Error(`Download failed: ${error.message}`);
    }
  }

  /**
   * Export master log with automatic format detection and download
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Object} filters - Optional filters
   * @param {string} format - Export format ('xlsx', 'csv', 'auto')
   * @returns {Promise<void>}
   */
  static async exportAndDownload(db, appId, filters = {}, format = 'auto') {
    try {
      console.log(`[MasterLogExportService] Starting export with format: ${format}`);

      let result;

      if (format === 'auto' || format === 'xlsx') {
        try {
          result = await this.exportMasterLogToExcel(db, appId, filters, 'xlsx');
        } catch (error) {
          if (format === 'auto') {
            console.log('[MasterLogExportService] Excel export failed, falling back to CSV');
            result = await this.exportMasterLogToCSV(db, appId, filters);
          } else {
            throw error;
          }
        }
      } else if (format === 'csv') {
        result = await this.exportMasterLogToCSV(db, appId, filters);
      } else {
        throw new Error(`Unsupported export format: ${format}`);
      }

      // Download the file
      this.downloadFile(result.blob, result.filename);

    } catch (error) {
      console.error('[MasterLogExportService] Export and download failed:', error);
      throw new Error(`Export and download failed: ${error.message}`);
    }
  }

  /**
   * Get export statistics for the current dataset
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Object} filters - Optional filters
   * @returns {Promise<Object>} Export statistics
   */
  static async getExportStatistics(db, appId, filters = {}) {
    try {
      const entries = await this.getMasterLogData(db, appId, filters);

      const stats = {
        totalRecords: entries.length,
        dateRange: {
          earliest: null,
          latest: null
        },
        currencyBreakdown: {},
        budgetLineBreakdown: {},
        vendorBreakdown: {},
        partialPaymentCount: 0,
        fullPaymentCount: 0,
        totalAmount: 0,
        totalBudgetImpactUSD: 0
      };

      if (entries.length > 0) {
        // Calculate date range
        const dates = entries
          .map(entry => entry.finalizationDate)
          .filter(date => date && date !== 'N/A')
          .sort();

        if (dates.length > 0) {
          stats.dateRange.earliest = dates[0];
          stats.dateRange.latest = dates[dates.length - 1];
        }

        // Calculate other statistics
        entries.forEach(entry => {
          // Currency breakdown
          const currency = entry.currency_Tx || 'Unknown';
          if (!stats.currencyBreakdown[currency]) {
            stats.currencyBreakdown[currency] = { count: 0, total: 0 };
          }
          stats.currencyBreakdown[currency].count++;
          stats.currencyBreakdown[currency].total += Number(entry.netPayable_ThisTx || 0);

          // Budget line breakdown
          const budgetLine = entry.budgetLine || 'Unknown';
          if (!stats.budgetLineBreakdown[budgetLine]) {
            stats.budgetLineBreakdown[budgetLine] = { count: 0, totalUSD: 0 };
          }
          stats.budgetLineBreakdown[budgetLine].count++;
          stats.budgetLineBreakdown[budgetLine].totalUSD += Number(entry.budgetImpactUSD_ThisTx || 0);

          // Vendor breakdown
          const vendor = entry.vendorName || 'Unknown';
          if (!stats.vendorBreakdown[vendor]) {
            stats.vendorBreakdown[vendor] = { count: 0, total: 0 };
          }
          stats.vendorBreakdown[vendor].count++;
          stats.vendorBreakdown[vendor].total += Number(entry.netPayable_ThisTx || 0);

          // Payment type counts
          if (entry.isPartialPayment) {
            stats.partialPaymentCount++;
          } else {
            stats.fullPaymentCount++;
          }

          // Total amounts
          stats.totalAmount += Number(entry.netPayable_ThisTx || 0);
          stats.totalBudgetImpactUSD += Number(entry.budgetImpactUSD_ThisTx || 0);
        });
      }

      return stats;

    } catch (error) {
      console.error('[MasterLogExportService] Error getting export statistics:', error);
      throw new Error(`Failed to get export statistics: ${error.message}`);
    }
  }
}
