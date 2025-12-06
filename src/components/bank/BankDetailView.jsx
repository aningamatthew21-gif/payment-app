import React, { useState } from 'react';
import { ChevronLeft, TrendingUp, TrendingDown, Wallet, Plus, Minus } from 'lucide-react';
import TransactionTable from './TransactionTable';
import InflowModal from './InflowModal';

const BankDetailView = ({ bank, onBack, onRecordInflow }) => {
    const [showInflowModal, setShowInflowModal] = useState(false);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: bank.currency,
        }).format(amount);
    };

    const handleSaveInflow = (data) => {
        onRecordInflow(bank.id, data);
        setShowInflowModal(false);
    };

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
                        <p className="text-slate-500 font-mono text-sm">{bank.accountNumber} • {bank.currency}</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-sm text-slate-500">Current Balance</p>
                    <p className="text-3xl font-bold text-slate-900">{formatCurrency(bank.balance)}</p>
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
                    <p className="text-2xl font-bold text-slate-800">{formatCurrency(bank.stats.monthlyInflow)}</p>
                    <p className="text-xs text-green-600 mt-1 flex items-center">
                        <TrendingUp size={12} className="mr-1" /> +12% vs last month
                    </p>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-500">Total Outflow (Mo)</span>
                        <div className="p-2 bg-red-50 rounded-lg">
                            <TrendingDown size={20} className="text-red-600" />
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-slate-800">{formatCurrency(bank.stats.monthlyOutflow)}</p>
                    <p className="text-xs text-red-600 mt-1 flex items-center">
                        <TrendingDown size={12} className="mr-1" /> -5% vs last month
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
                        {formatCurrency(bank.stats.monthlyInflow - bank.stats.monthlyOutflow)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                        Net cash flow this month
                    </p>
                </div>
            </div>

            {/* Action Bar */}
            <div className="flex space-x-4">
                <button
                    onClick={() => setShowInflowModal(true)}
                    className="flex items-center px-4 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 transition-colors shadow-sm"
                >
                    <Plus size={18} className="mr-2" />
                    Record Inflow
                </button>
                <button
                    disabled
                    className="flex items-center px-4 py-2 bg-slate-100 text-slate-400 font-medium rounded-md cursor-not-allowed"
                >
                    <Minus size={18} className="mr-2" />
                    Record Payment
                </button>
            </div>

            {/* Transactions */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                    <h3 className="text-lg font-semibold text-slate-800">Recent Transactions</h3>
                </div>
                <TransactionTable transactions={bank.transactions} currency={bank.currency} />
            </div>

            {/* Modals */}
            <InflowModal
                isOpen={showInflowModal}
                onClose={() => setShowInflowModal(false)}
                onSave={handleSaveInflow}
                currency={bank.currency}
            />
        </div>
    );
};

export default BankDetailView;
