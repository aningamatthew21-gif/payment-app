import React, { useState } from 'react';
import {
  Settings,
  X,
  RefreshCw,
  Database,
  FileText,
  TestTube,
  Bug,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Info,
  Zap,
  BarChart3,
  Shield,
  Cpu,
  Network,
  FileSpreadsheet,
  Calculator,
  Eye,
  Search,
  Wrench,
  Plus,
  DollarSign
} from 'lucide-react';

const TestSettingsPanel = ({ 
  isOpen, 
  onClose, 
  testFunctions,
  db,
  appId,
  userId 
}) => {
  const [activeCategory, setActiveCategory] = useState('database');

  const testCategories = [
    {
      id: 'database',
      name: 'Database',
      icon: Database,
      color: 'bg-blue-500',
      tests: [
        {
          id: 'testConnection',
          name: 'Test Connection',
          description: 'Tests Master Log connection and data retrieval',
          icon: Network,
          color: 'bg-orange-500',
          function: testFunctions?.testConnection,
          resultLocation: 'Console - Check browser developer tools'
        },
        {
          id: 'migrateDB',
          name: 'Migrate DB',
          description: 'Migrates existing budget lines to new schema',
          icon: Database,
          color: 'bg-orange-500',
          function: testFunctions?.migrateDB,
          resultLocation: 'Alert popup with migration results'
        },
        {
          id: 'checkStatus',
          name: 'Check Status',
          description: 'Checks migration status of budget lines',
          icon: CheckCircle,
          color: 'bg-blue-500',
          function: testFunctions?.checkStatus,
          resultLocation: 'Alert popup with status details'
        },
        {
          id: 'testCurrencyRates',
          name: 'Test Currency Rates',
          description: 'Tests dynamic currency exchange rate functionality',
          icon: DollarSign,
          color: 'bg-green-500',
          function: testFunctions?.testCurrencyRates,
          resultLocation: 'Console - Currency rate test results'
        }
      ]
    },
    {
      id: 'masterlog',
      name: 'Master Log',
      icon: FileText,
      color: 'bg-indigo-500',
      tests: [
        {
          id: 'debugData',
          name: 'Debug Data',
          description: 'Analyzes master log data structure and field availability',
          icon: Search,
          color: 'bg-purple-600',
          function: testFunctions?.debugData,
          resultLocation: 'Console - Detailed data structure analysis'
        },
        {
          id: 'debugTable',
          name: 'Debug Table',
          description: 'Verifies table structure and column mapping (25 columns)',
          icon: BarChart3,
          color: 'bg-indigo-600',
          function: testFunctions?.debugTable,
          resultLocation: 'Console - Table structure verification'
        },
        {
          id: 'testAll',
          name: 'Test All',
          description: 'Runs complete system test (data + table + mapping)',
          icon: Zap,
          color: 'bg-green-600',
          function: testFunctions?.testAll,
          resultLocation: 'Console - Comprehensive system analysis'
        }
      ]
    },
    {
      id: 'payment',
      name: 'Payment System',
      icon: Calculator,
      color: 'bg-green-500',
      tests: [
        {
          id: 'testFinalization',
          name: 'Test Finalization',
          description: 'Tests payment finalization process in debug mode',
          icon: CheckCircle,
          color: 'bg-yellow-600',
          function: testFunctions?.testFinalization,
          resultLocation: 'Console - Finalization process logs'
        },
        {
          id: 'testBudgetLines',
          name: 'Test Budget Lines',
          description: 'Tests budget line resolution for selected payments',
          icon: BarChart3,
          color: 'bg-purple-600',
          function: testFunctions?.testBudgetLines,
          resultLocation: 'Console - Budget line resolution details'
        },
        {
          id: 'testRates',
          name: 'Test Rates',
          description: 'Tests dynamic rate calculation for WHT and levy rates',
          icon: Calculator,
          color: 'bg-yellow-500',
          function: testFunctions?.testRates,
          resultLocation: 'Console - Rate calculation results'
        }
      ]
    },
    {
      id: 'pdf',
      name: 'PDF Generation',
      icon: FileText,
      color: 'bg-red-500',
      tests: [
        {
          id: 'debugPDF',
          name: 'Debug PDF',
          description: 'Comprehensive PDF generation debugging and testing',
          icon: Bug,
          color: 'bg-orange-600',
          function: testFunctions?.debugPDF,
          resultLocation: 'Console - PDF generation analysis'
        }
      ]
    },
    {
      id: 'maintenance',
      name: 'Maintenance',
      icon: Wrench,
      color: 'bg-gray-500',
      tests: [
        {
          id: 'cleanBudgetLines',
          name: 'Clean Budget Lines',
          description: 'Removes problematic budget lines (WATER, etc.)',
          icon: Trash2,
          color: 'bg-red-600',
          function: testFunctions?.cleanBudgetLines,
          resultLocation: 'Alert popup with cleanup results'
        },
        {
          id: 'createTestData',
          name: 'Create Test Data',
          description: 'Creates sample undo data for testing purposes',
          icon: TestTube,
          color: 'bg-purple-500',
          function: testFunctions?.createTestData,
          resultLocation: 'Alert popup with test data creation status'
        }
      ]
    },
    {
      id: 'system',
      name: 'System',
      icon: Cpu,
      color: 'bg-purple-500',
      tests: [
        {
          id: 'debugState',
          name: 'Debug State',
          description: 'Shows current component state and debug information',
          icon: Eye,
          color: 'bg-yellow-500',
          function: testFunctions?.debugState,
          resultLocation: 'Alert popup with state information'
        },
        {
          id: 'testAdd',
          name: 'Test Add',
          description: 'Populates forms with test data for validation testing',
          icon: Plus,
          color: 'bg-orange-500',
          function: testFunctions?.testAdd,
          resultLocation: 'Form fields populated with test data'
        }
      ]
    }
  ];

  const handleTestClick = (test) => {
    if (test.function) {
      try {
        test.function();
      } catch (error) {
        console.error(`Error running test ${test.name}:`, error);
        alert(`Test failed: ${error.message}`);
      }
    } else {
      alert(`Test function for ${test.name} is not available`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Settings className="w-6 h-6 text-gray-600" />
            <h2 className="text-xl font-semibold text-gray-800">Test & Debug Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 bg-gray-50 border-r border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Test Categories</h3>
            <div className="space-y-2">
              {testCategories.map((category) => {
                const IconComponent = category.icon;
                return (
                  <button
                    key={category.id}
                    onClick={() => setActiveCategory(category.id)}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                      activeCategory === category.id
                        ? 'bg-white shadow-sm border border-gray-200'
                        : 'hover:bg-white hover:shadow-sm'
                    }`}
                  >
                    <IconComponent className={`w-4 h-4 ${category.color.replace('bg-', 'text-')}`} />
                    <span className="text-sm font-medium text-gray-700">{category.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                {testCategories.find(c => c.id === activeCategory)?.name} Tests
              </h3>
              <p className="text-sm text-gray-600">
                Click on any test button to run the functionality. Hover over buttons for detailed descriptions.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {testCategories
                .find(c => c.id === activeCategory)
                ?.tests.map((test) => {
                  const IconComponent = test.icon;
                  return (
                    <div
                      key={test.id}
                      className="group relative bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all"
                    >
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                        <div className="font-medium mb-1">{test.description}</div>
                        <div className="text-gray-300">Results: {test.resultLocation}</div>
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                      </div>

                      <button
                        onClick={() => handleTestClick(test)}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${test.color} text-white hover:opacity-90`}
                      >
                        <IconComponent className="w-5 h-5" />
                        <span className="font-medium">{test.name}</span>
                      </button>
                    </div>
                  );
                })}
            </div>

            {/* Info Section */}
            <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-blue-800 mb-1">How to Use Test Functions</h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• Hover over any test button to see what it does and where to find results</li>
                    <li>• Most tests output results to the browser console (F12 → Console tab)</li>
                    <li>• Some tests show results in alert popups</li>
                    <li>• Test functions are safe and won't affect production data</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestSettingsPanel;
