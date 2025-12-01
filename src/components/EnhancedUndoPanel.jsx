import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Undo2, AlertTriangle, CheckCircle, Clock, DollarSign, User, Archive, FileText, TestTube } from 'lucide-react';
import {
  getRecentUndoLogEntries,
  undoTransactionBatch,
  markBatchAsUndone,
  createTestUndoData
} from '../services/TransactionService.js';

// CORE WHT INTEGRATION: Import WHT services
import { WHT_CONFIG } from '../config/WHTConfig.js';

const EnhancedUndoPanel = ({ db, userId, appId, onUndoComplete, weeklySheetFilter }) => {
  const [undoEntries, setUndoEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [showAllEntries, setShowAllEntries] = useState(false); // Temporary debug option

  useEffect(() => {
    if (db) {
      loadUndoEntries();
    }
  }, [db, weeklySheetFilter]);

  const loadUndoEntries = useCallback(async () => {
    if (!db) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      console.log('[EnhancedUndoPanel] Loading undo entries...');
      let entries = await getRecentUndoLogEntries(db, appId);
      console.log('[EnhancedUndoPanel] Loaded undo entries:', entries);

      // TEMPORARY: Show all entries for debugging, then filter
      console.log(`[EnhancedUndoPanel] All undo entries before filtering:`, entries.map(entry => ({
        batchId: entry.batchId,
        primaryVendor: entry.primaryVendor,
        totalAmount: entry.totalAmount,
        weeklySheetData: entry.weeklySheetData?.sheetName,
        scheduleSheet: entry.scheduleSheet,
        sourceWeeklySheet: entry.sourceWeeklySheet,
        datetime: entry.datetime
      })));

      // TEMPORARY: Disable filtering to show all entries for debugging
      if (weeklySheetFilter && !showAllEntries && false) { // Temporarily disabled
        entries = entries.filter(entry => {
          console.log(`[EnhancedUndoPanel] Checking entry ${entry.batchId} for weekly sheet filter:`, {
            weeklySheetFilter,
            weeklySheetName: entry.weeklySheetName,
            weeklySheetData: entry.weeklySheetData?.sheetName,
            scheduleSheet: entry.scheduleSheet,
            sourceWeeklySheet: entry.sourceWeeklySheet,
            primaryVendor: entry.primaryVendor
          });

          // ✅ ENHANCED: Check multiple possible field names for weekly sheet
          const possibleSheetNames = [
            entry.weeklySheetName,
            entry.weeklySheetData?.sheetName,
            entry.scheduleSheet,
            entry.sourceWeeklySheet
          ].filter(Boolean); // Remove undefined/null values

          console.log(`[EnhancedUndoPanel] Entry ${entry.batchId} possible sheet names:`, possibleSheetNames);

          // Check if any of the sheet names match the filter
          const matches = possibleSheetNames.some(sheetName => {
            const match = sheetName === weeklySheetFilter;
            console.log(`[EnhancedUndoPanel] Entry ${entry.batchId} checking "${sheetName}" against "${weeklySheetFilter}": ${match}`);
            return match;
          });

          console.log(`[EnhancedUndoPanel] Entry ${entry.batchId} final match result:`, matches);
          return matches;
        });
        console.log(`[EnhancedUndoPanel] Filtered entries for weekly sheet "${weeklySheetFilter}":`, entries.length);
      }

      setUndoEntries(entries);

      // Show success message if no entries found
      if (entries.length === 0) {
        setSuccess('No undo entries found. This is normal if no transactions have been finalized yet.');
      }

    } catch (error) {
      console.error('[EnhancedUndoPanel] Error loading undo entries:', error);

      // Provide more user-friendly error messages
      let errorMessage = 'Failed to load undo entries.';

      if (error.message.includes('index')) {
        errorMessage = 'Database index is being created. Please wait a few minutes and try again.';
      } else if (error.message.includes('permission')) {
        errorMessage = 'Permission denied. Please check your access rights.';
      } else if (error.message.includes('network')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else {
        errorMessage = `Failed to load undo entries: ${error.message}`;
      }

      setError(errorMessage);
      setUndoEntries([]); // Set empty array to prevent UI issues
    } finally {
      setLoading(false);
    }
  }, [db, weeklySheetFilter, appId]);

  // Add retry function
  const handleRetry = () => {
    console.log('[EnhancedUndoPanel] Retrying to load undo entries...');
    loadUndoEntries();
  };

  const handleUndoBatch = async (batchId) => {
    if (!batchId || !db) return;

    setIsUndoing(true);
    setError(null);
    setSuccess(null);

    try {
      // Confirm with user
      const confirmed = window.confirm(
        `Are you sure you want to undo the selected transaction batch?\n\n` +
        `Batch ID: ${batchId}\n` +
        `This action will:\n` +
        `• Restore original budget balances\n` +
        `• Remove transaction log entries\n` +
        `• Remove archived schedules/vouchers\n` +
        `• Remove WHT return entries\n\n` +
        `This action cannot be reversed for this batch!`
      );

      if (!confirmed) {
        setIsUndoing(false);
        return;
      }

      console.log('[EnhancedUndoPanel] Starting undo for batch:', batchId);

      // CORE WHT INTEGRATION: Clean up WHT entries before undo
      let whtCleanupResult = null;
      if (WHT_CONFIG.USE_ENHANCED_WHT_SERVICE) {
        try {
          console.log('[EnhancedUndoPanel] Cleaning up WHT entries for batch:', batchId);

          // Find and remove WHT return entries for this batch
          const { collection: firestoreCollection, query: firestoreQuery, where, getDocs, deleteDoc } = await import('firebase/firestore');

          // Check both primary and fallback paths
          const paths = [
            `artifacts/${appId}/whtReturns`,
            `artifacts/${appId}/public/data/whtReturns`
          ];

          let totalRemoved = 0;
          let totalFound = 0;

          for (const path of paths) {
            try {
              const whtReturnsRef = firestoreCollection(db, path);
              const whtQuery = firestoreQuery(whtReturnsRef, where('batchId', '==', batchId));
              const whtSnapshot = await getDocs(whtQuery);

              if (!whtSnapshot.empty) {
                console.log(`[EnhancedUndoPanel] Found ${whtSnapshot.docs.length} WHT entries to remove in ${path}`);
                totalFound += whtSnapshot.docs.length;

                for (const doc of whtSnapshot.docs) {
                  try {
                    await deleteDoc(doc.ref);
                    totalRemoved++;
                    console.log(`[EnhancedUndoPanel] ✓ WHT entry removed: ${doc.id}`);
                  } catch (deleteError) {
                    console.error(`[EnhancedUndoPanel] Failed to remove WHT entry ${doc.id}:`, deleteError);
                  }
                }
              }
            } catch (pathError) {
              console.warn(`[EnhancedUndoPanel] Error checking path ${path}:`, pathError);
            }
          }

          whtCleanupResult = {
            success: true,
            removedCount: totalRemoved,
            totalFound: totalFound
          };

          console.log(`[EnhancedUndoPanel] WHT cleanup completed: ${totalRemoved}/${totalFound} entries removed`);

        } catch (whtError) {
          console.warn('[EnhancedUndoPanel] WHT cleanup failed, continuing with undo:', whtError);
          whtCleanupResult = {
            success: false,
            error: whtError.message
          };
        }
      }

      const result = await undoTransactionBatch(db, appId, batchId);

      if (result.success) {
        setSuccess(`Transaction batch "${batchId}" has been successfully undone!`, {
          restoredBudgetLines: result.restoredBudgetLines,
          removedTransactions: result.removedTransactions,
          removedArchives: result.removedArchives,
          removedWHT: whtCleanupResult,
          whtCleanupSuccess: whtCleanupResult?.success
        });

        // Refresh the undo entries
        await loadUndoEntries();

        // Notify parent component
        if (onUndoComplete) {
          onUndoComplete(result);
        }

        // Clear success message after a delay
        setTimeout(() => setSuccess(null), 8000);
      }
    } catch (error) {
      console.error('Error undoing transaction batch:', error);
      setError(`Error during undo process: ${error.message}`);
    } finally {
      setIsUndoing(false);
    }
  };

  const handleCreateTestData = async () => {
    if (!db) {
      setError('Database connection not available');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await createTestUndoData(db, appId);

      if (result.success) {
        setSuccess(`Test undo data created successfully!\n\nBatch ID: ${result.testData.batchId}\nVendor: ${result.testData.primaryVendor}\nAmount: $${result.testData.totalAmount}`, {
          restoredBudgetLines: 0,
          removedTransactions: 0,
          removedArchives: 0,
          removedWHT: 0
        });

        // Refresh the undo entries
        await loadUndoEntries();

        // Clear success message after a delay
        setTimeout(() => setSuccess(null), 8000);
      }
    } catch (error) {
      console.error('Error creating test data:', error);
      setError(`Error creating test data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'Unknown';

    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Invalid date';
    }
  };

  const formatCurrency = (amount) => {
    if (typeof amount !== 'number' || isNaN(amount)) return '$0.00';

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const getStatusIcon = (entry) => {
    if (entry.isUndone) {
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    }
    return <Clock className="w-4 h-4 text-blue-600" />;
  };

  const getStatusText = (entry) => {
    if (entry.isUndone) {
      return 'Undone';
    }
    return 'Available for undo';
  };

  const getStatusColor = (entry) => {
    if (entry.isUndone) {
      return 'bg-green-100 text-green-800 border-green-200';
    }
    return 'bg-blue-100 text-blue-800 border-blue-200';
  };

  const renderSuccessMessage = (successData) => {
    if (!successData || typeof successData === 'string') {
      return <p className="text-green-700 mt-1">{successData || 'Operation completed successfully'}</p>;
    }

    return (
      <div className="text-green-700 mt-1 space-y-1">
        <p className="font-medium">✓ Undo completed successfully!</p>
        <div className="text-sm space-y-1">
          <p>• Budget lines restored: {successData.restoredBudgetLines || 0}</p>
          <p>• Transactions removed: {successData.removedTransactions || 0}</p>
          <p>• Archives removed: {successData.removedArchives || 0}</p>
          <p>• WHT entries removed: {successData.removedWHT || 0}</p>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mr-3" />
          <span className="text-gray-600">Loading undo entries...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Undo2 className="w-6 h-6 text-orange-600" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Transaction Undo Panel</h2>
            {weeklySheetFilter && (
              <p className="text-sm text-blue-600 font-medium">
                Filtered for Weekly Sheet: <span className="font-semibold">{weeklySheetFilter}</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {/* Temporary debug toggle */}
          <button
            onClick={() => setShowAllEntries(!showAllEntries)}
            className={`px-3 py-1 text-xs rounded ${showAllEntries
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700'
              }`}
            title="Toggle to show all entries (debug mode)"
          >
            {showAllEntries ? 'Show Filtered' : 'Show All'}
          </button>

          {/* Close Button */}
          <button
            onClick={onUndoComplete}
            className="px-3 py-2 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
            title="Close undo panel"
          >
            Close
          </button>

          <button
            onClick={loadUndoEntries}
            disabled={loading}
            className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>

        </div>
      </div>

      {/* Description */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-2">
          <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">
              Undo Recent Transactions
              {weeklySheetFilter && ` for ${weeklySheetFilter}`}
            </p>
            <p>
              This panel allows you to undo recently finalized payment transactions
              {weeklySheetFilter ? ` from the selected weekly sheet.` : '.'}
              Only the last 5 batches are available for undo. Use this feature carefully
              as it will reverse all changes including budget updates and transaction logs.
            </p>
            {weeklySheetFilter && (
              <p className="text-xs text-blue-700 mt-2 italic">
                {showAllEntries
                  ? `Debug mode: Showing ALL transactions (filter would be: ${weeklySheetFilter})`
                  : `Showing only transactions from: <strong>${weeklySheetFilter}</strong>`
                }
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Undo Entries */}
      {undoEntries.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Undo2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-lg font-medium">
            {weeklySheetFilter ? `No undo entries for ${weeklySheetFilter}` : 'No undo entries available'}
          </p>
          <p className="text-sm">
            {weeklySheetFilter
              ? `No recently finalized transactions found for this weekly sheet.`
              : 'Recent finalized transactions will appear here for potential undo operations.'
            }
          </p>
          {weeklySheetFilter && (
            <p className="text-xs text-blue-600 mt-2">
              Try checking other weekly sheets or finalizing some transactions first.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {undoEntries.map((entry) => (
            <div
              key={entry.id}
              className={`border rounded-lg p-4 transition-all hover:shadow-md ${selectedBatch === entry.batchId ? 'ring-2 ring-blue-500' : ''
                }`}
            >
              {/* Entry Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(entry)}
                  <div>
                    <h3 className="font-medium text-gray-900">Batch {entry.batchId}</h3>
                    <p className="text-sm text-gray-500">
                      {formatDateTime(entry.datetime || entry.timestamp)}
                    </p>
                    {weeklySheetFilter && (
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-xs text-blue-600 font-medium">✓ Current Sheet</span>
                        {entry.weeklySheetData?.affectedRows && (
                          <span className="text-xs text-gray-500">
                            (Rows: {entry.weeklySheetData.affectedRows.join(', ')})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <span className={`px-3 py-1 text-xs font-medium rounded-full border ${getStatusColor(entry)}`}>
                  {getStatusText(entry)}
                </span>
              </div>

              {/* Entry Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="flex items-center space-x-2">
                  <User className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Primary Vendor</p>
                    <p className="text-sm font-medium text-gray-900">{entry.primaryVendor || 'N/A'}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <DollarSign className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Total Amount</p>
                    <p className="text-sm font-medium text-gray-900">
                      {formatCurrency(entry.totalAmount || 0)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Weekly Sheet</p>
                    <div className="text-sm font-medium text-gray-900">
                      {entry.weeklySheetData?.sheetName || entry.scheduleSheet || entry.sourceWeeklySheet || 'N/A'}
                      {entry.weeklySheetData?.affectedRows && (
                        <div className="text-xs text-gray-500">
                          Rows: {entry.weeklySheetData.affectedRows.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Information */}
              {entry.budgetNames && entry.budgetNames.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1">Affected Budget Lines:</p>
                  <div className="flex flex-wrap gap-2">
                    {entry.budgetNames.map((budgetName, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full"
                      >
                        {budgetName}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Undo Operation Details (if already undone) */}
              {entry.isUndone && entry.undoOperation && (
                <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs text-green-600 mb-1 font-medium">Undo Operation Details:</p>
                  <div className="text-xs text-green-700 space-y-1">
                    <p>• Budget lines restored: {entry.undoOperation.restoredBudgetLines || 0}</p>
                    <p>• Transactions removed: {entry.undoOperation.removedTransactions || 0}</p>
                    <p>• Archives removed: {entry.undoOperation.removedArchives || 0}</p>
                    <p>• WHT entries removed: {entry.undoOperation.removedWHT || 0}</p>
                    <p>• Undone at: {formatDateTime(entry.undoOperation.timestamp)}</p>
                  </div>
                </div>
              )}

              {/* Action Button */}
              {!entry.isUndone && (
                <div className="flex justify-end">
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent event bubbling
                      handleUndoBatch(entry.batchId);
                    }}
                    disabled={isUndoing}
                    className="bg-orange-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                  >
                    {isUndoing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Undoing...</span>
                      </>
                    ) : (
                      <>
                        <Undo2 className="w-4 h-4" />
                        <span>Undo Batch</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
              <span className="text-red-800 font-medium">Error</span>
            </div>
            <button
              onClick={handleRetry}
              disabled={loading}
              className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center space-x-1"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Retry</span>
            </button>
          </div>
          <p className="text-red-700 mt-1">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
            <span className="text-green-800 font-medium">Success</span>
          </div>
          {renderSuccessMessage(success)}
        </div>
      )}

      {/* Footer Information */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="text-sm text-gray-600 space-y-1">
          <p><strong>Note:</strong> Only the last 5 finalized transaction batches are kept for undo operations.</p>
          <p><strong>Warning:</strong> Undoing a batch will reverse all related changes including budget updates, transaction logs, and archives.</p>
          <p><strong>Recommendation:</strong> Review the batch details carefully before proceeding with undo operations.</p>
        </div>
      </div>
    </div>
  );
};

export default EnhancedUndoPanel;
