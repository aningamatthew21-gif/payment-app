import React, { useState, useEffect } from 'react';
import { Plus, Calendar, RefreshCw, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { createNewWeeklySheet, getUserWeeklySheets } from '../services/WeeklySheetService.js';

const EnhancedWeeklySheetCreator = ({ db, userId, onSheetCreated, onBack }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [weekInfo, setWeekInfo] = useState(null);
  const [existingSheets, setExistingSheets] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    // Calculate week info for current date
    const calculateWeekInfo = () => {
      const dayOfWeek = currentDate.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      
      const weekStart = new Date(currentDate);
      weekStart.setDate(currentDate.getDate() - daysToMonday);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      const targetMonthDate = weekEnd;
      const monthName = targetMonthDate.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      
      // Calculate week number within the month
      const firstDayOfMonth = new Date(targetMonthDate.getFullYear(), targetMonthDate.getMonth(), 1);
      const weekStartOfMonth = new Date(firstDayOfMonth);
      const firstDayOfWeek = firstDayOfMonth.getDay();
      const daysToFirstMonday = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
      weekStartOfMonth.setDate(firstDayOfMonth.getDate() - daysToFirstMonday);
      
      let weekNum = 1;
      if (weekStart >= weekStartOfMonth) {
        const weeksDiff = Math.floor((weekStart - weekStartOfMonth) / (7 * 24 * 60 * 60 * 1000));
        weekNum = weeksDiff + 1;
      }
      
      if (weekNum <= 0) weekNum = 1;
      
      return {
        monthName,
        weekNumber: weekNum,
        weekStart,
        weekEnd,
        sheetName: `${monthName}-WEEK-${weekNum}`
      };
    };

    setWeekInfo(calculateWeekInfo());
  }, [currentDate]);

  useEffect(() => {
    // Load existing sheets
    const loadExistingSheets = async () => {
      try {
        const sheets = await getUserWeeklySheets(db, userId);
        setExistingSheets(sheets);
      } catch (error) {
        console.error('Error loading existing sheets:', error);
        setError('Failed to load existing sheets');
      }
    };

    loadExistingSheets();
  }, [db, userId]);

  const handleDateChange = (event) => {
    const newDate = new Date(event.target.value);
    setCurrentDate(newDate);
  };

  const handleCreateSheet = async () => {
    if (!weekInfo) return;

    setIsCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const newSheet = await createNewWeeklySheet(db, userId, currentDate);
      
      setSuccess(`Weekly sheet "${newSheet.name}" created successfully!`);
      
      // Refresh existing sheets
      const sheets = await getUserWeeklySheets(db, userId);
      setExistingSheets(sheets);
      
      // Notify parent component
      if (onSheetCreated) {
        onSheetCreated(newSheet);
      }
      
      // Auto-navigate after a short delay
      setTimeout(() => {
        if (onSheetCreated) {
          onSheetCreated(newSheet);
        }
      }, 2000);
      
    } catch (error) {
      console.error('Error creating weekly sheet:', error);
      setError(error.message || 'Failed to create weekly sheet');
    } finally {
      setIsCreating(false);
    }
  };

  const isSheetExists = weekInfo && existingSheets.some(sheet => sheet.name === weekInfo.sheetName);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Enhanced Weekly Sheet Creator</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Sheet Creation */}
        <div className="space-y-6">
          {/* Date Selection */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Calendar className="w-5 h-5 mr-2 text-blue-600" />
              Select Week
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Week Starting Date
                </label>
                <input
                  type="date"
                  value={currentDate.toISOString().split('T')[0]}
                  onChange={handleDateChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              {weekInfo && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-medium text-blue-900 mb-2">Week Information</h3>
                  <div className="space-y-2 text-sm text-blue-800">
                    <div className="flex justify-between">
                      <span>Month:</span>
                      <span className="font-medium">{weekInfo.monthName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Week Number:</span>
                      <span className="font-medium">{weekInfo.weekNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Week Start:</span>
                      <span className="font-medium">{weekInfo.weekStart.toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Week End:</span>
                      <span className="font-medium">{weekInfo.weekEnd.toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Sheet Name:</span>
                      <span className="font-medium font-mono">{weekInfo.sheetName}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sheet Creation */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Plus className="w-5 h-5 mr-2 text-green-600" />
              Create Sheet
            </h2>
            
            {isSheetExists ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mr-2" />
                  <span className="text-yellow-800 font-medium">
                    Sheet "{weekInfo.sheetName}" already exists
                  </span>
                </div>
                <p className="text-yellow-700 text-sm mt-2">
                  A weekly sheet for this week has already been created. You can view or edit it from the weekly sheets list.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-gray-600 text-sm">
                  This will create a new weekly sheet with automatic rollover of pending transactions from the previous week.
                </p>
                
                <button
                  onClick={handleCreateSheet}
                  disabled={isCreating || !weekInfo}
                  className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                >
                  {isCreating ? (
                    <>
                      <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                      Creating Sheet...
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5 mr-2" />
                      Create Weekly Sheet
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Information & Status */}
        <div className="space-y-6">
          {/* Rollover Information */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Info className="w-5 h-5 mr-2 text-blue-600" />
              Rollover Information
            </h2>
            
            <div className="space-y-3 text-sm text-gray-700">
              <div className="flex items-start space-x-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Pending transactions from previous week will be automatically rolled over</span>
              </div>
              <div className="flex items-start space-x-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Rolled over items will be marked as "Pending (Rollover)"</span>
              </div>
              <div className="flex items-start space-x-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Previous week sheet will be archived and protected</span>
              </div>
              <div className="flex items-start space-x-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Formulas and formatting will be preserved from template</span>
              </div>
            </div>
          </div>

          {/* Recent Sheets */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Weekly Sheets</h2>
            
            {existingSheets.length > 0 ? (
              <div className="space-y-2">
                {existingSheets.slice(0, 5).map((sheet) => (
                  <div
                    key={sheet.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      sheet.status === 'active' 
                        ? 'border-green-200 bg-green-50' 
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div>
                      <div className="font-medium text-gray-900">{sheet.name}</div>
                      <div className="text-sm text-gray-500">
                        Created {sheet.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {sheet.rolloverCount > 0 && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                          {sheet.rolloverCount} rolled over
                        </span>
                      )}
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        sheet.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {sheet.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-4">
                No weekly sheets created yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
            <span className="text-red-800 font-medium">Error</span>
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
          <p className="text-green-700 mt-1">{success}</p>
        </div>
      )}
    </div>
  );
};

export default EnhancedWeeklySheetCreator;
