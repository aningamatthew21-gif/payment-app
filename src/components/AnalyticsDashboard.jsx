import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, db, limit, onSnapshot } from 'firebase/firestore';
// import { useAuth } from '../contexts/AuthContext';

const AnalyticsDashboard = ({ weeklySheetId, weeklySheetName }) => {
  // const { db, userId, appId } = useAuth();
  const [analyticsData, setAnalyticsData] = useState({
    totalPayments: 0,
    totalAmount: 0,
    averagePayment: 0,
    budgetUtilization: [],
    paymentTrends: [],
    vendorPerformance: [],
    taxSummary: {
      totalWHT: 0,
      totalVAT: 0,
      totalLevy: 0,
      totalMoMo: 0
    },
    currencyBreakdown: [],
    monthlyTrends: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState('month');
  const [selectedMetric, setSelectedMetric] = useState('amount');

  // Fetch analytics data
  useEffect(() => {
    if (!db || !appId) return;
    
    const fetchAnalyticsData = async () => {
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
          
          // Process analytics data
          const processedData = processAnalyticsData(transactions);
          setAnalyticsData(processedData);
          setIsLoading(false);
        });
        
        return unsubscribe;
      } catch (error) {
        console.error('Error fetching analytics data:', error);
        setIsLoading(false);
      }
    };

    fetchAnalyticsData();
  }, [db, appId, selectedTimeframe]);

  const processAnalyticsData = (transactions) => {
    if (!transactions.length) return analyticsData;

    // Basic metrics
    const totalPayments = transactions.reduce((sum, t) => sum + t.paymentCount, 0);
    const totalAmount = transactions.reduce((sum, t) => sum + t.totalAmount, 0);
    const averagePayment = totalPayments > 0 ? totalAmount / totalPayments : 0;

    // Budget utilization
    const budgetData = {};
    transactions.forEach(t => {
      t.payments.forEach(p => {
        const budgetLine = p.budgetLine || 'Uncategorized';
        if (!budgetData[budgetLine]) {
          budgetData[budgetLine] = 0;
        }
        budgetData[budgetLine] += parseFloat(p.amount || 0);
      });
    });

    const budgetUtilization = Object.entries(budgetData)
      .map(([line, amount]) => ({
        budgetLine: line,
        amount: amount,
        percentage: (amount / totalAmount) * 100
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10); // Top 10 budget lines

    // Payment trends (last 12 periods)
    const trends = generatePaymentTrends(transactions, selectedTimeframe);

    // Vendor performance
    const vendorData = {};
    transactions.forEach(t => {
      t.payments.forEach(p => {
        const vendor = p.vendor || 'Unknown Vendor';
        if (!vendorData[vendor]) {
          vendorData[vendor] = {
            vendor: vendor,
            totalAmount: 0,
            paymentCount: 0,
            averageAmount: 0
          };
        }
        vendorData[vendor].totalAmount += parseFloat(p.amount || 0);
        vendorData[vendor].paymentCount += 1;
      });
    });

    // Calculate averages
    Object.values(vendorData).forEach(vendor => {
      vendor.averageAmount = vendor.totalAmount / vendor.paymentCount;
    });

    const vendorPerformance = Object.values(vendorData)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 10); // Top 10 vendors

    // Tax summary
    const taxSummary = {
      totalWHT: 0,
      totalVAT: 0,
      totalLevy: 0,
      totalMoMo: 0
    };

    transactions.forEach(t => {
      t.payments.forEach(p => {
        taxSummary.totalWHT += parseFloat(p.whtAmount || 0);
        taxSummary.totalVAT += parseFloat(p.vatAmount || 0);
        taxSummary.totalLevy += parseFloat(p.levyAmount || 0);
        taxSummary.totalMoMo += parseFloat(p.momoCharge || 0);
      });
    });

    // Currency breakdown
    const currencyData = {};
    transactions.forEach(t => {
      t.payments.forEach(p => {
        const currency = p.currency || 'GHS';
        if (!currencyData[currency]) {
          currencyData[currency] = 0;
        }
        currencyData[currency] += parseFloat(p.amount || 0);
      });
    });

    const currencyBreakdown = Object.entries(currencyData)
      .map(([currency, amount]) => ({
        currency,
        amount,
        percentage: (amount / totalAmount) * 100
      }));

    // Monthly trends
    const monthlyData = {};
    transactions.forEach(t => {
      const month = new Date(t.timestamp).toISOString().slice(0, 7); // YYYY-MM
      if (!monthlyData[month]) {
        monthlyData[month] = {
          month: month,
          totalAmount: 0,
          paymentCount: 0
        };
      }
      monthlyData[month].totalAmount += t.totalAmount;
      monthlyData[month].paymentCount += t.paymentCount;
    });

    const monthlyTrends = Object.values(monthlyData)
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12); // Last 12 months

    return {
      totalPayments,
      totalAmount,
      averagePayment,
      budgetUtilization,
      paymentTrends: trends,
      vendorPerformance,
      taxSummary,
      currencyBreakdown,
      monthlyTrends
    };
  };

  const generatePaymentTrends = (transactions, timeframe) => {
    const trends = [];
    const now = new Date();
    
    if (timeframe === 'week') {
      // Last 12 weeks
      for (let i = 11; i >= 0; i--) {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - (i * 7));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        
        const weekTransactions = transactions.filter(t => {
          const txDate = new Date(t.timestamp);
          return txDate >= weekStart && txDate <= weekEnd;
        });
        
        const weekAmount = weekTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
        const weekCount = weekTransactions.reduce((sum, t) => sum + t.paymentCount, 0);
        
        trends.push({
          period: `Week ${i + 1}`,
          amount: weekAmount,
          count: weekCount,
          date: weekStart.toISOString().slice(0, 10)
        });
      }
    } else if (timeframe === 'month') {
      // Last 12 months
      for (let i = 11; i >= 0; i--) {
        const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStr = month.toISOString().slice(0, 7);
        
        const monthTransactions = transactions.filter(t => 
          t.timestamp.startsWith(monthStr)
        );
        
        const monthAmount = monthTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
        const monthCount = monthTransactions.reduce((sum, t) => sum + t.paymentCount, 0);
        
        trends.push({
          period: month.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          amount: monthAmount,
          count: monthCount,
          date: monthStr
        });
      }
    }

    return trends;
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

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-64 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Analytics Dashboard</h2>
        <div className="flex gap-2">
          <select
            value={selectedTimeframe}
            onChange={(e) => setSelectedTimeframe(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="amount">Amount</option>
            <option value="count">Count</option>
          </select>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="text-blue-600 text-sm font-medium">Total Payments</div>
          <div className="text-2xl font-bold text-blue-800">{formatNumber(analyticsData.totalPayments)}</div>
          <div className="text-blue-600 text-xs">Finalized transactions</div>
        </div>
        
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="text-green-600 text-sm font-medium">Total Amount</div>
          <div className="text-2xl font-bold text-green-800">{formatCurrency(analyticsData.totalAmount)}</div>
          <div className="text-green-600 text-xs">GHS equivalent</div>
        </div>
        
        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <div className="text-purple-600 text-sm font-medium">Average Payment</div>
          <div className="text-2xl font-bold text-purple-800">{formatCurrency(analyticsData.averagePayment)}</div>
          <div className="text-purple-600 text-xs">Per transaction</div>
        </div>
        
        <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
          <div className="text-orange-600 text-sm font-medium">Active Budget Lines</div>
          <div className="text-2xl font-bold text-orange-800">{analyticsData.budgetUtilization.length}</div>
          <div className="text-orange-600 text-xs">With payments</div>
        </div>
      </div>

      {/* Charts and Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Payment Trends Chart */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Payment Trends</h3>
          <div className="h-64 flex items-end justify-between gap-1">
            {analyticsData.paymentTrends.map((trend, index) => {
              const maxValue = Math.max(...analyticsData.paymentTrends.map(t => 
                selectedMetric === 'amount' ? t.amount : t.count
              ));
              const value = selectedMetric === 'amount' ? trend.amount : trend.count;
              const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
              
              return (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div 
                    className="w-full bg-blue-500 rounded-t transition-all duration-300 hover:bg-blue-600"
                    style={{ height: `${height}%` }}
                    title={`${trend.period}: ${selectedMetric === 'amount' ? formatCurrency(value) : formatNumber(value)}`}
                  ></div>
                  <div className="text-xs text-gray-600 mt-2 text-center transform -rotate-45 origin-left">
                    {trend.period}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-center text-sm text-gray-600 mt-2">
            {selectedMetric === 'amount' ? 'Amount (GHS)' : 'Payment Count'}
          </div>
        </div>

        {/* Budget Utilization Chart */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Budget Line Utilization</h3>
          <div className="space-y-3">
            {analyticsData.budgetUtilization.slice(0, 8).map((budget, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{budget.budgetLine}</div>
                  <div className="text-xs text-gray-600">{formatCurrency(budget.amount)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(budget.percentage, 100)}%` }}
                    ></div>
                  </div>
                  <div className="text-sm font-medium text-gray-800 w-12 text-right">
                    {budget.percentage.toFixed(1)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tax Summary and Currency Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Tax Summary */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Tax Summary</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{formatCurrency(analyticsData.taxSummary.totalWHT)}</div>
              <div className="text-sm text-gray-600">WHT</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{formatCurrency(analyticsData.taxSummary.totalVAT)}</div>
              <div className="text-sm text-gray-600">VAT</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{formatCurrency(analyticsData.taxSummary.totalLevy)}</div>
              <div className="text-sm text-gray-600">Levy</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{formatCurrency(analyticsData.taxSummary.totalMoMo)}</div>
              <div className="text-sm text-gray-600">MoMo</div>
            </div>
          </div>
        </div>

        {/* Currency Breakdown */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Currency Breakdown</h3>
          <div className="space-y-3">
            {analyticsData.currencyBreakdown.map((currency, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-sm font-medium text-gray-800">{currency.currency}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-800">{formatCurrency(currency.amount, currency.currency)}</div>
                  <div className="text-xs text-gray-600">{currency.percentage.toFixed(1)}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Vendor Performance */}
      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Top Vendors by Payment Volume</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 text-sm font-medium text-gray-600">Vendor</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600">Total Amount</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600">Payment Count</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600">Average</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {analyticsData.vendorPerformance.map((vendor, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-2 text-sm text-gray-800 font-medium">{vendor.vendor}</td>
                  <td className="py-2 px-2 text-sm text-gray-800 text-right">{formatCurrency(vendor.totalAmount)}</td>
                  <td className="py-2 px-2 text-sm text-gray-800 text-right">{formatNumber(vendor.paymentCount)}</td>
                  <td className="py-2 px-2 text-sm text-gray-800 text-right">{formatCurrency(vendor.averageAmount)}</td>
                  <td className="py-2 px-2 text-sm text-gray-800 text-right">
                    {((vendor.totalAmount / analyticsData.totalAmount) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Trends Table */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Monthly Payment Trends</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 text-sm font-medium text-gray-600">Month</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600">Total Amount</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600">Payment Count</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600">Average</th>
              </tr>
            </thead>
            <tbody>
              {analyticsData.monthlyTrends.map((month, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-2 text-sm text-gray-800 font-medium">{month.month}</td>
                  <td className="py-2 px-2 text-sm text-gray-800 text-right">{formatCurrency(month.totalAmount)}</td>
                  <td className="py-2 px-2 text-sm text-gray-800 text-right">{formatNumber(month.paymentCount)}</td>
                  <td className="py-2 px-2 text-sm text-gray-800 text-right">
                    {formatCurrency(month.totalAmount / month.paymentCount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Export Options */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg">
        <h4 className="font-semibold text-blue-800 mb-2">Export Analytics</h4>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm">
            Export to Excel
          </button>
          <button className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm">
            Generate Report
          </button>
          <button className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors text-sm">
            Share Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard; 