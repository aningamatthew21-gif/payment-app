import React, { useState, useEffect } from 'react';
import { ChevronLeft, TrendingUp, TrendingDown, Wallet, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import TransactionTable from './TransactionTable';
import BankTransactionModal from './BankTransactionModal';
import { BankService } from '../../services/BankService';

const BankDetailView = ({ bank, onBack, db, appId, userId }) => {
    const [showModal, setShowModal] = useState({ isOpen: false, mode: 'INFLOW' });
    const [ledger, setLedger] = useState([]);
    const [loadingLedger, setLoadingLedger] = useState(true);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Load ledger on mount and when refreshTrigger changes
    useEffect(() => {
        if (db && appId && bank.id) {
            loadLedger();
        }
    }, [db, appId, bank.id, refreshTrigger]);

    const loadLedger = async () => {
        try {
            setLoadingLedger(true);
            const entries = await BankService.getBankLedger(db, appId, bank.id);
            setLedger(entries);
        } catch (error) {
            console.error('Error loading ledger:', error);
        } finally {
            setLoadingLedger(false);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: bank.currency || 'GHS',
        }).format(amount);
    };

    const handleTransactionSave = async (transactionData) => {
        try {
            await BankService.processManualTransaction(db, appId, {
                ...transactionData,
                bankId: bank.id,
                userId: userId || 'system',
                // Map description to vendor (outflow) or sourceEntity (inflow)
                vendor: transactionData.type === 'OUTFLOW' ? transactionData.description : undefined,
                sourceEntity: transactionData.type === 'INFLOW' ? transactionData.description : undefined
            });

            // Close modal
            setShowModal({ isOpen: false, mode: 'INFLOW' });

            // Refresh ledger and trigger parent refresh
            setRefreshTrigger(prev => prev + 1);

            // Optionally refresh the entire bank data from parent
            if (onBack) {
                // This assumes parent component will reload data
                // You might want to add an onRefresh prop instead
            }

            alert(`${transactionData.type === 'INFLOW' ? 'Inflow' : 'Outflow'} recorded successfully!`);
        } catch (error) {
            console.error('Transaction failed:', error);
            alert(`Transaction Failed: ${error.message}`);
        }
    };

    // Calculate monthly stats from ledger
    const calculateMonthlyStats = () => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        let monthlyInflow = 0;
        let monthlyOutflow = 0;

        ledger.forEach(entry => {
            const entryDate = new Date(entry.timestamp);
            if (entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear) {
                if (entry.type === 'INFLOW') {
                    monthlyInflow += Math.abs(Number(entry.amount || 0));
                } else {
                    monthlyOutflow += Math.abs(Number(entry.amount || 0));
                }
            }
        });

        return { monthlyInflow, monthlyOutflow };
    };

    const stats = calculateMonthlyStats();

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">{bank.name}</h1>
                        <p className="text-slate-500 font-mono text-sm">{bank.accountNumber} • {bank.currency || 'GHS'}</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-sm text-slate-500">Current Balance</p>
                    <p className="text-3xl font-bold text-slate-900">{formatCurrency(bank.balance || 0)}</p>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-500">Total Inflow (Mo)</span>
                        <div className="p-2 bg-green-50 rounded-lg">
                            <TrendingUp size={20} className="text-green-600" />
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-slate-800">{formatCurrency(stats.monthlyInflow)}</p>
                    <p className="text-xs text-slate-400 mt-1">
                        This month
                    </p>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-500">Total Outflow (Mo)</span>
                        <div className="p-2 bg-red-50 rounded-lg">
                            <TrendingDown size={20} className="text-red-600" />
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-slate-800">{formatCurrency(stats.monthlyOutflow)}</p>
                    <p className="text-xs text-slate-400 mt-1">
                        This month
                    </p>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-500">Net Position</span>
                        <div className="p-2 bg-blue-50 rounded-lg">
                            <Wallet size={20} className="text-blue-600" />
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-slate-800">
                        {formatCurrency(stats.monthlyInflow - stats.monthlyOutflow)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                        Net cash flow this month
                    </p>
                </div>
            </div>

            {/* Action Bar - BOTH BUTTONS NOW ENABLED */}
            <div className="flex space-x-4">
                <button
                    onClick={() => setShowModal({ isOpen: true, mode: 'INFLOW' })}
                    className="flex-1 bg-emerald-600 text-white p-4 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center space-x-2 font-bold"
                >
                    <ArrowDownLeft size={20} />
                    <span>Record Inflow</span>
                </button>

                {/* ENABLED OUTFLOW BUTTON */}
                <button
                    onClick={() => setShowModal({ isOpen: true, mode: 'OUTFLOW' })}
                    className="flex-1 bg-white border border-rose-200 text-rose-700 p-4 rounded-xl shadow-sm hover:bg-rose-50 hover:border-rose-300 transition-all flex items-center justify-center space-x-2 font-bold"
                >
                    <ArrowUpRight size={20} />
                    <span>Record Payment / Charge</span>
                </button>
            </div>

            {/* Transactions */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                    <h3 className="text-lg font-semibold text-slate-800">Recent Transactions</h3>
                </div>
                {loadingLedger ? (
                    <div className="p-8 text-center text-slate-500">
                        Loading transactions...
                    </div>
                ) : (
                    <TransactionTable transactions={ledger} currency={bank.currency || 'GHS'} />
                )}
            </div>

            {/* Unified Transaction Modal */}
            <BankTransactionModal
                isOpen={showModal.isOpen}
                mode={showModal.mode}
                bank={bank}
                onClose={() => setShowModal({ ...showModal, isOpen: false })}
                onSave={handleTransactionSave}
            />
        </div>
    );
};

export default BankDetailView;

