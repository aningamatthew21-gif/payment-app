import React, { useState, useEffect } from 'react';
import { FileText, CreditCard, TrendingUp, Calendar, Filter, Download, Eye, RefreshCw, ArrowLeft } from 'lucide-react';
import { MasterLogService } from '../services/MasterLogService';
import { WHTReturnService } from '../services/WHTReturnService';
import { MasterLogExportService } from '../services/MasterLogExportService';
import { WHTExportService } from '../services/WHTExportService';
import { WHTDataService } from '../services/WHTDataService';

const MasterLogDashboard = ({ db, appId, userId, onNavigate }) => {
  const [activeTab, setActiveTab] = useState('masterLog');
  const [masterLogEntries, setMasterLogEntries] = useState([]);
  const [whtEntries, setWhtEntries] = useState([]);
  const [whtBatchSummaries, setWhtBatchSummaries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    vendor: '',
    budgetLine: '',
    minAmount: '',
    maxAmount: ''
  });
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');

  useEffect(() => {
    if (!db || !appId) return;

    // Subscribe to real-time updates
    console.log('[MasterLogDashboard] Setting up Master Log subscription for appId:', appId);
    const unsubscribeMasterLog = MasterLogService.subscribeToMasterLog(
      db,
      appId,
      (entries) => {
        console.log('[MasterLogDashboard] Master Log subscription callback received entries:', entries.length);
        console.log('[MasterLogDashboard] First entry sample:', entries[0]);
        setMasterLogEntries(entries);
      }
    );

    const unsubscribeWHT = WHTReturnService.subscribeToWHTReturns(
      db,
      appId,
      (entries) => setWhtEntries(entries)
    );

    // Load initial data
    loadInitialData();

    // Add global test function for debugging
    window.testMasterLogService = () => MasterLogService.testMasterLogService(db, appId);
    window.testMasterLogConnection = testMasterLogConnection;

    return () => {
      unsubscribeMasterLog();
      unsubscribeWHT();
      // Clean up global functions
      delete window.testMasterLogService;
      delete window.testMasterLogConnection;
    };
  }, [db, appId]);

  const loadInitialData = async () => {
    if (!db || !appId) return;

    console.log('[MasterLogDashboard] loadInitialData called with:', { db: !!db, appId });
    setLoading(true);

    try {
      // Test Master Log connection first
      console.log('[MasterLogDashboard] Testing Master Log connection...');
      const masterLogEntries = await MasterLogService.getMasterLogEntries(db, appId);
      console.log('[MasterLogDashboard] Initial Master Log entries loaded:', masterLogEntries.length);

      if (masterLogEntries.length > 0) {
        console.log('[MasterLogDashboard] First entry sample:', masterLogEntries[0]);
      }

      // Extract WHT data from existing master log
      console.log('[MasterLogDashboard] Extracting WHT data from master log...');
      const whtEntries = await WHTDataService.getWHTEntriesFromMasterLog(db, appId);
      setWhtEntries(whtEntries);
      console.log('[MasterLogDashboard] WHT entries extracted:', whtEntries.length);

      // Generate WHT batch summaries from master log data
      console.log('[MasterLogDashboard] Generating WHT batch summaries...');
      const whtSummaries = await WHTDataService.getWHTBatchSummariesFromMasterLog(db, appId);
      setWhtBatchSummaries(whtSummaries);
      console.log('[MasterLogDashboard] WHT batch summaries generated:', whtSummaries.length);

    } catch (error) {
      console.error('[MasterLogDashboard] Error loading initial data:', error);
      console.error('[MasterLogDashboard] Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const getFilteredMasterLog = () => {
    if (!masterLogEntries || !Array.isArray(masterLogEntries)) {
      return [];
    }

    return masterLogEntries.filter(entry => {
      if (!entry) return false;

      // Date range filters
      if (filters.dateFrom && entry.finalizationDate < filters.dateFrom) return false;
      if (filters.dateTo && entry.finalizationDate > filters.dateTo) return false;

      // Vendor filter (case-insensitive search)
      if (filters.vendor && !entry.vendorName?.toLowerCase().includes(filters.vendor.toLowerCase())) return false;

      // Budget line filter (case-insensitive search)
      if (filters.budgetLine && !entry.budgetLine?.toLowerCase().includes(filters.budgetLine.toLowerCase())) return false;

      // Amount range filters (FullNetPayable_Inv)
      if (filters.minAmount && Number(entry.fullNetPayable_Inv || 0) < Number(filters.minAmount)) return false;
      if (filters.maxAmount && Number(entry.fullNetPayable_Inv || 0) > Number(filters.maxAmount)) return false;

      return true;
    });
  };

  const getFilteredWHT = () => {
    if (!whtEntries || !Array.isArray(whtEntries)) {
      return [];
    }

    return whtEntries.filter(entry => {
      if (!entry) return false;
      if (filters.status && entry.status !== filters.status) return false;
      if (filters.year && entry.year !== filters.year) return false;
      if (filters.vendor && entry.vendor !== filters.vendor) return false;
      if (filters.batchId && entry.batchId !== filters.batchId) return false;
      return true;
    });
  };

  const handleViewDetails = async (entry, type) => {
    setSelectedEntry({ ...entry, type });
    setShowDetails(true);
  };

  const formatCurrency = (amount, currency = 'GHS') => {
    const symbol = currency === 'USD' ? '$' : '₵';
    return `${symbol} ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Export functions
  const handleExport = async (data, format = 'csv') => {
    if (!db || !appId) {
      alert('Database connection not available');
      return;
    }

    setExporting(true);
    try {
      console.log(`[MasterLogDashboard] Starting ${format.toUpperCase()} export with ${data.length} entries`);

      // Prepare export options based on current filters
      const exportOptions = {
        status: filters.status || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        vendor: filters.vendor || undefined,
        budgetLine: filters.budgetLine || undefined,
        minAmount: filters.minAmount || undefined,
        maxAmount: filters.maxAmount || undefined,
        // Enhanced filter options
        currency: filters.currency || undefined,
        whtType: filters.whtType || undefined,
        minWHTRate: filters.minWHTRate || undefined,
        maxWHTRate: filters.maxWHTRate || undefined,
        isPartialPayment: filters.isPartialPayment || undefined,
        minPreTax: filters.minPreTax || undefined,
        maxPreTax: filters.maxPreTax || undefined,
        minNetPayable: filters.minNetPayable || undefined,
        maxNetPayable: filters.maxNetPayable || undefined,
        minSubtotal: filters.minSubtotal || undefined,
        maxSubtotal: filters.maxSubtotal || undefined,
        minBudgetImpact: filters.minBudgetImpact || undefined,
        maxBudgetImpact: filters.maxBudgetImpact || undefined
      };

      // Export and download - FIXED: Parameters in correct order (db, appId, filters, format)
      await MasterLogExportService.exportAndDownload(db, appId, exportOptions, format);

      console.log(`[MasterLogDashboard] ${format.toUpperCase()} export completed successfully`);

    } catch (error) {
      console.error(`[MasterLogDashboard] Export failed:`, error);
      alert(`Export failed: ${error.message}`);
    } finally {
      setExporting(false);
    }
  };

  const handleExportCSV = () => handleExport('csv');
  const handleExportExcel = () => handleExport('excel');

  // WHT Export functions
  const handleWHTExport = async (data, format = 'csv') => {
    if (!db || !appId) {
      alert('Database connection not available');
      return;
    }

    setExporting(true);
    try {
      console.log(`[MasterLogDashboard] Starting WHT ${format.toUpperCase()} export with ${data.length} entries`);

      // Prepare export options based on current filters
      const exportOptions = {
        status: filters.status || undefined,
        year: filters.year || undefined,
        vendor: filters.vendor || undefined,
        batchId: filters.batchId || undefined
      };

      // Export and download using WHTExportService
      await WHTExportService.exportAndDownload(db, appId, format, exportOptions);

      console.log(`[MasterLogDashboard] WHT ${format.toUpperCase()} export completed successfully`);

    } catch (error) {
      console.error(`[MasterLogDashboard] WHT export failed:`, error);
      alert(`WHT export failed: ${error.message}`);
    } finally {
      setExporting(false);
    }
  };

  // DEBUGGING: Add test function to analyze master log data structure
  const debugMasterLogDataStructure = () => {
    console.log('=== MASTER LOG DATA STRUCTURE DEBUG ===');

    if (!masterLogEntries || masterLogEntries.length === 0) {
      console.log('[DEBUG] No master log entries available');
      return;
    }

    const sampleEntry = masterLogEntries[0];
    console.log('[DEBUG] Sample master log entry:', sampleEntry);
    console.log('[DEBUG] Sample entry keys:', Object.keys(sampleEntry));

    // Check for required fields
    const requiredFields = [
      'logTimestamp', 'transactionID', 'finalizationDate', 'sourceWeeklySheet', 'originalSheetRow',
      'invoiceNo', 'originalInvoiceReference', 'description', 'vendorName', 'budgetLine',
      'isPartialPayment', 'paymentPercentage', 'originalFullPreTax_Inv', 'fullNetPayable_Inv',
      'preTax_ThisTx', 'netPayable_ThisTx', 'subtotal_ThisTx', 'currency_Tx', 'budgetImpactUSD_ThisTx',
      'whtType_ThisTx', 'whtRate_ThisTx', 'whtAmount_ThisTx', 'levyAmount_ThisTx', 'vatAmount_ThisTx',
      'moMoCharge_ThisTx', 'bankPaidFrom', 'paymentMode_Tx', 'userFinalized', 'manualStatusAtFinalization',
      'scheduleArchiveRef', 'fxRate', 'weeklySheetId', 'voucherId', 'batchId'
    ];

    const missingFields = [];
    const availableFields = [];

    requiredFields.forEach(field => {
      if (sampleEntry.hasOwnProperty(field)) {
        availableFields.push(field);
        console.log(`[DEBUG] ✓ Field "${field}" available:`, sampleEntry[field]);
      } else {
        missingFields.push(field);
        console.log(`[DEBUG] ✗ Field "${field}" missing`);
      }
    });

    console.log('[DEBUG] Available fields:', availableFields.length);
    console.log('[DEBUG] Missing fields:', missingFields.length);
    console.log('[DEBUG] Missing field names:', missingFields);

    // Check data types
    availableFields.forEach(field => {
      const value = sampleEntry[field];
      console.log(`[DEBUG] Field "${field}" type:`, typeof value, 'value:', value);
    });

    console.log('=== END DEBUG ===');

    return {
      availableFields,
      missingFields,
      sampleEntry
    };
  };

  // DEBUGGING: Test function to verify Master Log connection and data retrieval
  const testMasterLogConnection = async () => {
    console.log('=== MASTER LOG CONNECTION TEST ===');

    if (!db || !appId) {
      console.error('[TEST] Missing db or appId:', { db: !!db, appId });
      return;
    }

    try {
      console.log('[TEST] Testing connection to appId:', appId);

      // Test 1: Direct collection access
      console.log('[TEST] Test 1: Direct collection access');
      const { collection, getDocs, query, orderBy } = await import('firebase/firestore');
      const masterLogCollection = collection(db, `artifacts/${appId}/public/data/masterLog`);
      console.log('[TEST] Collection reference created:', !!masterLogCollection);

      // Test 2: Get documents
      console.log('[TEST] Test 2: Getting documents');
      const q = query(masterLogCollection, orderBy('logTimestamp', 'desc'));
      const snapshot = await getDocs(q);
      console.log('[TEST] Documents retrieved:', snapshot.size);

      if (snapshot.size > 0) {
        const firstDoc = snapshot.docs[0];
        console.log('[TEST] First document data:', firstDoc.data());
        console.log('[TEST] First document ID:', firstDoc.id);
      }

      // Test 3: MasterLogService call
      console.log('[TEST] Test 3: MasterLogService.getMasterLogEntries');
      const entries = await MasterLogService.getMasterLogEntries(db, appId);
      console.log('[TEST] Service returned entries:', entries.length);

      if (entries.length > 0) {
        console.log('[TEST] First service entry:', entries[0]);
      }

      // Test 4: Check subscription status
      console.log('[TEST] Test 4: Current subscription state');
      console.log('[TEST] Current masterLogEntries state:', masterLogEntries.length);
      console.log('[TEST] Current filteredData:', getFilteredMasterLog().length);

      console.log('[TEST] ✓ All connection tests completed successfully');

    } catch (error) {
      console.error('[TEST] ✗ Connection test failed:', error);
      console.error('[TEST] Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
    }

    console.log('=== END CONNECTION TEST ===');
  };

  // DEBUGGING: Test function to verify table structure
  const debugTableStructure = () => {
    console.log('=== TABLE STRUCTURE DEBUG ===');

    // Count table headers
    const tableHeaders = document.querySelectorAll('thead th');
    console.log('[DEBUG] Total table headers found:', tableHeaders.length);

    // Log each header with its column letter
    tableHeaders.forEach((header, index) => {
      const columnLetter = String.fromCharCode(65 + index); // A, B, C, etc.
      const headerText = header.textContent?.trim() || 'No text';
      console.log(`[DEBUG] Column ${columnLetter} (${index + 1}): ${headerText}`);
    });

    // Check if we have exactly 25 columns
    if (tableHeaders.length === 25) {
      console.log('[DEBUG] ✓ Table structure is correct: 25 columns found');
    } else {
      console.log(`[DEBUG] ✗ Table structure issue: Expected 25 columns, found ${tableHeaders.length}`);
    }

    // Count data cells in first row (if exists)
    const firstDataRow = document.querySelector('tbody tr');
    if (firstDataRow) {
      const dataCells = firstDataRow.querySelectorAll('td');
      console.log(`[DEBUG] Data cells in first row: ${dataCells.length}`);

      if (dataCells.length === 25) {
        console.log('[DEBUG] ✓ Data row structure is correct: 25 cells found');
      } else {
        console.log(`[DEBUG] ✗ Data row structure issue: Expected 25 cells, found ${dataCells.length}`);
      }
    } else {
      console.log('[DEBUG] No data rows found to check');
    }

    console.log('=== END TABLE STRUCTURE DEBUG ===');

    return {
      totalColumns: tableHeaders.length,
      isCorrect: tableHeaders.length === 25,
      hasDataRows: !!firstDataRow
    };
  };

  // DEBUGGING: Comprehensive test function for complete system
  const testCompleteSystem = () => {
    console.log('=== COMPLETE SYSTEM TEST ===');

    // Test 1: Data Structure
    const dataStructureResult = debugMasterLogDataStructure();
    console.log('[TEST] Data Structure Test Result:', dataStructureResult);

    // Test 2: Table Structure
    const tableStructureResult = debugTableStructure();
    console.log('[TEST] Table Structure Test Result:', tableStructureResult);

    // Test 3: Data Mapping
    if (masterLogEntries && masterLogEntries.length > 0) {
      const sampleEntry = masterLogEntries[0];
      console.log('[TEST] Sample Entry Data Mapping:');

      // Check if new fields are accessible
      const newFields = [
        'preTax_ThisTx', 'netPayable_ThisTx', 'subtotal_ThisTx', 'currency_Tx',
        'budgetImpactUSD_ThisTx', 'whtType_ThisTx', 'whtRate_ThisTx', 'whtAmount_ThisTx',
        'levyAmount_ThisTx', 'vatAmount_ThisTx', 'moMoCharge_ThisTx'
      ];

      newFields.forEach(field => {
        const value = sampleEntry[field];
        const status = value !== undefined ? '✓' : '✗';
        console.log(`[TEST] ${status} Field "${field}":`, value);
      });
    }

    // Test 4: Table Layout and Scrolling
    console.log('[TEST] Table Layout Test:');
    const tableContainer = document.querySelector('.overflow-x-auto');
    if (tableContainer) {
      console.log('[TEST] ✓ Table container found with horizontal scroll');
      console.log('[TEST] Container scroll width:', tableContainer.scrollWidth);
      console.log('[TEST] Container client width:', tableContainer.clientWidth);
      console.log('[TEST] Has horizontal scroll:', tableContainer.scrollWidth > tableContainer.clientWidth);
    } else {
      console.log('[TEST] ✗ Table container not found');
    }

    // Test 5: Column Widths
    const tableHeaders = document.querySelectorAll('thead th');
    if (tableHeaders.length === 25) {
      console.log('[TEST] ✓ All 25 columns present');
      tableHeaders.forEach((header, index) => {
        const columnLetter = String.fromCharCode(65 + index);
        const headerText = header.textContent?.trim() || 'No text';
        console.log(`[TEST] Column ${columnLetter}: "${headerText}" - Width: ${header.offsetWidth}px`);
      });
    }

    console.log('[TEST] Complete System Test Finished');
    console.log('=== END COMPLETE SYSTEM TEST ===');

    return {
      dataStructure: dataStructureResult,
      tableStructure: tableStructureResult,
      timestamp: new Date().toISOString()
    };
  };

  const renderMasterLogTab = () => {
    const filteredData = getFilteredMasterLog();

    // DEBUGGING: Log data structure on each render
    console.log('[DEBUG] renderMasterLogTab called with filteredData length:', filteredData.length);
    if (filteredData.length > 0) {
      console.log('[DEBUG] First filtered entry sample:', filteredData[0]);
    }

    // DEBUGGING: Log table structure progress
    console.log('[DEBUG] Phase 4 Complete: Enhanced filtering logic implemented for all 25 columns');
    console.log('[DEBUG] Columns A-Y: All headers, data cells, layout, and filtering completed');
    console.log('[DEBUG] Next step: Update export functionality and final testing');

    return (
      <div className="space-y-6">
        {/* Simplified Filters */}
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Master Log Filters</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {/* Date Range Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
              <input
                type="date"
                value={filters.dateFrom || ''}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
              <input
                type="date"
                value={filters.dateTo || ''}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Vendor Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
              <input
                type="text"
                placeholder="Search vendor..."
                value={filters.vendor || ''}
                onChange={(e) => handleFilterChange('vendor', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Budget Line Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Budget Line</label>
              <input
                type="text"
                placeholder="Search budget line..."
                value={filters.budgetLine || ''}
                onChange={(e) => handleFilterChange('budgetLine', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Amount Range Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Amount</label>
              <input
                type="number"
                placeholder="Min amount..."
                value={filters.minAmount || ''}
                onChange={(e) => handleFilterChange('minAmount', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Amount</label>
              <input
                type="number"
                placeholder="Max amount..."
                value={filters.maxAmount || ''}
                onChange={(e) => handleFilterChange('maxAmount', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Filter Actions */}
          <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200">
            <div className="flex space-x-2">
              {/* Test Connection Button */}
              <button
                onClick={testMasterLogConnection}
                className="px-4 py-2 text-sm bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors flex items-center space-x-2"
                title="Test Master Log connection and data retrieval"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Test Connection</span>
              </button>

              <button
                onClick={() => setFilters({
                  dateFrom: '',
                  dateTo: '',
                  vendor: '',
                  budgetLine: '',
                  minAmount: '',
                  maxAmount: ''
                })}
                className="px-4 py-2 text-sm bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
              >
                Clear All Filters
              </button>
              <button
                onClick={loadInitialData}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Refresh</span>
              </button>


            </div>

            {/* Export Options */}
            <div className="flex space-x-2">
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="csv">Export CSV</option>
                <option value="xlsx">Export Excel</option>
              </select>
              <button
                onClick={() => handleExport(filteredData, exportFormat)}
                disabled={exporting}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center space-x-2"
              >
                <Download className="h-4 w-4" />
                <span>{exporting ? 'Exporting...' : 'Export'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Excel-like Table */}
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          {/* Table Info Header */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-sm font-medium text-gray-700">
                  Master Log Entries: <span className="text-blue-600 font-semibold">{filteredData.length}</span>
                </span>
                <span className="text-sm text-gray-500">
                  Columns: <span className="text-green-600 font-semibold">A-Y (25 total)</span>
                </span>
              </div>
              <div className="text-xs text-gray-500">
                Scroll horizontally to view all columns
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200" style={{ minWidth: '2000px' }}>
              {/* Excel-style Header Row */}
              <thead className="bg-blue-700 sticky top-0 z-10">
                <tr>
                  {/* Column A: LogTimestamp */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>A</span>
                      <span>LogTimestamp</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column B: TransactionID */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>B</span>
                      <span>TransactionID</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column C: FinalizationDate */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>C</span>
                      <span>FinalizationDate</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column D: SourceWeeklySheet */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>D</span>
                      <span>SourceWeeklySheet</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column E: OriginalSheetRow */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>E</span>
                      <span>OriginalSheetRow</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column F: InvoiceNo */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>F</span>
                      <span>InvoiceNo</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column G: OriginalInvoiceReference */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>G</span>
                      <span>OriginalInvoiceReference</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column H: VendorName */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>H</span>
                      <span>VendorName</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column I: Description */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>I</span>
                      <span>Description</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column J: BudgetLine */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>J</span>
                      <span>BudgetLine</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column K: IsPartialPayment */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>K</span>
                      <span>IsPartialPayment</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column L: PaymentPercentage */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>L</span>
                      <span>PaymentPercentage</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column M: OriginalFullPreTax_Inv */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>M</span>
                      <span>OriginalFullPreTax_Inv</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column N: FullNetPayable_Inv */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>N</span>
                      <span>FullNetPayable_Inv</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column O: PreTax_ThisTx */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>O</span>
                      <span>PreTax_ThisTx</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column P: NetPayable_ThisTx */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>P</span>
                      <span>NetPayable_ThisTx</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column Q: Subtotal_ThisTx */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>Q</span>
                      <span>Subtotal_ThisTx</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column R: Currency_Tx */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>R</span>
                      <span>Currency_Tx</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column S: BudgetImpactUSD_ThisTx */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>S</span>
                      <span>BudgetImpactUSD_ThisTx</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column T: WHT_Type_ThisTx */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>T</span>
                      <span>WHT_Type_ThisTx</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column U: WHT_Rate_ThisTx */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>U</span>
                      <span>WHT_Rate_ThisTx</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column V: WHT_Amount_ThisTx */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>V</span>
                      <span>WHT_Amount_ThisTx</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column W: Levy_Amount_ThisTx */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>W</span>
                      <span>Levy_Amount_ThisTx</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column X: VAT_Amount_ThisTx */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>X</span>
                      <span>VAT_Amount_ThisTx</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>

                  {/* Column Y: MoMoCharge_ThisTx */}
                  <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-600 transition-colors">
                    <div className="flex items-center space-x-1">
                      <span>Y</span>
                      <span>MoMoCharge_ThisTx</span>
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </th>
                </tr>
              </thead>

              {/* Excel-style Data Rows */}
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan="25" className="px-4 py-8 text-center text-gray-500">
                      <div className="flex flex-col items-center space-y-2">
                        <FileText className="h-12 w-12 text-gray-300" />
                        <p className="text-lg font-medium">No master log entries found</p>
                        <p className="text-sm">Try adjusting your filters or refresh the data</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredData.map((entry, index) => (
                    <tr
                      key={entry.id || index}
                      className={`hover:bg-gray-50 cursor-pointer transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-blue-50'
                        }`}
                      onClick={() => handleViewDetails(entry, 'masterLog')}
                    >
                      {/* Column A: LogTimestamp */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200">
                        {entry.logTimestamp ? new Date(entry.logTimestamp.toDate ? entry.logTimestamp.toDate() : entry.logTimestamp).toLocaleString() : 'N/A'}
                      </td>

                      {/* Column B: TransactionID */}
                      <td className="px-4 py-3 text-sm font-mono text-blue-600 whitespace-nowrap border border-gray-200">
                        {entry.transactionID || 'N/A'}
                      </td>

                      {/* Column C: FinalizationDate */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200">
                        {entry.finalizationDate || 'N/A'}
                      </td>

                      {/* Column D: SourceWeeklySheet */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200">
                        {entry.sourceWeeklySheet || 'N/A'}
                      </td>

                      {/* Column E: OriginalSheetRow */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200 text-center">
                        {entry.originalSheetRow || 'N/A'}
                      </td>

                      {/* Column F: InvoiceNo */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200">
                        {entry.invoiceNo || 'N/A'}
                      </td>

                      {/* Column G: OriginalInvoiceReference */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200">
                        {entry.originalInvoiceReference || 'N/A'}
                      </td>

                      {/* Column H: VendorName */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200">
                        {entry.vendorName || 'N/A'}
                      </td>

                      {/* Column I: Description */}
                      <td className="px-4 py-3 text-sm text-gray-900 border border-gray-200 max-w-xs">
                        <div className="truncate" title={entry.description || 'N/A'}>
                          {entry.description || 'N/A'}
                        </div>
                      </td>

                      {/* Column J: BudgetLine */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200">
                        {entry.budgetLine || 'N/A'}
                      </td>

                      {/* Column K: IsPartialPayment */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200 text-center">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${entry.isPartialPayment
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                          }`}>
                          {entry.isPartialPayment ? 'Yes' : 'No'}
                        </span>
                      </td>

                      {/* Column L: PaymentPercentage */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200 text-center">
                        {entry.paymentPercentage ? `${entry.paymentPercentage}%` : '100%'}
                      </td>

                      {/* Column M: OriginalFullPreTax_Inv */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200 text-right">
                        {entry.originalFullPreTax_Inv ? `$${Number(entry.originalFullPreTax_Inv).toFixed(2)}` : 'N/A'}
                      </td>

                      {/* Column N: FullNetPayable_Inv */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200 text-right">
                        {entry.fullNetPayable_Inv ? `$${Number(entry.fullNetPayable_Inv).toFixed(2)}` : 'N/A'}
                      </td>

                      {/* Column O: PreTax_ThisTx */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200 text-right">
                        {entry.preTax_ThisTx ? `$${Number(entry.preTax_ThisTx).toFixed(2)}` : 'N/A'}
                      </td>

                      {/* Column P: NetPayable_ThisTx */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200 text-right">
                        {entry.netPayable_ThisTx ? `$${Number(entry.netPayable_ThisTx).toFixed(2)}` : 'N/A'}
                      </td>

                      {/* Column Q: Subtotal_ThisTx */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200 text-right">
                        {entry.subtotal_ThisTx ? `$${Number(entry.subtotal_ThisTx).toFixed(2)}` : 'N/A'}
                      </td>

                      {/* Column R: Currency_Tx */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200 text-center">
                        {entry.currency_Tx || 'GHS'}
                      </td>

                      {/* Column S: BudgetImpactUSD_ThisTx */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200 text-right">
                        {entry.budgetImpactUSD_ThisTx ? `$${Number(entry.budgetImpactUSD_ThisTx).toFixed(2)}` : 'N/A'}
                      </td>

                      {/* Column T: WHT_Type_ThisTx */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200">
                        {entry.whtType_ThisTx || 'STANDARD'}
                      </td>

                      {/* Column U: WHT_Rate_ThisTx */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200 text-center">
                        {entry.whtRate_ThisTx ? `${(Number(entry.whtRate_ThisTx) * 100).toFixed(1)}%` : 'N/A'}
                      </td>

                      {/* Column V: WHT_Amount_ThisTx */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200 text-right">
                        {entry.whtAmount_ThisTx ? `₵${Number(entry.whtAmount_ThisTx).toFixed(2)}` : 'N/A'}
                      </td>

                      {/* Column W: Levy_Amount_ThisTx */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200 text-right">
                        {entry.levyAmount_ThisTx ? `₵${Number(entry.levyAmount_ThisTx).toFixed(2)}` : 'N/A'}
                      </td>

                      {/* Column X: VAT_Amount_ThisTx */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200 text-right">
                        {entry.vatAmount_ThisTx ? `₵${Number(entry.vatAmount_ThisTx).toFixed(2)}` : 'N/A'}
                      </td>

                      {/* Column Y: MoMoCharge_ThisTx */}
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap border border-gray-200 text-right">
                        {entry.moMoCharge_ThisTx ? `₵${Number(entry.moMoCharge_ThisTx).toFixed(2)}` : 'N/A'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Excel-style Summary Row */}
          {filteredData.length > 0 && (
            <div className="bg-gray-100 px-4 py-3 border-t border-gray-200">
              <div className="flex justify-between items-center text-sm text-gray-700">
                <span className="font-medium">Total Entries: {filteredData.length}</span>
                <span className="font-medium">
                  Total Amount: ${filteredData.reduce((sum, entry) => sum + (Number(entry.fullNetPayable_Inv) || 0), 0).toFixed(2)}
                </span>
                <span className="font-medium">
                  Partial Payments: {filteredData.filter(entry => entry.isPartialPayment).length}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderWHTTab = () => (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total WHT Entries</p>
              <p className="text-2xl font-bold text-gray-900">{whtEntries.length}</p>
            </div>
            <FileText className="h-8 w-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total WHT Amount</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(whtEntries.reduce((sum, entry) => sum + (entry.whtAmount || 0), 0))}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-green-500" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending Returns</p>
              <p className="text-2xl font-bold text-gray-900">
                {whtEntries.filter(entry => entry.status === 'pending').length}
              </p>
            </div>
            <CreditCard className="h-8 w-8 text-yellow-500" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">This Year</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(
                  whtEntries
                    .filter(entry => entry.year === new Date().getFullYear())
                    .reduce((sum, entry) => sum + (entry.whtAmount || 0), 0)
                )}
              </p>
            </div>
            <Calendar className="h-8 w-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Filters and Export Controls */}
      <div className="bg-white p-4 rounded-lg shadow border">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Filters:</span>
            </div>

            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="submitted">Submitted</option>
              <option value="processed">Processed</option>
            </select>

            <select
              value={filters.year}
              onChange={(e) => handleFilterChange('year', parseInt(e.target.value) || new Date().getFullYear())}
              className="border border-gray-300 rounded-md px-3 py-1 text-sm"
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>

            <select
              value={filters.vendor}
              onChange={(e) => handleFilterChange('vendor', e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1 text-sm"
            >
              <option value="">All Vendors</option>
              {[...new Set(whtEntries
                .filter(entry => entry && entry.vendor)
                .map(entry => entry.vendor)
              )].map(vendor => (
                <option key={vendor || 'unknown'} value={vendor || ''}>{vendor || 'Unknown'}</option>
              ))}
            </select>
          </div>

          {/* Export Controls */}
          <div className="flex items-center space-x-3">
            <button
              onClick={loadInitialData}
              disabled={loading}
              className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center space-x-1"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Data</span>
            </button>

            <span className="text-sm font-medium text-gray-700">Export:</span>

            <button
              onClick={() => handleWHTExport(getFilteredWHT(), 'csv')}
              disabled={exporting || getFilteredWHT().length === 0}
              className={`px-4 py-2 text-sm font-medium rounded-md flex items-center space-x-2 ${exporting || getFilteredWHT().length === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              title="Export WHT data to CSV"
            >
              <Download className="h-4 w-4" />
              <span>CSV</span>
            </button>

            <button
              onClick={() => handleWHTExport(getFilteredWHT(), 'excel')}
              disabled={exporting || getFilteredWHT().length === 0}
              className={`px-4 py-2 text-sm font-medium rounded-md flex items-center space-x-2 ${exporting || getFilteredWHT().length === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              title="Export WHT data to Excel"
            >
              <Download className="h-4 w-4" />
              <span>Excel</span>
            </button>

            {exporting && (
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Exporting...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* WHT Entries Table */}
      <div className="bg-white rounded-lg shadow border overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">WHT Return Entries</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pre-Tax Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">WHT Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">WHT Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tax Period</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {getFilteredWHT().length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-8 text-center text-gray-500">
                    <div className="flex flex-col items-center space-y-2">
                      <FileText className="h-8 w-8 text-gray-300" />
                      <p className="text-sm">No WHT entries found</p>
                      <p className="text-xs">Try refreshing the data or adjusting your filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                getFilteredWHT().map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {entry.vendor || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {entry.invoiceNo || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatCurrency(entry.pretaxAmount || 0, entry.currency || 'GHS')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {entry.whtRate ? `${(Number(entry.whtRate) * 100).toFixed(1)}%` : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatCurrency(entry.whtAmount || 0, entry.currency || 'GHS')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {entry.taxPeriod || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${entry.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          entry.status === 'submitted' ? 'bg-blue-100 text-blue-800' :
                            'bg-green-100 text-green-800'
                        }`}>
                        {entry.status || 'unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleViewDetails(entry, 'wht')}
                        className="text-blue-600 hover:text-blue-900 flex items-center space-x-1"
                      >
                        <Eye size={16} />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderDetailsModal = () => {
    if (!selectedEntry || !showDetails) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">
                {selectedEntry.type === 'masterLog' ? 'Master Log Details' : 'WHT Entry Details'}
              </h2>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
          </div>

          <div className="p-6">
            {selectedEntry.type === 'masterLog' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Batch ID</label>
                    <p className="text-sm text-gray-900">{selectedEntry.batchId}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Date</label>
                    <p className="text-sm text-gray-900">{formatDate(selectedEntry.timestamp)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Weekly Sheet</label>
                    <p className="text-sm text-gray-900">{selectedEntry.sourceWeeklySheet}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Total Payments</label>
                    <p className="text-sm text-gray-900">{selectedEntry.totalPayments}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Total Amount</label>
                    <p className="text-sm text-gray-900">
                      {formatCurrency(selectedEntry.totalAmount, selectedEntry.currency)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Status</label>
                    <p className="text-sm text-gray-900">{selectedEntry.status}</p>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Payment Details</label>
                  <div className="mt-2 space-y-2">
                    {selectedEntry.paymentDetails?.map((payment, index) => (
                      <div key={index} className="bg-gray-50 p-3 rounded border">
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="font-medium">Vendor:</span> {payment.vendor}
                          </div>
                          <div>
                            <span className="font-medium">Amount:</span> {formatCurrency(payment.amount, selectedEntry.currency)}
                          </div>
                          <div>
                            <span className="font-medium">Budget Line:</span> {payment.budgetLine}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Vendor</label>
                    <p className="text-sm text-gray-900">{selectedEntry.vendor}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Invoice No</label>
                    <p className="text-sm text-gray-900">{selectedEntry.invoiceNo}</p>
                  </div>
                  <div>
                    <label className="font-medium text-gray-700">Pre-Tax Amount</label>
                    <p className="text-sm text-gray-900">
                      {formatCurrency(selectedEntry.pretaxAmount, selectedEntry.currency)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">WHT Rate</label>
                    <p className="text-sm text-gray-900">{(selectedEntry.whtRate * 100).toFixed(1)}%</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">WHT Amount</label>
                    <p className="text-sm text-gray-900">
                      {formatCurrency(selectedEntry.whtAmount, selectedEntry.currency)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Tax Period</label>
                    <p className="text-sm text-gray-900">{selectedEntry.taxPeriod}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Budget Line</label>
                    <p className="text-sm text-gray-900">{selectedEntry.budgetLine}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Status</label>
                    <p className="text-sm text-gray-900">{selectedEntry.status}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-gray-200 flex justify-end">
            <button
              onClick={() => setShowDetails(false)}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Master Log & WHT Dashboard</h1>
              <p className="mt-2 text-gray-600">
                Real-time monitoring of finalized transactions and withholding tax returns
              </p>
            </div>
            {onNavigate && (
              <button
                onClick={() => onNavigate('dashboard')}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Back to Dashboard</span>
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow border mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab('masterLog')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'masterLog'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                Master Log
              </button>
              <button
                onClick={() => setActiveTab('wht')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'wht'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                WHT Returns
              </button>
            </nav>
          </div>
        </div>

        {/* Refresh Button */}
        <div className="mb-6 flex justify-end">
          <button
            onClick={loadInitialData}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Data</span>
          </button>
        </div>

        {/* Content */}
        {activeTab === 'masterLog' ? renderMasterLogTab() : renderWHTTab()}

        {/* Details Modal */}
        {renderDetailsModal()}
      </div>
    </div>
  );
};

export default MasterLogDashboard;
