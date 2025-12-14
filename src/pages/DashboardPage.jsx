import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { Settings, LogOut, CreditCard, LayoutDashboard, FileSpreadsheet, FileText, Landmark, Users, BarChart2 } from 'lucide-react';
import Layout from '../components/Layout/Layout';
import StrategicReportingHub from '../components/StrategicReportingHub';
import TestSettingsPanel from '../components/TestSettingsPanel';
import { safeToFixed } from '../utils/formatters';

const DashboardPage = ({ onNavigate, onBack, onLogout, userId, db, appId, showTestSettings, setShowTestSettings }) => {
    const [budgetSummary, setBudgetSummary] = useState({
        totalBudget: 0,
        availableBudget: 0,
        spentBudget: 0
    });
    const [showStrategicReports, setShowStrategicReports] = useState(false);

    // Load budget summary data
    useEffect(() => {
        if (!db || !userId) return;

        const loadBudgetSummary = async () => {
            try {
                const budgetRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);
                const querySnapshot = await getDocs(budgetRef);

                let total = 0;
                let spent = 0;

                querySnapshot.forEach(doc => {
                    const budgetLine = doc.data();

                    // 1. Calculate Total Allocated (Budget)
                    // Sum of absolute values of monthlyValues array
                    const allocated = budgetLine.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 0;

                    // 2. Calculate Total Spent
                    // Use existing tracking fields, similar to BudgetManagementPage logic
                    const spentAmount = Math.abs(budgetLine.totalSpent || budgetLine.totalSpendToDate || 0);

                    // 3. Calculate Available
                    const remaining = allocated - spentAmount;

                    total += allocated;
                    spent += spentAmount;
                });

                setBudgetSummary({
                    totalBudget: total,
                    spentBudget: spent,
                    availableBudget: total - spent
                });
            } catch (error) {
                console.error('Error loading budget summary:', error);
            }
        };

        loadBudgetSummary();
    }, [db, userId, appId]);

    const headerActions = (
        <button
            className="flex items-center space-x-2 px-3 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
            onClick={() => setShowTestSettings(true)}
            title="Test & Debug Settings"
        >
            <Settings size={16} />
        </button>
    );

    return (
        <Layout
            title="Dashboard"
            userId={userId}
            onLogout={onLogout}
            headerActions={headerActions}
        >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="md:col-span-1 bg-white p-6 rounded-xl shadow-md flex flex-col justify-center items-center space-y-4">
                    <button
                        onClick={() => onNavigate('paymentGenerator')}
                        className="w-full p-4 bg-blue-500 text-white font-semibold rounded-md text-lg hover:bg-blue-600 transition-colors flex items-center justify-center space-x-2"
                    >
                        <CreditCard size={24} />
                        <span>Payment Generator</span>
                    </button>
                    <button
                        onClick={() => onNavigate('weeklyPayments')}
                        className="w-full p-4 bg-purple-500 text-white font-semibold rounded-md text-lg hover:bg-purple-600 transition-colors flex items-center justify-center space-x-2"
                    >
                        <LayoutDashboard size={24} />
                        <span>Weekly Payments</span>
                    </button>
                    <button
                        onClick={() => onNavigate('excelDemo')}
                        className="w-full p-4 bg-green-500 text-white font-semibold rounded-md text-lg hover:bg-green-600 transition-colors flex items-center justify-center space-x-2"
                    >
                        <FileSpreadsheet size={24} />
                        <span>Excel Demo</span>
                    </button>
                </div>

                <div className="md:col-span-1 lg:col-span-2 bg-white p-6 rounded-xl shadow-md">
                    <h2 className="text-xl font-bold mb-4">Financial Overview Dashboard</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                            <h3 className="text-sm font-medium text-blue-800">Total Budget</h3>
                            <p className="text-2xl font-bold text-blue-900">${safeToFixed(budgetSummary.totalBudget)}</p>
                            <p className="text-xs text-blue-600">Across all budget lines</p>
                        </div>
                        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                            <h3 className="text-sm font-medium text-green-800">Available</h3>
                            <p className="text-2xl font-bold text-green-900">${safeToFixed(budgetSummary.availableBudget)}</p>
                            <p className="text-xs text-green-600">Remaining budget</p>
                        </div>
                        <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                            <h3 className="text-sm font-medium text-orange-800">Spent</h3>
                            <p className="text-2xl font-bold text-orange-900">${safeToFixed(budgetSummary.spentBudget)}</p>
                            <p className="text-xs text-orange-600">Total expenditures</p>
                        </div>
                    </div>
                    <div className="w-full h-32 bg-gray-200 rounded-lg flex items-center justify-center text-gray-500">
                        [Placeholder for future charts/reports]
                    </div>
                </div>

                <div className="md:col-span-1 bg-white p-6 rounded-xl shadow-md flex flex-col justify-center items-center space-y-4">
                    <button
                        onClick={() => onNavigate('budgetManagement')}
                        className="w-full p-4 bg-orange-500 text-white font-semibold rounded-md text-lg hover:bg-orange-600 transition-colors flex items-center justify-center space-x-2"
                    >
                        <Settings size={24} />
                        <span>Budget Management</span>
                    </button>
                    <button
                        onClick={() => onNavigate('bankManagement')}
                        className="w-full p-4 bg-teal-600 text-white font-semibold rounded-md text-lg hover:bg-teal-700 transition-colors flex items-center justify-center space-x-2"
                    >
                        <Landmark size={24} />
                        <span>Bank Management</span>
                    </button>
                    <button
                        onClick={() => onNavigate('vendorManagement')}
                        className="w-full p-4 bg-cyan-600 text-white font-semibold rounded-md text-lg hover:bg-cyan-700 transition-colors flex items-center justify-center space-x-2"
                    >
                        <Users size={24} />
                        <span>Vendor Management</span>
                    </button>
                    <button
                        onClick={() => onNavigate('masterLogDashboard')}
                        className="w-full p-4 bg-indigo-500 text-white font-semibold rounded-md text-lg hover:bg-indigo-600 transition-colors flex items-center justify-center space-x-2"
                    >
                        <FileText size={24} />
                        <span>Master Log & WHT</span>
                    </button>

                    <button
                        onClick={() => setShowStrategicReports(true)}
                        className="w-full p-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-semibold rounded-md text-lg hover:from-blue-700 hover:to-indigo-800 transition-all flex items-center justify-center space-x-2"
                    >
                        <BarChart2 size={24} />
                        <span>Strategic Reports</span>
                    </button>
                </div>
            </div>



            {/* Strategic Reporting Hub Modal */}
            {showStrategicReports && (
                <StrategicReportingHub
                    isOpen={showStrategicReports}
                    onClose={() => setShowStrategicReports(false)}
                    db={db}
                    appId={appId}
                />
            )}

            {/* Test Settings Panel */}
            <TestSettingsPanel
                isOpen={showTestSettings}
                onClose={() => setShowTestSettings(false)}
                testFunctions={{
                    testConnection: () => {
                        console.log('=== TESTING MASTER LOG CONNECTION ===');
                        console.log('Database:', !!db);
                        console.log('App ID:', appId);
                        console.log('User ID:', userId);
                        alert('Check console for connection test results');
                    },
                    migrateDB: () => {
                        alert('Database migration test - function not yet implemented');
                    },
                    checkStatus: () => {
                        alert('Status check test - function not yet implemented');
                    },
                    debugData: () => {
                        alert('Debug data test - function not yet implemented');
                    },
                    debugTable: () => {
                        alert('Debug table test - function not yet implemented');
                    },
                    testAll: () => {
                        alert('Test all functionality - function not yet implemented');
                    },
                    testFinalization: () => {
                        alert('Test finalization - function not yet implemented');
                    },
                    testBudgetLines: () => {
                        alert('Test budget lines - function not yet implemented');
                    },
                    testRates: () => {
                        alert('Test rates - function not yet implemented');
                    },
                    debugPDF: () => {
                        alert('Debug PDF - function not yet implemented');
                    },
                    cleanBudgetLines: () => {
                        alert('Clean budget lines - function not yet implemented');
                    },
                    createTestData: () => {
                        alert('Create test data - function not yet implemented');
                    },
                    debugState: () => {
                        alert('Debug state - function not yet implemented');
                    },
                    testAdd: () => {
                        alert('Test add - function not yet implemented');
                    },
                    testCurrencyRates: () => {
                        alert('Test currency rates - function not yet implemented');
                    }
                }}
                db={db}
                appId={appId}
                userId={userId}
            />
        </Layout>
    );
};

export default DashboardPage;
