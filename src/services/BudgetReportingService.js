// Enhanced Budget Reporting Service
// Generates comprehensive budget reports with overspending detection, underspending recognition, and performance analytics

// ✅ REMOVED: import * as XLSX from 'xlsx'; - Using dynamic import for code splitting
import { BudgetBalanceService, getCurrentMonth } from './BudgetBalanceService.js';

/**
 * Enhanced Budget Reporting Service
 * Provides comprehensive budget analysis and reporting capabilities
 */
export class BudgetReportingService {

  /**
   * Generate comprehensive budget performance report
   * @param {Array} budgetLines - Array of budget line objects
   * @param {string} selectedMonth - Month for detailed analysis (e.g., "2025-01")
   * @returns {Object} Comprehensive budget performance report
   */
  static generateBudgetPerformanceReport(budgetLines, selectedMonth = getCurrentMonth()) {
    const report = {
      month: selectedMonth,
      generatedAt: new Date(),

      // Monthly Summary
      monthlySummary: {
        totalAllocated: 0,
        totalSpent: 0,
        totalRemaining: 0,
        overspentLines: [],
        underspentLines: [],
        onTargetLines: [],
        completedLines: []
      },

      // Department Analysis
      departmentAnalysis: {},

      // Risk Assessment
      riskAssessment: {
        highRiskLines: [],
        mediumRiskLines: [],
        lowRiskLines: [],
        noRiskLines: []
      },

      // Performance Metrics
      performanceMetrics: {
        averageUtilization: 0,
        totalOverspendAmount: 0,
        totalUnderspendAmount: 0,
        efficiencyScore: 0
      },

      // Recommendations
      recommendations: []
    };

    // Process each budget line
    budgetLines.forEach(line => {
      const monthData = line.monthlyBalances?.[selectedMonth];
      if (!monthData) return;

      const performance = BudgetBalanceService.getBudgetPerformance(line);

      // Update monthly summary
      report.monthlySummary.totalAllocated += monthData.allocated;
      report.monthlySummary.totalSpent += monthData.spent;
      report.monthlySummary.totalRemaining += monthData.balance;

      // Categorize by performance
      if (monthData.status === 'overspent') {
        report.monthlySummary.overspentLines.push({
          name: line.name,
          accountNo: line.accountNo,
          deptCode: line.deptCode,
          deptDimension: line.deptDimension,
          allocated: monthData.allocated,
          spent: monthData.spent,
          overspendAmount: monthData.overspendAmount,
          utilizationRate: monthData.utilizationRate,
          riskLevel: performance.riskLevel
        });
      } else if (monthData.status === 'underspent') {
        report.monthlySummary.underspentLines.push({
          name: line.name,
          accountNo: line.accountNo,
          deptCode: line.deptCode,
          deptDimension: line.deptDimension,
          allocated: monthData.allocated,
          spent: monthData.spent,
          remaining: monthData.balance,
          utilizationRate: monthData.utilizationRate,
          savingsAmount: monthData.balance
        });
      } else if (monthData.status === 'completed') {
        report.monthlySummary.completedLines.push({
          name: line.name,
          accountNo: line.accountNo,
          deptCode: line.deptCode,
          deptDimension: line.deptDimension,
          allocated: monthData.allocated,
          spent: monthData.spent,
          utilizationRate: monthData.utilizationRate
        });
      } else {
        report.monthlySummary.onTargetLines.push({
          name: line.name,
          accountNo: line.accountNo,
          deptCode: line.deptCode,
          deptDimension: line.deptDimension,
          allocated: monthData.allocated,
          spent: monthData.spent,
          remaining: monthData.balance,
          utilizationRate: monthData.utilizationRate
        });
      }

      // Risk assessment
      if (performance.riskLevel === 'HIGH') {
        report.riskAssessment.highRiskLines.push({
          name: line.name,
          accountNo: line.accountNo,
          deptCode: line.deptCode,
          deptDimension: line.deptDimension,
          overBudgetAmount: performance.overBudgetAmount,
          monthsOverspent: performance.monthsOverspent,
          riskLevel: performance.riskLevel
        });
      } else if (performance.riskLevel === 'MEDIUM') {
        report.riskAssessment.mediumRiskLines.push({
          name: line.name,
          accountNo: line.accountNo,
          deptCode: line.deptCode,
          deptDimension: line.deptDimension,
          overBudgetAmount: performance.overBudgetAmount,
          monthsOverspent: performance.monthsOverspent,
          riskLevel: performance.riskLevel
        });
      } else if (performance.riskLevel === 'LOW') {
        report.riskAssessment.lowRiskLines.push({
          name: line.name,
          accountNo: line.accountNo,
          deptCode: line.deptCode,
          deptDimension: line.deptDimension,
          overBudgetAmount: performance.overBudgetAmount,
          monthsOverspent: performance.monthsOverspent,
          riskLevel: performance.riskLevel
        });
      } else {
        report.riskAssessment.noRiskLines.push({
          name: line.name,
          accountNo: line.accountNo,
          deptCode: line.deptCode,
          deptDimension: line.deptDimension,
          totalSpent: performance.totalSpent,
          totalRemaining: performance.totalRemaining,
          riskLevel: performance.riskLevel
        });
      }

      // Department analysis
      if (!report.departmentAnalysis[line.deptCode]) {
        report.departmentAnalysis[line.deptCode] = {
          deptName: line.deptDimension,
          totalAllocated: 0,
          totalSpent: 0,
          totalRemaining: 0,
          budgetLines: 0,
          overspentLines: 0,
          underspentLines: 0,
          completedLines: 0,
          onTargetLines: 0
        };
      }

      const dept = report.departmentAnalysis[line.deptCode];
      dept.totalAllocated += monthData.allocated;
      dept.totalSpent += monthData.spent;
      dept.totalRemaining += monthData.balance;
      dept.budgetLines += 1;

      if (monthData.status === 'overspent') dept.overspentLines += 1;
      if (monthData.status === 'underspent') dept.underspentLines += 1;
      if (monthData.status === 'completed') dept.completedLines += 1;
      if (monthData.status === 'active') dept.onTargetLines += 1;
    });

    // Calculate performance metrics
    const totalLines = budgetLines.length;
    if (totalLines > 0) {
      report.performanceMetrics.averageUtilization =
        (report.monthlySummary.totalSpent / report.monthlySummary.totalAllocated) * 100;

      report.performanceMetrics.totalOverspendAmount =
        report.monthlySummary.overspentLines.reduce((sum, line) => sum + line.overspendAmount, 0);

      report.performanceMetrics.totalUnderspendAmount =
        report.monthlySummary.underspentLines.reduce((sum, line) => sum + line.savingsAmount, 0);

      // Calculate efficiency score (0-100)
      const overspendPenalty = (report.performanceMetrics.totalOverspendAmount / report.monthlySummary.totalAllocated) * 100;
      const underspendBonus = (report.performanceMetrics.totalUnderspendAmount / report.monthlySummary.totalAllocated) * 50;
      report.performanceMetrics.efficiencyScore = Math.max(0, Math.min(100, 100 - overspendPenalty + underspendBonus));
    }

    // Generate recommendations
    if (report.monthlySummary.overspentLines.length > 0) {
      report.recommendations.push({
        type: 'WARNING',
        priority: 'HIGH',
        message: `${report.monthlySummary.overspentLines.length} budget lines are overspent this month`,
        action: 'Review spending patterns and consider budget adjustments or spending controls',
        affectedLines: report.monthlySummary.overspentLines.map(line => line.name)
      });
    }

    if (report.monthlySummary.underspentLines.length > 0) {
      report.recommendations.push({
        type: 'INFO',
        priority: 'MEDIUM',
        message: `${report.monthlySummary.underspentLines.length} budget lines are underutilized`,
        action: 'Consider reallocating unused budget to high-priority areas or carry forward to next month',
        affectedLines: report.monthlySummary.underspentLines.map(line => line.name)
      });
    }

    if (report.riskAssessment.highRiskLines.length > 0) {
      report.recommendations.push({
        type: 'CRITICAL',
        priority: 'URGENT',
        message: `${report.riskAssessment.highRiskLines.length} budget lines have HIGH risk levels`,
        action: 'Immediate attention required - implement spending controls and review budget allocations',
        affectedLines: report.riskAssessment.highRiskLines.map(line => line.name)
      });
    }

    // Add efficiency recommendations
    if (report.performanceMetrics.efficiencyScore < 70) {
      report.recommendations.push({
        type: 'ADVICE',
        priority: 'MEDIUM',
        message: 'Overall budget efficiency is below target (70%)',
        action: 'Review budget management processes and implement efficiency improvements',
        metric: `Current Efficiency: ${report.performanceMetrics.efficiencyScore.toFixed(1)}%`
      });
    }

    return report;
  }

