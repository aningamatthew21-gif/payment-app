import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, addDoc, onSnapshot } from 'firebase/firestore';
import { ArrowLeft, LogOut, FileText, Download, Settings, Check, RefreshCw, FileDown, Upload, Plus, Save, X, Edit, Trash2 } from 'lucide-react';
import Layout from '../components/Layout/Layout';
import * as BudgetExcelService from '../services/BudgetExcelService';
import { BudgetBalanceService, getCurrentMonth } from '../services/BudgetBalanceService';
import { BudgetReportingService } from '../services/BudgetReportingService';
import { BudgetValidationService } from '../services/BudgetValidationService';
import { BudgetRealTimeService } from '../services/BudgetRealTimeService';
import VendorDiscoveryService from '../services/VendorDiscoveryService';
import { safeToFixed } from '../utils/formatters';
import AuditService, { AUDIT_ACTIONS } from '../services/AuditService';
import { auth } from '../firebase-config';

const BudgetManagementPage = ({ db, userId, appId, onNavigate, onLogout }) => {
    const [budgetLines, setBudgetLines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importPreview, setImportPreview] = useState(null);
    const [importStatus, setImportStatus] = useState('');
    const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
    const [showBalanceDetails, setShowBalanceDetails] = useState(false);
    const [budgetReport, setBudgetReport] = useState(null);
    const [dataQualityReport, setDataQualityReport] = useState(null);
    const [validationIssues, setValidationIssues] = useState([]);
    const [showValidationPanel, setShowValidationPanel] = useState(false);
    const [formData, setFormData] = useState({
        accountNo: '',
        name: '',
        deptCode: '',
        deptDimension: '',
        monthlyValues: Array(12).fill(0)
    });

    // Vendor discovery service instance for this component
    const vendorDiscoveryService = useMemo(() => {
        if (db && appId) {
            return new VendorDiscoveryService(db, appId);
        }
        return null;
    }, [db, appId]);

    // Audit service instance
    const auditService = useMemo(() => {
        if (db && appId) {
            return new AuditService(db, appId);
        }
        return null;
    }, [db, appId]);

    // State for validation data (dropdown options) - needed for Excel import
    const [validationData, setValidationData] = useState({
        vendors: []
    });

    // Load validation data needed for Excel import
    useEffect(() => {
        if (!db || !userId) return;

        const loadValidationData = async () => {
            try {
                const validationRef = collection(db, `artifacts/${appId}/public/data/validation`);
                const querySnapshot = await getDocs(validationRef);

                const vendors = [];
                querySnapshot.forEach(doc => {
                    const item = doc.data();
                    if (item.field === 'vendors') {
                        vendors.push({
                            id: doc.id,
                            value: item.value,
                            description: item.description || '',
                            isActive: item.isActive !== false
                        });
                    }
                });

                setValidationData(prev => ({ ...prev, vendors }));
            } catch (error) {
                console.error('Error loading validation data:', error);
            }
        };

        loadValidationData();
    }, [db, userId, appId]);

    // ✅ ENHANCED budget summary calculation with consistent field mapping
    const budgetSummary = React.useMemo(() => {
        if (budgetLines.length === 0) return {
            totalBudget: 0,
            totalSpent: 0,
            totalRemaining: 0,
            overspentLines: 0,
            underspentLines: 0,
            onTargetLines: 0,
            completedLines: 0
        };

        const summary = {
            totalBudget: 0,
            totalSpent: 0,
            totalRemaining: 0,
            overspentLines: 0,
            underspentLines: 0,
            onTargetLines: 0,
            completedLines: 0
        };

        budgetLines.forEach(line => {
            // ✅ CONSISTENT FIELD MAPPING: Use the same fields that PaymentFinalization updates
            const monthData = line.monthlyBalances?.[selectedMonth];
            if (monthData) {
                summary.totalBudget += monthData.allocated;
                summary.totalSpent += monthData.spent;
                summary.totalRemaining += monthData.balance;

                if (monthData.status === 'overspent') summary.overspentLines++;
                if (monthData.status === 'underspent') summary.underspentLines++;
                if (monthData.status === 'completed') summary.completedLines++;
                if (monthData.status === 'active') summary.onTargetLines++;
            } else {
                // ✅ FALLBACK: Use the exact fields that PaymentFinalization updates
                const allocated = line.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 0;
                const spent = Math.abs(line.totalSpent || line.totalSpendToDate || 0);
                const remaining = allocated - spent;

                summary.totalBudget += allocated;
                summary.totalSpent += spent;
                summary.totalRemaining += remaining;

                // Determine status based on remaining balance
                if (remaining < 0) {
                    summary.overspentLines++;
                } else if (remaining === 0) {
                    summary.completedLines++;
                } else if (remaining > allocated * 0.8) {
                    summary.underspentLines++;
                } else {
                    summary.onTargetLines++;
                }

                // Debug logging for budget line calculations
                console.log(`[BudgetManagement] Budget line "${line.name}" (fallback):`, {
                    allocated,
                    spent,
                    remaining,
                    fields: {
                        totalSpent: line.totalSpent,
                        totalSpendToDate: line.totalSpendToDate,
                        monthlyBalances: line.monthlyBalances,
                        balCD: line.balCD
                    }
                });
            }
        });

        console.log('[BudgetManagement] Budget summary calculated:', summary);

        return summary;
    }, [budgetLines, selectedMonth]);

    // Ref to track if data has been loaded (avoids stale closure bug)
    const dataLoadedRef = useRef(false);

    // ✅ ENHANCED REAL-TIME LISTENER: Use optimized real-time service
    useEffect(() => {
        if (!db || !userId) return;

        // Reset the ref on effect run
        dataLoadedRef.current = false;

        console.log('[BudgetManagement] Setting up enhanced real-time service...');

        // Add a timeout to ensure data is loaded even if real-time service fails
        const dataTimeout = setTimeout(() => {
            // Use ref instead of state to avoid stale closure
            if (!dataLoadedRef.current) {
                console.log('[BudgetManagement] Timeout reached, loading data directly...');
                loadBudgetDataDirectly();
            }
        }, 5000); // 5 second timeout

        const initializeRealTimeService = async () => {
            try {
                // Initialize the enhanced real-time service
                await BudgetRealTimeService.initialize(db, appId);

                // Subscribe to budget line changes
                const unsubscribe = BudgetRealTimeService.subscribe('budgetLines', (changes) => {
                    console.log('[BudgetManagement] Enhanced real-time update received:', changes);

                    // Get all cached budget lines
                    const cachedData = BudgetRealTimeService.getAllCachedBudgetLines();

                    // Initialize monthly balances for budget lines
                    if (cachedData.length > 0) {
                        // Initialize monthly balances for existing budget lines
                        const enhancedData = cachedData.map(line => {
                            if (!line.monthlyBalances) {
                                return BudgetBalanceService.initializeMonthlyBalances(line);
                            }
                            return line;
                        });

                        console.log('[BudgetManagement] Setting budget lines with enhanced real-time data:', enhancedData.length);
                        setBudgetLines(enhancedData);
                        dataLoadedRef.current = true; // Mark data as loaded
                    }

                    setLoading(false);
                });

                // Subscribe to errors
                const errorUnsubscribe = BudgetRealTimeService.subscribe('error', (errorData) => {
                    console.error('[BudgetManagement] Enhanced real-time service error:', errorData);
                    setLoading(false);
                });

                // Return cleanup function
                return () => {
                    console.log('[BudgetManagement] Cleaning up enhanced real-time service subscriptions');
                    unsubscribe();
                    errorUnsubscribe();
                    // Don't call global cleanup here - let the service handle reference counting
                };

            } catch (error) {
                console.error('[BudgetManagement] Error initializing enhanced real-time service:', error);
                setLoading(false);

                // Fallback to original listener if enhanced service fails
                return setupFallbackListener();
            }
        };

        // Fallback listener function
        const setupFallbackListener = () => {
            console.log('[BudgetManagement] Setting up fallback real-time listener...');

            const budgetRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);

            const unsubscribe = onSnapshot(budgetRef, (snapshot) => {
                console.log('[BudgetManagement] Fallback real-time update received:', snapshot.docs.length, 'budget lines');

                const data = [];
                snapshot.forEach(doc => {
                    const budgetLine = doc.data();
                    data.push({
                        id: doc.id,
                        ...budgetLine
                    });
                });

                // Initialize monthly balances for budget lines
                if (data.length > 0) {
                    // Initialize monthly balances for existing budget lines
                    const enhancedData = data.map(line => {
                        if (!line.monthlyBalances) {
                            return BudgetBalanceService.initializeMonthlyBalances(line);
                        }
                        return line;
                    });

                    console.log('[BudgetManagement] Setting budget lines with fallback data:', enhancedData.length);
                    setBudgetLines(enhancedData);
                    dataLoadedRef.current = true; // Mark data as loaded
                }

                setLoading(false);
            }, (error) => {
                console.error('[BudgetManagement] Fallback real-time listener error:', error);
                setLoading(false);
            });

            return unsubscribe;
        };

        // Initialize the enhanced service
        const cleanup = initializeRealTimeService();

        // Cleanup on unmount
        return () => {
            clearTimeout(dataTimeout);
            cleanup.then(unsubscribe => {
                if (unsubscribe) unsubscribe();
            });
            // Force cleanup of the service when component unmounts
            BudgetRealTimeService.cleanup(true);
        };
    }, [db, userId, appId]);

    const loadBudgetDataDirectly = async () => {
        if (!db || !userId) return;

        try {
            console.log('[BudgetManagement] Loading budget data directly from Firestore...');
            const budgetRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);
            const { getDocs } = await import('firebase/firestore');

            const snapshot = await getDocs(budgetRef);
            const data = [];

            snapshot.forEach(doc => {
                const budgetLine = doc.data();
                data.push({
                    id: doc.id,
                    ...budgetLine
                });
            });

            if (data.length > 0) {
                // Initialize monthly balances for existing budget lines
                const enhancedData = data.map(line => {
                    if (!line.monthlyBalances) {
                        return BudgetBalanceService.initializeMonthlyBalances(line);
                    }
                    return line;
                });

                console.log('[BudgetManagement] Setting budget lines with direct data:', enhancedData.length);
                setBudgetLines(enhancedData);
            }

            setLoading(false);
        } catch (error) {
            console.error('[BudgetManagement] Error loading budget data directly:', error);
            setLoading(false);
        }
    };

    // Hardcoded sample data removed - budget lines are now fully dynamic
    // Users can import from Excel or create manually via the UI

    // Debug status
    const getServiceStatus = () => {
        return BudgetRealTimeService.getStatus();
    };

    // Excel Export/Import handlers
    const handleExportTemplate = async (includeData) => {
        try {
            const result = await BudgetExcelService.exportBudgetTemplate(budgetLines, includeData);
            if (result.success) {
                alert(`Budget ${includeData ? 'data' : 'template'} exported successfully: ${result.filename}`);
            } else {
                alert(`Export failed: ${result.error}`);
            }
        } catch (error) {
            console.error('Export error:', error);
            alert('Export failed. Please try again.');
        }
    };

    const handleExportSummary = async () => {
        try {
            const result = await BudgetExcelService.exportBudgetSummary(budgetLines);
            if (result.success) {
                alert(`Budget summary exported successfully: ${result.filename}`);
            } else {
                alert(`Export failed: ${result.error}`);
            }
        } catch (error) {
            console.error('Export error:', error);
            alert('Export failed. Please try again.');
        }
    };

    const handleImportFile = async (file) => {
        setImportStatus('Processing file...');

        try {
            const result = await BudgetExcelService.importBudgetData(file);
            if (result.success) {
                setImportPreview(result.data);
                setImportStatus(`File processed successfully. Found ${result.count} budget lines.`);
            } else {
                setImportStatus(`Import failed: ${result.error}`);
                setImportPreview(null);
            }
        } catch (error) {
            console.error('Import error:', error);
            setImportStatus(`Import failed: ${error.message}`);
            setImportPreview(null);
        }
    };

    // Generate enhanced budget report
    const generateBudgetReport = () => {
        try {
            const report = BudgetReportingService.generateBudgetPerformanceReport(budgetLines, selectedMonth);
            setBudgetReport(report);
            console.log('Budget report generated:', report);
        } catch (error) {
            console.error('Error generating budget report:', error);
            alert('Failed to generate budget report. Please try again.');
        }
    };

    // ✅ ENHANCED: Generate data quality report
    const generateDataQualityReport = async () => {
        try {
            console.log('[BudgetManagement] Generating data quality report...');
            const report = await BudgetValidationService.generateDataQualityReport(db, appId);
            setDataQualityReport(report);
            setValidationIssues(report.validationReport.budgetLineValidations.filter(v => !v.validation.valid));
            console.log('Data quality report generated:', report);
        } catch (error) {
            console.error('Error generating data quality report:', error);
            alert('Failed to generate data quality report. Please try again.');
        }
    };

    // ✅ ENHANCED: Validate all budget lines
    const validateAllBudgetLines = async () => {
        try {
            console.log('[BudgetManagement] Validating all budget lines...');
            const validationReport = await BudgetValidationService.validateAllBudgetLines(db, appId);
            setValidationIssues(validationReport.budgetLineValidations.filter(v => !v.validation.valid));
            setShowValidationPanel(true);
            console.log('Budget validation completed:', validationReport);
        } catch (error) {
            console.error('Error validating budget lines:', error);
            alert('Failed to validate budget lines. Please try again.');
        }
    };

    // ✅ ENHANCED: Validate single budget line
    const validateBudgetLine = (budgetLine) => {
        try {
            const validation = BudgetValidationService.validateBudgetLine(budgetLine);
            return validation;
        } catch (error) {
            console.error('Error validating budget line:', error);
            return { valid: false, issues: [{ message: 'Validation error occurred' }] };
        }
    };

    // Export enhanced budget report
    const exportEnhancedReport = async () => {
        if (!budgetReport) {
            alert('Please generate a budget report first.');
            return;
        }

        try {
            await BudgetReportingService.exportBudgetReportToExcel(budgetReport, `Budget_Report_${selectedMonth}.xlsx`);
            alert('Enhanced budget report exported successfully!');
        } catch (error) {
            console.error('Export error:', error);
            alert('Export failed. Please try again.');
        }
    };

    const handleConfirmImport = async () => {
        if (!importPreview || !db || !userId) return;

        try {
            setImportStatus('Importing budget data...');

            // Clear existing budget lines
            const budgetRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);
            const existingDocs = await getDocs(budgetRef);
            const deletePromises = existingDocs.docs.map(doc => deleteDoc(doc.ref));
            await Promise.all(deletePromises);

            // Add new budget lines
            const addPromises = importPreview.map(budgetLine => {
                const newBudgetLine = {
                    ...budgetLine,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                return addDoc(budgetRef, newBudgetLine);
            });

            await Promise.all(addPromises);

            // Reload budget lines
            const newQuerySnapshot = await getDocs(budgetRef);
            const newData = [];
            newQuerySnapshot.forEach(doc => {
                newData.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            setBudgetLines(newData);

            setImportStatus('Import completed successfully!');
            setTimeout(() => {
                setShowImportModal(false);
                setImportFile(null);
                setImportPreview(null);
                setImportStatus('');
            }, 2000);

        } catch (error) {
            console.error('Import error:', error);
            setImportStatus(`Import failed: ${error.message}`);
        }
    };



    const handleAddBudgetLine = async () => {
        if (!db || !userId) return;

        try {
            const budgetRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);
            const newBudgetLine = {
                ...formData,
                monthlyValues: formData.monthlyValues.map(val => Number(val) || 0),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            await addDoc(budgetRef, newBudgetLine);

            // Log budget line creation
            if (auditService && auth?.currentUser) {
                auditService.log(
                    AUDIT_ACTIONS.CREATE,
                    'BudgetLine',
                    `Created budget line: ${formData.name} (${formData.accountNo})`,
                    auth.currentUser
                );
            }

            // Reset form
            setFormData({
                accountNo: '',
                name: '',
                deptCode: '',
                deptDimension: '',
                monthlyValues: Array(12).fill(0)
            });
            setShowAddForm(false);

            // Reload budget lines
            const querySnapshot = await getDocs(budgetRef);
            const data = [];
            querySnapshot.forEach(doc => {
                data.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            setBudgetLines(data);

        } catch (error) {
            console.error('Error adding budget line:', error);
            alert('Failed to add budget line.');
        }
    };

    const handleEditBudgetLine = async () => {
        if (!editingItem || !db || !userId) return;

        try {
            const budgetRef = doc(db, `artifacts/${appId}/public/data/budgetLines`, editingItem.id);
            const updatedData = {
                ...formData,
                monthlyValues: formData.monthlyValues.map(val => Number(val) || 0),
                updatedAt: new Date().toISOString()
            };

            await setDoc(budgetRef, updatedData, { merge: true });

            // Log budget line update
            if (auditService && auth?.currentUser) {
                auditService.log(
                    AUDIT_ACTIONS.UPDATE,
                    'BudgetLine',
                    `Updated budget line: ${formData.name} (${editingItem.id})`,
                    auth.currentUser
                );
            }

            // Reset form and editing state
            setEditingItem(null);
            setFormData({
                accountNo: '',
                name: '',
                deptCode: '',
                deptDimension: '',
                monthlyValues: Array(12).fill(0)
            });

            // Reload budget lines
            const budgetRef2 = collection(db, `artifacts/${appId}/public/data/budgetLines`);
            const querySnapshot = await getDocs(budgetRef2);
            const data = [];
            querySnapshot.forEach(doc => {
                data.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            setBudgetLines(data);

        } catch (error) {
            console.error('Error updating budget line:', error);
            alert('Failed to update budget line.');
        }
    };

    const handleDeleteBudgetLine = async (id) => {
        if (!db || !userId) return;

        if (confirm('Are you sure you want to delete this budget line?')) {
            try {
                const budgetRef = doc(db, `artifacts/${appId}/public/data/budgetLines`, id);

                // Get the budget line name before deletion for logging
                const budgetLineToDelete = budgetLines.find(line => line.id === id);

                await deleteDoc(budgetRef);

                // Log deletion
                if (auditService && budgetLineToDelete && auth?.currentUser) {
                    auditService.log(
                        AUDIT_ACTIONS.DELETE,
                        'BudgetLine',
                        `Deleted budget line: ${budgetLineToDelete.name} (${budgetLineToDelete.accountNo})`,
                        auth.currentUser
                    );
                }

                // Reload budget lines
                const budgetRef2 = collection(db, `artifacts/${appId}/public/data/budgetLines`);
                const querySnapshot = await getDocs(budgetRef2);
                const data = [];
                querySnapshot.forEach(doc => {
                    data.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                setBudgetLines(data);

            } catch (error) {
                console.error('Error deleting budget line:', error);
                alert('Failed to delete budget line.');
            }
        }
    };

    const handleEditClick = (budgetLine) => {
        setEditingItem(budgetLine);
        setFormData({
            accountNo: budgetLine.accountNo || '',
            name: budgetLine.name || '',
            deptCode: budgetLine.deptCode || '',
            deptDimension: budgetLine.deptDimension || '',
            monthlyValues: budgetLine.monthlyValues || Array(12).fill(0)
        });
    };

    const handleCancelEdit = () => {
        setEditingItem(null);
        setFormData({
            accountNo: '',
            name: '',
            deptCode: '',
            deptDimension: '',
            monthlyValues: Array(12).fill(0)
        });
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="text-xl font-semibold text-gray-700">Loading Budget Management...</div>
            </div>
        );
    }

    return (
        <Layout
            title="Budget Management"
            userId={userId}
            onBack={() => onNavigate('dashboard')}
            onLogout={onLogout}
        >
            {/* Enhanced Budget Summary with Balance Tracking */}
            <div className="bg-white p-6 rounded-xl shadow-md mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Enhanced Budget Summary - {selectedMonth}</h2>
                    <div className="flex items-center space-x-2">
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                        >
                            {Array.from({ length: 12 }, (_, i) => {
                                const month = `2025-${String(i + 1).padStart(2, '0')}`;
                                return (
                                    <option key={month} value={month}>
                                        {new Date(month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                    </option>
                                );
                            })}
                        </select>
                        <button
                            onClick={generateBudgetReport}
                            className="flex items-center space-x-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors shadow-sm text-sm font-medium"
                        >
                            <FileText size={16} />
                            <span>Generate Report</span>
                        </button>
                        {budgetReport && (
                            <button
                                onClick={exportEnhancedReport}
                                className="flex items-center space-x-2 px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm text-sm font-medium"
                            >
                                <Download size={16} />
                                <span>Export Report</span>
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Allocated</h3>
                        <p className="text-2xl font-bold text-slate-900">
                            ${safeToFixed(budgetSummary.totalBudget)}
                        </p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Spent</h3>
                        <p className="text-2xl font-bold text-red-600">
                            ${safeToFixed(budgetSummary.totalSpent)}
                        </p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Remaining</h3>
                        <p className="text-2xl font-bold text-emerald-600">
                            ${safeToFixed(budgetSummary.totalRemaining)}
                        </p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Budget Lines</h3>
                        <p className="text-2xl font-bold text-slate-900">
                            {budgetLines.length}
                        </p>
                    </div>
                </div>

                {/* Performance Status Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                        <h3 className="text-sm font-medium text-red-800">Overspent Lines</h3>
                        <p className="text-2xl font-bold text-red-900">
                            {budgetSummary.overspentLines}
                        </p>
                    </div>
                    <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                        <h3 className="text-sm font-medium text-yellow-800">Underspent Lines</h3>
                        <p className="text-2xl font-bold text-yellow-900">
                            {budgetSummary.underspentLines}
                        </p>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <h3 className="text-sm font-medium text-blue-800">On Target</h3>
                        <p className="text-2xl font-bold text-blue-900">
                            {budgetSummary.onTargetLines}
                        </p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                        <h3 className="text-sm font-medium text-green-800">Completed</h3>
                        <p className="text-2xl font-bold text-green-900">
                            {budgetSummary.completedLines}
                        </p>
                    </div>
                </div>
            </div>

            {/* Add/Edit Form */}
            <div className="bg-white p-6 rounded-xl shadow-md mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">
                        {editingItem ? 'Edit Budget Line' : 'Add New Budget Line'}
                    </h2>
                    <div className="flex space-x-2">
                        <button
                            onClick={() => window.location.reload()}
                            className="flex items-center space-x-2 px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
                        >
                            <RefreshCw size={16} />
                            <span>Refresh</span>
                        </button>
                        <button
                            onClick={() => handleExportTemplate(false)}
                            className="flex items-center space-x-2 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
                        >
                            <FileDown size={16} />
                            <span>Export Template</span>
                        </button>
                        <button
                            onClick={() => handleExportTemplate(true)}
                            className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                        >
                            <Download size={16} />
                            <span>Export Data</span>
                        </button>
                        <button
                            onClick={() => handleExportSummary()}
                            className="flex items-center space-x-2 px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors"
                        >
                            <FileText size={16} />
                            <span>Export Summary</span>
                        </button>
                        <button
                            onClick={() => setShowImportModal(true)}
                            className="flex items-center space-x-2 px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors"
                        >
                            <Upload size={16} />
                            <span>Import Data</span>
                        </button>
                        {!editingItem && (
                            <button
                                onClick={() => setShowAddForm(!showAddForm)}
                                className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                            >
                                <Plus size={16} />
                                <span>{showAddForm ? 'Cancel' : 'Add Budget Line'}</span>
                            </button>
                        )}
                    </div>
                </div>

                {(showAddForm || editingItem) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                        <input
                            type="text"
                            name="accountNo"
                            placeholder="G/L Account No"
                            value={formData.accountNo}
                            onChange={handleChange}
                            className="p-2 border rounded-md"
                            required
                        />
                        <input
                            type="text"
                            name="name"
                            placeholder="Account Name"
                            value={formData.name}
                            onChange={handleChange}
                            className="p-2 border rounded-md"
                            required
                        />
                        <input
                            type="text"
                            name="deptCode"
                            placeholder="Department Code"
                            value={formData.deptCode}
                            onChange={handleChange}
                            className="p-2 border rounded-md"
                            required
                        />
                        <input
                            type="text"
                            name="deptDimension"
                            placeholder="Department Dimension"
                            value={formData.deptDimension}
                            onChange={handleChange}
                            className="p-2 border rounded-md"
                            required
                        />
                    </div>
                )}

                {(showAddForm || editingItem) && (
                    <div className="mb-4">
                        <h4 className="text-lg font-semibold mb-2">Monthly Values (2025)</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, index) => (
                                <div key={month} className="flex flex-col">
                                    <label className="text-sm font-medium text-gray-700 mb-1">{month}</label>
                                    <input
                                        type="number"
                                        name={`monthlyValues.${index}`}
                                        placeholder="0"
                                        value={formData.monthlyValues[index] || 0}
                                        onChange={(e) => {
                                            const newMonthlyValues = [...formData.monthlyValues];
                                            newMonthlyValues[index] = Number(e.target.value) || 0;
                                            setFormData(prev => ({
                                                ...prev,
                                                monthlyValues: newMonthlyValues
                                            }));
                                        }}
                                        className="p-2 border rounded-md text-sm"
                                        step="0.01"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {(showAddForm || editingItem) && (
                    <div className="flex justify-end space-x-2">
                        <button
                            onClick={editingItem ? handleEditBudgetLine : handleAddBudgetLine}
                            className="p-2 bg-green-500 text-white rounded-md flex items-center space-x-2"
                        >
                            <Save size={16} />
                            <span>{editingItem ? 'Update' : 'Add'}</span>
                        </button>
                        <button
                            onClick={editingItem ? handleCancelEdit : () => setShowAddForm(false)}
                            className="p-2 bg-gray-500 text-white rounded-md flex items-center space-x-2"
                        >
                            <X size={16} />
                            <span>Cancel</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Enhanced Budget Lines Table with Balance Tracking */}
            <div className="bg-white p-6 rounded-xl shadow-md">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">Enhanced Budget Lines with Balance Tracking</h3>
                    <button
                        onClick={() => setShowBalanceDetails(!showBalanceDetails)}
                        className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium shadow-sm"
                    >
                        {showBalanceDetails ? 'Hide' : 'Show'} Balance Details
                    </button>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">G/L Account No</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dept Code</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                                {showBalanceDetails ? (
                                    <>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Allocated</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Spent</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Utilization</th>
                                    </>
                                ) : (
                                    <>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Jan</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Feb</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Mar</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Apr</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">May</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Jun</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Jul</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Aug</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Sep</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Oct</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Nov</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Dec</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {budgetLines.map((budgetLine) => {
                                const monthData = budgetLine.monthlyBalances?.[selectedMonth];

                                // ✅ ENHANCED: Validate budget line data
                                const validation = BudgetValidationService.validateBudgetLine(budgetLine);
                                const hasIssues = validation.issues.length > 0;
                                const hasWarnings = validation.warnings.length > 0;

                                return (
                                    <tr key={budgetLine.id} className={`hover:bg-gray-50 ${hasIssues ? 'bg-red-50' : hasWarnings ? 'bg-yellow-50' : ''
                                        }`}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <div className="flex space-x-2">
                                                <button onClick={() => handleEditClick(budgetLine)} className="text-indigo-600 hover:text-indigo-900">
                                                    <Edit size={16} />
                                                </button>
                                                <button onClick={() => handleDeleteBudgetLine(budgetLine.id)} className="text-red-600 hover:text-red-900">
                                                    <Trash2 size={16} />
                                                </button>
                                                {/* ✅ ENHANCED: Validation indicators */}
                                                {hasIssues && (
                                                    <div className="flex items-center" title={`${validation.issues.length} validation issue(s)`}>
                                                        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                                    </div>
                                                )}
                                                {hasWarnings && !hasIssues && (
                                                    <div className="flex items-center" title={`${validation.warnings.length} validation warning(s)`}>
                                                        <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                                                    </div>
                                                )}
                                                {!hasIssues && !hasWarnings && (
                                                    <div className="flex items-center" title="Data validated successfully">
                                                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">{budgetLine.accountNo}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">{budgetLine.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">{budgetLine.deptCode}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">{budgetLine.deptDimension}</td>

                                        {showBalanceDetails ? (
                                            <>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono">
                                                    ${safeToFixed(monthData?.allocated || budgetLine.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 0)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono text-blue-600">
                                                    ${safeToFixed(monthData?.spent || Math.abs(budgetLine.totalSpent || budgetLine.totalSpendToDate || 0))}
                                                </td>
                                                <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-mono font-bold ${(monthData?.balance || (budgetLine.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 0) - Math.abs(budgetLine.totalSpent || budgetLine.totalSpendToDate || 0)) < 0 ? 'text-red-600' :
                                                    (monthData?.balance || (budgetLine.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 0) - Math.abs(budgetLine.totalSpent || budgetLine.totalSpendToDate || 0)) > (monthData?.allocated || budgetLine.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 0) * 0.8 ? 'text-yellow-600' : 'text-green-600'
                                                    }`}>
                                                    ${safeToFixed(monthData?.balance || (budgetLine.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 0) - Math.abs(budgetLine.totalSpent || budgetLine.totalSpendToDate || 0))}
                                                </td>
                                                <td className={`px-6 py-4 whitespace-nowrap text-sm text-center font-medium ${(monthData?.status === 'overspent' || (monthData?.balance || (budgetLine.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 0) - Math.abs(budgetLine.totalSpent || budgetLine.totalSpendToDate || 0)) < 0) ? 'text-red-600 bg-red-100' :
                                                    (monthData?.status === 'underspent' || (monthData?.balance || (budgetLine.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 0) - Math.abs(budgetLine.totalSpent || budgetLine.totalSpendToDate || 0)) > (monthData?.allocated || budgetLine.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 0) * 0.8) ? 'text-yellow-600 bg-yellow-100' :
                                                        (monthData?.status === 'completed' || (monthData?.balance || (budgetLine.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 0) - Math.abs(budgetLine.totalSpent || budgetLine.totalSpendToDate || 0)) === 0) ? 'text-green-600 bg-green-100' :
                                                            'text-blue-600 bg-blue-100'
                                                    } rounded-full px-2 py-1`}>
                                                    {monthData?.status?.toUpperCase() ||
                                                        ((monthData?.balance || (budgetLine.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 0) - Math.abs(budgetLine.totalSpent || budgetLine.totalSpendToDate || 0)) < 0 ? 'OVERSPENT' :
                                                            (monthData?.balance || (budgetLine.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 0) - Math.abs(budgetLine.totalSpent || budgetLine.totalSpendToDate || 0)) === 0 ? 'COMPLETED' :
                                                                (monthData?.balance || (budgetLine.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 0) - Math.abs(budgetLine.totalSpent || budgetLine.totalSpendToDate || 0)) > (monthData?.allocated || budgetLine.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 0) * 0.8 ? 'UNDERSPENT' : 'ACTIVE')}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono">
                                                    {monthData?.utilizationRate?.toFixed(1) ||
                                                        ((Math.abs(budgetLine.totalSpent || budgetLine.totalSpendToDate || 0) / (budgetLine.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 1)) * 100).toFixed(1)}%
                                                </td>
                                            </>
                                        ) : (
                                            budgetLine.monthlyValues?.map((value, index) => (
                                                <td key={index} className="px-2 py-4 whitespace-nowrap text-sm text-right font-mono">
                                                    <span className={value >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                        ${safeToFixed(Math.abs(value))}
                                                    </span>
                                                </td>
                                            )) || Array(12).fill(0).map((_, index) => (
                                                <td key={index} className="px-2 py-4 whitespace-nowrap text-sm text-right font-mono text-gray-400">
                                                    $0.00
                                                </td>
                                            ))
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {budgetLines.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                        No budget lines found. Click "Add Budget Line" or "Import Data" to get started.
                    </div>
                )}
            </div>

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold mb-4">Import Budget Data</h2>
                        <div className="space-y-4">
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                                <input
                                    type="file"
                                    accept=".xlsx, .xls"
                                    onChange={(e) => handleImportFile(e.target.files[0])}
                                    className="hidden"
                                    id="fileInput"
                                />
                                <label htmlFor="fileInput" className="cursor-pointer">
                                    <Upload size={48} className="mx-auto text-gray-400 mb-2" />
                                    <p className="text-gray-600">Click to upload Excel file</p>
                                    <p className="text-xs text-gray-400 mt-1">Supports .xlsx and .xls</p>
                                </label>
                            </div>

                            {importStatus && (
                                <div className={`p-3 rounded-md ${importStatus.includes('failed') ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                                    }`}>
                                    {importStatus}
                                </div>
                            )}

                            {importPreview && (
                                <div className="mt-4">
                                    <h3 className="font-bold mb-2">Preview ({importPreview.length} items)</h3>
                                    <div className="overflow-x-auto max-h-60 border rounded-md">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Account No</th>
                                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Dept</th>
                                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Dimension</th>
                                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Values</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {importPreview.slice(0, 10).map((item, index) => (
                                                    <tr key={index}>
                                                        <td className="px-3 py-2 text-sm font-mono">{item.accountNo}</td>
                                                        <td className="px-3 py-2 text-sm">{item.name}</td>
                                                        <td className="px-3 py-2 text-sm">{item.deptCode}</td>
                                                        <td className="px-3 py-2 text-sm">{item.deptDimension}</td>
                                                        {item.monthlyValues?.map((value, monthIndex) => (
                                                            <td key={monthIndex} className="px-1 py-2 text-xs text-right font-mono">
                                                                <span className={value >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                                    ${safeToFixed(Math.abs(value))}
                                                                </span>
                                                            </td>
                                                        )) || Array(12).fill(0).map((_, monthIndex) => (
                                                            <td key={monthIndex} className="px-1 py-2 text-xs text-right font-mono text-gray-400">
                                                                $0.00
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                                {importPreview.length > 10 && (
                                                    <tr>
                                                        <td colSpan="16" className="px-3 py-2 text-sm text-gray-500 text-center">
                                                            ... and {importPreview.length - 10} more items
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end space-x-2">
                                <button
                                    onClick={() => setShowImportModal(false)}
                                    className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                                >
                                    Cancel
                                </button>
                                {importPreview && (
                                    <button
                                        onClick={handleConfirmImport}
                                        className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
                                    >
                                        Confirm Import
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Validation Panel Modal */}
            {showValidationPanel && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-gray-800">Budget Validation Results</h2>
                            <button
                                onClick={() => setShowValidationPanel(false)}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {validationIssues.length === 0 ? (
                            <div className="text-center py-8">
                                <Check className="w-16 h-16 text-green-500 mx-auto mb-4" />
                                <p className="text-lg font-semibold text-green-700">All budget lines are valid!</p>
                                <p className="text-gray-600">No issues found in your budget data.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <p className="text-red-600 font-medium">
                                    Found {validationIssues.length} budget line(s) with issues:
                                </p>
                                {validationIssues.map((issue, index) => (
                                    <div key={index} className="border border-red-200 rounded-lg p-4 bg-red-50">
                                        <h3 className="font-semibold text-gray-800 mb-2">
                                            {issue.budgetLineName || issue.name || `Budget Line ${index + 1}`}
                                        </h3>
                                        <ul className="list-disc list-inside text-sm text-red-700">
                                            {issue.validation?.issues?.map((err, i) => (
                                                <li key={i}>{err.message || err}</li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex justify-end mt-6">
                            <button
                                onClick={() => setShowValidationPanel(false)}
                                className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
};

export default BudgetManagementPage;
