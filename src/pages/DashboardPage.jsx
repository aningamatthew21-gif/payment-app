import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { Settings, CreditCard, LayoutDashboard, FileSpreadsheet, FileText, Landmark, Users, BarChart2 } from 'lucide-react';
import Layout from '../components/Layout/Layout';
import StrategicReportingHub from '../components/StrategicReportingHub';
import TestSettingsPanel from '../components/TestSettingsPanel';
import ActionCard from '../components/dashboard/ActionCard';
import MetricCard from '../components/dashboard/MetricCard';
import InteractiveAnalytics from '../components/dashboard/InteractiveAnalytics';

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
                    const allocated = budgetLine.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 0;

                    // 2. Calculate Total Spent
                    const spentAmount = Math.abs(budgetLine.totalSpent || budgetLine.totalSpendToDate || 0);

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
            className="flex items-center space-x-2 px-3 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 transition-colors"
            onClick={() => setShowTestSettings(true)}
            title="Test & Debug Settings"
        >
            <Settings size={16} />
        </button>
    );

    return (
        <Layout
            title="Command Center"
            userId={userId}
            onLogout={onLogout}
            headerActions={headerActions}
        >
            <div className="max-w-7xl mx-auto space-y-8">

                {/* TOP METRICS ROW */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <MetricCard
                        label="Total Allocated Budget"
                        value={budgetSummary.totalBudget}
                        type="total"
                    />
                    <MetricCard
                        label="Total Expenditure (YTD)"
                        value={budgetSummary.spentBudget}
                        type="spent"
                    />
                    <MetricCard
                        label="Available Funds"
                        value={budgetSummary.availableBudget}
                        type="available"
                    />
                </div>

                {/* MAIN CONTENT GRID */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* LEFT: OPERATIONS CENTER (2/3 width) */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="flex items-center gap-2 mb-4">
                            <LayoutDashboard size={20} className="text-slate-400" />
                            <h2 className="text-lg font-bold text-slate-800">Operations Center</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Primary Action - Royal Blue */}
                            <ActionCard
                                primary
                                icon={CreditCard}
                                title="Payment Generator"
                                description="Create vouchers and instructions"
                                onClick={() => onNavigate('paymentGenerator')}
                            />

                            {/* Secondary Actions - Clean White */}
                            <ActionCard
                                icon={FileText}
                                title="Master Log & WHT"
                                description="Transaction log and tax filing"
                                onClick={() => onNavigate('masterLogDashboard')}
                            />

                            <ActionCard
                                icon={LayoutDashboard}
                                title="Weekly Payments"
                                description="Manage payment batches"
                                onClick={() => onNavigate('weeklyPayments')}
                            />

                            <ActionCard
                                icon={FileSpreadsheet}
                                title="Excel Demo"
                                description="Import and export tools"
                                onClick={() => onNavigate('excelDemo')}
                            />

                            <ActionCard
                                icon={Settings}
                                title="Budget Manager"
                                description="Allocations and tracking"
                                onClick={() => onNavigate('budgetManagement')}
                            />

                            <ActionCard
                                icon={Landmark}
                                title="Bank Manager"
                                description="Monitor balances and flows"
                                onClick={() => onNavigate('bankManagement')}
                            />

                            <ActionCard
                                icon={Users}
                                title="Vendor Database"
                                description="Manage beneficiaries"
                                onClick={() => onNavigate('vendorManagement')}
                            />

                            <ActionCard
                                icon={BarChart2}
                                title="Strategic Reports"
                                description="Financial analytics & insights"
                                onClick={() => setShowStrategicReports(true)}
                            />
                        </div>
                    </div>

                    {/* RIGHT: FINANCIAL INTELLIGENCE (1/3 width) */}
                    <div className="space-y-6">
                        {/* Interactive Charts */}
                        <InteractiveAnalytics db={db} appId={appId} />

                        {/* System Status Panel */}
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                            <h3 className="font-bold text-slate-800 mb-4">System Status</h3>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                        <span className="text-sm font-medium text-blue-700">System Online</span>
                                    </div>
                                    <span className="text-xs font-bold text-blue-800">Operational</span>
                                </div>

                                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-100">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                        <span className="text-sm font-medium text-green-700">Data Sync</span>
                                    </div>
                                    <span className="text-xs font-bold text-green-800">Up to Date</span>
                                </div>
                            </div>
                        </div>
                    </div>

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