  /**
   * Export budget performance report to Excel
   * @param {Object} report - Budget performance report
   * @param {string} filename - Output filename
   * @returns {Promise<void>}
   */
  static async exportBudgetReportToExcel(report, filename = 'Budget_Performance_Report.xlsx') {
    try {
      // ✅ DYNAMIC IMPORT: Load xlsx only when needed for code splitting
      const XLSX = await import('xlsx');

      const workbook = XLSX.utils.book_new();

      // 1. Executive Summary Sheet
      const summaryData = [
        ['BUDGET PERFORMANCE REPORT - EXECUTIVE SUMMARY'],
        [''],
        ['Report Generated:', report.generatedAt.toLocaleDateString()],
        ['Analysis Month:', report.month],
        [''],
        ['OVERALL PERFORMANCE'],
        ['Total Allocated:', report.monthlySummary.totalAllocated],
        ['Total Spent:', report.monthlySummary.totalSpent],
        ['Total Remaining:', report.monthlySummary.totalRemaining],
        ['Efficiency Score:', `${report.performanceMetrics.efficiencyScore.toFixed(1)}%`],
        [''],
        ['PERFORMANCE BREAKDOWN'],
        ['Overspent Lines:', report.monthlySummary.overspentLines.length],
        ['Underspent Lines:', report.monthlySummary.underspentLines.length],
        ['On Target Lines:', report.monthlySummary.onTargetLines.length],
        ['Completed Lines:', report.monthlySummary.completedLines.length],
        [''],
        ['RISK ASSESSMENT'],
        ['High Risk Lines:', report.riskAssessment.highRiskLines.length],
        ['Medium Risk Lines:', report.riskAssessment.mediumRiskLines.length],
        ['Low Risk Lines:', report.riskAssessment.lowRiskLines.length],
        ['No Risk Lines:', report.riskAssessment.noRiskLines.length]
      ];

      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, summaryWs, "Executive Summary");

      // 2. Monthly Performance Sheet
      const monthlyHeaders = [
        'Account No', 'Name', 'Department Code', 'Department Name', 'Allocated', 'Spent', 'Remaining',
        'Status', 'Utilization Rate', 'Risk Level', 'Notes'
      ];

      const monthlyData = [monthlyHeaders];

      // Add all budget lines
      const allLines = [
        ...report.monthlySummary.overspentLines.map(line => [
          line.accountNo, line.name, line.deptCode, line.deptDimension, line.allocated, line.spent,
          line.overspendAmount, 'OVERSENT', `${line.utilizationRate.toFixed(1)}%`, line.riskLevel,
          `OVERSPENT by $${line.overspendAmount.toLocaleString()}`
        ]),
        ...report.monthlySummary.underspentLines.map(line => [
          line.accountNo, line.name, line.deptCode, line.deptDimension, line.allocated, line.spent,
          line.remaining, 'UNDERSPENT', `${line.utilizationRate.toFixed(1)}%`, 'LOW',
          `SAVINGS: $${line.savingsAmount.toLocaleString()}`
        ]),
        ...report.monthlySummary.onTargetLines.map(line => [
          line.accountNo, line.name, line.deptCode, line.deptDimension, line.allocated, line.spent,
          line.remaining, 'ON TARGET', `${line.utilizationRate.toFixed(1)}%`, 'LOW', 'Performing well'
        ]),
        ...report.monthlySummary.completedLines.map(line => [
          line.accountNo, line.name, line.deptCode, line.deptDimension, line.allocated, line.spent,
          0, 'COMPLETED', `${line.utilizationRate.toFixed(1)}%`, 'NONE', 'Budget fully utilized'
        ])
      ];

      monthlyData.push(...allLines);
      const monthlyWs = XLSX.utils.aoa_to_sheet(monthlyData);
      XLSX.utils.book_append_sheet(workbook, monthlyWs, "Monthly Performance");

      // 3. Department Analysis Sheet
      const deptHeaders = [
        'Department Code', 'Department Name', 'Total Allocated', 'Total Spent', 'Total Remaining',
        'Budget Lines', 'Overspent', 'Underspent', 'On Target', 'Completed', 'Efficiency'
      ];

      const deptData = [deptHeaders];
      Object.values(report.departmentAnalysis).forEach(dept => {
        const efficiency = (dept.totalSpent / dept.totalAllocated) * 100;
        deptData.push([
          dept.deptName.split('|')[0] || dept.deptName,
          dept.deptName.split('|')[1] || dept.deptName,
          dept.totalAllocated,
          dept.totalSpent,
          dept.totalRemaining,
          dept.budgetLines,
          dept.overspentLines,
          dept.underspentLines,
          dept.onTargetLines,
          dept.completedLines,
          `${efficiency.toFixed(1)}%`
        ]);
      });

      const deptWs = XLSX.utils.aoa_to_sheet(deptData);
      XLSX.utils.book_append_sheet(workbook, deptWs, "Department Analysis");

      // 4. Risk Assessment Sheet
      const riskHeaders = [
        'Account No', 'Name', 'Department', 'Risk Level', 'Over Budget Amount', 'Months Overspent', 'Actions Required'
      ];

      const riskData = [riskHeaders];

      // Add high risk lines first
      report.riskAssessment.highRiskLines.forEach(line => {
        riskData.push([
          line.accountNo, line.name, line.deptDimension, line.riskLevel,
          line.overBudgetAmount, line.monthsOverspent, 'IMMEDIATE ACTION REQUIRED'
        ]);
      });

      // Add medium risk lines
      report.riskAssessment.mediumRiskLines.forEach(line => {
        riskData.push([
          line.accountNo, line.name, line.deptDimension, line.riskLevel,
          line.overBudgetAmount, line.monthsOverspent, 'Monitor closely'
        ]);
      });

      // Add low risk lines
      report.riskAssessment.lowRiskLines.forEach(line => {
        riskData.push([
          line.accountNo, line.name, line.deptDimension, line.riskLevel,
          line.overBudgetAmount, line.monthsOverspent, 'Continue monitoring'
        ]);
      });

      const riskWs = XLSX.utils.aoa_to_sheet(riskData);
      XLSX.utils.book_append_sheet(workbook, riskWs, "Risk Assessment");

      // 5. Recommendations Sheet
      const recHeaders = ['Priority', 'Type', 'Message', 'Recommended Action', 'Details'];
      const recData = [recHeaders];

      report.recommendations.forEach(rec => {
        recData.push([
          rec.priority, rec.type, rec.message, rec.action,
          rec.affectedLines ? rec.affectedLines.join(', ') : rec.metric || ''
        ]);
      });

      const recWs = XLSX.utils.aoa_to_sheet(recData);
      XLSX.utils.book_append_sheet(workbook, recWs, "Recommendations");

      // Save the workbook
      XLSX.writeFile(workbook, filename);

      console.log(`Budget report exported successfully: ${filename}`);

    } catch (error) {
      console.error('Error exporting budget report to Excel:', error);
      throw error;
    }
  }
}

// Export utility functions
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(amount);
};

export const formatPercentage = (value) => {
  return `${value.toFixed(1)}%`;
};

export const getStatusColor = (status) => {
  switch (status) {
    case 'overspent': return 'text-red-600 bg-red-100';
    case 'underspent': return 'text-yellow-600 bg-yellow-100';
    case 'completed': return 'text-green-600 bg-green-100';
    case 'active': return 'text-blue-600 bg-blue-100';
    default: return 'text-gray-600 bg-gray-100';
  }
};

export const getRiskColor = (riskLevel) => {
  switch (riskLevel) {
    case 'HIGH': return 'text-red-600 bg-red-100';
    case 'MEDIUM': return 'text-yellow-600 bg-yellow-100';
    case 'LOW': return 'text-green-600 bg-green-100';
    case 'NONE': return 'text-gray-600 bg-gray-100';
    default: return 'text-gray-600 bg-gray-100';
  }
};