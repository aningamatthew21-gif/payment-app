// Budget Validation Service
// Provides comprehensive validation for budget data consistency and integrity

import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where 
} from 'firebase/firestore';

/**
 * Budget Validation Service
 * Ensures budget data consistency and provides comprehensive validation
 */
export class BudgetValidationService {
  
  /**
   * Validate budget line data consistency
   * @param {Object} budgetLine - Budget line data
   * @returns {Object} Validation result with issues and warnings
   */
  static validateBudgetLine(budgetLine) {
    const validation = {
      valid: true,
      issues: [],
      warnings: [],
      recommendations: []
    };

    // Check for required fields
    const requiredFields = ['name', 'accountNo'];
    for (const field of requiredFields) {
      if (!budgetLine[field]) {
        validation.issues.push({
          type: 'missing_field',
          message: `Required field ${field} is missing`,
          field: field,
          severity: 'error'
        });
        validation.valid = false;
      }
    }

    // Check balance field consistency
    const balanceFields = ['currentBalanceUSD', 'currentBalance', 'balCD', 'balance'];
    const balanceValues = balanceFields
      .map(field => budgetLine[field])
      .filter(val => val !== undefined && val !== null);
    
    if (balanceValues.length > 1) {
      const uniqueValues = [...new Set(balanceValues)];
      if (uniqueValues.length > 1) {
        validation.issues.push({
          type: 'balance_inconsistency',
          message: 'Multiple balance fields have different values',
          fields: balanceFields,
          values: balanceValues,
          severity: 'error'
        });
        validation.valid = false;
      }
    }

    // Check for negative balances without proper status
    const currentBalance = this.getCurrentBalance(budgetLine);
    if (currentBalance < 0) {
      const monthData = budgetLine.monthlyBalances?.[this.getCurrentMonth()];
      if (monthData && monthData.status !== 'overspent') {
        validation.warnings.push({
          type: 'negative_balance_status',
          message: 'Negative balance detected but status is not overspent',
          balance: currentBalance,
          status: monthData.status,
          severity: 'warning'
        });
      }
    }

    // Check monthly values consistency
    if (budgetLine.monthlyValues && Array.isArray(budgetLine.monthlyValues)) {
      const totalMonthlyValues = budgetLine.monthlyValues.reduce((sum, val) => sum + Math.abs(val || 0), 0);
      const allocatedAmount = budgetLine.allocatedAmount || budgetLine.totalBudget || 0;
      
      if (Math.abs(totalMonthlyValues - allocatedAmount) > 0.01) {
        validation.warnings.push({
          type: 'monthly_values_inconsistency',
          message: 'Monthly values sum does not match allocated amount',
          monthlySum: totalMonthlyValues,
          allocatedAmount: allocatedAmount,
          difference: Math.abs(totalMonthlyValues - allocatedAmount),
          severity: 'warning'
        });
      }
    }

    // Check for data type issues
    if (budgetLine.monthlyValues && !Array.isArray(budgetLine.monthlyValues)) {
      validation.issues.push({
        type: 'invalid_data_type',
        message: 'monthlyValues should be an array',
        field: 'monthlyValues',
        actualType: typeof budgetLine.monthlyValues,
        severity: 'error'
      });
      validation.valid = false;
    }

    // Check for reasonable values
    if (currentBalance < -1000000) {
      validation.warnings.push({
        type: 'extreme_negative_balance',
        message: 'Extremely negative balance detected',
        balance: currentBalance,
        severity: 'warning'
      });
    }

    // Generate recommendations
    if (validation.issues.length === 0 && validation.warnings.length === 0) {
      validation.recommendations.push({
        type: 'data_quality',
        message: 'Budget line data is consistent and well-structured',
        severity: 'info'
      });
    }

    return validation;
  }

