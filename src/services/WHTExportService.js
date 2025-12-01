import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { WHTDataService } from './WHTDataService';

/**
 * WHT Export Service
 * Handles exporting WHT return data in various formats (CSV, Excel)
 * Exports data at entry level with comprehensive details
 */
export class WHTExportService {
  
  /**
   * Export WHT data to CSV format
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Object} options - Export options
   * @returns {Promise<string>} - CSV data as string
   */
  static async exportToCSV(db, appId, options = {}) {
    try {
      console.log('[WHTExportService] Starting CSV export with options:', options);
      
      // Get all WHT entries
      const whtEntries = await this.getAllWHTEntries(db, appId, options);
      
      // Generate CSV
      const csvContent = this.generateCSV(whtEntries);
      
      console.log('[WHTExportService] CSV export completed, rows:', whtEntries.length);
      return csvContent;
      
    } catch (error) {
      console.error('[WHTExportService] CSV export failed:', error);
      throw new Error(`CSV export failed: ${error.message}`);
    }
  }
  
  /**
   * Export WHT data to Excel format
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Object} options - Export options
   * @returns {Promise<Blob>} - Excel file as blob
   */
  static async exportToExcel(db, appId, options = {}) {
    try {
      console.log('[WHTExportService] Starting Excel export with options:', options);
      
      // Get all WHT entries
      const whtEntries = await this.getAllWHTEntries(db, appId, options);
      
      // Generate Excel file
      const excelBlob = await this.generateExcel(whtEntries);
      
      console.log('[WHTExportService] Excel export completed, rows:', whtEntries.length);
      return excelBlob;
      
    } catch (error) {
      console.error('[WHTExportService] Excel export failed:', error);
      throw new Error(`Excel export failed: ${error.message}`);
    }
  }
  
  /**
   * Get all WHT entries with optional filtering
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} - Array of WHT entries
   */
  static async getAllWHTEntries(db, appId, options = {}) {
    try {
      // Use the new WHT data service that extracts from master log
      const entries = await WHTDataService.getWHTEntriesFromMasterLog(db, appId, options);
      return entries;
      
    } catch (error) {
      console.error('[WHTExportService] Error getting WHT entries:', error);
      throw error;
    }
  }
  
  /**
   * Generate CSV content from WHT data
   * @param {Array} whtEntries - Array of WHT entries
   * @returns {string} - CSV content as string
   */
  static generateCSV(whtEntries) {
    if (!whtEntries || whtEntries.length === 0) {
      return 'No data to export';
    }
    
    // Define CSV headers
    const headers = [
      'Entry ID',
      'Batch ID',
      'Vendor Name',
      'Invoice Number',
      'Description',
      'Pre-Tax Amount',
      'Currency',
      'WHT Rate (%)',
      'WHT Amount',
      'Tax Period',
      'Status',
      'Created Date',
      'Last Modified',
      'Notes'
    ];
    
    // Create CSV content
    let csvContent = headers.join(',') + '\n';
    
    whtEntries.forEach(entry => {
      const values = [
        this.escapeCSVValue(entry.id),
        this.escapeCSVValue(entry.batchId),
        this.escapeCSVValue(entry.vendor),
        this.escapeCSVValue(entry.invoiceNo),
        this.escapeCSVValue(entry.description),
        entry.pretaxAmount || 0,
        this.escapeCSVValue(entry.currency || 'GHS'),
        (entry.whtRate || 0) * 100,
        entry.whtAmount || 0,
        this.escapeCSVValue(entry.taxPeriod),
        this.escapeCSVValue(entry.status),
        this.formatDate(entry.timestamp),
        this.formatDate(entry.lastModified || entry.timestamp),
        this.escapeCSVValue(entry.notes || '')
      ];
      
      csvContent += values.join(',') + '\n';
    });
    
    return csvContent;
  }
  
