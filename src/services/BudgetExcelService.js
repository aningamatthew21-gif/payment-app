import * as XLSX from 'xlsx';
import { BudgetBalanceService } from './BudgetBalanceService';

// Budget Excel template configuration matching user's structure
const BUDGET_TEMPLATE_CONFIG = {
  headers: [
    'G/L Account No',
    'Name',
    'DEPARTMENTS Code',
    'Department Dimension'
  ],
  monthlyHeaders: [
    '1/1/2025', '2/1/2025', '3/1/2025', '4/1/2025', '5/1/2025', '6/1/2025',
    '7/1/2025', '8/1/2025', '9/1/2025', '10/1/2025', '11/1/2025', '12/1/2025'
  ],
  widths: [15, 30, 20, 25, ...Array(12).fill(18)], // 12 monthly columns
  sampleData: [
    // Sample data removed - system will use only database-driven budget lines
    // This prevents confusion between hardcoded sample data and real budget lines
  ]
};

// Helper function to read Excel file
const readBudgetExcelFile = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        resolve(workbook);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

// Export budget data as Excel template matching user's structure
export const exportBudgetTemplate = async (budgetLines = [], includeData = true) => {
  try {
    const workbook = XLSX.utils.book_new();
    const mainData = [];

    // Add export filters section (rows 1-4)
    mainData.push(['Export Filters']);
    mainData.push(['Budget Name', '2025']);
    mainData.push(['DEPARTMENTS Code']);
    mainData.push([]); // Empty row

    // Add main headers (row 5)
    const fullHeaders = [...BUDGET_TEMPLATE_CONFIG.headers, ...BUDGET_TEMPLATE_CONFIG.monthlyHeaders];
    mainData.push(fullHeaders);

    if (includeData && budgetLines.length > 0) {
      // Add existing budget data
      budgetLines.forEach(budgetLine => {
        const row = [
          budgetLine.accountNo || '',
          budgetLine.name || '',
          budgetLine.deptCode || '',
          budgetLine.deptDimension || '',
          ...(budgetLine.monthlyValues || Array(12).fill(0))
        ];
        mainData.push(row);
      });
    } else {
      // Add sample data matching user's structure
      BUDGET_TEMPLATE_CONFIG.sampleData.forEach(sample => {
        const row = [
          sample.accountNo,
          sample.name,
          sample.deptCode,
          sample.deptDimension,
          ...sample.monthlyValues
        ];
        mainData.push(row);
      });
    }

    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(mainData);

    // Set column widths
    worksheet['!cols'] = BUDGET_TEMPLATE_CONFIG.widths.map(width => ({ width }));

    // Style the main header row (row 5, index 4)
    const headerRange = XLSX.utils.decode_range(worksheet['!ref']);
    for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 4, c: col }); // Row 5 (index 4) is headers
      if (!worksheet[cellAddress]) continue;

      worksheet[cellAddress].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '808080' } }, // Dark grey background like user's sheet
        alignment: { horizontal: 'center' }
      };
    }

    // Style the export filters section
    if (worksheet['A1']) {
      worksheet['A1'].s = {
        font: { bold: true, size: 14, color: { rgb: '2F75B5' } }
      };
    }

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Budget Template');

    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = includeData ?
      `Budget_Data_${timestamp}.xlsx` :
      `Budget_Template_${timestamp}.xlsx`;

    // Export file
    XLSX.writeFile(workbook, filename);

    return { success: true, filename };
  } catch (error) {
    console.error('Error exporting budget template:', error);
    return { success: false, error: error.message };
  }
};

