import React from 'react';
import { Landmark } from 'lucide-react';

const BankCard = ({ bank, onClick }) => {
    // Format currency
    const formatCurrency = (amount, currency) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
        }).format(amount);
    };

    return (
        <div
            onClick={() => onClick(bank)}
            className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition-shadow group"
        >
            <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                    <Landmark className="text-blue-600" size={24} />
                </div>
                <span className="text-xs font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded">
                    {bank.accountNumber}
                </span>
            </div>

            <h3 className="text-lg font-semibold text-slate-800 mb-1">{bank.name}</h3>
            <p className="text-2xl font-bold text-slate-900">
                {formatCurrency(bank.balance, bank.currency)}
            </p>

            <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between text-sm">
                <div>
                    <span className="block text-slate-400 text-xs">Inflow (Mo)</span>
                    <span className="text-green-600 font-medium">
                        +{formatCurrency(bank.stats.monthlyInflow, bank.currency)}
                    </span>
                </div>
                <div className="text-right">
                    <span className="block text-slate-400 text-xs">Outflow (Mo)</span>
                    <span className="text-red-500 font-medium">
                        -{formatCurrency(bank.stats.monthlyOutflow, bank.currency)}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default BankCard;
