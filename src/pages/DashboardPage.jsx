import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { Settings, CreditCard, LayoutDashboard, FileSpreadsheet, FileText, Landmark, Users, BarChart2, PieChart, Activity, Wallet } from 'lucide-react';
import Layout from '../components/Layout/Layout';
import StrategicReportingHub from '../components/StrategicReportingHub';
import ActionCard from '../components/dashboard/ActionCard';
import MetricCard from '../components/dashboard/MetricCard';
import InteractiveAnalytics from '../components/dashboard/InteractiveAnalytics';
import { BankService } from '../services/BankService';

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
    // State for Bank Data
    const [bankSummary, setBankSummary] = useState({
        totalBalance: 0,
        activeBanks: 0,
        banks: []
    });
    const [showStrategicReports, setShowStrategicReports] = useState(false);

    // Load data
    useEffect(() => {
        console.log('[Dashboard] useEffect triggered. db:', !!db, 'userId:', userId, 'appId:', appId);

        if (!db || !userId) {
            console.warn('[Dashboard] Missing db or userId, skipping data load');
            return;
        }

        // 1. Load Budget Summary
        const loadBudgetSummary = async () => {
            try {
                const budgetRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);
                const snapshot = await getDocs(budgetRef);

                let total = 0;
                let spent = 0;

                snapshot.forEach(doc => {
                    const budgetLine = doc.data();
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
                console.error('[Dashboard] Error loading budget summary:', error);
            }
        };

        // 2. Load Bank Summary (NEW)
        const loadBankSummary = async () => {
            try {
                const summary = await BankService.getBankSummary(db, appId);
                console.log('[Dashboard] Bank summary loaded:', summary);
                setBankSummary(summary);
            } catch (error) {
                console.error('[Dashboard] Error loading bank summary:', error);
            }
        };

        loadBudgetSummary();
        loadBankSummary();
    }, [db, userId, appId]);

    // Helper to format currency
    const formatCurrency = (amount, currency = 'GHS') => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2
        }).format(amount);
    };

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

                    {/* KPI Metrics Section - Updated to 4 columns to include Bank Cash */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <MetricCard
                            label="Total Budget"
                            value={budgetSummary.totalBudget}
                            type="total"
                        />
                        <MetricCard
                            label="Available Funds"
                            value={budgetSummary.availableBudget}
                            type="available"
                        />
                        <MetricCard
                            label="Utilized"
                            value={budgetSummary.spentBudget}
                            type="spent"
                        />
                        {/* NEW: Bank Cash KPI */}
                        <MetricCard
                            label="Total Cash Position"
                            value={bankSummary.totalBalance}
                            type="available"
                        />
                    </div>

                    {/* NEW: Bank Accounts Overview Section */}
                    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <Landmark className="text-blue-600" size={20} />
                                Bank Accounts Overview
                            </h2>
                            <span className="text-sm text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                                {bankSummary.activeBanks} Active Accounts
                            </span>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3 rounded-tl-lg">Bank Name</th>
                                        <th className="px-4 py-3">Account Type</th>
                                        <th className="px-4 py-3">Currency</th>
                                        <th className="px-4 py-3 text-right rounded-tr-lg">Balance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {bankSummary.banks.length > 0 ? (
                                        bankSummary.banks.map((bank) => (
                                            <tr key={bank.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3 font-medium text-slate-800">
                                                    {bank.name}
                                                    <div className="text-xs text-slate-400 font-normal">{bank.accountNumber}</div>
                                                </td>
                                                <td className="px-4 py-3 text-slate-600">{bank.bankType || 'Checking'}</td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                                                        {bank.currency || 'GHS'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold text-slate-700">
                                                    {formatCurrency(bank.balance, bank.currency)}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="4" className="px-4 py-8 text-center text-slate-400 italic">
                                                No bank accounts found. Go to Operations → Bank Accounts to add one.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
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
