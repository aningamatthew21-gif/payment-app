import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { Settings, CreditCard, LayoutDashboard, FileSpreadsheet, FileText, Landmark, Users, BarChart2, PieChart, Activity } from 'lucide-react';
import Layout from '../components/Layout/Layout';
import StrategicReportingHub from '../components/StrategicReportingHub';
import ActionCard from '../components/dashboard/ActionCard';
import MetricCard from '../components/dashboard/MetricCard';
import InteractiveAnalytics from '../components/dashboard/InteractiveAnalytics';

// Toggle Switcher Component
const ViewToggle = ({ activeTab, onToggle }) => (
    <div className="flex justify-center mb-8">
        <div className="bg-slate-100 p-1 rounded-full inline-flex shadow-inner">
            <button
                onClick={() => onToggle('dashboard')}
                className={`flex items-center gap-2 px-8 py-3 rounded-full text-sm font-bold transition-all duration-200 ${activeTab === 'dashboard'
                        ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
            >
                <PieChart size={18} />
                DASHBOARD
            </button>

            <button
                onClick={() => onToggle('operations')}
                className={`flex items-center gap-2 px-8 py-3 rounded-full text-sm font-bold transition-all duration-200 ${activeTab === 'operations'
                        ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
            >
                <LayoutDashboard size={18} />
                OPERATIONS
            </button>
        </div>
    </div>
);

const DashboardPage = ({ onNavigate, onLogout, userId, db, appId }) => {
    const [activeTab, setActiveTab] = useState('dashboard'); // Toggle state
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
                const snapshot = await getDocs(budgetRef);

                let total = 0;
                let spent = 0;

                snapshot.forEach(doc => {
                    const budgetLine = doc.data();

                    // Calculate total from monthlyValues array
                    const allocated = budgetLine.monthlyValues?.reduce((sum, val) => sum + Math.abs(val || 0), 0) || 0;
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

    return (
        <Layout
            title="Financial Command Center"
            userId={userId}
            onLogout={onLogout}
        >
            {/* Toggle Switcher */}
            <ViewToggle activeTab={activeTab} onToggle={setActiveTab} />

            {/* DASHBOARD VIEW - Analytics & Metrics */}
            {activeTab === 'dashboard' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">

                    {/* KPI Metrics Section */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <MetricCard
                            title="Total Budget"
                            value={`GH₵ ${budgetSummary.totalBudget.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            subtitle="Allocated across all departments"
                            color="blue"
                        />
                        <MetricCard
                            title="Available Funds"
                            value={`GH₵ ${budgetSummary.availableBudget.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            subtitle="Ready for new commitments"
                            color="green"
                        />
                        <MetricCard
                            title="Utilized"
                            value={`GH₵ ${budgetSummary.spentBudget.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            subtitle={`${budgetSummary.totalBudget > 0 ? ((budgetSummary.spentBudget / budgetSummary.totalBudget) * 100).toFixed(1) : 0}% of total budget`}
                            color="purple"
                        />
                    </div>

                    {/* Interactive Analytics Section */}
                    <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
                        <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <Activity className="text-blue-600" size={20} />
                            Financial Intelligence
                        </h2>
                        <InteractiveAnalytics
                            db={db}
                            userId={userId}
                            appId={appId}
                        />
                    </div>
                </div>
            )}

            {/* OPERATIONS VIEW - Action Cards */}
            {activeTab === 'operations' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                        <ActionCard
                            icon={LayoutDashboard}
                            title="Master Log"
                            description="View all payment records"
                            onClick={() => onNavigate('masterLogDashboard')}
                        />

                        <ActionCard
                            icon={CreditCard}
                            title="Weekly Payments"
                            description="Create and manage payments"
                            onClick={() => onNavigate('weeklyPayments')}
                        />

                        <ActionCard
                            icon={Settings}
                            title="Budget Manager"
                            description="Allocations and tracking"
                            onClick={() => onNavigate('budgetManagement')}
                        />

                        <ActionCard
                            icon={Landmark}
                            title="Bank Accounts"
                            description="Manage funding sources"
                            onClick={() => onNavigate('bankManagement')}
                        />

                        <ActionCard
                            icon={Users}
                            title="Vendor Database"
                            description="Manage vendors & banking"
                            onClick={() => onNavigate('vendorManagement')}
                        />

                        <ActionCard
                            icon={FileSpreadsheet}
                            title="Excel Demo"
                            description="Import and export tools"
                            onClick={() => onNavigate('excelDemo')}
                        />

                        <ActionCard
                            icon={BarChart2}
                            title="Strategic Reports"
                            description="Financial analytics & insights"
                            onClick={() => setShowStrategicReports(true)}
                        />

                        <ActionCard
                            icon={Settings}
                            title="Settings"
                            description="System configuration & audit trail"
                            onClick={() => onNavigate('settings')}
                        />

                    </div>
                </div>
            )}

            {/* Strategic Reporting Hub Modal */}
            {showStrategicReports && (
                <StrategicReportingHub
                    isOpen={showStrategicReports}
                    onClose={() => setShowStrategicReports(false)}
                    db={db}
                    appId={appId}
                />
            )}
        </Layout>
    );
};

export default DashboardPage;