// Import budget data from Excel file matching user's structure
export const importBudgetData = async (file) => {
  try {
    const workbook = await readBudgetExcelFile(file);
    const worksheet = workbook.Sheets['Budget Template'] || workbook.Sheets[workbook.SheetNames[0]];

    if (!worksheet) {
      throw new Error('No worksheet found in Excel file');
    }

    // Convert to JSON with headers
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (rawData.length < 6) {
      throw new Error('Invalid Excel file format. Expected at least 6 rows.');
    }

    // Find the header row (should be row 5, index 4)
    let headerRowIndex = -1;
    for (let i = 0; i < rawData.length; i++) {
      if (rawData[i] && rawData[i].length >= 16 &&
        rawData[i][0] === 'G/L Account No' &&
        rawData[i][1] === 'Name') {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      throw new Error('Header row not found. Expected columns: G/L Account No, Name, etc.');
    }

    // Extract data rows (skip headers and empty rows)
    const dataRows = rawData.slice(headerRowIndex + 1).filter(row =>
      row && row.length >= 16 && row[0] && row[0].toString().trim() !== ''
    );

    if (dataRows.length === 0) {
      throw new Error('No data rows found in Excel file');
    }

    // Parse budget data
    const budgetData = dataRows.map((row, index) => {
      const monthlyValues = row.slice(4, 16).map(val => {
        const num = Number(val);
        return isNaN(num) ? 0 : num;
      });

      const budgetLine = {
        accountNo: row[0]?.toString().trim() || '',
        name: row[1]?.toString().trim() || '',
        deptCode: row[2]?.toString().trim() || '',
        deptDimension: row[3]?.toString().trim() || '',
        monthlyValues: monthlyValues,
        // Calculate totals
        totalBudget: monthlyValues.reduce((sum, val) => sum + Math.abs(val), 0),
        totalSpent: monthlyValues.filter(val => val < 0).reduce((sum, val) => sum + Math.abs(val), 0),
        totalRevenue: monthlyValues.filter(val => val > 0).reduce((sum, val) => sum + val, 0)
      };

      // Validate required fields
      if (!budgetLine.accountNo || !budgetLine.name) {
        throw new Error(`Row ${index + 1}: G/L Account No and Name are required`);
      }

      // Initialize monthly balances structure
      return BudgetBalanceService.initializeMonthlyBalances(budgetLine);
    });

    return {
      success: true,
      data: budgetData,
      count: budgetData.length
    };

  } catch (error) {
    console.error('Error importing budget data:', error);
    return { success: false, error: error.message };
  }
};

// Export budget summary report by department
export const exportBudgetSummary = async (budgetLines) => {
  try {
    const workbook = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      ['BUDGET SUMMARY REPORT BY DEPARTMENT'],
      [],
      ['Report Date:', new Date().toLocaleDateString()],
      ['Total Budget Lines:', budgetLines.length],
      [],
      ['Department Code', 'Department Name', 'Total Budget', 'Total Spent', 'Total Revenue', 'Net Position', 'Budget Lines'],
    ];

    // Group by department
    const deptSummary = {};
    budgetLines.forEach(line => {
      const deptCode = line.deptCode || 'Unknown';
      const deptName = line.deptDimension || 'Unknown';
      const key = `${deptCode}|${deptName}`;

      if (!deptSummary[key]) {
        deptSummary[key] = {
          deptCode,
          deptName,
          totalBudget: 0,
          totalSpent: 0,
          totalRevenue: 0,
          budgetLines: 0
        };
      }

      deptSummary[key].totalBudget += Number(line.totalBudget || 0);
      deptSummary[key].totalSpent += Number(line.totalSpent || 0);
      deptSummary[key].totalRevenue += Number(line.totalRevenue || 0);
      deptSummary[key].budgetLines += 1;
    });

    // Add department totals
    Object.values(deptSummary).forEach(dept => {
      const netPosition = dept.totalRevenue - dept.totalSpent;
      summaryData.push([
        dept.deptCode,
        dept.deptName,
        dept.totalBudget,
        dept.totalSpent,
        dept.totalRevenue,
        netPosition,
        dept.budgetLines
      ]);
    });

    // Add grand totals
    const grandTotal = budgetLines.reduce((sum, line) => sum + Number(line.totalBudget || 0), 0);
    const grandSpent = budgetLines.reduce((sum, line) => sum + Number(line.totalSpent || 0), 0);
    const grandRevenue = budgetLines.reduce((sum, line) => sum + Number(line.totalRevenue || 0), 0);
    const grandNet = grandRevenue - grandSpent;

    summaryData.push([]);
    summaryData.push(['GRAND TOTAL', '', grandTotal, grandSpent, grandRevenue, grandNet, budgetLines.length]);

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    summarySheet['!cols'] = [20, 30, 20, 20, 20, 20, 15];

    // Style summary sheet
    const summaryRange = XLSX.utils.decode_range(summarySheet['!ref']);
    for (let col = summaryRange.s.c; col <= summaryRange.e.c; col++) {
      const headerCell = XLSX.utils.encode_cell({ r: 5, c: col });
      if (summarySheet[headerCell]) {
        summarySheet[headerCell].s = {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '4472C4' } },
          alignment: { horizontal: 'center' }
        };
      }
    }

    // Style title
    if (summarySheet['A1']) {
      summarySheet['A1'].s = {
        font: { bold: true, size: 16, color: { rgb: '2F75B5' } },
        alignment: { horizontal: 'center' }
      };
    }

    // Style grand total row
    const grandTotalRow = summaryData.length - 1;
    for (let col = 0; col < 7; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: grandTotalRow, c: col });
      if (summarySheet[cellAddress]) {
        summarySheet[cellAddress].s = {
          font: { bold: true },
          fill: { fgColor: { rgb: 'D9E1F2' } }
        };
      }
    }

    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Budget Summary');

    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `Budget_Summary_${timestamp}.xlsx`;

    // Export file
    XLSX.writeFile(workbook, filename);

    return { success: true, filename };
  } catch (error) {
    console.error('Error exporting budget summary:', error);
    return { success: false, error: error.message };
  }
};
