// ✅ REMOVED: import * as XLSX from 'xlsx'; - Using dynamic import for code splitting
import { MasterLogExportService } from './MasterLogExportService';
import { BudgetReportingService } from './BudgetReportingService';

class ReportingService {

  /**
   * NEW: Strategic Reporting Hub Methods
   * Generates comprehensive report data for PDF generation with embedded infographics
   */

  /**
   * Generates the master data object for the comprehensive report
   * @param {Object} db - Firestore instance
   * @param {string} appId - App ID
   * @param {Date} startDate 
   * @param {Date} endDate 
   */
  static async getComprehensiveReportData(db, appId, startDate, endDate) {
    try {
      console.log('[ReportingService] Generating comprehensive report data...', { startDate, endDate });

      // 1. Fetch Raw Transaction Data (Source of Truth)
      const dateFilters = {
        dateFrom: startDate.toISOString(),
        dateTo: endDate.toISOString()
      };

      const masterLogEntries = await MasterLogExportService.getMasterLogData(db, appId, dateFilters);
      console.log(`[ReportingService] Fetched ${masterLogEntries.length} master log entries`);

      // 2. Calculate all metrics
      const financialMetrics = this.calculateFinancialMetrics(masterLogEntries);
      const cashFlow = this.calculateCashFlow(masterLogEntries);
      const weeklyTrends = this.calculateWeeklyTrends(masterLogEntries);
      const vendorStats = this.calculateVendorStats(masterLogEntries);
      const compliance = this.calculateComplianceStats(masterLogEntries);

      // 3. Get budget data for efficiency scores and departmental analysis (if available)
      let budgetReport = {
        efficiencyScore: 0,
        riskAssessment: { highRisk: [], mediumRisk: [], lowRisk: [] },
        monthlySummary: { overspentLines: [], underspentLines: [] }
      };
      let budgetLines = [];

      try {
        const { collection, getDocs } = await import('firebase/firestore');
        const budgetRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);
        const budgetSnapshot = await getDocs(budgetRef);
        budgetLines = budgetSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        if (budgetLines.length > 0) {
          budgetReport = BudgetReportingService.generateBudgetPerformanceReport(budgetLines);
        }
      } catch (budgetError) {
        console.warn('[ReportingService] Could not fetch budget data:', budgetError);
      }

      // 4. Calculate departmental and GL statistics
      const deptStats = this.calculateDepartmentStats(masterLogEntries, budgetLines);
      const glStats = this.calculateGLStats(masterLogEntries, budgetLines);

      const reportData = {
        period: { start: startDate, end: endDate },
        generatedAt: new Date(),
        financial: financialMetrics,
        cashFlow: cashFlow,
        weeklyTrends: weeklyTrends,
        budget: {
          efficiencyScore: budgetReport.performanceMetrics?.efficiencyScore || 0,
          riskLevels: budgetReport.riskAssessment || { highRisk: [], mediumRisk: [], lowRisk: [] },
          overspent: budgetReport.monthlySummary?.overspentLines || [],
          underspent: budgetReport.monthlySummary?.underspentLines || []
        },
        vendors: vendorStats,
        departmental: deptStats,
        glAnalysis: glStats,
        compliance: compliance
      };

      console.log('[ReportingService] Report data generated successfully');
      return reportData;

    } catch (error) {
      console.error('[ReportingService] Failed to gather comprehensive data:', error);
      throw error;
    }
  }

  static calculateFinancialMetrics(entries) {
    const totalSpend = entries.reduce((sum, e) => sum + (Number(e.netPayable_ThisTx) || 0), 0);

    // Currency breakdown
    const currencies = {};
    entries.forEach(e => {
      const curr = e.currency_Tx || 'GHS';
      const amount = Number(e.netPayable_ThisTx) || 0;
      currencies[curr] = (currencies[curr] || 0) + amount;
    });

    // Payment Mode Analysis
    const modes = {};
    entries.forEach(e => {
      const mode = e.paymentMode_Tx || 'Unknown';
      modes[mode] = (modes[mode] || 0) + (Number(e.netPayable_ThisTx) || 0);
    });

    return {
      totalSpend,
      transactionCount: entries.length,
      currencyBreakdown: Object.entries(currencies).map(([name, value]) => ({
        name,
        value,
        percentage: totalSpend > 0 ? (value / totalSpend) * 100 : 0
      })),
      paymentModes: Object.entries(modes).map(([name, value]) => ({
        name,
        value,
        percentage: totalSpend > 0 ? (value / totalSpend) * 100 : 0
      })),
      averagePayment: entries.length > 0 ? totalSpend / entries.length : 0
    };
  }

  static calculateCashFlow(entries) {
    // Group by date for line chart
    const dailyMap = {};
    entries.forEach(e => {
      // Use finalizationDate or logTimestamp
      const dateStr = e.finalizationDate ? e.finalizationDate.split('T')[0] : null;
      if (!dateStr) return;

      dailyMap[dateStr] = (dailyMap[dateStr] || 0) + (Number(e.netPayable_ThisTx) || 0);
    });

    return Object.entries(dailyMap)
      .sort((a, b) => new Date(a[0]) - new Date(b[0]))
      .map(([date, amount]) => ({ date, amount }));
  }

  static calculateWeeklyTrends(entries) {
    // Week grouping logic
    const weeks = {};
    entries.forEach(e => {
      if (!e.finalizationDate) return;
      const date = new Date(e.finalizationDate);

      // Get ISO week number
      const startOfYear = new Date(date.getFullYear(), 0, 1);
      const pastDays = (date - startOfYear) / 86400000;
      const weekNum = Math.ceil((pastDays + startOfYear.getDay() + 1) / 7);
      const weekKey = `Week ${weekNum}`;

      weeks[weekKey] = (weeks[weekKey] || 0) + (Number(e.netPayable_ThisTx) || 0);
    });

    return Object.entries(weeks)
      .map(([week, total]) => ({ week, total }))
      .sort((a, b) => {
        const aNum = parseInt(a.week.split(' ')[1]);
        const bNum = parseInt(b.week.split(' ')[1]);
        return aNum - bNum;
      });
  }

  static calculateVendorStats(entries) {
    const vendors = {};
    entries.forEach(e => {
      const vName = e.vendorName || 'Unknown';
      if (!vendors[vName]) vendors[vName] = { name: vName, volume: 0, count: 0 };
      vendors[vName].volume += (Number(e.netPayable_ThisTx) || 0);
      vendors[vName].count += 1;
    });

    const vendorArray = Object.values(vendors);
    const sortedByVol = [...vendorArray].sort((a, b) => b.volume - a.volume);
    const sortedByFreq = [...vendorArray].sort((a, b) => b.count - a.count);

    return {
      topByVolume: sortedByVol.slice(0, 5),
      topByFreq: sortedByFreq.slice(0, 5),
      totalUnique: Object.keys(vendors).length
    };
  }

  static calculateComplianceStats(entries) {
    const totalWHT = entries.reduce((sum, e) => sum + (Number(e.whtAmount_ThisTx) || 0), 0);
    const totalVAT = entries.reduce((sum, e) => sum + (Number(e.vatAmount_ThisTx) || 0), 0);
    const totalLevy = entries.reduce((sum, e) => sum + (Number(e.levyAmount_ThisTx) || 0), 0);
    const totalGross = entries.reduce((sum, e) => sum + (Number(e.pretaxAmount_ThisTx) || 0), 0);

    return {
      totalLiability: totalWHT + totalVAT + totalLevy,
      breakdown: {
        wht: totalWHT,
        vat: totalVAT,
        levy: totalLevy,
        gross: totalGross
      },
      auditCount: entries.length
    };
  }

  /**
   * Aggregates spend by Department with GL sub-breakdown
   * @param {Array} entries - Master log entries
   * @param {Array} budgetLines - Budget line definitions
   * @returns {Array} Sorted array of department statistics
   */
  static calculateDepartmentStats(entries, budgetLines) {
    // 1. Create a lookup map for BudgetLineName -> DeptDetails
    const budgetMap = {};
    budgetLines.forEach(b => {
      budgetMap[b.name] = {
        code: b.deptCode || 'UNCATEGORIZED',
        name: b.deptDimension || 'Uncategorized'
      };
    });

    const deptMap = {};

    entries.forEach(e => {
      const bLineName = e.budgetLine || 'Unknown';
      const amount = Number(e.netPayable_ThisTx) || 0;

      // Lookup Department
      const deptInfo = budgetMap[bLineName] || { code: 'UNCATEGORIZED', name: 'Uncategorized' };
      const deptKey = deptInfo.code;

      if (!deptMap[deptKey]) {
        deptMap[deptKey] = {
          code: deptKey,
          name: deptInfo.name,
          totalSpend: 0,
          transactionCount: 0,
          // Track individual GLs within this department for sub-breakdown
          glBreakdown: {}
        };
      }

      deptMap[deptKey].totalSpend += amount;
      deptMap[deptKey].transactionCount += 1;

      // Add to sub-breakdown
      if (!deptMap[deptKey].glBreakdown[bLineName]) {
        deptMap[deptKey].glBreakdown[bLineName] = 0;
      }
      deptMap[deptKey].glBreakdown[bLineName] += amount;
    });

    // Convert to Array and Sort by Spend
    const sortedDepts = Object.values(deptMap)
      .map(d => ({
        ...d,
        // Convert GL Breakdown object to sorted array
        topGLs: Object.entries(d.glBreakdown)
          .map(([name, amount]) => ({ name, amount }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5) // Keep top 5 per dept
      }))
      .sort((a, b) => b.totalSpend - a.totalSpend);

    return sortedDepts;
  }

  /**
   * Aggregates spend by GL (Geo) Account
   * @param {Array} entries - Master log entries
   * @param {Array} budgetLines - Budget line definitions
   * @returns {Array} Top 10 GL accounts by spending
   */
  static calculateGLStats(entries, budgetLines) {
    // 1. Create lookup for BudgetLineName -> AccountNo
    const budgetMap = {};
    budgetLines.forEach(b => {
      budgetMap[b.name] = b.accountNo || 'N/A';
    });

    const glMap = {};

    entries.forEach(e => {
      const bLineName = e.budgetLine || 'Unknown';
      const amount = Number(e.netPayable_ThisTx) || 0;
      const accountNo = budgetMap[bLineName] || 'N/A';

      // Key by AccountNo + Name to ensure uniqueness
      const key = `${accountNo}_${bLineName}`;

      if (!glMap[key]) {
        glMap[key] = {
          accountNo,
          name: bLineName,
          totalSpend: 0,
          count: 0
        };
      }

      glMap[key].totalSpend += amount;
      glMap[key].count += 1;
    });

    return Object.values(glMap)
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 10); // Return Top 10 Global GLs
  }

  /**
   * END: Strategic Reporting Hub Methods
   * Existing methods below...
   */

  // Generate comprehensive financial report
  static async generateFinancialReport(data, reportType = 'comprehensive') {
    try {
      // ✅ DYNAMIC IMPORT: Load xlsx only when needed for code splitting
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      switch (reportType) {
        case 'comprehensive':
          return await this.generateComprehensiveReport(wb, data);
        case 'budget':
          return await this.generateBudgetReport(wb, data);
        case 'vendor':
          return await this.generateVendorReport(wb, data);
        case 'tax':
          return await this.generateTaxReport(wb, data);
        case 'monthly':
          return await this.generateMonthlyReport(wb, data);
        default:
          return await this.generateComprehensiveReport(wb, data);
      }
    } catch (error) {
      console.error('Error generating financial report:', error);
      throw error;
    }
  }

  // Generate comprehensive financial report
  static async generateComprehensiveReport(wb, data) {
    // Executive Summary Sheet
    const summaryData = [
      ["FINANCIAL REPORT - EXECUTIVE SUMMARY"],
      [""],
      ["Report Generated:", new Date().toLocaleDateString()],
      ["Period:", data.period || "All Time"],
      [""],
      ["KEY METRICS"],
      ["Total Payments", data.totalPayments || 0],
      ["Total Amount", data.totalAmount || 0],
      ["Average Payment", data.averagePayment || 0],
      ["Active Budget Lines", data.budgetLines?.length || 0],
      ["Unique Vendors", data.vendors?.length || 0],
      [""],
      ["TAX SUMMARY"],
      ["Total WHT", data.taxSummary?.totalWHT || 0],
      ["Total VAT", data.taxSummary?.totalVAT || 0],
      ["Total Levy", data.taxSummary?.totalLevy || 0],
      ["Total MoMo Charges", data.taxSummary?.totalMoMo || 0],
      [""],
      ["CURRENCY BREAKDOWN"],
      ...(data.currencyBreakdown || []).map(currency => [
        currency.currency,
        currency.amount,
        currency.percentage.toFixed(1) + "%"
      ])
    ];

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, "Executive Summary");

    // Payment Details Sheet
    if (data.paymentDetails) {
      const paymentHeaders = [
        "Date",
        "Batch ID",
        "Vendor",
        "Invoice No",
        "Description",
        "Amount",
        "Currency",
        "Budget Line",
        "Payment Mode",
        "Tax Type",
        "WHT Amount",
        "VAT Amount",
        "Levy Amount",
        "MoMo Charge",
        "Net Amount"
      ];

      const paymentData = [
        paymentHeaders,
        ...data.paymentDetails.map(payment => [
          new Date(payment.date).toLocaleDateString(),
          payment.batchId || "",
          payment.vendor || "",
          payment.invoiceNo || "",
          payment.description || "",
          payment.amount || 0,
          payment.currency || "GHS",
          payment.budgetLine || "",
          payment.paymentMode || "",
          payment.taxType || "",
          payment.whtAmount || 0,
          payment.vatAmount || 0,
          payment.levyAmount || 0,
          payment.momoCharge || 0,
          payment.netAmount || payment.amount || 0
        ])
      ];

      const paymentWs = XLSX.utils.aoa_to_sheet(paymentData);
      XLSX.utils.book_append_sheet(wb, paymentWs, "Payment Details");
    }

    // Budget Analysis Sheet
    if (data.budgetAnalysis) {
      const budgetHeaders = [
        "Budget Line",
        "Total Spent",
        "Payment Count",
        "Average Payment",
        "Unique Vendors",
        "Last Payment Date",
        "Currency Breakdown"
      ];

      const budgetData = [
        budgetHeaders,
        ...data.budgetAnalysis.map(budget => [
          budget.budgetLine,
          budget.totalSpent,
          budget.paymentCount,
          budget.averagePayment,
          budget.vendorCount,
          budget.lastPayment ? new Date(budget.lastPayment).toLocaleDateString() : "N/A",
          budget.currencyBreakdown?.map(c => `${c.currency}: ${c.amount}`).join(", ") || "N/A"
        ])
      ];

      const budgetWs = XLSX.utils.aoa_to_sheet(budgetData);
      XLSX.utils.book_append_sheet(wb, budgetWs, "Budget Analysis");
    }

    // Vendor Performance Sheet
    if (data.vendorPerformance) {
      const vendorHeaders = [
        "Vendor",
        "Total Amount",
        "Payment Count",
        "Average Payment",
        "Budget Lines",
        "Last Payment Date"
      ];

      const vendorData = [
        vendorHeaders,
        ...data.vendorPerformance.map(vendor => [
          vendor.vendor,
          vendor.totalAmount,
          vendor.paymentCount,
          vendor.averageAmount,
          vendor.budgetLines?.map(b => b.line).join(", ") || "N/A",
          vendor.lastPayment ? new Date(vendor.lastPayment).toLocaleDateString() : "N/A"
        ])
      ];

      const vendorWs = XLSX.utils.aoa_to_sheet(vendorData);
      XLSX.utils.book_append_sheet(wb, vendorWs, "Vendor Performance");
    }

    // Monthly Trends Sheet
    if (data.monthlyTrends) {
      const monthlyHeaders = [
        "Month",
        "Total Amount",
        "Payment Count",
        "Average Payment",
        "Budget Lines Used",
        "Unique Vendors"
      ];

      const monthlyData = [
        monthlyHeaders,
        ...data.monthlyTrends.map(month => [
          month.month,
          month.totalAmount,
          month.paymentCount,
          month.totalAmount / month.paymentCount,
          month.budgetLines?.length || 0,
          month.vendors || 0
        ])
      ];

      const monthlyWs = XLSX.utils.aoa_to_sheet(monthlyData);
      XLSX.utils.book_append_sheet(wb, monthlyWs, "Monthly Trends");
    }

    return this.generateExcelFile(wb, "Comprehensive_Financial_Report");
  }

  // Generate budget-focused report
  static async generateBudgetReport(wb, data) {
    // Budget Overview Sheet
    const overviewData = [
      ["BUDGET ANALYSIS REPORT"],
      [""],
      ["Report Generated:", new Date().toLocaleDateString()],
      ["Period:", data.period || "All Time"],
      [""],
      ["BUDGET OVERVIEW"],
      ["Total Budget Lines", data.budgetLines?.length || 0],
      ["Total Spent", data.totalSpent || 0],
      ["Average Spending per Line", data.averageSpendingPerLine || 0],
      ["Most Active Budget Line", data.mostActiveBudgetLine || "N/A"],
      ["Highest Spending Line", data.highestSpendingLine || "N/A"],
      [""],
      ["SPENDING PATTERNS"],
      ["Daily Average", data.dailyAverage || 0],
      ["Weekly Average", data.weeklyAverage || 0],
      ["Monthly Average", data.monthlyAverage || 0]
    ];

    const overviewWs = XLSX.utils.aoa_to_sheet(overviewData);
    XLSX.utils.book_append_sheet(wb, overviewWs, "Budget Overview");

    // Detailed Budget Analysis
    if (data.budgetLines) {
      const budgetHeaders = [
        "Budget Line",
        "Total Spent",
        "Payment Count",
        "Average Payment",
        "Unique Vendors",
        "Last Payment",
        "Currency Mix",
        "Spending Trend"
      ];

      const budgetData = [
        budgetHeaders,
        ...data.budgetLines.map(budget => [
          budget.budgetLine,
          budget.totalSpent,
          budget.paymentCount,
          budget.averagePayment,
          budget.vendorCount,
          budget.lastPayment ? new Date(budget.lastPayment).toLocaleDateString() : "N/A",
          budget.currencyBreakdown?.map(c => `${c.currency}: ${c.percentage.toFixed(1)}%`).join(", ") || "N/A",
          this.calculateSpendingTrend(budget.spendingPatterns)
        ])
      ];

      const budgetWs = XLSX.utils.aoa_to_sheet(budgetData);
      XLSX.utils.book_append_sheet(wb, budgetWs, "Detailed Budget Analysis");
    }

    // Spending Patterns by Category
    if (data.categoryAnalysis) {
      const categoryHeaders = [
        "Category",
        "Type",
        "Total Amount",
        "Payment Count",
        "Percentage of Total"
      ];

      const categoryData = [
        categoryHeaders,
        ...this.flattenCategoryData(data.categoryAnalysis)
      ];

      const categoryWs = XLSX.utils.aoa_to_sheet(categoryData);
      XLSX.utils.book_append_sheet(wb, categoryWs, "Category Analysis");
    }

    return this.generateExcelFile(wb, "Budget_Analysis_Report");
  }

  // Generate vendor performance report
  static async generateVendorReport(wb, data) {
    // Vendor Summary Sheet
    const summaryData = [
      ["VENDOR PERFORMANCE REPORT"],
      [""],
      ["Report Generated:", new Date().toLocaleDateString()],
      ["Period:", data.period || "All Time"],
      [""],
      ["VENDOR SUMMARY"],
      ["Total Vendors", data.vendors?.length || 0],
      ["Total Payments", data.totalPayments || 0],
      ["Total Amount", data.totalAmount || 0],
      ["Average Payment per Vendor", data.averagePaymentPerVendor || 0],
      ["Top Vendor by Volume", data.topVendorByVolume || "N/A"],
      ["Top Vendor by Count", data.topVendorByCount || "N/A"]
    ];

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, "Vendor Summary");

    // Vendor Performance Details
    if (data.vendorPerformance) {
      const vendorHeaders = [
        "Vendor",
        "Total Amount",
        "Payment Count",
        "Average Payment",
        "Budget Lines",
        "Last Payment",
        "Payment Frequency",
        "Performance Rating"
      ];

      const vendorData = [
        vendorHeaders,
        ...data.vendorPerformance.map(vendor => [
          vendor.vendor,
          vendor.totalAmount,
          vendor.paymentCount,
          vendor.averageAmount,
          vendor.budgetLines?.map(b => b.line).join(", ") || "N/A",
          vendor.lastPayment ? new Date(vendor.lastPayment).toLocaleDateString() : "N/A",
          this.calculatePaymentFrequency(vendor.paymentCount, vendor.lastPayment, vendor.firstPayment),
          this.calculatePerformanceRating(vendor)
        ])
      ];

      const vendorWs = XLSX.utils.aoa_to_sheet(vendorData);
      XLSX.utils.book_append_sheet(wb, vendorWs, "Vendor Performance");
    }

    // Vendor Spending by Budget Line
    if (data.vendorSpendingByBudget) {
      const spendingHeaders = [
        "Vendor",
        "Budget Line",
        "Total Amount",
        "Payment Count",
        "Percentage of Vendor Total"
      ];

      const spendingData = [
        spendingHeaders,
        ...this.flattenVendorSpendingData(data.vendorSpendingByBudget)
      ];

      const spendingWs = XLSX.utils.aoa_to_sheet(spendingData);
      XLSX.utils.book_append_sheet(wb, spendingWs, "Vendor Spending by Budget");
    }

    return this.generateExcelFile(wb, "Vendor_Performance_Report");
  }

  // Generate tax compliance report
  static async generateTaxReport(wb, data) {
    // Tax Summary Sheet
    const summaryData = [
      ["TAX COMPLIANCE REPORT"],
      [""],
      ["Report Generated:", new Date().toLocaleDateString()],
      ["Period:", data.period || "All Time"],
      ["Company:", "MARGINS ID SYSTEMS APPLICATION LIMITED"],
      ["TIN:", "C0005254159"],
      [""],
      ["TAX SUMMARY"],
      ["Total WHT", data.taxSummary?.totalWHT || 0],
      ["Total VAT", data.taxSummary?.totalVAT || 0],
      ["Total Levy", data.totalLevy || 0],
      ["Total MoMo Charges", data.totalMoMo || 0],
      ["Net Tax Liability", (data.taxSummary?.totalWHT || 0) + (data.taxSummary?.totalVAT || 0)],
      [""],
      ["COMPLIANCE STATUS"],
      ["WHT Compliance", this.checkWHTCompliance(data.taxSummary?.totalWHT, data.totalAmount)],
      ["VAT Compliance", this.checkVATCompliance(data.taxSummary?.totalVAT, data.vatableAmount)],
      ["Levy Compliance", this.checkLevyCompliance(data.totalLevy, data.goodsAmount)]
    ];

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, "Tax Summary");

    // WHT Details Sheet
    if (data.whtDetails) {
      const whtHeaders = [
        "Vendor",
        "Invoice No",
        "Gross Amount",
        "WHT Rate",
        "WHT Amount",
        "Net Amount",
        "Payment Date",
        "Budget Line"
      ];

      const whtData = [
        whtHeaders,
        ...data.whtDetails.map(wht => [
          wht.vendor,
          wht.invoiceNo,
          wht.grossAmount,
          "5%",
          wht.whtAmount,
          wht.netAmount,
          new Date(wht.paymentDate).toLocaleDateString(),
          wht.budgetLine
        ])
      ];

      const whtWs = XLSX.utils.aoa_to_sheet(whtData);
      XLSX.utils.book_append_sheet(wb, whtWs, "WHT Details");
    }

    // VAT Details Sheet
    if (data.vatDetails) {
      const vatHeaders = [
        "Vendor",
        "Invoice No",
        "Gross Amount",
        "VAT Rate",
        "VAT Amount",
        "Net Amount",
        "Payment Date",
        "VAT Status"
      ];

      const vatData = [
        vatHeaders,
        ...data.vatDetails.map(vat => [
          vat.vendor,
          vat.invoiceNo,
          vat.grossAmount,
          "12.5%",
          vat.vatAmount,
          vat.netAmount,
          new Date(vat.paymentDate).toLocaleDateString(),
          vat.vatStatus
        ])
      ];

      const vatWs = XLSX.utils.aoa_to_sheet(vatData);
      XLSX.utils.book_append_sheet(wb, vatWs, "VAT Details");
    }

    return this.generateExcelFile(wb, "Tax_Compliance_Report");
  }

  // Generate monthly trends report
  static async generateMonthlyReport(wb, data) {
    // Monthly Overview Sheet
    const overviewData = [
      ["MONTHLY TRENDS REPORT"],
      [""],
      ["Report Generated:", new Date().toLocaleDateString()],
      ["Period:", data.period || "All Time"],
      [""],
      ["MONTHLY SUMMARY"],
      ["Total Months", data.monthlyTrends?.length || 0],
      ["Highest Month", data.highestMonth || "N/A"],
      ["Lowest Month", data.lowestMonth || "N/A"],
      ["Average Monthly Spending", data.averageMonthlySpending || 0],
      ["Growth Rate", data.growthRate ? `${data.growthRate.toFixed(2)}%` : "N/A"]
    ];

    const overviewWs = XLSX.utils.aoa_to_sheet(overviewData);
    XLSX.utils.book_append_sheet(wb, overviewWs, "Monthly Overview");

    // Monthly Trends Details
    if (data.monthlyTrends) {
      const monthlyHeaders = [
        "Month",
        "Total Amount",
        "Payment Count",
        "Average Payment",
        "Budget Lines Used",
        "Unique Vendors",
        "Growth from Previous",
        "Trend"
      ];

      const monthlyData = [
        monthlyHeaders,
        ...data.monthlyTrends.map((month, index) => [
          month.month,
          month.totalAmount,
          month.paymentCount,
          month.totalAmount / month.paymentCount,
          month.budgetLines?.length || 0,
          month.vendors || 0,
          index > 0 ? this.calculateGrowth(data.monthlyTrends[index - 1].totalAmount, month.totalAmount) : "N/A",
          this.calculateTrend(data.monthlyTrends, index)
        ])
      ];

      const monthlyWs = XLSX.utils.aoa_to_sheet(monthlyData);
      XLSX.utils.book_append_sheet(wb, monthlyWs, "Monthly Trends");
    }

    // Seasonal Analysis
    if (data.seasonalAnalysis) {
      const seasonalHeaders = [
        "Season",
        "Total Amount",
        "Payment Count",
        "Average Payment",
        "Percentage of Year"
      ];

      const seasonalData = [
        seasonalHeaders,
        ...Object.entries(data.seasonalAnalysis).map(([season, data]) => [
          season,
          data.totalAmount,
          data.paymentCount,
          data.totalAmount / data.paymentCount,
          data.percentageOfYear.toFixed(1) + "%"
        ])
      ];

      const seasonalWs = XLSX.utils.aoa_to_sheet(seasonalData);
      XLSX.utils.book_append_sheet(wb, seasonalWs, "Seasonal Analysis");
    }

    return this.generateExcelFile(wb, "Monthly_Trends_Report");
  }

  // Helper methods
  static calculateSpendingTrend(patterns) {
    if (!patterns || patterns.length < 2) return "Insufficient Data";

    const recent = patterns.slice(-3).reduce((sum, p) => sum + p.amount, 0);
    const previous = patterns.slice(-6, -3).reduce((sum, p) => sum + p.amount, 0);

    if (previous === 0) return "New";
    const change = ((recent - previous) / previous) * 100;

    if (change > 10) return "Increasing";
    if (change < -10) return "Decreasing";
    return "Stable";
  }

  static calculatePaymentFrequency(count, lastPayment, firstPayment) {
    if (!lastPayment || !firstPayment || count < 2) return "N/A";

    const days = (new Date(lastPayment) - new Date(firstPayment)) / (1000 * 60 * 60 * 24);
    const frequency = days / (count - 1);

    if (frequency <= 7) return "Weekly";
    if (frequency <= 30) return "Monthly";
    if (frequency <= 90) return "Quarterly";
    return "Annually";
  }

  static calculatePerformanceRating(vendor) {
    const score = (vendor.totalAmount / 10000) + (vendor.paymentCount * 0.1);

    if (score >= 10) return "Excellent";
    if (score >= 5) return "Good";
    if (score >= 2) return "Average";
    return "Below Average";
  }

  static checkWHTCompliance(whtAmount, totalAmount, expectedWHTRate = null) {
    // If no expected rate provided, cannot calculate compliance
    // Expected rate should come from database validation collection
    if (!expectedWHTRate || expectedWHTRate === 0) {
      return "Rate Not Available"; // Cannot check compliance without rate from database
    }

    const expectedWHT = totalAmount * expectedWHTRate;
    const variance = Math.abs(whtAmount - expectedWHT);
    const compliance = (variance / expectedWHT) * 100;

    if (compliance <= 5) return "Compliant";
    if (compliance <= 10) return "Minor Variance";
    return "Review Required";
  }

  static checkVATCompliance(vatAmount, vatableAmount) {
    if (!vatableAmount) return "N/A";
    const expectedVAT = vatableAmount * 0.125;
    const variance = Math.abs(vatAmount - expectedVAT);
    const compliance = (variance / expectedVAT) * 100;

    if (compliance <= 5) return "Compliant";
    if (compliance <= 10) return "Minor Variance";
    return "Review Required";
  }

  static checkLevyCompliance(levyAmount, goodsAmount) {
    if (!goodsAmount) return "N/A";
    const expectedLevy = goodsAmount * 0.01;
    const variance = Math.abs(levyAmount - expectedLevy);
    const compliance = (variance / expectedLevy) * 100;

    if (compliance <= 5) return "Compliant";
    if (compliance <= 10) return "Minor Variance";
    return "Review Required";
  }

  static calculateGrowth(previous, current) {
    if (previous === 0) return "N/A";
    const change = ((current - previous) / previous) * 100;
    return `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
  }

  static calculateTrend(trends, index) {
    if (index < 2) return "Insufficient Data";

    const recent = trends.slice(index - 2, index + 1).map(t => t.totalAmount);
    const slope = (recent[2] - recent[0]) / 2;

    if (slope > 0) return "Upward";
    if (slope < 0) return "Downward";
    return "Stable";
  }

  static flattenCategoryData(categoryAnalysis) {
    const flattened = [];

    Object.entries(categoryAnalysis).forEach(([category, items]) => {
      items.forEach(item => {
        flattened.push([
          category,
          item.type || item.mode || item.currency,
          item.amount,
          item.count,
          ((item.amount / this.getTotalAmount(categoryAnalysis)) * 100).toFixed(1) + "%"
        ]);
      });
    });

    return flattened;
  }

  static flattenVendorSpendingData(vendorSpendingByBudget) {
    const flattened = [];

    vendorSpendingByBudget.forEach(vendor => {
      vendor.budgetLines.forEach(budget => {
        flattened.push([
          vendor.vendor,
          budget.line,
          budget.amount,
          budget.count || 1,
          budget.percentage.toFixed(1) + "%"
        ]);
      });
    });

    return flattened;
  }

  static getTotalAmount(categoryAnalysis) {
    let total = 0;
    Object.values(categoryAnalysis).forEach(category => {
      category.forEach(item => {
        total += item.amount;
      });
    });
    return total;
  }

  // Generate Excel file from workbook
  static async generateExcelFile(wb, filename) {
    try {
      // ✅ DYNAMIC IMPORT: Load xlsx only when needed for code splitting
      const XLSX = await import('xlsx');
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      return {
        blob,
        filename: `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`
      };
    } catch (error) {
      console.error('Error generating Excel file:', error);
      throw error;
    }
  }

  // Create download link for generated report
  static createDownloadLink(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

export default ReportingService;