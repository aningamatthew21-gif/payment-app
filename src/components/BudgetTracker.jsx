import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, onSnapshot, orderBy, db } from 'firebase/firestore';
// import { useAuth } from '../contexts/AuthContext';

const BudgetTracker = ({ weeklySheetId, weeklySheetName }) => {
  const { db, userId, appId } = useAuth();
  const [budgetData, setBudgetData] = useState({
    budgetLines: [],
    spendingPatterns: [],
    monthlyBreakdown: [],
    vendorSpending: [],
    categoryAnalysis: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBudgetLine, setSelectedBudgetLine] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState('12months');
  const [showDetails, setShowDetails] = useState(false);

  // Fetch budget data
  useEffect(() => {
    if (!db || !appId) return;
    
    const fetchBudgetData = async () => {
      try {
        setIsLoading(true);
        
        // Fetch finalized transactions
        const logRef = collection(db, `artifacts/${appId}/public/transactionLog`);
        const q = query(
          logRef,
          where('status', '==', 'finalized'),
          orderBy('timestamp', 'desc')
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const transactions = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          
          // Process budget data
          const processedData = processBudgetData(transactions);
          setBudgetData(processedData);
          setIsLoading(false);
        });
        
        return unsubscribe;
      } catch (error) {
        console.error('Error fetching budget data:', error);
        setIsLoading(false);
      }
    };

    fetchBudgetData();
  }, [db, appId, selectedPeriod]);

  const processBudgetData = (transactions) => {
    if (!transactions.length) return budgetData;

    // Filter transactions by selected period
    const filteredTransactions = filterTransactionsByPeriod(transactions, selectedPeriod);
    
    // Budget line analysis
    const budgetLines = analyzeBudgetLines(filteredTransactions);
    
    // Spending patterns
    const spendingPatterns = analyzeSpendingPatterns(filteredTransactions);
    
    // Monthly breakdown
    const monthlyBreakdown = analyzeMonthlyBreakdown(filteredTransactions);
    
    // Vendor spending by budget line
    const vendorSpending = analyzeVendorSpending(filteredTransactions);
    
    // Category analysis
    const categoryAnalysis = analyzeCategories(filteredTransactions);

    return {
      budgetLines,
      spendingPatterns,
      monthlyBreakdown,
      vendorSpending,
      categoryAnalysis
    };
  };

  const filterTransactionsByPeriod = (transactions, period) => {
    const now = new Date();
    const cutoffDate = new Date();
    
    switch (period) {
      case '3months':
        cutoffDate.setMonth(now.getMonth() - 3);
        break;
      case '6months':
        cutoffDate.setMonth(now.getMonth() - 6);
        break;
      case '12months':
        cutoffDate.setFullYear(now.getFullYear() - 1);
        break;
      case 'ytd':
        cutoffDate.setMonth(0, 1);
        break;
      default:
        return transactions;
    }
    
    return transactions.filter(t => new Date(t.timestamp) >= cutoffDate);
  };

  const analyzeBudgetLines = (transactions) => {
    const budgetData = {};
    
    transactions.forEach(t => {
      t.payments.forEach(p => {
        const budgetLine = p.budgetLine || 'Uncategorized';
        if (!budgetData[budgetLine]) {
          budgetData[budgetLine] = {
            budgetLine: budgetLine,
            totalSpent: 0,
            paymentCount: 0,
            averagePayment: 0,
            lastPayment: null,
            currencyBreakdown: {},
            vendorCount: new Set()
          };
        }
        
        budgetData[budgetLine].totalSpent += parseFloat(p.amount || 0);
        budgetData[budgetLine].paymentCount += 1;
        budgetData[budgetLine].vendorCount.add(p.vendor || 'Unknown');
        
        // Currency breakdown
        const currency = p.currency || 'GHS';
        if (!budgetData[budgetLine].currencyBreakdown[currency]) {
          budgetData[budgetLine].currencyBreakdown[currency] = 0;
        }
        budgetData[budgetLine].currencyBreakdown[currency] += parseFloat(p.amount || 0);
        
        // Last payment date
        const paymentDate = new Date(t.timestamp);
        if (!budgetData[budgetLine].lastPayment || paymentDate > budgetData[budgetLine].lastPayment) {
          budgetData[budgetLine].lastPayment = paymentDate;
        }
      });
    });
    
    // Calculate averages and convert sets to counts
    Object.values(budgetData).forEach(budget => {
      budget.averagePayment = budget.totalSpent / budget.paymentCount;
      budget.vendorCount = budget.vendorCount.size;
      budget.currencyBreakdown = Object.entries(budget.currencyBreakdown).map(([currency, amount]) => ({
        currency,
        amount,
        percentage: (amount / budget.totalSpent) * 100
      }));
    });
    
    return Object.values(budgetData)
      .sort((a, b) => b.totalSpent - a.totalSpent);
  };

  const analyzeSpendingPatterns = (transactions) => {
    const patterns = {
      daily: {},
      weekly: {},
      monthly: {}
    };
    
    transactions.forEach(t => {
      const date = new Date(t.timestamp);
      const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
      const month = date.toLocaleDateString('en-US', { month: 'long' });
      const dateKey = date.toISOString().slice(0, 10);
      
      // Daily patterns
      if (!patterns.daily[dateKey]) {
        patterns.daily[dateKey] = { amount: 0, count: 0 };
      }
      patterns.daily[dateKey].amount += t.totalAmount;
      patterns.daily[dateKey].count += t.paymentCount;
      
      // Weekly patterns
      if (!patterns.weekly[dayOfWeek]) {
        patterns.weekly[dayOfWeek] = { amount: 0, count: 0 };
      }
      patterns.weekly[dayOfWeek].amount += t.totalAmount;
      patterns.weekly[dayOfWeek].count += t.paymentCount;
      
      // Monthly patterns
      if (!patterns.monthly[month]) {
        patterns.monthly[month] = { amount: 0, count: 0 };
      }
      patterns.monthly[month].amount += t.totalAmount;
      patterns.monthly[month].count += t.paymentCount;
    });
    
    return {
      daily: Object.entries(patterns.daily)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 30), // Last 30 days
      weekly: Object.entries(patterns.weekly)
        .map(([day, data]) => ({ day, ...data })),
      monthly: Object.entries(patterns.monthly)
        .map(([month, data]) => ({ month, ...data }))
    };
  };

  const analyzeMonthlyBreakdown = (transactions) => {
    const monthlyData = {};
    
    transactions.forEach(t => {
      const month = new Date(t.timestamp).toISOString().slice(0, 7);
      if (!monthlyData[month]) {
        monthlyData[month] = {
          month: month,
          totalAmount: 0,
          paymentCount: 0,
          budgetLines: {},
          vendors: new Set()
        };
      }
      
      monthlyData[month].totalAmount += t.totalAmount;
      monthlyData[month].paymentCount += t.paymentCount;
      
      t.payments.forEach(p => {
        const budgetLine = p.budgetLine || 'Uncategorized';
        if (!monthlyData[month].budgetLines[budgetLine]) {
          monthlyData[month].budgetLines[budgetLine] = 0;
        }
        monthlyData[month].budgetLines[budgetLine] += parseFloat(p.amount || 0);
        monthlyData[month].vendors.add(p.vendor || 'Unknown');
      });
    });
    
    // Convert budget lines to arrays and vendors to counts
    Object.values(monthlyData).forEach(month => {
      month.budgetLines = Object.entries(month.budgetLines)
        .map(([line, amount]) => ({ line, amount }))
        .sort((a, b) => b.amount - a.amount);
      month.vendors = month.vendors.size;
    });
    
    return Object.values(monthlyData)
      .sort((a, b) => a.month.localeCompare(b.month));
  };

  const analyzeVendorSpending = (transactions) => {
    const vendorData = {};
    
    transactions.forEach(t => {
      t.payments.forEach(p => {
        const vendor = p.vendor || 'Unknown Vendor';
        const budgetLine = p.budgetLine || 'Uncategorized';
        
        if (!vendorData[vendor]) {
          vendorData[vendor] = {
            vendor: vendor,
            totalSpent: 0,
            paymentCount: 0,
            budgetLines: {},
            averagePayment: 0
          };
        }
        
        vendorData[vendor].totalSpent += parseFloat(p.amount || 0);
        vendorData[vendor].paymentCount += 1;
        
        if (!vendorData[vendor].budgetLines[budgetLine]) {
          vendorData[vendor].budgetLines[budgetLine] = 0;
        }
        vendorData[vendor].budgetLines[budgetLine] += parseFloat(p.amount || 0);
      });
    });
    
    // Calculate averages and convert budget lines to arrays
    Object.values(vendorData).forEach(vendor => {
      vendor.averagePayment = vendor.totalSpent / vendor.paymentCount;
      vendor.budgetLines = Object.entries(vendor.budgetLines)
        .map(([line, amount]) => ({ line, amount, percentage: (amount / vendor.totalSpent) * 100 }))
        .sort((a, b) => b.amount - a.amount);
    });
    
    return Object.values(vendorData)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 20); // Top 20 vendors
  };

  const analyzeCategories = (transactions) => {
    const categoryData = {
      procurementTypes: {},
      taxTypes: {},
      paymentModes: {},
      currencies: {}
    };
    
    transactions.forEach(t => {
      t.payments.forEach(p => {
        // Procurement types
        const procType = p.procurementType || 'Unknown';
        if (!categoryData.procurementTypes[procType]) {
          categoryData.procurementTypes[procType] = { type: procType, amount: 0, count: 0 };
        }
        categoryData.procurementTypes[procType].amount += parseFloat(p.amount || 0);
        categoryData.procurementTypes[procType].count += 1;
        
        // Tax types
        const taxType = p.taxType || 'None';
        if (!categoryData.taxTypes[taxType]) {
          categoryData.taxTypes[taxType] = { type: taxType, amount: 0, count: 0 };
        }
        categoryData.taxTypes[taxType].amount += parseFloat(p.amount || 0);
        categoryData.taxTypes[taxType].count += 1;
        
        // Payment modes
        const paymentMode = p.paymentMode || 'Unknown';
        if (!categoryData.paymentModes[paymentMode]) {
          categoryData.paymentModes[paymentMode] = { mode: paymentMode, amount: 0, count: 0 };
        }
        categoryData.paymentModes[paymentMode].amount += parseFloat(p.amount || 0);
        categoryData.paymentModes[paymentMode].count += 1;
        
        // Currencies
        const currency = p.currency || 'GHS';
        if (!categoryData.currencies[currency]) {
          categoryData.currencies[currency] = { currency: currency, amount: 0, count: 0 };
        }
        categoryData.currencies[currency].amount += parseFloat(p.amount || 0);
        categoryData.currencies[currency].count += 1;
      });
    });
    
    // Convert to arrays and sort
    Object.keys(categoryData).forEach(key => {
      categoryData[key] = Object.values(categoryData[key])
        .sort((a, b) => b.amount - a.amount);
    });
    
    return categoryData;
  };

  const formatCurrency = (amount, currency = 'GHS') => {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatNumber = (number) => {
    return new Intl.NumberFormat('en-GH').format(number);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-GH');
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Budget Tracker</h2>
        <div className="flex gap-2">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="3months">Last 3 Months</option>
            <option value="6months">Last 6 Months</option>
            <option value="12months">Last 12 Months</option>
            <option value="ytd">Year to Date</option>
          </select>
          <select
            value={selectedBudgetLine}
            onChange={(e) => setSelectedBudgetLine(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="all">All Budget Lines</option>
            {budgetData.budgetLines.map(budget => (
              <option key={budget.budgetLine} value={budget.budgetLine}>
                {budget.budgetLine}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Budget Line Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="text-blue-600 text-sm font-medium">Total Budget Lines</div>
          <div className="text-2xl font-bold text-blue-800">{budgetData.budgetLines.length}</div>
          <div className="text-blue-600 text-xs">Active budget lines</div>
        </div>
        
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="text-green-600 text-sm font-medium">Total Spent</div>
          <div className="text-2xl font-bold text-green-800">
            {formatCurrency(budgetData.budgetLines.reduce((sum, b) => sum + b.totalSpent, 0))}
          </div>
          <div className="text-green-600 text-xs">In selected period</div>
        </div>
        
        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <div className="text-purple-600 text-sm font-medium">Average Spending</div>
          <div className="text-2xl font-bold text-purple-800">
            {formatCurrency(budgetData.budgetLines.reduce((sum, b) => sum + b.totalSpent, 0) / 
                          Math.max(budgetData.budgetLines.length, 1))}
          </div>
          <div className="text-purple-600 text-xs">Per budget line</div>
        </div>
      </div>

      {/* Budget Lines Table */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Budget Line Analysis</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 text-sm font-medium text-gray-600">Budget Line</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600">Total Spent</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600">Payments</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600">Average</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600">Vendors</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600">Last Payment</th>
                <th className="text-center py-2 px-2 text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {budgetData.budgetLines.map((budget, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-2 text-sm text-gray-800 font-medium">{budget.budgetLine}</td>
                  <td className="py-2 px-2 text-sm text-gray-800 text-right">{formatCurrency(budget.totalSpent)}</td>
                  <td className="py-2 px-2 text-sm text-gray-800 text-right">{formatNumber(budget.paymentCount)}</td>
                  <td className="py-2 px-2 text-sm text-gray-800 text-right">{formatCurrency(budget.averagePayment)}</td>
                  <td className="py-2 px-2 text-sm text-gray-800 text-right">{budget.vendorCount}</td>
                  <td className="py-2 px-2 text-sm text-gray-800 text-right">
                    {budget.lastPayment ? formatDate(budget.lastPayment) : 'N/A'}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <button
                      onClick={() => setShowDetails(showDetails === budget.budgetLine ? null : budget.budgetLine)}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      {showDetails === budget.budgetLine ? 'Hide' : 'Details'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Budget Line Details */}
      {showDetails && (
        <div className="mb-8 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold text-gray-800 mb-4">
            Details for: {showDetails}
          </h4>
          {(() => {
            const budget = budgetData.budgetLines.find(b => b.budgetLine === showDetails);
            if (!budget) return null;
            
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Currency Breakdown */}
                <div>
                  <h5 className="font-medium text-gray-700 mb-2">Currency Breakdown</h5>
                  <div className="space-y-2">
                    {budget.currencyBreakdown.map((currency, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{currency.currency}</span>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-800">{formatCurrency(currency.amount, currency.currency)}</div>
                          <div className="text-xs text-gray-500">{currency.percentage.toFixed(1)}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Spending Trends */}
                <div>
                  <h5 className="font-medium text-gray-700 mb-2">Spending Summary</h5>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Total Spent:</span>
                      <span className="text-sm font-medium text-gray-800">{formatCurrency(budget.totalSpent)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Payment Count:</span>
                      <span className="text-sm font-medium text-gray-800">{formatNumber(budget.paymentCount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Average Payment:</span>
                      <span className="text-sm font-medium text-gray-800">{formatCurrency(budget.averagePayment)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Unique Vendors:</span>
                      <span className="text-sm font-medium text-gray-800">{budget.vendorCount}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Category Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Procurement Types */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-semibold text-gray-800 mb-3">Procurement Types</h4>
          <div className="space-y-2">
            {budgetData.categoryAnalysis.procurementTypes.map((type, index) => (
              <div key={index} className="flex justify-between items-center">
                <span className="text-sm text-gray-700">{type.type}</span>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-800">{formatCurrency(type.amount)}</div>
                  <div className="text-xs text-gray-500">{formatNumber(type.count)} payments</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tax Types */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-semibold text-gray-800 mb-3">Tax Types</h4>
          <div className="space-y-2">
            {budgetData.categoryAnalysis.taxTypes.map((tax, index) => (
              <div key={index} className="flex justify-between items-center">
                <span className="text-sm text-gray-700">{tax.type}</span>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-800">{formatCurrency(tax.amount)}</div>
                  <div className="text-xs text-gray-500">{formatNumber(tax.count)} payments</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly Breakdown */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Monthly Spending Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 text-sm font-medium text-gray-600">Month</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600">Total Amount</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600">Payment Count</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600">Budget Lines</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600">Vendors</th>
              </tr>
            </thead>
            <tbody>
              {budgetData.monthlyBreakdown.map((month, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-2 text-sm text-gray-800 font-medium">{month.month}</td>
                  <td className="py-2 px-2 text-sm text-gray-800 text-right">{formatCurrency(month.totalAmount)}</td>
                  <td className="py-2 px-2 text-sm text-gray-800 text-right">{formatNumber(month.paymentCount)}</td>
                  <td className="py-2 px-2 text-sm text-gray-800 text-right">{month.budgetLines.length}</td>
                  <td className="py-2 px-2 text-sm text-gray-800 text-right">{month.vendors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Export Options */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg">
        <h4 className="font-semibold text-blue-800 mb-2">Export Budget Data</h4>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm">
            Export Budget Report
          </button>
          <button className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm">
            Generate Spending Analysis
          </button>
          <button className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors text-sm">
            Budget vs Actual
          </button>
        </div>
      </div>
    </div>
  );
};

export default BudgetTracker; 