  /**
   * Generate Excel file from WHT data
   * @param {Array} whtEntries - Array of WHT entries
   * @returns {Promise<Blob>} - Excel file as blob
   */
  static async generateExcel(whtEntries) {
    try {
      // Dynamic import of xlsx library
      const XLSX = await import('xlsx');
      
      if (!whtEntries || whtEntries.length === 0) {
        throw new Error('No data to export');
      }
      
      // Define worksheet headers
      const headers = [
        'Entry ID',
        'Batch ID',
        'Vendor Name',
        'Invoice Number',
        'Description',
        'Pre-Tax Amount',
        'Currency',
        'WHT Rate (%)',
        'WHT Amount',
        'Tax Period',
        'Status',
        'Created Date',
        'Last Modified',
        'Notes'
      ];
      
      // Prepare worksheet data
      const worksheetData = [headers];
      
      whtEntries.forEach(entry => {
        worksheetData.push([
          entry.id,
          entry.batchId,
          entry.vendor,
          entry.invoiceNo,
          entry.description,
          entry.pretaxAmount || 0,
          entry.currency || 'GHS',
          (entry.whtRate || 0) * 100,
          entry.whtAmount || 0,
          entry.taxPeriod,
          entry.status,
          this.formatDate(entry.timestamp),
          this.formatDate(entry.lastModified || entry.timestamp),
          entry.notes || ''
        ]);
      });
      
      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      
      // Set column widths
      const columnWidths = [
        { wch: 15 }, // Entry ID
        { wch: 20 }, // Batch ID
        { wch: 25 }, // Vendor Name
        { wch: 20 }, // Invoice Number
        { wch: 30 }, // Description
        { wch: 18 }, // Pre-Tax Amount
        { wch: 12 }, // Currency
        { wch: 15 }, // WHT Rate
        { wch: 15 }, // WHT Amount
        { wch: 15 }, // Tax Period
        { wch: 12 }, // Status
        { wch: 20 }, // Created Date
        { wch: 20 }, // Last Modified
        { wch: 30 }  // Notes
      ];
      
      worksheet['!cols'] = columnWidths;
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'WHT Returns Export');
      
      // Generate Excel file
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      return blob;
      
    } catch (error) {
      console.error('[WHTExportService] Excel generation failed:', error);
      throw new Error(`Excel generation failed: ${error.message}`);
    }
  }
  
  /**
   * Escape CSV value to handle commas and quotes
   * @param {string} value - Value to escape
   * @returns {string} - Escaped value
   */
  static escapeCSVValue(value) {
    if (value === null || value === undefined) {
      return '';
    }
    
    const stringValue = String(value);
    
    // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    
    return stringValue;
  }
  
  /**
   * Format date for export
   * @param {Date|string} date - Date to format
   * @returns {string} - Formatted date string
   */
  static formatDate(date) {
    if (!date) return 'N/A';
    
    try {
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) return 'N/A';
      
      return dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (error) {
      return 'N/A';
    }
  }
  
  /**
   * Download file to user's device
   * @param {string|Blob} content - File content (string for CSV, Blob for Excel)
   * @param {string} filename - Name of the file to download
   * @param {string} type - MIME type of the file
   */
  static downloadFile(content, filename, type) {
    try {
      let blob;
      
      if (typeof content === 'string') {
        // For CSV content
        blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
      } else {
        // For Excel blob
        blob = content;
      }
      
      // Create download link
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      URL.revokeObjectURL(url);
      
      console.log('[WHTExportService] File downloaded successfully:', filename);
      
    } catch (error) {
      console.error('[WHTExportService] File download failed:', error);
      throw new Error(`File download failed: ${error.message}`);
    }
  }
  
  /**
   * Export WHT data with automatic download
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @param {string} format - Export format ('csv' or 'excel')
   * @param {Object} options - Export options
   * @returns {Promise<void>}
   */
  static async exportAndDownload(db, appId, format = 'csv', options = {}) {
    try {
      console.log(`[WHTExportService] Starting ${format.toUpperCase()} export and download`);
      
      let content;
      let filename;
      let mimeType;
      
      if (format.toLowerCase() === 'csv') {
        content = await this.exportToCSV(db, appId, options);
        filename = `wht_returns_export_${new Date().toISOString().split('T')[0]}.csv`;
        mimeType = 'text/csv';
      } else if (format.toLowerCase() === 'excel') {
        content = await this.exportToExcel(db, appId, options);
        filename = `wht_returns_export_${new Date().toISOString().split('T')[0]}.xlsx`;
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else {
        throw new Error(`Unsupported export format: ${format}`);
      }
      
      // Download the file
      this.downloadFile(content, filename, mimeType);
      
      console.log(`[WHTExportService] ${format.toUpperCase()} export and download completed`);
      
    } catch (error) {
      console.error(`[WHTExportService] Export and download failed:`, error);
      throw error;
    }
  }
}