  /**
   * Get current balance from budget line data with fallback logic
   * @param {Object} budgetLine - Budget line data
   * @returns {number} Current balance
   */
  static getCurrentBalance(budgetLine) {
    // Priority order for balance fields
    const balanceFields = [
      'currentBalanceUSD',
      'currentBalance', 
      'balCD',
      'balance'
    ];

    for (const field of balanceFields) {
      if (budgetLine[field] !== undefined && budgetLine[field] !== null) {
        return Number(budgetLine[field]) || 0;
      }
    }

    // Fallback: calculate from monthly values
    const totalAllocated = budgetLine.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 0;
    const totalSpent = Math.abs(budgetLine.totalSpent || budgetLine.totalSpendToDate || 0);
    return totalAllocated - totalSpent;
  }

  /**
   * Validate all budget lines in the system
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @returns {Promise<Object>} Comprehensive validation report
   */
  static async validateAllBudgetLines(db, appId) {
    try {
      console.log('[BudgetValidationService] Starting comprehensive budget validation...');
      
      const budgetRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);
      const querySnapshot = await getDocs(budgetRef);
      
      const validationReport = {
        timestamp: new Date().toISOString(),
        totalBudgetLines: querySnapshot.docs.length,
        validBudgetLines: 0,
        invalidBudgetLines: 0,
        totalIssues: 0,
        totalWarnings: 0,
        budgetLineValidations: [],
        summary: {
          criticalIssues: 0,
          dataInconsistencies: 0,
          balanceIssues: 0,
          missingFields: 0
        }
      };

      for (const doc of querySnapshot.docs) {
        const budgetLine = { id: doc.id, ...doc.data() };
        const validation = this.validateBudgetLine(budgetLine);
        
        validationReport.budgetLineValidations.push({
          budgetLineId: doc.id,
          budgetLineName: budgetLine.name || 'Unknown',
          validation: validation
        });

        if (validation.valid) {
          validationReport.validBudgetLines++;
        } else {
          validationReport.invalidBudgetLines++;
        }

        validationReport.totalIssues += validation.issues.length;
        validationReport.totalWarnings += validation.warnings.length;

        // Categorize issues for summary
        validation.issues.forEach(issue => {
          if (issue.type === 'missing_field') {
            validationReport.summary.missingFields++;
          } else if (issue.type === 'balance_inconsistency') {
            validationReport.summary.balanceIssues++;
          } else if (issue.type === 'invalid_data_type') {
            validationReport.summary.dataInconsistencies++;
          }
          
          if (issue.severity === 'error') {
            validationReport.summary.criticalIssues++;
          }
        });
      }

      console.log('[BudgetValidationService] Validation completed:', validationReport);
      return validationReport;

    } catch (error) {
      console.error('[BudgetValidationService] Error validating budget lines:', error);
      throw error;
    }
  }

  /**
   * Validate budget line before update
   * @param {Object} budgetLine - Current budget line data
   * @param {Object} updateData - Proposed update data
   * @returns {Object} Pre-update validation result
   */
  static validateBudgetLineUpdate(budgetLine, updateData) {
    const validation = {
      valid: true,
      issues: [],
      warnings: [],
      impact: {
        balanceChange: 0,
        spendingChange: 0,
        statusChange: false
      }
    };

    // Calculate impact of proposed changes
    const currentBalance = this.getCurrentBalance(budgetLine);
    const newBalance = updateData.currentBalanceUSD || updateData.currentBalance || updateData.balCD || currentBalance;
    validation.impact.balanceChange = newBalance - currentBalance;

    const currentSpent = Math.abs(budgetLine.totalSpent || budgetLine.totalSpendToDate || 0);
    const newSpent = updateData.totalSpent || updateData.totalSpendToDate || currentSpent;
    validation.impact.spendingChange = newSpent - currentSpent;

    // Check for unreasonable changes
    if (Math.abs(validation.impact.balanceChange) > 1000000) {
      validation.warnings.push({
        type: 'large_balance_change',
        message: 'Large balance change detected',
        change: validation.impact.balanceChange,
        severity: 'warning'
      });
    }

    // Check for negative spending (which shouldn't happen)
    if (newSpent < 0) {
      validation.issues.push({
        type: 'negative_spending',
        message: 'Total spending cannot be negative',
        newSpent: newSpent,
        severity: 'error'
      });
      validation.valid = false;
    }

    // Check for status changes
    const currentStatus = budgetLine.monthlyBalances?.[this.getCurrentMonth()]?.status || 'active';
    const newStatus = updateData[`monthlyBalances.${this.getCurrentMonth()}.status`] || currentStatus;
    validation.impact.statusChange = currentStatus !== newStatus;

    return validation;
  }

  /**
   * Get current month for validation
   * @returns {string} Current month in YYYY-MM format
   */
  static getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Generate data quality report
   * @param {Object} db - Firestore database instance
   * @param {string} appId - Application ID
   * @returns {Promise<Object>} Data quality report
   */
  static async generateDataQualityReport(db, appId) {
    try {
      console.log('[BudgetValidationService] Generating data quality report...');
      
      const validationReport = await this.validateAllBudgetLines(db, appId);
      
      const qualityReport = {
        timestamp: new Date().toISOString(),
        overallScore: 0,
        categories: {
          dataCompleteness: 0,
          dataConsistency: 0,
          dataAccuracy: 0,
          dataIntegrity: 0
        },
        recommendations: [],
        validationReport: validationReport
      };

      // Calculate overall score
      const totalBudgetLines = validationReport.totalBudgetLines;
      const validBudgetLines = validationReport.validBudgetLines;
      
      if (totalBudgetLines > 0) {
        qualityReport.overallScore = Math.round((validBudgetLines / totalBudgetLines) * 100);
      }

      // Calculate category scores
      const totalIssues = validationReport.totalIssues;
      const totalWarnings = validationReport.totalWarnings;
      
      // Data completeness (based on missing fields)
      const missingFields = validationReport.summary.missingFields;
      qualityReport.categories.dataCompleteness = Math.max(0, 100 - (missingFields * 10));

      // Data consistency (based on balance inconsistencies)
      const balanceIssues = validationReport.summary.balanceIssues;
      qualityReport.categories.dataConsistency = Math.max(0, 100 - (balanceIssues * 20));

      // Data accuracy (based on data type issues)
      const dataInconsistencies = validationReport.summary.dataInconsistencies;
      qualityReport.categories.dataAccuracy = Math.max(0, 100 - (dataInconsistencies * 25));

      // Data integrity (based on critical issues)
      const criticalIssues = validationReport.summary.criticalIssues;
      qualityReport.categories.dataIntegrity = Math.max(0, 100 - (criticalIssues * 30));

      // Generate recommendations
      if (qualityReport.overallScore < 80) {
        qualityReport.recommendations.push({
          type: 'improvement',
          message: 'Data quality needs improvement. Review and fix validation issues.',
          priority: 'high'
        });
      }

      if (missingFields > 0) {
        qualityReport.recommendations.push({
          type: 'completeness',
          message: `Fix ${missingFields} missing field(s) to improve data completeness.`,
          priority: 'medium'
        });
      }

      if (balanceIssues > 0) {
        qualityReport.recommendations.push({
          type: 'consistency',
          message: `Resolve ${balanceIssues} balance inconsistency(ies) to improve data consistency.`,
          priority: 'high'
        });
      }

      if (criticalIssues > 0) {
        qualityReport.recommendations.push({
          type: 'integrity',
          message: `Address ${criticalIssues} critical issue(s) to improve data integrity.`,
          priority: 'critical'
        });
      }

      console.log('[BudgetValidationService] Data quality report generated:', qualityReport);
      return qualityReport;

    } catch (error) {
      console.error('[BudgetValidationService] Error generating data quality report:', error);
      throw error;
    }
  }
}
